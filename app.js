let proInterval = null;
let isProRunning = false;
let audioContext = null;
let stream = null;
let sessionRecorder = null;
let sessionRecordingChunks = [];
let lastSessionRecording = null;
let lastLoggedText = ""; 
let lastLowSignalLogAt = 0;
let lastHistorySaveAt = 0;
let transcriptText = "";
let whisperModelId = "";
let whisperWorker = null;
let whisperRequestId = 0;
const whisperRequests = new Map();
let fallbackWhisperPipeline = null;
let fallbackWhisperInstance = null;
let fallbackWhisperModelId = "";
let isProcessingChunk = false;
let pipActive = false;
let lastTranslationAt = 0;
let translationInFlight = false;
let cloudBackoffUntil = 0;
let toastTimer = null;
const translationCache = new Map();
const HISTORY_KEY = 'vlive_history';
const TRANSLATION_MIN_INTERVAL_MS = 2500;
const MIC_PERMISSION_VALUE = "__request_mic_permission";
const DISPLAY_TRANSCRIPT_LIMIT = 3000;
const HISTORY_SAVE_INTERVAL_MS = 15000;
const LOCAL_WHISPER_MODEL = "Xenova/whisper-tiny";
const FALLBACK_WHISPER_MODEL = "Xenova/whisper-base";
const LOCAL_MIN_RMS = 0.008;
const CAPTURE_TIMING = { localRecordMs: 1700, cloudRecordMs: 3200, restartDelayMs: 200 };
const STT_PROVIDER_MODELS = {
    groq: [
        { value: "whisper-large-v3", label: "whisper-large-v3" },
        { value: "whisper-large-v3-turbo", label: "whisper-large-v3-turbo" }
    ],
    openai: [
        { value: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
        { value: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
        { value: "whisper-1", label: "whisper-1" }
    ],
    gladia: [
        { value: "standard", label: "Gladia standard" }
    ],
    speechmatics: [
        { value: "enhanced", label: "Enhanced" },
        { value: "standard", label: "Standard" }
    ],
    ibm: [
        { value: "ko-KR_BroadbandModel", label: "한국어 Broadband" },
        { value: "en-US_BroadbandModel", label: "English US Broadband" }
    ],
    azure: [
        { value: "conversation", label: "Conversation" }
    ]
};
const STT_PROVIDER_META = {
    groq: {
        summary: "개인 GROQ API 사용 중",
        help: "Groq 키 하나로 Whisper 기반 고정밀 자막을 사용할 수 있습니다.",
        extra: ""
    },
    openai: {
        summary: "개인 OPENAI API 사용 중",
        help: "OpenAI 키 하나로 고정밀 자막을 사용할 수 있습니다. AI 자막 정리와도 같은 키를 재사용하기 좋습니다.",
        extra: ""
    },
    gladia: {
        summary: "개인 GLADIA API 사용 중",
        help: "Gladia는 무료 제공량이 넉넉한 편이라 긴 사용에 적합합니다. 서버가 짧게 녹음한 음성 조각을 업로드하고 결과를 받아옵니다.",
        extra: ""
    },
    speechmatics: {
        summary: "개인 SPEECHMATICS API 사용 중",
        help: "Speechmatics는 악센트와 다양한 발화에 강한 편입니다. 짧은 음성 조각을 작업으로 등록한 뒤 결과를 받아옵니다.",
        extra: ""
    },
    ibm: {
        summary: "개인 IBM WATSON API 사용 중",
        help: "IBM Watson은 API 키와 서비스 URL이 모두 필요합니다.",
        extra: { label: "서비스 URL", placeholder: "https://api.<region>.speech-to-text.watson.cloud.ibm.com" }
    },
    azure: {
        summary: "개인 AZURE SPEECH API 사용 중",
        help: "Azure Speech는 API 키와 리전이 필요합니다. 현재 브라우저 녹음 포맷에 따라 일부 환경에서 실패할 수 있습니다.",
        extra: { label: "리전", placeholder: "koreacentral, eastus 등" }
    }
};
const AI_PROVIDER_MODELS = {
    gemini: [
        { value: "gemini-1.5-flash", label: "gemini-1.5-flash" },
        { value: "gemini-1.5-pro", label: "gemini-1.5-pro" }
    ],
    openai: [
        { value: "gpt-4o-mini", label: "gpt-4o-mini" },
        { value: "gpt-4o", label: "gpt-4o" },
        { value: "gpt-4.1-mini", label: "gpt-4.1-mini" }
    ],
    groq: [
        { value: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" },
        { value: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" }
    ]
};

// Supabase 초기화 (익명 사용이 가능한 임시 세팅)
// 실제 운영시에는 본인의 프로젝트 URL과 API KEY로 변경해야 합니다.
let supabaseClient = null;
let roomSubscription = null;

const pipCanvas = document.getElementById('pip-canvas');
const pipVideo = document.getElementById('pip-video');
const pipCtx = pipCanvas.getContext('2d');

window.onload = () => {
    const saved = localStorage.getItem('vlive_transcript');
    transcriptText = saved || "";
    renderTranscriptDisplay();
    
    // 저장된 설정 불러오기
    const size = localStorage.getItem('vlive_font_size');
    const color = localStorage.getItem('vlive_text_color');
    const bgColor = localStorage.getItem('vlive_caption_bg');
    const bgOpacity = localStorage.getItem('vlive_caption_bg_opacity');

    if(size) document.getElementById('font-size-slider').value = size;
    if(color) document.getElementById('text-color-picker').value = color;
    if(bgColor) document.getElementById('caption-bg-picker').value = bgColor;
    if(bgOpacity) document.getElementById('caption-bg-opacity').value = bgOpacity;

    updateStyle();
    restoreApiSettings();
    restoreAiSettings();
    updateEngineSettingsVisibility();
    renderHistory();
    initAds();
    applyShareParams();
    if (!isSharedReceiverUrl()) setupMicrophoneSelect();
};

function isSharedReceiverUrl() {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('room')) && params.get('role') !== 'sender';
}

function generateRoomID() {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((value) => value.toString(36).padStart(2, '0'))
        .join('')
        .slice(0, 8)
        .toUpperCase();
    document.getElementById('room-id').value = id;
    updateShareLink(true);
}

function applyShareParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const role = params.get('role');
    const stage = params.get('stage');
    if (!room) {
        updateShareLink();
        return;
    }
    const roomInput = document.getElementById('room-id');
    const roleSelect = document.getElementById('role-select');
    if (roomInput) roomInput.value = room.replace(/[^\w-]/g, '').slice(0, 32);
    if (roleSelect) roleSelect.value = role === 'sender' ? 'sender' : 'receiver';
    updateShareLink(true);
    switchMode('shared');
    if (stage === '1') toggleStageMode(false);
}

function switchMode(mode) {
    document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetContainer = document.getElementById(mode + '-container');
    if (targetContainer) targetContainer.classList.add('active');
    
    const navItems = document.querySelectorAll('.nav-item');
    if (mode === 'youtube') navItems[0].classList.add('active');
    else if (mode === 'mic') navItems[1].classList.add('active');
    
    if (mode === 'mic') renderHistory();
    
    stopProRec();
}

function clearSharedTranscript() {
    document.getElementById('shared-text').innerText = "";
}

function getShareUrl(stage = false) {
    const room = document.getElementById('room-id')?.value.trim();
    if (!room) return "";
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set('room', room);
    url.searchParams.set('role', 'receiver');
    if (stage) url.searchParams.set('stage', '1');
    return url.toString();
}

function updateShareLink(showQr = false) {
    const shareInput = document.getElementById('share-link');
    const qrBox = document.getElementById('qr-box');
    const qrImage = document.getElementById('qr-image');
    const url = getShareUrl();
    if (shareInput) shareInput.value = url;
    if (!url) {
        if (qrBox) qrBox.classList.remove('active');
        if (qrImage) qrImage.removeAttribute('src');
        return;
    }
    if (!qrBox || !qrImage) return;
    if (showQr) {
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
        qrBox.classList.add('active');
    }
}

async function copyShareLink() {
    const url = getShareUrl();
    if (!url) return alert("방 번호를 먼저 입력하거나 생성하세요.");
    try {
        await navigator.clipboard.writeText(url);
        log("공유 링크를 복사했습니다.");
    } catch (e) {
        const input = document.getElementById('share-link');
        if (input) {
            input.focus();
            input.select();
        }
        alert("복사가 막혔습니다. 링크 입력칸을 직접 복사해 주세요.");
    }
}

async function copyStageLink() {
    const url = getShareUrl(true);
    if (!url) return alert("방 번호를 먼저 입력하거나 생성하세요.");
    try {
        await navigator.clipboard.writeText(url);
        log("송출 모드 링크를 복사했습니다.");
    } catch (e) {
        alert(url);
    }
}

async function toggleStageMode(shouldRequestFullscreen = true) {
    document.body.classList.toggle('stage-mode');
    const active = document.body.classList.contains('stage-mode');
    const btn = document.getElementById('stage-mode-btn');
    if (btn) btn.textContent = active ? "송출 종료" : "송출 모드";
    if (active && shouldRequestFullscreen) {
        try {
            await document.getElementById('shared-container')?.requestFullscreen?.();
        } catch (e) {
            log("전체 화면 전환은 브라우저에서 허용되지 않았습니다.", true);
        }
    } else if (!active && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (e) {}
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('stage-mode')) {
        document.body.classList.remove('stage-mode');
        const btn = document.getElementById('stage-mode-btn');
        if (btn) btn.textContent = "송출 모드";
    }
});

async function toggleSharedConnection() {
    const btn = document.getElementById('shared-connect-btn');
    const status = document.getElementById('shared-status');
    const room = document.getElementById('room-id').value;
    const role = document.getElementById('role-select').value;
    
    if (!room) return alert("방 번호를 입력해주세요.");

    if (btn.innerText === "연결하기") {
        // Supabase 초기화
        if (!supabaseClient) {
            try {
                const configRes = await fetch('/api/config');
                const config = await configRes.json();
                
                const supabaseKey = config.supabaseAnonKey || config.supabaseKey;
                if (!config.supabaseUrl || !supabaseKey) {
                    alert("Cloudflare 환경 변수 설정이 필요합니다 (SUPABASE_URL, SUPABASE_ANON_KEY).");
                    return;
                }
                
                supabaseClient = supabase.createClient(config.supabaseUrl, supabaseKey);
            } catch (e) {
                alert("설정 정보를 불러오는데 실패했습니다.");
                return;
            }
        }

        btn.innerText = "연결 해제";
        btn.classList.replace('btn-start', 'btn-stop');
        status.innerText = `${room}번 방에 ${role === 'sender' ? '전송' : '수신'} 모드로 연결됨`;
        status.style.color = "var(--primary)";

        if (role === 'receiver') {
            // 수신 모드: 실시간 구독 시작
            roomSubscription = supabaseClient
                .channel(`room-${room}`)
                .on('broadcast', { event: 'caption' }, (payload) => {
                    const sharedText = document.getElementById('shared-text');
                    if (sharedText.innerText.includes("방 번호를 입력하고")) sharedText.innerText = "";
                    sharedText.innerText += payload.payload.text + " ";
                    // 자동 스크롤
                    const scrollArea = document.getElementById('shared-scroll');
                    scrollArea.scrollTop = scrollArea.scrollHeight;
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        log(`${room}번 방 수신 시작`);
                    }
                });
        } else {
            // 전송 모드 채널 미리 열기
            roomSubscription = supabaseClient.channel(`room-${room}`).subscribe();
        }
    } else {
        if (roomSubscription) {
            supabaseClient.removeChannel(roomSubscription);
            roomSubscription = null;
        }
        btn.innerText = "연결하기";
        btn.classList.replace('btn-stop', 'btn-start');
        status.innerText = "연결 대기 중...";
        status.style.color = "var(--text-muted)";
    }
}

