let proInterval = null;
let isProRunning = false;
let audioContext = null;
let stream = null;
let isProcessingChunk = false;
let cloudBackoffUntil = 0;
let lastLowSignalLogAt = 0;

console.log("LiveNote Audio Engine Loaded - v1.0.1");
console.log("Current Protocol:", location.protocol);

// Whisper
let whisperWorker = null;
let whisperRequestId = 0;
const whisperRequests = new Map();
let whisperModelId = '';
let fallbackWhisperPipeline = null;
let fallbackWhisperInstance = null;
let fallbackWhisperModelId = '';

// PIP
let pipActive = false;
let pipCanvas = document.getElementById('pip-canvas');
let pipVideo = document.getElementById('pip-video');
let pipCtx = pipCanvas ? pipCanvas.getContext('2d') : null;

// Session Recording
let sessionRecorder = null;
let sessionRecordingChunks = [];
let lastSessionRecording = null;
let sessionRecordingStartedAt = 0;
let lastSessionRecordingDurationMs = 0;

function recordAudioChunk(durationMs, options) {
    return new Promise((resolve, reject) => {
        if (!stream) {
            reject(new Error("마이크 입력이 없습니다."));
            return;
        }
        const recorder = new MediaRecorder(stream, options);
        const chunks = [];
        let stopTimer = null;
        recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = e => {
            if (stopTimer) clearTimeout(stopTimer);
            reject(e.error || new Error("녹음 처리 오류"));
        };
        recorder.onstop = () => {
            if (stopTimer) clearTimeout(stopTimer);
            resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.start();
        stopTimer = setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
        }, durationMs);
    });
}

async function startProRec() {
    if(!stream) await initAudio();
    if(!stream) {
        log("마이크 권한이 필요합니다.", true);
        showToast("마이크 권한이 필요합니다.", "error");
        return;
    }
    const engine = document.getElementById('engine-select').value;
    const localLang = getRecognitionLanguage();
    const serverLang = getRecognitionLanguageForServer();
    isProRunning = true;
    isProcessingChunk = false;
    startCaptionTimingSession();
    
    document.body.classList.add('recording');
    document.getElementById('pro-start').disabled = true;
    document.getElementById('pro-stop').disabled = false;
    startSessionRecording();
    setStatus(
        engine === 'groq'
            ? (getAppLanguage() === 'ko' ? "클라우드 자막 중" : "Cloud captions running")
            : (getAppLanguage() === 'ko' ? "자막 생성 중" : "Captions running"),
        true
    );

    if (engine === 'local-whisper') {
        showToast("내 기기에서 자막 생성을 시작합니다.");
        startLocalWhisper(localLang);
    } else {
        const sttSettings = getSttRequestSettings();
        const apiLabel = sttSettings.provider === 'default'
            ? "LiveNote 서버 크레딧"
            : `내 ${sttSettings.provider.toUpperCase()} API 키`;
        showToast(getAppLanguage() === 'ko'
            ? `${apiLabel}로 클라우드 자막을 시작합니다.`
            : `Starting cloud captions with ${apiLabel}.`);
        startGroqWhisper(serverLang);
    }
}

async function startLocalWhisper(lang) {
    log("[로컬 자막] 백그라운드 모델 준비 중...");
    showToast("로컬 자막 모델을 준비 중입니다.");
    document.getElementById('model-loading').style.display = 'block';
    try {
        document.getElementById('model-loading-fill').style.width = "0%";
        if (location.protocol !== "file:") getWhisperWorker();
        else log("[로컬 자막] file:// 실행 감지: 호환 모드로 실행합니다.", true);

        const captureLocalChunk = async () => {
            if (!isProRunning) return;
            isProcessingChunk = true;
            let internalAudioCtx = null;
            try {
                const blob = await recordAudioChunk(CAPTURE_TIMING.localRecordMs);
                if (blob.size < 2500) return;
                const audioData = await blob.arrayBuffer();
                internalAudioCtx = new AudioContext({ sampleRate: 16000 });
                const decoded = await internalAudioCtx.decodeAudioData(audioData);
                const audioFloat32 = decoded.getChannelData(0);
                const rms = getAudioRms(audioFloat32);
                console.log("Audio RMS:", rms, "Threshold:", LOCAL_MIN_RMS);
                if (rms < LOCAL_MIN_RMS || rms < 0.005) {
                    logLowSignalOnce();
                    return;
                }

                const text = await transcribeLocal(audioFloat32, lang);
                document.getElementById('model-loading').style.display = 'none';
                const cleaned = await prepareCaptionText(text);
                if (cleaned && cleaned.length > 1) appendCaptionChunk(cleaned, CAPTURE_TIMING.localRecordMs);
            } catch (e) {
                log("로컬 자막 처리 실패: " + e.message, true);
                showToast("로컬 자막 처리 중 오류가 발생했습니다.", "error");
            } finally {
                if (internalAudioCtx) await internalAudioCtx.close();
                isProcessingChunk = false;
                if (isProRunning) proInterval = setTimeout(captureLocalChunk, CAPTURE_TIMING.restartDelayMs);
            }
        };
        captureLocalChunk();
    } catch (e) {
        log("로컬 자막 오류: " + e.message, true);
        stopProRec();
    }
}

