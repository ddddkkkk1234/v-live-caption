// ============================================================
// audio.js
// 마이크 초기화, 오디오 캡처, 로컬/클라우드 자막 엔진, Whisper
// 의존: constants.js, ui.js, settings.js, auth.js, history.js
// ============================================================

let proInterval = null;
let isProRunning = false;
let audioContext = null;
let stream = null;
let isProcessingChunk = false;
let cloudBackoffUntil = 0;
let lastLowSignalLogAt = 0;

// Whisper
let whisperWorker = null;
let whisperRequestId = 0;
const whisperRequests = new Map();
let whisperModelId = "";
let fallbackWhisperPipeline = null;
let fallbackWhisperInstance = null;
let fallbackWhisperModelId = "";

// PIP
let pipActive = false;
const pipCanvas = document.getElementById('pip-canvas');
const pipVideo = document.getElementById('pip-video');
const pipCtx = pipCanvas ? pipCanvas.getContext('2d') : null;

// ── 마이크 ────────────────────────────────────────────────

async function setupMicrophoneSelect(errorLabel = "") {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect) return;
    if (errorLabel) {
        deviceSelect.replaceChildren(new Option(errorLabel, ""));
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        const savedId = localStorage.getItem('vlive_audio_device') || "";
        deviceSelect.replaceChildren();
        deviceSelect.appendChild(new Option(getAppLanguage() === 'ko' ? "기본 마이크" : "Default Mic", ""));
        mics.forEach((m, i) => {
            if (!m.deviceId || m.deviceId === 'default') return;
            const opt = new Option(m.label || `마이크 ${i + 1}`, m.deviceId);
            if (m.deviceId === savedId) opt.selected = true;
            deviceSelect.appendChild(opt);
        });
        deviceSelect.appendChild(new Option(uiText('micPermission'), MIC_PERMISSION_VALUE));
    } catch (e) {}
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
            deviceSelect.appendChild(new Option(getAppLanguage() === 'ko' ? "기본 마이크" : "Default Mic", ""));
            mics.forEach((m, i) => {
                if (!m.deviceId || m.deviceId === 'default') return;
                const opt = new Option(m.label || `마이크 ${i + 1}`, m.deviceId);
                if (m.deviceId === savedId) opt.selected = true;
                deviceSelect.appendChild(opt);
            });
            deviceSelect.appendChild(new Option(uiText('micPermission'), MIC_PERMISSION_VALUE));
        }
        if (outputSelect) {
            const savedOutId = localStorage.getItem('vlive_audio_output') || "";
            outputSelect.replaceChildren();
            outputSelect.appendChild(new Option(getAppLanguage() === 'ko' ? "기본 스피커" : "Default Speaker", ""));
            speakers.forEach((s, i) => {
                if (!s.deviceId || s.deviceId === 'default') return;
                const opt = new Option(s.label || `스피커 ${i + 1}`, s.deviceId);
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
        
        // 이미 스트림이 있고 선택된 장치와 일치한다면 중복 초기화 방지
        const currentDeviceId = stream?.getAudioTracks()[0]?.getSettings()?.deviceId;
        const targetDeviceId = deviceSelect?.value;
        if (stream && currentDeviceId === targetDeviceId && audioContext && audioContext.state !== 'closed') {
            log("마이크가 이미 연결되어 있습니다.");
            return;
        }

        if (audioContext && audioContext.state !== 'closed') await audioContext.close();
        if (!deviceSelect) return;
        const savedId = localStorage.getItem('vlive_audio_device') || "";
        const isReqPerm = deviceSelect.value === MIC_PERMISSION_VALUE;
        let deviceId = isReqPerm ? "" : (deviceSelect.value || savedId);
        if (stream) stream.getTracks().forEach(t => t.stop());
        try {
            const constraints = { audio: deviceId ? { deviceId: { ideal: deviceId } } : true };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            // 권한 획득 성공 직후 목록을 다시 불러오면 블루투스 등 상세 장치명이 나타납니다.
            await refreshDevices();
        } catch (e) {
            console.warn("Retrying with default mic...", e);
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const actualId = stream.getAudioTracks()[0]?.getSettings()?.deviceId || "";
        if (actualId) localStorage.setItem('vlive_audio_device', actualId);
        
        // 장치 목록 갱신은 초기 1회만 하거나 필요할 때만 호출하도록 수정
        if (!deviceSelect.options.length || deviceSelect.options.length <= 2) {
            await refreshDevices();
        }
        
        if (deviceSelect && actualId) deviceSelect.value = actualId;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let lastDrawTime = 0;
        function draw(time) {
            if (!audioContext || audioContext.state === 'closed') return;
            requestAnimationFrame(draw);
            if (time - lastDrawTime < 66) return;
            lastDrawTime = time;
            if (isProRunning || pipActive) {
                analyser.getByteFrequencyData(data);
                let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
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
    } catch (e) {
        if (deviceSelect && e.name === 'NotAllowedError') setupMicrophoneSelect("마이크 권한 필요");
        log("마이크 연결 실패: " + e.message, true);
        showToast("마이크 오류: " + e.message, "error");
    }
}

async function handleDeviceSelectChange() {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect || !deviceSelect.value) return;
    await initAudio();
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

// ── 오디오 캡처 ───────────────────────────────────────────

function recordAudioChunk(durationMs, options) {
    return new Promise((resolve, reject) => {
        if (!stream) { reject(new Error("마이크 입력이 없습니다.")); return; }
        const recorder = new MediaRecorder(stream, options);
        const chunks = [];
        let stopTimer = null;
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onerror = e => { if (stopTimer) clearTimeout(stopTimer); reject(e.error || new Error("녹음 처리 오류")); };
        recorder.onstop = () => { if (stopTimer) clearTimeout(stopTimer); resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
        recorder.start();
        stopTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, durationMs);
    });
}

function getAudioRms(samples) {
    if (!samples || !samples.length) return 0;
    const stride = Math.max(1, Math.floor(samples.length / 400));
    let sum = 0, count = 0;
    for (let i = 0; i < samples.length; i += stride) { sum += samples[i] * samples[i]; count++; }
    return Math.sqrt(sum / Math.max(1, count));
}

function logLowSignalOnce() {
    const now = Date.now();
    if (now - lastLowSignalLogAt < 12000) return;
    lastLowSignalLogAt = now;
    log("입력 소리가 너무 작아 자막 생성을 건너뜁니다. 마이크 입력 장치를 확인하세요.", true);
}

// ── 세션 녹음 ─────────────────────────────────────────────

let sessionRecorder = null;
let sessionRecordingChunks = [];
let lastSessionRecording = null;
let sessionRecordingStartedAt = 0;
let lastSessionRecordingDurationMs = 0;

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
        sessionRecordingChunks = []; lastSessionRecording = null; lastSessionRecordingDurationMs = 0;
        setRecordingButtons(false);
        const mimeType = getRecordingMimeType();
        sessionRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        sessionRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) sessionRecordingChunks.push(event.data); };
        sessionRecorder.onstop = () => {
            const type = sessionRecorder?.mimeType || mimeType || 'audio/webm';
            lastSessionRecordingDurationMs = sessionRecordingStartedAt ? Date.now() - sessionRecordingStartedAt : 0;
            lastSessionRecording = new Blob(sessionRecordingChunks, { type });
            sessionRecordingChunks = [];
            setRecordingButtons(lastSessionRecording.size > 0);
            log("녹음 파일이 준비되었습니다."); showToast("녹음 파일이 준비되었습니다.");
        };
        sessionRecorder.onerror = () => {
            log("전체 녹음 저장 중 오류가 발생했습니다.", true);
            showToast("전체 녹음 저장 중 오류가 발생했습니다.", "error");
        };
        sessionRecorder.start(1000);
        sessionRecordingStartedAt = Date.now();
        log("전체 녹음을 시작했습니다."); showToast("녹음 저장을 시작했습니다. 실시간 자막도 함께 실행됩니다.");
    } catch (e) {
        log("전체 녹음은 사용할 수 없지만 실시간 자막은 계속 진행합니다.", true);
        showToast("녹음 저장은 사용할 수 없지만 자막은 계속 실행됩니다.", "error");
    }
}