// 텍스트를 외부로 공유하는 함수
async function broadcastText(text) {
    const btn = document.getElementById('shared-connect-btn');
    const room = document.getElementById('room-id').value;
    const role = document.getElementById('role-select').value;

    if (btn.innerText === "연결 해제" && role === 'sender' && room && supabaseClient) {
        await supabaseClient.channel(`room-${room}`).send({
            type: 'broadcast',
            event: 'caption',
            payload: { text: text }
        });
    }
}

function updateStyle() {
    const size = (localStorage.getItem('vlive_font_size') || document.getElementById('font-size-slider').value) + "rem";
    const color = localStorage.getItem('vlive_text_color') || document.getElementById('text-color-picker').value;
    const bgColor = localStorage.getItem('vlive_caption_bg') || document.getElementById('caption-bg-picker')?.value || "#000000";
    const bgOpacity = localStorage.getItem('vlive_caption_bg_opacity') || document.getElementById('caption-bg-opacity')?.value || "0";
    document.documentElement.style.setProperty('--caption-size', size);
    document.documentElement.style.setProperty('--caption-color', color);
    document.documentElement.style.setProperty('--caption-bg', hexToRgba(bgColor, bgOpacity));
    localStorage.setItem('vlive_font_size', parseFloat(size));
    localStorage.setItem('vlive_text_color', color);
    localStorage.setItem('vlive_caption_bg', bgColor);
    localStorage.setItem('vlive_caption_bg_opacity', bgOpacity);
    const bgPicker = document.getElementById('caption-bg-picker');
    const bgOpacityInput = document.getElementById('caption-bg-opacity');
    if (bgPicker) bgPicker.value = bgColor;
    if (bgOpacityInput) bgOpacityInput.value = bgOpacity;
}