function startGroqWhisper(lang) {
    log("[클라우드 자막] API 엔진 가동");
    showToast("클라우드 자막 요청을 준비했습니다.");
    const captureCloudChunk = async () => {
        if (!isProRunning) return;
        const waitMs = cloudBackoffUntil - Date.now();
        if (waitMs > 0) {
            proInterval = setTimeout(captureCloudChunk, waitMs);
            return;
        }
        isProcessingChunk = true;
        const sttSettings = getSttRequestSettings();
        try {
            const usesServerCredit = sttSettings.provider === 'default';
            const chunkSeconds = Math.ceil(CAPTURE_TIMING.cloudRecordMs / 1000);
            if (usesServerCredit && !currentUser) {
                openAuthModal("클라우드 고정밀 자막은 로그인 후 사용할 수 있습니다. 기본 접근성 자막은 로컬 모드에서 계속 사용할 수 있습니다.");
                stopProRec();
                return;
            }
            if (usesServerCredit && !hasQuota('cloudSeconds', chunkSeconds)) {
                showUpgradePrompt("무료 클라우드 자막 시간이 모두 사용되었습니다.");
                stopProRec();
                return;
            }
            const blob = await recordAudioChunk(CAPTURE_TIMING.cloudRecordMs, getCloudRecordingOptions(sttSettings.provider));
            if (blob.size < 2500) return;
            const formData = new FormData();
            formData.append('file', blob, blob.type.includes('ogg') ? 'audio.ogg' : 'audio.webm');
            formData.append('durationSeconds', String(chunkSeconds));
            if (lang !== 'auto') formData.append('language', lang);
            formData.append('provider', sttSettings.provider);
            if (sttSettings.provider !== 'default') {
                if (!sttSettings.apiKey) {
                    log("내 API 키를 입력하거나 내 API 키 사용을 꺼주세요.", true);
                    showToast("내 API 키가 필요합니다.", "error");
                    stopProRec();
                    return;
                }
                formData.append('model', sttSettings.model);
                formData.append('apiKey', sttSettings.apiKey);
                if (sttSettings.diarization) formData.append('diarization', 'true');
                if (['ibm', 'azure'].includes(sttSettings.provider) && !sttSettings.providerExtra) {
                    log(`${sttSettings.provider.toUpperCase()} 추가 설정을 입력해 주세요.`, true);
                    showToast(`${sttSettings.provider.toUpperCase()} 추가 설정이 필요합니다.`, "error");
                    stopProRec();
                    return;
                }
                if (sttSettings.providerExtra) formData.append('providerExtra', sttSettings.providerExtra);
            }
            const data = await requestStt(formData);
            if (usesServerCredit) incrementUsage('cloudSeconds', chunkSeconds);
            if (data.text) {
                const cleaned = await prepareCaptionText(data.text);
                if (cleaned) appendCaptionChunk(cleaned, CAPTURE_TIMING.cloudRecordMs);
            }
        } catch (e) {
            log("클라우드 자막 연결 오류: " + e.message, true);
            const retryDelay = getCloudRetryDelayMs(e);
            if (retryDelay) {
                cloudBackoffUntil = Date.now() + retryDelay;
                showToast(`요청 제한에 걸려 ${Math.ceil(retryDelay / 1000)}초 후 다시 시도합니다.`, "error", 5200);
            } else {
                showToast(e.message || "클라우드 자막 연결 오류가 발생했습니다.", "error", 5200);
            }
        } finally {
            isProcessingChunk = false;
            if (isProRunning) proInterval = setTimeout(captureCloudChunk, CAPTURE_TIMING.restartDelayMs);
        }
    };
    captureCloudChunk();
}

function stopProRec() { 
    isProRunning = false; isProcessingChunk = false; clearTimeout(proInterval);
    proInterval = null;
    stopSessionRecording();
    whisperRequests.forEach(({ reject }) => reject(new Error("세션이 종료되었습니다.")));
    whisperRequests.clear();
    if (transcriptText.trim().length >= 10) saveHistorySnapshot(transcriptText);
    
    document.body.classList.remove('recording');
    const startBtn = document.getElementById('pro-start');
    const stopBtn = document.getElementById('pro-stop');
    if (startBtn) startBtn.disabled = false; 
    if (stopBtn) stopBtn.disabled = true;
    const interimText = document.getElementById('interim-text');
    if (interimText) interimText.innerText = ""; 
    setStatus(getAppLanguage() === 'ko' ? "대기 중" : "Idle", false);
    const modelLoading = document.getElementById('model-loading');
    if (modelLoading) modelLoading.style.display = 'none';
    showToast(getAppLanguage() === 'ko' ? "세션을 종료했습니다." : "Session ended.");


    let cleaned = text.trim();
    if(!cleaned) return "";
    cleaned = cleaned.replace(/^\[(끝|end)\]$/i, "$1");
    if (isLikelyWhisperHallucination(cleaned)) return "";
    const words = cleaned.split(/\s+/);
    const dedupedWords = words.filter((word, i) => word !== words[i - 1]);
    cleaned = dedupedWords.join(' ');
    const noise = ["감사합니다", "thank you", "어..", "음..", "어...", "감사합니다.", "Thank you.", "음", "아"];
    if(noise.some(n => cleaned.toLowerCase() === n)) return "";
    if (isLikelyWhisperHallucination(cleaned)) return "";
    if(cleaned === lastLoggedText) return ""; 
    lastLoggedText = cleaned;
    return cleaned;
}