function stopSessionRecording() {
    if (sessionRecorder && sessionRecorder.state === 'recording') sessionRecorder.stop();
}

function downloadSessionRecording() {
    if (!lastSessionRecording) return alert("다운로드할 녹음 파일이 없습니다.");
    const ext = lastSessionRecording.type.includes('ogg') ? 'ogg' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(lastSessionRecording, `LiveNote_녹음_${stamp}.${ext}`);
}

// ── PIP ───────────────────────────────────────────────────

function updatePipCanvas() {
    if (!pipActive || !pipCtx) return;
    pipCtx.fillStyle = "black"; pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
    pipCtx.fillStyle = document.getElementById('text-color-picker').value;
    const fontSize = parseFloat(document.getElementById('font-size-slider').value) * 32;
    pipCtx.font = `bold ${fontSize}px Pretendard, sans-serif`; pipCtx.textAlign = "center";
    const youtubeText = document.getElementById('youtube-text');
    const fullText = (youtubeText ? youtubeText.innerText : "").trim();
    const words = fullText.split(' ').slice(-8).join(' ');
    pipCtx.fillText(words, pipCanvas.width / 2, pipCanvas.height / 2 + 15);
}

async function togglePIP() {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture(); pipActive = false;
        } else {
            pipActive = true; updatePipCanvas();
            if (!pipVideo.srcObject) pipVideo.srcObject = pipCanvas.captureStream();
            await pipVideo.play(); await pipVideo.requestPictureInPicture();
        }
    } catch (e) { log("PIP 에러", true); }
}