function hexToRgba(hex, opacity) {
    const clean = String(hex || "#000000").replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((ch) => ch + ch).join("") : clean;
    const num = parseInt(value, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(0.9, Number(opacity) || 0))})`;
}

function toggleFocusMode() {
    document.body.classList.toggle('caption-focus');
    const btn = document.getElementById('focus-mode-btn');
    if (btn) btn.textContent = document.body.classList.contains('caption-focus') ? "기본 화면" : "큰 자막";
}

function toggleSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    const btn = document.getElementById('settings-toggle');
    if (!panel) return;
    panel.classList.toggle('active');
    if (btn) btn.textContent = panel.classList.contains('active') ? "설정 닫기" : "환경설정";
}

function restoreApiSettings() {
    const enabled = localStorage.getItem('vlive_personal_api_enabled') === 'true';
    const provider = localStorage.getItem('vlive_stt_provider') || 'groq';
    const model = localStorage.getItem('vlive_stt_model') || '';
    const apiKey = getSecretValue('vlive_stt_api_key', 'vlive_stt_key_storage');
    const keyStorage = localStorage.getItem('vlive_stt_key_storage') || 'local';
    const providerExtra = localStorage.getItem('vlive_stt_provider_extra') || '';
    const diarization = localStorage.getItem('vlive_stt_diarization') === 'true';
    const enabledInput = document.getElementById('personal-api-enabled');
    const providerInput = document.getElementById('stt-provider');
    const apiKeyInput = document.getElementById('stt-api-key');
    const keyStorageInput = document.getElementById('stt-key-storage');
    const providerExtraInput = document.getElementById('stt-provider-extra');
    const diarizationInput = document.getElementById('stt-diarization-enabled');

    if (enabledInput) enabledInput.checked = enabled;
    if (providerInput && STT_PROVIDER_MODELS[provider]) providerInput.value = provider;
    updateProviderModelOptions(model);
    if (apiKeyInput) apiKeyInput.value = apiKey;
    if (keyStorageInput) keyStorageInput.value = keyStorage;
    if (providerExtraInput) providerExtraInput.value = providerExtra;
    if (diarizationInput) diarizationInput.checked = diarization;
    togglePersonalApiSettings(false);
    updateApiSummary();
}

function updateEngineSettingsVisibility() {
    const engine = document.getElementById('engine-select')?.value;
    const apiSettings = document.getElementById('api-settings');
    const btn = document.getElementById('api-detail-toggle');
    if (!apiSettings) return;
    apiSettings.classList.toggle('active', engine === 'groq');
    apiSettings.classList.remove('detail-open');
    if (btn) btn.textContent = "API 설정";
}

function toggleApiDetail() {
    const apiSettings = document.getElementById('api-settings');
    const btn = document.getElementById('api-detail-toggle');
    if (!apiSettings) return;
    apiSettings.classList.toggle('detail-open');
    if (btn) btn.textContent = apiSettings.classList.contains('detail-open') ? "설정 닫기" : "API 설정";
}

function togglePersonalApiSettings(shouldSave = true) {
    const enabledInput = document.getElementById('personal-api-enabled');
    const apiSettings = document.getElementById('api-settings');
    const enabled = Boolean(enabledInput?.checked);
    if (apiSettings) apiSettings.classList.toggle('use-personal-key', enabled);
    if (shouldSave) saveApiSettings();
    updateApiSummary();
}

function updateProviderModelOptions(preferredModel = "") {
    const providerInput = document.getElementById('stt-provider');
    const modelInput = document.getElementById('stt-model');
    if (!providerInput || !modelInput) return;

    const models = STT_PROVIDER_MODELS[providerInput.value] || STT_PROVIDER_MODELS.groq;
    modelInput.replaceChildren(...models.map((model) => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.label;
        return option;
    }));

    const savedModel = preferredModel || localStorage.getItem('vlive_stt_model') || models[0].value;
    modelInput.value = models.some((model) => model.value === savedModel) ? savedModel : models[0].value;
    updateProviderExtraVisibility();
    saveApiSettings();
    updateApiSummary();
}

function updateProviderExtraVisibility() {
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const apiSettings = document.getElementById('api-settings');
    const extraInput = document.getElementById('stt-provider-extra');
    const extraLabel = document.getElementById('stt-extra-label');
    const providerHelp = document.getElementById('provider-help');
    const meta = STT_PROVIDER_META[provider] || STT_PROVIDER_META.groq;
    const supportsDiarization = ['gladia', 'speechmatics'].includes(provider);

    if (apiSettings) apiSettings.classList.toggle('needs-provider-extra', Boolean(meta.extra));
    if (apiSettings) apiSettings.classList.toggle('supports-diarization', supportsDiarization);
    if (extraLabel && meta.extra) extraLabel.textContent = meta.extra.label;
    if (extraInput && meta.extra) extraInput.placeholder = meta.extra.placeholder;
    if (providerHelp) providerHelp.textContent = meta.help;
}

function saveApiSettings() {
    const enabled = document.getElementById('personal-api-enabled')?.checked ? 'true' : 'false';
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const model = document.getElementById('stt-model')?.value || '';
    const apiKey = document.getElementById('stt-api-key')?.value || '';
    const keyStorage = document.getElementById('stt-key-storage')?.value || 'local';
    const providerExtra = document.getElementById('stt-provider-extra')?.value || '';
    const diarization = document.getElementById('stt-diarization-enabled')?.checked ? 'true' : 'false';
    localStorage.setItem('vlive_personal_api_enabled', enabled);
    localStorage.setItem('vlive_stt_provider', provider);
    localStorage.setItem('vlive_stt_model', model);
    setSecretValue('vlive_stt_api_key', apiKey, 'vlive_stt_key_storage', keyStorage);
    localStorage.setItem('vlive_stt_provider_extra', providerExtra);
    localStorage.setItem('vlive_stt_diarization', diarization);
    updateApiSummary();
}

function applyGroqApiKey(apiKey, storage = "session") {
    const key = String(apiKey || "").trim();
    if (!key) return false;
    const engineInput = document.getElementById('engine-select');
    const enabledInput = document.getElementById('personal-api-enabled');
    const providerInput = document.getElementById('stt-provider');
    const keyInput = document.getElementById('stt-api-key');
    const storageInput = document.getElementById('stt-key-storage');
    if (engineInput) engineInput.value = 'groq';
    updateEngineSettingsVisibility();
    if (enabledInput) enabledInput.checked = true;
    if (providerInput) providerInput.value = 'groq';
    if (storageInput) storageInput.value = storage === 'local' ? 'local' : 'session';
    updateProviderModelOptions();
    if (keyInput) keyInput.value = key;
    togglePersonalApiSettings(false);
    saveApiSettings();
    showToast("Groq 개인 API 키를 이번 세션에 적용했습니다.");
    return true;
}

function promptGroqApiKey() {
    const key = prompt("Groq API 키를 붙여 넣으세요. 소스 파일에는 저장되지 않습니다.");
    if (!key) return;
    if (!applyGroqApiKey(key, "session")) {
        showToast("Groq API 키를 적용하지 못했습니다.", "error");
    }
}

function updateApiSummary() {
    const summary = document.getElementById('api-mode-summary');
    if (!summary) return;
    const usePersonalKey = document.getElementById('personal-api-enabled')?.checked;
    if (!usePersonalKey) {
        summary.textContent = "기본 서버 API 사용 중 · 개인 키 선택 가능";
        return;
    }
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const model = document.getElementById('stt-model')?.value || '';
    const meta = STT_PROVIDER_META[provider] || STT_PROVIDER_META.groq;
    summary.textContent = `${meta.summary}${model ? ` · ${model}` : ""}`;
}

function getSttRequestSettings() {
    const usePersonalKey = document.getElementById('personal-api-enabled')?.checked;
    if (!usePersonalKey) return { provider: 'default' };
    saveApiSettings();
    return {
        provider: document.getElementById('stt-provider')?.value || 'groq',
        model: document.getElementById('stt-model')?.value || '',
        apiKey: document.getElementById('stt-api-key')?.value.trim() || '',
        providerExtra: document.getElementById('stt-provider-extra')?.value.trim() || '',
        diarization: Boolean(document.getElementById('stt-diarization-enabled')?.checked)
    };
}

function getCloudRecordingOptions(provider) {
    if (provider === 'azure' && MediaRecorder.isTypeSupported?.('audio/ogg;codecs=opus')) {
        return { mimeType: 'audio/ogg;codecs=opus' };
    }
    if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) {
        return { mimeType: 'audio/webm;codecs=opus' };
    }
    return {};
}

function getSecretValue(key, storageModeKey) {
    const mode = localStorage.getItem(storageModeKey) || 'local';
    return mode === 'session' ? (sessionStorage.getItem(key) || "") : (localStorage.getItem(key) || "");
}

function setSecretValue(key, value, storageModeKey, mode) {
    localStorage.setItem(storageModeKey, mode);
    if (mode === 'session') {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
    } else {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
    }
}

function restoreAiSettings() {
    const enabled = localStorage.getItem('vlive_ai_personal_api_enabled') === 'true';
    const provider = localStorage.getItem('vlive_ai_provider') || 'gemini';
    const model = localStorage.getItem('vlive_ai_model') || '';
    const apiKey = getSecretValue('vlive_ai_api_key', 'vlive_ai_key_storage');
    const keyStorage = localStorage.getItem('vlive_ai_key_storage') || 'local';
    const enabledInput = document.getElementById('ai-personal-api-enabled');
    const providerInput = document.getElementById('ai-provider');
    const apiKeyInput = document.getElementById('ai-api-key');
    const keyStorageInput = document.getElementById('ai-key-storage');

    if (enabledInput) enabledInput.checked = enabled;
    if (providerInput && AI_PROVIDER_MODELS[provider]) providerInput.value = provider;
    updateAiModelOptions(model);
    if (apiKeyInput) apiKeyInput.value = apiKey;
    if (keyStorageInput) keyStorageInput.value = keyStorage;
    toggleAiPersonalApiSettings(false);
}

function toggleAiSettings() {
    const panel = document.getElementById('ai-settings-panel');
    const btn = document.getElementById('ai-settings-toggle');
    if (!panel) return;
    panel.classList.toggle('active');
    if (btn) btn.textContent = panel.classList.contains('active') ? "설정 닫기" : "AI 설정";
}

function toggleAiPersonalApiSettings(shouldSave = true) {
    const enabledInput = document.getElementById('ai-personal-api-enabled');
    const panel = document.getElementById('ai-settings-panel');
    const enabled = Boolean(enabledInput?.checked);
    if (panel) panel.classList.toggle('use-personal-key', enabled);
    if (shouldSave) saveAiSettings();
    updateAiSummary();
}

function updateAiModelOptions(preferredModel = "") {
    const providerInput = document.getElementById('ai-provider');
    const modelInput = document.getElementById('ai-model');
    if (!providerInput || !modelInput) return;

    const models = AI_PROVIDER_MODELS[providerInput.value] || AI_PROVIDER_MODELS.gemini;
    modelInput.replaceChildren(...models.map((model) => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.label;
        return option;
    }));

    const savedModel = preferredModel || localStorage.getItem('vlive_ai_model') || models[0].value;
    modelInput.value = models.some((model) => model.value === savedModel) ? savedModel : models[0].value;
    saveAiSettings();
    updateAiSummary();
}

function saveAiSettings() {
    const enabled = document.getElementById('ai-personal-api-enabled')?.checked ? 'true' : 'false';
    const provider = document.getElementById('ai-provider')?.value || 'gemini';
    const model = document.getElementById('ai-model')?.value || '';
    const apiKey = document.getElementById('ai-api-key')?.value || '';
    const keyStorage = document.getElementById('ai-key-storage')?.value || 'local';
    localStorage.setItem('vlive_ai_personal_api_enabled', enabled);
    localStorage.setItem('vlive_ai_provider', provider);
    localStorage.setItem('vlive_ai_model', model);
    setSecretValue('vlive_ai_api_key', apiKey, 'vlive_ai_key_storage', keyStorage);
    updateAiSummary();
}

function updateAiSummary() {
    const summary = document.getElementById('ai-mode-summary');
    if (!summary) return;
    const enabled = document.getElementById('ai-personal-api-enabled')?.checked;
    if (!enabled) {
        summary.textContent = "기본 AI API 사용 중 · 개인 키 선택 가능";
        return;
    }
    const provider = document.getElementById('ai-provider')?.value || 'gemini';
    const model = document.getElementById('ai-model')?.value || '';
    summary.textContent = `개인 ${provider.toUpperCase()} API 사용 중${model ? ` · ${model}` : ""}`;
}

function getAiRequestSettings() {
    const enabled = document.getElementById('ai-personal-api-enabled')?.checked;
    if (!enabled) return { provider: 'default' };
    saveAiSettings();
    return {
        provider: document.getElementById('ai-provider')?.value || 'gemini',
        model: document.getElementById('ai-model')?.value || '',
        apiKey: document.getElementById('ai-api-key')?.value.trim() || ''
    };
}

function getMinutesType() {
    return document.getElementById('minutes-type')?.value || 'meeting';
}

async function translateCaptionChunk(text) {
    const target = document.getElementById('translation-target')?.value || 'none';
    if (target === 'none' || !text) return text;
    if (location.protocol === "file:") {
        log("번역은 서버 주소에서 실행할 때 사용할 수 있습니다. 원문 자막을 표시합니다.", true);
        return text;
    }
    const source = cleanText(text);
    if (source.length < 2) return source;
    const cacheKey = `${target}:${source}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    const now = Date.now();
    if (translationInFlight || now - lastTranslationAt < TRANSLATION_MIN_INTERVAL_MS) {
        log("번역 자막 요청 간격 제한: 원문을 우선 표시합니다.", true);
        return source;
    }
    const aiSettings = getAiRequestSettings();
    if (aiSettings.provider !== 'default' && !aiSettings.apiKey) {
        log("번역 자막에는 AI 개인 API 키를 입력하거나 개인 API 키 사용을 꺼주세요.", true);
        return source;
    }
    try {
        translationInFlight = true;
        lastTranslationAt = now;
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        if (!res.ok || !data.result) {
            log(data.result || "번역 자막 요청 실패", true);
            return source;
        }
        const translated = data.result.trim();
        translationCache.set(cacheKey, translated);
        if (translationCache.size > 30) translationCache.delete(translationCache.keys().next().value);
        return translated;
    } catch (e) {
        log("번역 자막 연결 오류: 로컬 파일로 열었다면 서버 주소에서 실행해 주세요.", true);
        return source;
    } finally {
        translationInFlight = false;
    }
}

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
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
}