function cleanText(text) {
    let cleaned = text.trim();
    if(!cleaned) return "";
    cleaned = cleaned.replace(/^\[(끝|end)\]$/i, "$1");
    if (isLikelyWhisperHallucination(cleaned)) return "";
    const words = cleaned.split(/\s+/);
    const dedupedWords = words.filter((word, i) => word !== words[i - 1]);
    cleaned = dedupedWords.join(' ');
    const noise = ["감사합니다", "thank you", "어..", "음..", "어...", "감사합니다.", "Thank you.", "음", "아"];
    if(noise.some(n => cleaned.toLowerCase() === n)) return "";
    if (isLikelyWhisperHallucination(cleaned)) return "";
    if(cleaned === lastLoggedText) return "";
    lastLoggedText = cleaned;
    return cleaned;
}

function normalizeCaptionToken(token) {
    return token.toLowerCase().replace(/[.,!?()[\]{}"'“”‘’…~·:;，。！？]/g, "").trim();
}

function isLikelyWhisperHallucination(text) {
    const compact = text.replace(/\s+/g, "");
    if (/^\[?(끝|end)\]?$/i.test(compact)) return true;

    const tokens = text.split(/\s+/).map(normalizeCaptionToken).filter(Boolean);
    if (tokens.length < 6) return false;

    const counts = tokens.reduce((map, token) => {
        map.set(token, (map.get(token) || 0) + 1);
        return map;
    }, new Map());
    const maxRepeat = Math.max(...counts.values());
    const uniqueRatio = counts.size / tokens.length;
    if (maxRepeat >= 6 && uniqueRatio <= 0.45) return true;

    const subscribeMentions = tokens.filter(token => token.includes("구독") || token.includes("좋아요")).length;
    if (subscribeMentions >= 6 && uniqueRatio <= 0.6) return true;

    const pairs = [];
    for (let i = 0; i < tokens.length - 1; i++) pairs.push(`${tokens[i]} ${tokens[i + 1]}`);
    const pairCounts = pairs.reduce((map, pair) => {
        map.set(pair, (map.get(pair) || 0) + 1);
        return map;
    }, new Map());
    return pairCounts.size > 0 && Math.max(...pairCounts.values()) >= 4;
}

function getAudioRms(samples) {
    if (!samples || !samples.length) return 0;
    const stride = Math.max(1, Math.floor(samples.length / 400)); // 샘플링 수 줄임
    let sum = 0;
    let count = 0;
    for (let i = 0; i < samples.length; i += stride) {
        sum += samples[i] * samples[i];
        count++;
    }
    return Math.sqrt(sum / Math.max(1, count));
}

function logLowSignalOnce() {
    const now = Date.now();
    if (now - lastLowSignalLogAt < 12000) return;
    lastLowSignalLogAt = now;
    log("입력 소리가 너무 작아 자막 생성을 건너뜁니다. 마이크 입력 장치를 확인하세요.", true);
}

function getWhisperWorker() {
    if (location.protocol === "file:") {
        throw new Error("로컬 파일에서는 Web Worker 대신 기본 로컬 모드로 실행합니다.");
    }
    if (whisperWorker) return whisperWorker;
    // 경로를 루트 기준 절대 경로로 변경하여 확실하게 호출
    whisperWorker = new Worker('/js/workers/local-whisper-worker.js', { type: 'module' });
    whisperWorker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
            const fill = document.getElementById('model-loading-fill');
            if (fill && data.progress?.status === 'progress') fill.style.width = `${data.progress.progress || 0}%`;
            return;
        }
        if (data.type === 'log') {
            log(data.message, true);
            return;
        }
        const request = whisperRequests.get(data.id);
        if (!request) return;
        whisperRequests.delete(data.id);
        if (data.type === 'result') {
            whisperModelId = data.modelId || whisperModelId;
            request.resolve(data.text || "");
        } else if (data.type === 'error') {
            request.reject(new Error(data.message || "로컬 자막 처리 실패"));
        }
    };
    whisperWorker.onerror = (event) => {
        const message = event.message || "로컬 자막 작업자 오류";
        whisperRequests.forEach(({ reject }) => reject(new Error(message)));
        whisperRequests.clear();
        whisperWorker?.terminate?.();
        whisperWorker = null;
        log("로컬 자막 작업자 오류: file://로 열었다면 로컬 서버 주소에서 실행해 주세요.", true);
    };
    return whisperWorker;
}

async function loadFallbackWhisperPipeline(modelId) {
    if (!fallbackWhisperPipeline) {
        const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        module.env.allowLocalModels = false;
        module.env.useBrowserCache = true;
        fallbackWhisperPipeline = module.pipeline;
    }
    const progress = (p) => {
        const fill = document.getElementById('model-loading-fill');
        if (fill && p.status === 'progress') fill.style.width = `${p.progress || 0}%`;
    };
    try {
        return await fallbackWhisperPipeline('automatic-speech-recognition', modelId, {
            device: 'webgpu',
            progress_callback: progress
        });
    } catch (e) {
        return await fallbackWhisperPipeline('automatic-speech-recognition', modelId, {
            progress_callback: progress
        });
    }
}