if (pipVideo) {
    pipVideo.addEventListener('leavepictureinpicture', () => { pipActive = false; });
}

// ── Whisper 로컬 ──────────────────────────────────────────

function getWhisperWorker() {
    if (location.protocol === "file:") throw new Error("로컬 파일에서는 Web Worker 대신 기본 로컬 모드로 실행합니다.");
    if (whisperWorker) return whisperWorker;
    whisperWorker = new Worker('js/workers/local-whisper-worker.js', { type: 'module' });
    whisperWorker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
            const fill = document.getElementById('model-loading-fill');
            if (fill && data.progress?.status === 'progress') fill.style.width = `${data.progress.progress || 0}%`;
            return;
        }
        if (data.type === 'log') { log(data.message, true); return; }
        const request = whisperRequests.get(data.id);
        if (!request) return;
        whisperRequests.delete(data.id);
        if (data.type === 'result') { whisperModelId = data.modelId || whisperModelId; request.resolve(data.text || ""); }
        else if (data.type === 'error') { request.reject(new Error(data.message || "로컬 자막 처리 실패")); }
    };
    whisperWorker.onerror = (event) => {
        const message = event.message || "로컬 자막 작업자 오류";
        whisperRequests.forEach(({ reject }) => reject(new Error(message)));
        whisperRequests.clear(); whisperWorker?.terminate?.(); whisperWorker = null;
        log("로컬 자막 작업자 오류: file://로 열었다면 로컬 서버 주소에서 실행해 주세요.", true);
    };
    return whisperWorker;
}

async function loadFallbackWhisperPipeline(modelId) {
    if (!fallbackWhisperPipeline) {
        const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        module.env.allowLocalModels = false; module.env.useBrowserCache = true;
        fallbackWhisperPipeline = module.pipeline;
    }
    const progress = (p) => {
        const fill = document.getElementById('model-loading-fill');
        if (fill && p.status === 'progress') fill.style.width = `${p.progress || 0}%`;
    };
    try { return await fallbackWhisperPipeline('automatic-speech-recognition', modelId, { device: 'webgpu', progress_callback: progress }); }
    catch (e) { return await fallbackWhisperPipeline('automatic-speech-recognition', modelId, { progress_callback: progress }); }
}

async function transcribeLocalFallback(audioFloat32, lang) {
    if (!fallbackWhisperInstance || fallbackWhisperModelId !== LOCAL_WHISPER_MODEL) {
        try { fallbackWhisperInstance = await loadFallbackWhisperPipeline(LOCAL_WHISPER_MODEL); fallbackWhisperModelId = LOCAL_WHISPER_MODEL; }
        catch (e) { log("빠른 모델 로드에 실패해 대체 모델로 전환합니다.", true); fallbackWhisperInstance = await loadFallbackWhisperPipeline(FALLBACK_WHISPER_MODEL); fallbackWhisperModelId = FALLBACK_WHISPER_MODEL; }
    }
    const result = await fallbackWhisperInstance(audioFloat32, { language: lang === 'auto' ? null : lang, task: 'transcribe', return_timestamps: false, chunk_length_s: 30, stride_length_s: 5 });
    whisperModelId = fallbackWhisperModelId;
    return result?.text || "";
}