function saveHistorySnapshot(text) {
    const content = (text || "").trim();
    if (content.length < 10) return;
    const history = getHistory();
    const now = new Date();
    const latest = history[0];
    const item = {
        id: latest && now.getTime() - latest.updatedAt < 60000 ? latest.id : String(now.getTime()),
        title: content.slice(0, 42) + (content.length > 42 ? "..." : ""),
        text: content,
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
        list.textContent = "지난 자막이 없습니다. 실시간 자막이 생성되면 최근 내용이 이곳에 표시됩니다.";
        return;
    }
    history.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'history-item';

        const meta = document.createElement('div');
        meta.className = 'history-meta';

        const title = document.createElement('strong');
        title.textContent = item.title || "자막 기록";
        const date = document.createElement('span');
        date.textContent = new Date(item.updatedAt).toLocaleString();
        const preview = document.createElement('p');
        preview.textContent = item.text.slice(0, 140) + (item.text.length > 140 ? "..." : "");
        meta.append(title, date, preview);

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-pip';
        loadBtn.textContent = "불러오기";
        loadBtn.onclick = () => loadHistoryItem(item.id);
        const minutesBtn = document.createElement('button');
        minutesBtn.className = 'btn btn-pip';
        minutesBtn.textContent = "회의록";
        minutesBtn.onclick = () => createMinutesFromHistory(item.id);
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-pip';
        downloadBtn.textContent = "다운로드";
        downloadBtn.onclick = () => downloadHistoryItem(item.id);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-pip';
        deleteBtn.textContent = "삭제";
        deleteBtn.onclick = () => deleteHistoryItem(item.id);
        actions.append(loadBtn, minutesBtn, downloadBtn, deleteBtn);

        row.append(meta, actions);
        list.appendChild(row);
    });
}