async function transcribeLocalFallback(audioFloat32, lang) {
    if (!fallbackWhisperInstance || fallbackWhisperModelId !== LOCAL_WHISPER_MODEL) {
        try {
            fallbackWhisperInstance = await loadFallbackWhisperPipeline(LOCAL_WHISPER_MODEL);
            fallbackWhisperModelId = LOCAL_WHISPER_MODEL;
        } catch (e) {
            log("빠른 모델 로드에 실패해 대체 모델로 전환합니다.", true);
            fallbackWhisperInstance = await loadFallbackWhisperPipeline(FALLBACK_WHISPER_MODEL);
            fallbackWhisperModelId = FALLBACK_WHISPER_MODEL;
        }
    }
    const result = await fallbackWhisperInstance(audioFloat32, {
        language: lang === 'auto' ? null : lang,
        task: 'transcribe',
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5
    });
    whisperModelId = fallbackWhisperModelId;
    return result?.text || "";
}

function transcribeLocalInWorker(audioFloat32, lang) {
    return new Promise((resolve, reject) => {
        const worker = getWhisperWorker();
        const id = ++whisperRequestId;
        const audioCopy = new Float32Array(audioFloat32);
        whisperRequests.set(id, { resolve, reject });
        worker.postMessage({
            id,
            type: 'transcribe',
            audio: audioCopy.buffer,
            modelId: LOCAL_WHISPER_MODEL,
            fallbackModelId: FALLBACK_WHISPER_MODEL,
            lang
        }, [audioCopy.buffer]);
    });
}

async function transcribeLocal(audioFloat32, lang) {
    if (location.protocol === "file:") {
        return transcribeLocalFallback(audioFloat32, lang);
    }
    try {
        return await transcribeLocalInWorker(audioFloat32, lang);
    } catch (e) {
        log("로컬 자막 작업자를 사용할 수 없어 기본 로컬 모드로 전환합니다.", true);
        return transcribeLocalFallback(audioFloat32, lang);
    }
}

async function handleOutputSelectChange() {
    const outputSelect = document.getElementById('output-select');
    if (!outputSelect) return;
    const deviceId = outputSelect.value;
    localStorage.setItem('vlive_audio_output', deviceId);
    try {
        if (pipVideo && typeof pipVideo.setSinkId === 'function') await pipVideo.setSinkId(deviceId);
        if (audioContext && typeof audioContext.setSinkId === 'function') await audioContext.setSinkId(deviceId);
        log(`출력 장치 변경: ${deviceId || "기본"}`);
    } catch (e) { log("출력 변경 실패: " + e.message, true); }
}

async function handleDeviceSelectChange() {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect || !deviceSelect.value) return;
    await initAudio();
}

async function refreshDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        const speakers = devices.filter(d => d.kind === 'audiooutput');
        const deviceSelect = document.getElementById('device-select');
        const outputSelect = document.getElementById('output-select');

        if (deviceSelect) {
            const savedId = localStorage.getItem('vlive_audio_device') || "";
            deviceSelect.replaceChildren();
            deviceSelect.appendChild(new Option(getAppLanguage()==='ko'?"기본 마이크":"Default Mic", ""));
            mics.forEach((m, i) => {
                if (!m.deviceId || m.deviceId === 'default') return;
                const opt = new Option(m.label || `마이크 ${i+1}`, m.deviceId);
                if (m.deviceId === savedId) opt.selected = true;
                deviceSelect.appendChild(opt);
            });
            deviceSelect.appendChild(new Option(uiText('micPermission'), MIC_PERMISSION_VALUE));
        }
        if (outputSelect) {
            const savedOutId = localStorage.getItem('vlive_audio_output') || "";
            outputSelect.replaceChildren();
            outputSelect.appendChild(new Option(getAppLanguage()==='ko'?"기본 스피커":"Default Speaker", ""));
            speakers.forEach((s, i) => {
                if (!s.deviceId || s.deviceId === 'default') return;
                const opt = new Option(s.label || `스피커 ${i+1}`, s.deviceId);
                if (s.deviceId === savedOutId) opt.selected = true;
                outputSelect.appendChild(opt);
            });
        }
    } catch (e) {}
}

async function initAudio() {
    const deviceSelect = document.getElementById('device-select');
    try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("HTTPS 연결 필요");
        if (audioContext && audioContext.state !== 'closed') await audioContext.close();
        if (!deviceSelect) return;

        const savedId = localStorage.getItem('vlive_audio_device') || "";
        const isReqPerm = deviceSelect.value === MIC_PERMISSION_VALUE;
        let deviceId = isReqPerm ? "" : (deviceSelect.value || savedId);

        if(stream) stream.getTracks().forEach(t => t.stop());
        
        // 최대한 유연한 권한 요청
        try {
            const constraints = { audio: deviceId ? { deviceId: { ideal: deviceId } } : true };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            console.warn("Retrying with default mic...", e);
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        const actualId = stream.getAudioTracks()[0]?.getSettings()?.deviceId || "";
        if (actualId) localStorage.setItem('vlive_audio_device', actualId);
        await refreshDevices();
        if (deviceSelect && actualId) deviceSelect.value = actualId;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        
        let lastDrawTime = 0;
        function draw(time) {
            if(!audioContext || audioContext.state === 'closed') return;
            requestAnimationFrame(draw);
            if (time - lastDrawTime < 66) return;
            lastDrawTime = time;
            if (isProRunning || pipActive) {
                analyser.getByteFrequencyData(data);
                let sum = 0; for(let i=0; i<data.length; i++) sum += data[i];
                let avg = Math.round((sum / data.length) * 4.8); 
                const vFill = document.getElementById('v-fill');
                const vLabel = document.getElementById('v-label');
                if (vFill) vFill.style.width = Math.min(100, avg) + "%";
                if (vLabel) vLabel.innerText = Math.min(100, avg) + "%";
                if (pipActive) updatePipCanvas();
            }
        }
        requestAnimationFrame(draw);
        setStatus(getAppLanguage() === 'ko' ? "준비 완료" : "Ready", false);
        log("마이크 연결 성공");
    } catch(e) {
        if (deviceSelect && e.name === 'NotAllowedError') {
            setupMicrophoneSelect("마이크 권한 필요");
        }
        log("마이크 연결 실패: " + e.message, true);
        showToast("마이크 오류: " + e.message, "error");
    }
}