function transcribeLocalInWorker(audioFloat32, lang) {
    return new Promise((resolve, reject) => {
        const worker = getWhisperWorker();
        const id = ++whisperRequestId;
        const audioCopy = new Float32Array(audioFloat32);
        whisperRequests.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'transcribe', audio: audioCopy.buffer, modelId: LOCAL_WHISPER_MODEL, fallbackModelId: FALLBACK_WHISPER_MODEL, lang }, [audioCopy.buffer]);
    });
}

async function transcribeLocal(audioFloat32, lang) {
    if (location.protocol === "file:") return transcribeLocalFallback(audioFloat32, lang);
    try { return await transcribeLocalInWorker(audioFloat32, lang); }
    catch (e) { log("로컬 자막 작업자를 사용할 수 없어 기본 로컬 모드로 전환합니다.", true); return transcribeLocalFallback(audioFloat32, lang); }
}

// ── 텍스트 정제 ───────────────────────────────────────────

let lastLoggedText = "";

function normalizeCaptionToken(token) {
    return token.toLowerCase().replace(/[.,!?()[\]{}"'""''…~·:;，。！？]/g, "").trim();
}

function isLikelyWhisperHallucination(text) {
    const compact = text.replace(/\s+/g, "");
    if (/^\[?(끝|end)\]?$/i.test(compact)) return true;
    const tokens = text.split(/\s+/).map(normalizeCaptionToken).filter(Boolean);
    if (tokens.length < 6) return false;
    const counts = tokens.reduce((map, token) => { map.set(token, (map.get(token) || 0) + 1); return map; }, new Map());
    const maxRepeat = Math.max(...counts.values());
    const uniqueRatio = counts.size / tokens.length;
    if (maxRepeat >= 6 && uniqueRatio <= 0.45) return true;
    const subscribeMentions = tokens.filter(token => token.includes("구독") || token.includes("좋아요")).length;
    if (subscribeMentions >= 6 && uniqueRatio <= 0.6) return true;
    const pairs = [];
    for (let i = 0; i < tokens.length - 1; i++) pairs.push(`${tokens[i]} ${tokens[i + 1]}`);
    const pairCounts = pairs.reduce((map, pair) => { map.set(pair, (map.get(pair) || 0) + 1); return map; }, new Map());
    return pairCounts.size > 0 && Math.max(...pairCounts.values()) >= 4;
}

function cleanText(text) {
    let cleaned = text.trim();
    if (!cleaned) return "";
    cleaned = cleaned.replace(/^\[(끝|end)\]$/i, "$1");
    if (isLikelyWhisperHallucination(cleaned)) return "";
    const words = cleaned.split(/\s+/);
    cleaned = words.filter((word, i) => word !== words[i - 1]).join(' ');
    const noise = ["감사합니다", "thank you", "어..", "음..", "어...", "감사합니다.", "Thank you.", "음", "아"];
    if (noise.some(n => cleaned.toLowerCase() === n)) return "";
    if (isLikelyWhisperHallucination(cleaned)) return "";
    if (cleaned === lastLoggedText) return "";
    lastLoggedText = cleaned;
    return cleaned;
}

// ── 자막 시작/종료 ────────────────────────────────────────

async function startProRec() {
    if (isProRunning) return; // 이미 실행 중이면 무시
    
    if (!stream) await initAudio();
    if (!stream) { log("마이크 권한이 필요합니다.", true); showToast("마이크 권한이 필요합니다.", "error"); return; }
    
    const engine = document.getElementById('engine-select').value;
    const localLang = getRecognitionLanguage();
    const serverLang = getRecognitionLanguageForServer();
    isProRunning = true; isProcessingChunk = false;
    startCaptionTimingSession();
    document.body.classList.add('recording');
    document.getElementById('pro-start').disabled = true;
    document.getElementById('pro-stop').disabled = false;
    startSessionRecording();
    setStatus(engine === 'groq'
        ? (getAppLanguage() === 'ko' ? "클라우드 자막 중" : "Cloud captions running")
        : (getAppLanguage() === 'ko' ? "자막 생성 중" : "Captions running"), true);
    if (engine === 'local-whisper') {
        showToast("내 기기에서 자막 생성을 시작합니다.");
        startLocalWhisper(localLang);
    } else {
        const sttSettings = getSttRequestSettings();
        const apiLabel = sttSettings.provider === 'default' ? "LiveNote 서버 크레딧" : `내 ${sttSettings.provider.toUpperCase()} API 키`;
        showToast(getAppLanguage() === 'ko' ? `${apiLabel}로 클라우드 자막을 시작합니다.` : `Starting cloud captions with ${apiLabel}.`);
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
                if (rms < LOCAL_MIN_RMS) { logLowSignalOnce(); return; }
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
    } catch (e) { log("로컬 자막 오류: " + e.message, true); stopProRec(); }
}

function startGroqWhisper(lang) {
    log("[클라우드 자막] API 엔진 가동");
    showToast("클라우드 자막 요청을 준비했습니다.");
    const captureCloudChunk = async () => {
        if (!isProRunning) return;
        const waitMs = cloudBackoffUntil - Date.now();
        if (waitMs > 0) { proInterval = setTimeout(captureCloudChunk, waitMs); return; }
        isProcessingChunk = true;
        const sttSettings = getSttRequestSettings();
        try {
            const usesServerCredit = sttSettings.provider === 'default';
            const chunkSeconds = Math.ceil(CAPTURE_TIMING.cloudRecordMs / 1000);
            if (usesServerCredit && !currentUser) { openAuthModal("클라우드 고정밀 자막은 로그인 후 사용할 수 있습니다. 기본 접근성 자막은 로컬 모드에서 계속 사용할 수 있습니다."); stopProRec(); return; }
            if (usesServerCredit && !hasQuota('cloudSeconds', chunkSeconds)) { showUpgradePrompt("무료 클라우드 자막 시간이 모두 사용되었습니다."); stopProRec(); return; }
            const blob = await recordAudioChunk(CAPTURE_TIMING.cloudRecordMs, getCloudRecordingOptions(sttSettings.provider));
            if (blob.size < 2500) return;
            const formData = new FormData();
            formData.append('file', blob, blob.type.includes('ogg') ? 'audio.ogg' : 'audio.webm');
            formData.append('durationSeconds', String(chunkSeconds));
            if (lang !== 'auto') formData.append('language', lang);
            formData.append('provider', sttSettings.provider);
            if (sttSettings.provider !== 'default') {
                if (!sttSettings.apiKey) { log("내 API 키를 입력하거나 내 API 키 사용을 꺼주세요.", true); showToast("내 API 키가 필요합니다.", "error"); stopProRec(); return; }
                formData.append('model', sttSettings.model);
                formData.append('apiKey', sttSettings.apiKey);
                if (sttSettings.diarization) formData.append('diarization', 'true');
                if (['ibm', 'azure'].includes(sttSettings.provider) && !sttSettings.providerExtra) { log(`${sttSettings.provider.toUpperCase()} 추가 설정을 입력해 주세요.`, true); showToast(`${sttSettings.provider.toUpperCase()} 추가 설정이 필요합니다.`, "error"); stopProRec(); return; }
                if (sttSettings.providerExtra) formData.append('providerExtra', sttSettings.providerExtra);
            }
            const data = await requestStt(formData);
            if (usesServerCredit) incrementUsage('cloudSeconds', chunkSeconds);
            if (data.text) { const cleaned = await prepareCaptionText(data.text); if (cleaned) appendCaptionChunk(cleaned, CAPTURE_TIMING.cloudRecordMs); }
        } catch (e) {
            log("클라우드 자막 연결 오류: " + e.message, true);
            const retryDelay = getCloudRetryDelayMs(e);
            if (retryDelay) { cloudBackoffUntil = Date.now() + retryDelay; showToast(`요청 제한에 걸려 ${Math.ceil(retryDelay / 1000)}초 후 다시 시도합니다.`, "error", 5200); }
            else showToast(e.message || "클라우드 자막 연결 오류가 발생했습니다.", "error", 5200);
        } finally {
            isProcessingChunk = false;
            if (isProRunning) proInterval = setTimeout(captureCloudChunk, CAPTURE_TIMING.restartDelayMs);
        }
    };
    captureCloudChunk();
}

function stopProRec() {
    isProRunning = false; isProcessingChunk = false; clearTimeout(proInterval); proInterval = null;
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
}