function loadHistoryItem(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    setTranscriptText(item.text);
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

async function createSmartMinutes() {
    await callAI(null, "minutes");
}

async function createMinutesFromHistory(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    setTranscriptText(item.text);
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
    if (!text) return alert("복사할 회의록이 없습니다.");
    try {
        await navigator.clipboard.writeText(text);
        log("회의록 Markdown을 복사했습니다.");
    } catch (e) {
        alert("브라우저에서 클립보드 복사를 허용하지 않았습니다.");
    }
}

function downloadSmartMinutes() {
    const text = getSmartMinutesText();
    if (!text) return alert("다운로드할 회의록이 없습니다.");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(text, `LiveNote_회의록_${stamp}.md`);
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
        setRecordingButtons(false);
        const mimeType = getRecordingMimeType();
        sessionRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        sessionRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) sessionRecordingChunks.push(event.data);
        };
        sessionRecorder.onstop = () => {
            const type = sessionRecorder?.mimeType || mimeType || 'audio/webm';
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
    const res = await fetch('/api/stt', { method: 'POST', body: formData });
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

async function transcribeSessionRecording() {
    if (!lastSessionRecording) return alert("변환할 녹음 파일이 없습니다.");
    if (location.protocol === "file:") {
        alert("최종 변환은 서버 주소에서 사용할 수 있습니다. 녹음 다운로드 후 다시 업로드하는 방식으로 처리해 주세요.");
        return;
    }
    const transcribeBtn = document.getElementById('recording-transcribe');
    if (transcribeBtn) transcribeBtn.disabled = true;
    try {
        log("녹음 파일 최종 변환을 시작합니다.");
        showToast("녹음 파일 최종 변환을 시작합니다.");
        const lang = document.getElementById('lang-select')?.value || 'auto';
        const sttSettings = getSttRequestSettings();
        const formData = new FormData();
        formData.append('file', lastSessionRecording, lastSessionRecording.type.includes('ogg') ? 'recording.ogg' : 'recording.webm');
        if (lang !== 'auto') formData.append('language', lang);
        formData.append('provider', sttSettings.provider);
        if (sttSettings.provider !== 'default') {
            if (!sttSettings.apiKey) {
                alert("개인 API 키를 입력하거나 개인 API 키 사용을 꺼주세요.");
                return;
            }
            formData.append('model', sttSettings.model);
            formData.append('apiKey', sttSettings.apiKey);
            if (sttSettings.diarization) formData.append('diarization', 'true');
            if (sttSettings.providerExtra) formData.append('providerExtra', sttSettings.providerExtra);
        }
        const data = await requestStt(formData);
        if (!data.text) {
            log("녹음 파일 변환 실패", true);
            return;
        }
        const cleaned = cleanText(data.text);
        if (!cleaned) {
            log("변환된 자막 내용이 없습니다.", true);
            return;
        }
        setTranscriptText(cleaned);
        saveHistorySnapshot(cleaned);
        renderHistory();
        log("녹음 파일 최종 변환이 완료되었습니다.");
        showToast("녹음 파일 최종 변환이 완료되었습니다.");
    } catch (e) {
        log("녹음 파일 변환 오류: " + e.message, true);
        showToast(e.message || "녹음 파일 변환 오류가 발생했습니다.", "error", 5200);
    } finally {
        if (transcribeBtn) transcribeBtn.disabled = !lastSessionRecording;
    }
}

function showToast(message, type = "success", duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimer = setTimeout(() => {
        toast.className = "toast";
    }, duration);
}

const log = (msg, isError = false) => {
    const box = document.getElementById('debug-log');
    if (!box) return;
    const color = isError ? '#FF5252' : '#00E676';
    const line = document.createElement('span');
    line.style.color = color;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.append(line, document.createElement('br'));
    box.scrollTop = box.scrollHeight;
};

const appendPlainText = (target, text, suffix = "") => {
    if (!target || !text) return;
    target.append(document.createTextNode(text + suffix));
};

const setPlainText = (target, text) => {
    if (!target) return;
    target.textContent = text;
};

function renderTranscriptDisplay() {
    const el = document.getElementById('youtube-text');
    if (!el) return;
    const visibleText = transcriptText.length > DISPLAY_TRANSCRIPT_LIMIT
        ? "... " + transcriptText.slice(-DISPLAY_TRANSCRIPT_LIMIT)
        : transcriptText;
    setPlainText(el, visibleText);
}

function setTranscriptText(text) {
    transcriptText = text || "";
    localStorage.setItem('vlive_transcript', transcriptText);
    renderTranscriptDisplay();
}

function appendCaptionChunk(text) {
    if (!text) return;
    const separator = transcriptText.trim() ? "\n" : "";
    transcriptText = `${transcriptText.trimEnd()}${separator}${text.trim()}`;
    localStorage.setItem('vlive_transcript', transcriptText);
    const now = Date.now();
    if (now - lastHistorySaveAt > HISTORY_SAVE_INTERVAL_MS) {
        lastHistorySaveAt = now;
        saveHistorySnapshot(transcriptText);
    }
    renderTranscriptDisplay();
    const scroll = document.getElementById('youtube-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    broadcastText(text);
}

const appendAiMessage = (container, label, text, className = "") => {
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.className = className;
    wrapper.style.marginTop = '10px';
    const prefix = document.createElement('strong');
    prefix.textContent = label;
    if (label === 'Q: ') prefix.style.color = 'var(--primary)';
    wrapper.append(prefix, document.createTextNode(text));
    container.appendChild(wrapper);
};

function initAds() {
    // AdSense 승인 후 data-ad-slot에 실제 광고 단위 ID를 입력하면 자동으로 로드됩니다.
    document.querySelectorAll('.adsbygoogle').forEach((ad) => {
        const wrapper = ad.closest('.ad-slot');
        if (!ad.dataset.adSlot) {
            if (wrapper) wrapper.classList.remove('is-ready');
            return;
        }
        if (wrapper) wrapper.classList.add('is-ready');
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            log("광고 로드 대기 중");
        }
    });
}

const setStatus = (status, active = false) => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (text) text.innerText = status.toUpperCase();
    if (dot) { if(active) dot.classList.add('active'); else dot.classList.remove('active'); }
};

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
    const stride = Math.max(1, Math.floor(samples.length / 16000));
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
    whisperWorker = new Worker('local-whisper-worker.js', { type: 'module' });
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