function updatePipCanvas() {
    if (!pipActive || !pipCtx) return;
    pipCtx.fillStyle = "black"; pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
    pipCtx.fillStyle = document.getElementById('text-color-picker').value;
    const fontSize = parseFloat(document.getElementById('font-size-slider').value) * 32;
    pipCtx.font = `bold ${fontSize}px Pretendard, sans-serif`; pipCtx.textAlign = "center";
    const youtubeText = document.getElementById('youtube-text');
    const fullText = (youtubeText ? youtubeText.innerText : "").trim();
    const words = fullText.split(' ').slice(-8).join(' ');
    pipCtx.fillText(words, pipCanvas.width/2, pipCanvas.height/2 + 15);
}

async function togglePIP() {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            pipActive = false;
        } else {
            pipActive = true;
            updatePipCanvas();
            if (!pipVideo.srcObject) pipVideo.srcObject = pipCanvas.captureStream();
            await pipVideo.play();
            await pipVideo.requestPictureInPicture();
        }
    } catch (e) { log("PIP 에러", true); }
}

pipVideo.addEventListener('leavepictureinpicture', () => {
    pipActive = false;
});


async function prepareCaptionText(text) {
    return cleanText(await translateCaptionChunk(text));
}

function getHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, getPlanLimits().historyItems)));
}

function synthesizeCaptionSegments(text) {
    return String(text || "")
        .split(/\n+/)
        .map((line) => cleanText(line))
        .filter(Boolean)
        .map((line, index) => ({
            text: line,
            start: index * 4,
            end: index * 4 + 4
        }));
}

function getStoredCaptionSegments() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CAPTION_SEGMENTS_KEY) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((segment) => ({
                text: cleanText(segment.text || ""),
                start: Math.max(0, Number(segment.start) || 0),
                end: Math.max(0, Number(segment.end) || 0)
            }))
            .filter((segment) => segment.text && segment.end > segment.start);
    } catch (e) {
        return [];
    }
}

function saveCaptionSegments() {
    localStorage.setItem(CAPTION_SEGMENTS_KEY, JSON.stringify(captionSegments.slice(-500)));
}

function resetCaptionSegments(segments = []) {
    captionSegments = Array.isArray(segments)
        ? segments
            .map((segment) => ({
                text: cleanText(segment.text || ""),
                start: Math.max(0, Number(segment.start) || 0),
                end: Math.max(0, Number(segment.end) || 0)
            }))
            .filter((segment) => segment.text && segment.end > segment.start)
        : [];
    saveCaptionSegments();
}

function startCaptionTimingSession() {
    if (!transcriptText.trim()) resetCaptionSegments();
    else if (!captionSegments.length) resetCaptionSegments(synthesizeCaptionSegments(transcriptText));
    const lastEnd = captionSegments.length ? captionSegments[captionSegments.length - 1].end : 0;
    sessionCaptionStartedAt = Date.now() - Math.round(lastEnd * 1000);
}

function addCaptionSegment(text, durationMs = 4000) {
    const cleaned = cleanText(text);
    if (!cleaned) return;
    if (!sessionCaptionStartedAt) startCaptionTimingSession();
    const elapsedEnd = Math.max(0, (Date.now() - sessionCaptionStartedAt) / 1000);
    const duration = Math.max(0.5, (Number(durationMs) || 4000) / 1000);
    const previousEnd = captionSegments.length ? captionSegments[captionSegments.length - 1].end : 0;
    const start = Math.max(previousEnd, elapsedEnd - duration);
    const end = Math.max(start + 0.5, elapsedEnd);
    captionSegments.push({ text: cleaned, start, end });
    captionSegments = captionSegments.slice(-500);
    saveCaptionSegments();
}

function saveHistorySnapshot(text) {
    const content = (text || "").trim();
    if (content.length < 10) return;
    const history = getHistory();
    const now = new Date();
    const latest = history[0];
    const lessonMeta = getLessonMeta();
    const fallbackTitle = content.slice(0, 42) + (content.length > 42 ? "..." : "");
    const item = {
        id: latest && now.getTime() - latest.updatedAt < 60000 ? latest.id : String(now.getTime()),
        title: lessonMeta.title || fallbackTitle,
        lessonTitle: lessonMeta.title || "",
        text: content,
        segments: content === transcriptText.trim() ? captionSegments.slice(-500) : [],
        updatedAt: now.getTime()
    };
    if (latest && item.id === latest.id) history[0] = item;
    else history.unshift(item);
    setHistory(history);
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const history = getHistory();
    list.replaceChildren();
    if (!history.length) {
        list.textContent = getAppLanguage() === 'ko'
            ? "지난 자막이 없습니다. 실시간 자막이 생성되면 최근 내용이 이곳에 표시됩니다."
            : "No caption history yet. Recent captions will appear here after a live session.";
        return;
    }
    history.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'history-item';

        const meta = document.createElement('div');
        meta.className = 'history-meta';

        const title = document.createElement('strong');
        title.textContent = item.lessonTitle || item.title || (getAppLanguage() === 'ko' ? "수업 자막 기록" : "Class caption history");
        const date = document.createElement('span');
        date.textContent = `${new Date(item.updatedAt).toLocaleString()} · ${item.text.length.toLocaleString()}${getAppLanguage() === 'ko' ? '자' : ' chars'}`;
        const preview = document.createElement('p');
        preview.textContent = item.text.slice(0, 140) + (item.text.length > 140 ? "..." : "");
        meta.append(title, date, preview);

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-pip';
        loadBtn.textContent = getAppLanguage() === 'ko' ? "불러오기" : "Load";
        loadBtn.onclick = () => loadHistoryItem(item.id);
        const minutesBtn = document.createElement('button');
        minutesBtn.className = 'btn btn-pip';
        minutesBtn.textContent = uiText('classMaterials');
        minutesBtn.onclick = () => createMinutesFromHistory(item.id);
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-pip';
        downloadBtn.textContent = getAppLanguage() === 'ko' ? "다운로드" : "Download";
        downloadBtn.onclick = () => downloadHistoryItem(item.id);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-pip';
        deleteBtn.textContent = getAppLanguage() === 'ko' ? "삭제" : "Delete";
        deleteBtn.onclick = () => deleteHistoryItem(item.id);
        actions.append(loadBtn, minutesBtn, downloadBtn, deleteBtn);

        row.append(meta, actions);
        list.appendChild(row);
    });
}

function loadHistoryItem(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    const titleInput = document.getElementById('lesson-title');
    if (titleInput) {
        titleInput.value = item.lessonTitle || item.title || "";
        saveLessonMeta();
    }
    setTranscriptText(item.text, { segments: item.segments || [] });
    switchMode('youtube');
}

function downloadHistoryItem(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    downloadTextFile(item.text, `LiveNote_자막_${item.id}.txt`);
}

function deleteHistoryItem(id) {
    if(confirm("이 기록을 삭제할까요?")) {
        setHistory(getHistory().filter((entry) => entry.id !== id));
        renderHistory();
    }
}