function setupMicrophoneSelect(message = "이용 가능한 마이크 선택") {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect) return;
    const placeholder = new Option(message, "", true, true);
    placeholder.disabled = true;
    deviceSelect.replaceChildren(
        placeholder,
        new Option("마이크 권한 허용하기", MIC_PERMISSION_VALUE)
    );
}

async function handleDeviceSelectChange() {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect || !deviceSelect.value) return;
    await initAudio();
}

async function initAudio() {
    const deviceSelect = document.getElementById('device-select');
    try {
        if (audioContext && audioContext.state !== 'closed') await audioContext.close();
        if (!deviceSelect) return;
        const savedDeviceId = localStorage.getItem('vlive_audio_device') || "";
        const requestedPermission = deviceSelect.value === MIC_PERMISSION_VALUE;
        let deviceId = requestedPermission ? "" : (deviceSelect.value || savedDeviceId);
        const getConstraints = (id) => ({ audio: { deviceId: id ? { exact: id } : undefined, autoGainControl: false, echoCancellation: false, noiseSuppression: false } });
        if(stream) stream.getTracks().forEach(track => track.stop());
        try {
            stream = await navigator.mediaDevices.getUserMedia(getConstraints(deviceId));
        } catch (e) {
            if (!deviceId) throw e;
            deviceId = "";
            localStorage.removeItem('vlive_audio_device');
            stream = await navigator.mediaDevices.getUserMedia(getConstraints(""));
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        const selectableMics = mics.filter(mic => mic.deviceId && mic.deviceId !== "default");
        const currentVal = selectableMics.some(mic => mic.deviceId === deviceId) ? deviceId : "";
        deviceSelect.replaceChildren();
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "시스템 기본 마이크 사용";
        defaultOption.selected = !currentVal;
        deviceSelect.appendChild(defaultOption);
        selectableMics.forEach((mic, index) => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            option.textContent = mic.label || `이름 없는 입력 장치 ${index + 1}`;
            option.selected = mic.deviceId === currentVal;
            deviceSelect.appendChild(option);
        });
        if (!selectableMics.length) {
            const emptyOption = document.createElement('option');
            emptyOption.value = "";
            emptyOption.textContent = "이용 가능한 추가 마이크 없음";
            emptyOption.disabled = true;
            deviceSelect.appendChild(emptyOption);
        }
        localStorage.setItem('vlive_audio_device', currentVal);
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        
        function draw() {
            if(!audioContext || audioContext.state === 'closed') return;
            
            // 세션이 실행 중이거나 PIP가 활성 상태일 때만 분석 및 렌더링 수행
            if (isProRunning || pipActive) {
                analyser.getByteFrequencyData(data);
                let sum = 0; for(let i=0; i<data.length; i++) sum += data[i];
                let avg = Math.round((sum / data.length) * 4.8); 
                const vFill = document.getElementById('v-fill');
                const vLabel = document.getElementById('v-label');
                if (vFill) vFill.style.width = Math.min(100, avg) + "%";
                if (vLabel) vLabel.innerText = Math.min(100, avg) + "%";
                
                // PIP가 활성 상태일 때만 캔버스 렌더링 (성능 최적화)
                if (pipActive) updatePipCanvas();
            }
            requestAnimationFrame(draw);
        }
        draw();
        setStatus("준비 완료", false);
    } catch(e) {
        if (deviceSelect) {
            setupMicrophoneSelect("마이크 권한이 필요합니다");
        }
        log("마이크 연결 실패: 브라우저 권한과 입력 장치를 확인하세요.", true);
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
    const lang = document.getElementById('lang-select').value;
    isProRunning = true;
    isProcessingChunk = false;
    document.getElementById('pro-start').disabled = true;
    document.getElementById('pro-stop').disabled = false;
    startSessionRecording();
    setStatus(engine === 'groq' ? "클라우드 자막 중" : "자막 생성 중", true);

    if (engine === 'local-whisper') {
        showToast("내 기기에서 자막 생성을 시작합니다.");
        startLocalWhisper(lang);
    } else {
        const sttSettings = getSttRequestSettings();
        const apiLabel = sttSettings.provider === 'default'
            ? "기본 서버 API"
            : `개인 ${sttSettings.provider.toUpperCase()} API`;
        showToast(`${apiLabel}로 클라우드 자막을 시작합니다.`);
        startGroqWhisper(lang);
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
                if (rms < LOCAL_MIN_RMS) {
                    logLowSignalOnce();
                    return;
                }

                const text = await transcribeLocal(audioFloat32, lang);
                document.getElementById('model-loading').style.display = 'none';
                const cleaned = await prepareCaptionText(text);
                if (cleaned && cleaned.length > 1) appendCaptionChunk(cleaned);
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
            const blob = await recordAudioChunk(CAPTURE_TIMING.cloudRecordMs, getCloudRecordingOptions(sttSettings.provider));
            if (blob.size < 2500) return;
            const formData = new FormData();
            formData.append('file', blob, blob.type.includes('ogg') ? 'audio.ogg' : 'audio.webm');
            if (lang !== 'auto') formData.append('language', lang);
            formData.append('provider', sttSettings.provider);
            if (sttSettings.provider !== 'default') {
                if (!sttSettings.apiKey) {
                    log("개인 API 키를 입력하거나 개인 API 키 사용을 꺼주세요.", true);
                    showToast("개인 API 키가 필요합니다.", "error");
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
            if (data.text) {
                const cleaned = await prepareCaptionText(data.text);
                if (cleaned) appendCaptionChunk(cleaned);
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
    const startBtn = document.getElementById('pro-start');
    const stopBtn = document.getElementById('pro-stop');
    if (startBtn) startBtn.disabled = false; 
    if (stopBtn) stopBtn.disabled = true;
    const interimText = document.getElementById('interim-text');
    if (interimText) interimText.innerText = ""; 
    setStatus("IDLE", false);
    const modelLoading = document.getElementById('model-loading');
    if (modelLoading) modelLoading.style.display = 'none';
    showToast("세션을 종료했습니다.");
}

async function callAI(question = null, mode = "summary") {
    const text = transcriptText.trim();
    if (text.length < 5) return log("데이터 부족", true);
    const aiArea = document.getElementById('youtube-ai');
    if (!aiArea) return;
    const trimmedQuestion = question ? question.trim() : "";
    const isMinutesMode = mode === "minutes";
    if (trimmedQuestion) {
        appendAiMessage(aiArea, "Q: ", trimmedQuestion);
        document.getElementById('chat-input').value = "";
    } else if (isMinutesMode) {
        setPlainText(aiArea, "회의록을 작성 중...");
    } else {
        setPlainText(aiArea, "분석 중...");
    }
    try {
        const aiSettings = getAiRequestSettings();
        if (aiSettings.provider !== 'default' && !aiSettings.apiKey) {
            log("AI 개인 API 키를 입력하거나 개인 API 키 사용을 꺼주세요.", true);
            if (!trimmedQuestion) setPlainText(aiArea, "AI 개인 API 키를 입력하거나 개인 API 키 사용을 꺼주세요.");
            return;
        }
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                question: trimmedQuestion || null,
                mode: isMinutesMode ? "minutes" : "summary",
                minutesType: isMinutesMode ? getMinutesType() : "",
                provider: aiSettings.provider,
                model: aiSettings.model,
                apiKey: aiSettings.apiKey
            })
        });
        const data = await res.json();
        const result = data.result || "결과 오류";
        if (trimmedQuestion) appendAiMessage(aiArea, "A: ", result);
        else {
            setPlainText(aiArea, result);
            if (isMinutesMode) localStorage.setItem('vlive_last_minutes', result);
        }
        aiArea.scrollTop = aiArea.scrollHeight;
    } catch (e) { log("AI 오류", true); }
}