function clearAllHistory() {
    if(confirm("모든 지난 자막을 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) {
        setHistory([]);
        renderHistory();
    }
}

function clearTranscript() {
    if(confirm("기록을 삭제할까요?")) {
        setTranscriptText("");
        document.getElementById('interim-text').innerText = "";
        localStorage.removeItem('vlive_transcript');
        log("기록 초기화 완료.");
    }
}

function downloadTranscript() {
    const text = transcriptText.trim();
    if(!text) return alert("내용이 없습니다.");
    saveHistorySnapshot(text);
    downloadTextFile(text, "LiveNote_자막.txt");
}

function loadSampleLesson() {
    const titleInput = document.getElementById('lesson-title');
    if (titleInput) titleInput.value = "중3 과학: 전류와 전압";
    saveLessonMeta();
    setTranscriptText([
        "전류는 전하가 일정한 방향으로 이동하는 흐름입니다.",
        "전압은 전류가 흐르게 만드는 전기적인 압력으로 이해할 수 있습니다.",
        "저항이 커지면 같은 전압에서 전류는 작아집니다.",
        "오늘 복습할 핵심은 전류, 전압, 저항의 관계와 옴의 법칙입니다."
    ].join("\n"));
    resetCaptionSegments([
        { start: 0, end: 4, text: "전류는 전하가 일정한 방향으로 이동하는 흐름입니다." },
        { start: 4, end: 9, text: "전압은 전류가 흐르게 만드는 전기적인 압력으로 이해할 수 있습니다." },
        { start: 9, end: 13, text: "저항이 커지면 같은 전압에서 전류는 작아집니다." },
        { start: 13, end: 18, text: "오늘 복습할 핵심은 전류, 전압, 저항의 관계와 옴의 법칙입니다." }
    ]);
    const aiArea = document.getElementById('youtube-ai');
    if (aiArea) {
        setPlainText(aiArea, [
            "# 강의자료: 전류와 전압",
            "",
            "## 핵심 개념",
            "- 전류: 전하가 일정한 방향으로 이동하는 흐름",
            "- 전압: 전류가 흐르게 만드는 전기적인 압력",
            "- 저항: 전류의 흐름을 방해하는 정도",
            "",
            "## 복습 질문",
            "1. 전압이 같을 때 저항이 커지면 전류는 어떻게 변할까요?",
            "2. 옴의 법칙에서 전류, 전압, 저항은 어떤 관계일까요?",
            "",
            "## 다음 수업 과제",
            "- 회로도에서 전류 방향을 표시하고 전압/저항 값을 이용해 전류를 계산해 오기"
        ].join("\n"));
        localStorage.setItem('vlive_last_minutes', aiArea.innerText);
    }
    saveHistorySnapshot(transcriptText);
    showToast("샘플 강의와 자료를 불러왔습니다.");
}

function getCaptionSegments() {
    if (captionSegments.length) return captionSegments;
    return synthesizeCaptionSegments(transcriptText);
}

function formatCueTime(totalSeconds, separator = ",") {
    const safeTime = Math.max(0, Number(totalSeconds) || 0);
    const seconds = Math.floor(safeTime);
    const milliseconds = String(Math.round((safeTime - seconds) * 1000)).padStart(3, "0");
    const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}${separator}${milliseconds}`;
}

function buildCaptionExport(format) {
    const segments = getCaptionSegments();
    if (format === "vtt") {
        return `WEBVTT\n\n${segments.map((segment) => {
            return `${formatCueTime(segment.start, ".")} --> ${formatCueTime(segment.end, ".")}\n${segment.text}`;
        }).join("\n\n")}\n`;
    }
    return `${segments.map((segment, index) => {
        return `${index + 1}\n${formatCueTime(segment.start)} --> ${formatCueTime(segment.end)}\n${segment.text}`;
    }).join("\n\n")}\n`;
}

function downloadTimedCaption(format) {
    const normalizedFormat = format === "vtt" ? "vtt" : "srt";
    if (!isPremiumPlan()) {
        showUpgradePrompt("SRT/VTT 자막 내보내기는 Premium 기능입니다.");
        return;
    }
    const segments = getCaptionSegments();
    if (!segments.length) return alert("내보낼 자막이 없습니다.");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(buildCaptionExport(normalizedFormat), `LiveNote_자막_${stamp}.${normalizedFormat}`);
}

function downloadSrtCaption() {
    downloadTimedCaption("srt");
}

function downloadVttCaption() {
    downloadTimedCaption("vtt");
}

async function createSmartMinutes() {
    await callAI(null, "minutes");
}

async function createMinutesFromHistory(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    setTranscriptText(item.text, { segments: item.segments || [] });
    switchMode('youtube');
    await callAI(null, "minutes");
}

function getSmartMinutesText() {
    const saved = localStorage.getItem('vlive_last_minutes') || "";
    const aiText = document.getElementById('youtube-ai')?.innerText || "";
    return (saved || aiText).trim();
}

async function copySmartMinutes() {
    const text = getSmartMinutesText();
    if (!text) return alert("복사할 강의자료가 없습니다.");
    try {
        await navigator.clipboard.writeText(text);
        log("강의자료 Markdown을 복사했습니다.");
    } catch (e) {
        alert("브라우저에서 클립보드 복사를 허용하지 않았습니다.");
    }
}

function downloadSmartMinutes() {
    const text = getSmartMinutesText();
    if (!text) return alert("다운로드할 강의자료가 없습니다.");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(text, `LiveNote_강의노트_${stamp}.md`);
}



function downloadSmartMinutesPdf() {
    const text = getSmartMinutesText();
    if (!text) return alert("PDF로 저장할 강의자료가 없습니다.");
    if (!isPremiumPlan()) {
        showUpgradePrompt("강의자료 PDF 저장은 Premium 기능입니다.");
        return;
    }
    
    const stamp = new Date().toISOString().slice(0, 10);
    const lessonTitle = getLessonMeta().title || "강의노트";
    
    // PDF용 임시 컨테이너 생성
    const element = document.createElement('div');
    element.style.padding = '40px';
    element.style.color = '#111827';
    element.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    element.innerHTML = `
        <h1 style="font-size: 24px; margin: 0 0 6px; border-bottom: 2px solid #00E676; padding-bottom: 10px;">${lessonTitle}</h1>
        <div style="color: #6b7280; font-size: 13px; margin-bottom: 24px; margin-top: 10px;">생성일: ${stamp} · LiveNote Professional PDF</div>
        <div style="white-space: pre-wrap; word-break: keep-all; font-size: 14px; line-height: 1.7;">${escapeHtml(text)}</div>
    `;

    const opt = {
        margin: [15, 15],
        filename: `LiveNote_${lessonTitle}_${stamp}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    showToast("PDF를 생성 중입니다...");
    html2pdf().set(opt).from(element).save().then(() => {
        showToast("PDF 다운로드가 완료되었습니다.");
    }).catch(err => {
        console.error("PDF 생성 오류:", err);
        showToast("PDF 생성 중 오류가 발생했습니다.", "error");
    });
}

function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function getRecordingMimeType() {
    if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported?.('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported?.('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
    return '';
}

function setRecordingButtons(enabled) {
    const downloadBtn = document.getElementById('recording-download');
    const transcribeBtn = document.getElementById('recording-transcribe');
    if (downloadBtn) downloadBtn.disabled = !enabled;
    if (transcribeBtn) transcribeBtn.disabled = !enabled;
}

function startSessionRecording() {
    try {
        if (!stream) return;
        if (sessionRecorder && sessionRecorder.state === 'recording') return;
        sessionRecordingChunks = [];
        lastSessionRecording = null;
        lastSessionRecordingDurationMs = 0;
        setRecordingButtons(false);
        const mimeType = getRecordingMimeType();
        sessionRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        sessionRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) sessionRecordingChunks.push(event.data);
        };
        sessionRecorder.onstop = () => {
            const type = sessionRecorder?.mimeType || mimeType || 'audio/webm';
            lastSessionRecordingDurationMs = sessionRecordingStartedAt ? Date.now() - sessionRecordingStartedAt : 0;
            lastSessionRecording = new Blob(sessionRecordingChunks, { type });
            sessionRecordingChunks = [];
            setRecordingButtons(lastSessionRecording.size > 0);
            log("녹음 파일이 준비되었습니다.");
            showToast("녹음 파일이 준비되었습니다.");
        };
        sessionRecorder.onerror = () => {
            log("전체 녹음 저장 중 오류가 발생했습니다.", true);
            showToast("전체 녹음 저장 중 오류가 발생했습니다.", "error");
        };
        sessionRecorder.start(1000);
        sessionRecordingStartedAt = Date.now();
        log("전체 녹음을 시작했습니다.");
        showToast("녹음 저장을 시작했습니다. 실시간 자막도 함께 실행됩니다.");
    } catch (e) {
        log("전체 녹음은 사용할 수 없지만 실시간 자막은 계속 진행합니다.", true);
        showToast("녹음 저장은 사용할 수 없지만 자막은 계속 실행됩니다.", "error");
    }
}

function stopSessionRecording() {
    if (sessionRecorder && sessionRecorder.state === 'recording') {
        sessionRecorder.stop();
    }
}

function downloadBlob(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadSessionRecording() {
    if (!lastSessionRecording) return alert("다운로드할 녹음 파일이 없습니다.");
    const ext = lastSessionRecording.type.includes('ogg') ? 'ogg' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(lastSessionRecording, `LiveNote_녹음_${stamp}.${ext}`);
}

async function requestStt(formData) {
    if (location.protocol === "file:") {
        throw new Error("클라우드 자막은 file://에서 사용할 수 없습니다. 서버 주소로 열어 주세요.");
    }
    const headers = currentSession?.access_token
        ? { Authorization: `Bearer ${currentSession.access_token}` }
        : {};
    const res = await fetch('/api/stt', { method: 'POST', body: formData, headers });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new Error("/api/stt 서버 함수가 실행 중이 아닙니다. Cloudflare Pages/Functions 또는 배포 주소에서 열어 주세요.");
    }
    const data = await res.json();
    if (!res.ok) {
        const error = new Error(data.error || "클라우드 자막 요청 실패");
        error.status = res.status;
        throw error;
    }
    return data;
}

function getCloudRetryDelayMs(error) {
    const message = String(error?.message || "");
    const retryMatch = message.match(/(\d+(?:\.\d+)?)\s*초\s*후/);
    if (retryMatch) return Math.ceil(Number(retryMatch[1]) * 1000) + 800;
    if (error?.status === 429 || message.includes("rate") || message.includes("요청 속도 제한")) return 4500;
    return 0;
}

async function translateCaptionChunk(text) {
    const target = document.getElementById('translation-target')?.value || 'none';
    if (target === 'none' || !text) return text;
    if (location.protocol === 'file:') {
        log('번역은 서버 주소에서 실행해야 사용할 수 있습니다. 원문 자막만 표시합니다.', true);
        return text;
    }
    const source = cleanText(text);
    if (source.length < 2) return source;
    const cacheKey = `${target}:${source}`;
    if (typeof translationCache !== 'undefined' && translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    const now = Date.now();
    if (typeof translationInFlight !== 'undefined' && (translationInFlight || now - lastTranslationAt < 2500)) {
        log('번역 자막 요청 간격 제한: 원문만 우선 표시합니다.', true);
        return source;
    }
    const aiSettings = getAiRequestSettings();
    if (aiSettings.provider !== 'default' && !aiSettings.apiKey) { 
        log('번역 자막에는 내 AI API 키를 입력하거나 내 API 키 사용을 꺼주세요.', true);
        return source;
    }
    const usesServerCredit = aiSettings.provider === 'default';
    if (usesServerCredit && typeof currentUser !== 'undefined' && !currentUser) {
        openAuthModal('번역 자막은 로그인 후 사용할 수 있습니다.');
        return source;
    }
    if (usesServerCredit && typeof hasQuota === 'function' && !hasQuota('aiRequests', 1)) {
        showUpgradePrompt('무료 AI 번역 횟수를 모두 사용했습니다.');
        return source;
    }
    try {
        if (typeof translationInFlight !== 'undefined') translationInFlight = true;
        if (typeof lastTranslationAt !== 'undefined') lastTranslationAt = now;
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(typeof currentSession !== 'undefined' && currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {})
            },
            body: JSON.stringify({
                text: source,
                mode: 'translate',
                targetLanguage: target,
                provider: aiSettings.provider,
                model: aiSettings.model,
                apiKey: aiSettings.apiKey
            })
        });
        const data = await res.json();
        if (usesServerCredit && res.ok && typeof incrementUsage === 'function') incrementUsage('aiRequests', 1);
        if (!res.ok || !data.result) {
            log(data.result || '번역 자막 요청 실패', true);
            return source;
        }
        const translated = data.result.trim();
        if (typeof translationCache !== 'undefined') {
            translationCache.set(cacheKey, translated);
            if (translationCache.size > 30) translationCache.delete(translationCache.keys().next().value);
        }
        return translated;
    } catch (e) {
        log('번역 자막 연결 오류: 로컬 파일로 열었다면 서버 주소에서 실행해 주세요.', true);
        return source;
    } finally {
        if (typeof translationInFlight !== 'undefined') translationInFlight = false;
    }
}�다면 서버 주소에서 실행해 주세요.', true);
        return source;
    } finally {
        if (typeof translationInFlight !== 'undefined') translationInFlight = false;
    }
}