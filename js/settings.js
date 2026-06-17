// ============================================================
// settings.js
// STT / AI API 설정 저장·복원, 마이크·기기 설정
// 의존: constants.js, ui.js
// ============================================================

// ── 공통 유틸 ─────────────────────────────────────────────

function getRecognitionLanguage() {
    const value = document.getElementById('lang-select')?.value || 'en';
    return value === 'en-AU' ? 'en' : value;
}

function getRecognitionLanguageForServer() {
    return document.getElementById('lang-select')?.value || 'en';
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

// ── STT 설정 ──────────────────────────────────────────────

function restoreApiSettings() {
    const enabled = localStorage.getItem('vlive_personal_api_enabled') === 'true';
    const provider = localStorage.getItem('vlive_stt_provider') || 'groq';
    const model = localStorage.getItem('vlive_stt_model') || '';
    const apiKey = getSecretValue('vlive_stt_api_key', 'vlive_stt_key_storage');
    const keyStorage = localStorage.getItem('vlive_stt_key_storage') || 'local';
    const providerExtra = localStorage.getItem('vlive_stt_provider_extra') || '';

    const enabledInput = document.getElementById('personal-api-enabled');
    const providerInput = document.getElementById('stt-provider');
    const apiKeyInput = document.getElementById('stt-api-key');
    const keyStorageInput = document.getElementById('stt-key-storage');
    const providerExtraInput = document.getElementById('stt-provider-extra');

    if (enabledInput) enabledInput.checked = enabled;
    if (providerInput && STT_PROVIDER_MODELS[provider]) providerInput.value = provider;
    updateProviderModelOptions(model);
    if (apiKeyInput) apiKeyInput.value = apiKey;
    if (keyStorageInput) keyStorageInput.value = keyStorage;
    if (providerExtraInput) providerExtraInput.value = providerExtra;
    togglePersonalApiSettings(false);
    updateApiSummary();
}

function saveApiSettings() {
    const enabled = document.getElementById('personal-api-enabled')?.checked ? 'true' : 'false';
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const model = document.getElementById('stt-model')?.value || '';
    const apiKey = document.getElementById('stt-api-key')?.value || '';
    const keyStorage = document.getElementById('stt-key-storage')?.value || 'local';
    const providerExtra = document.getElementById('stt-provider-extra')?.value || '';
    localStorage.setItem('vlive_personal_api_enabled', enabled);
    localStorage.setItem('vlive_stt_provider', provider);
    localStorage.setItem('vlive_stt_model', model);
    setSecretValue('vlive_stt_api_key', apiKey, 'vlive_stt_key_storage', keyStorage);
    localStorage.setItem('vlive_stt_provider_extra', providerExtra);
    localStorage.removeItem('vlive_stt_diarization');
    updateApiSummary();
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

function togglePersonalApiSettings(shouldSave = true) {
    const enabledInput = document.getElementById('personal-api-enabled');
    const apiSettings = document.getElementById('api-settings');
    const enabled = Boolean(enabledInput?.checked);
    if (apiSettings) apiSettings.classList.toggle('use-personal-key', enabled);
    if (shouldSave) saveApiSettings();
    updateApiSummary();
}

function updateEngineSettingsVisibility() {
    const engine = document.getElementById('engine-select')?.value;
    const apiSettings = document.getElementById('api-settings');
    const btn = document.getElementById('api-detail-toggle');
    if (!apiSettings) return;
    apiSettings.classList.toggle('active', engine === 'groq');
    apiSettings.classList.remove('detail-open');
    if (btn) btn.textContent = uiText('advancedSettings');
}

function toggleApiDetail() {
    const apiSettings = document.getElementById('api-settings');
    const btn = document.getElementById('api-detail-toggle');
    if (!apiSettings) return;
    apiSettings.classList.toggle('detail-open');
    if (btn) btn.textContent = apiSettings.classList.contains('detail-open') ? uiText('closeSettings') : uiText('advancedSettings');
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
    if (providerHelp) providerHelp.textContent = getProviderHelp(provider);
}

function getProviderHelp(provider) {
    const english = {
        groq: "Use one Groq key for Whisper-based high-accuracy captions.",
        openai: "Use one OpenAI key for high-accuracy captions.",
        gladia: "Gladia can be useful for longer usage.",
        speechmatics: "Speechmatics is strong for accents and varied speech.",
        ibm: "IBM Watson requires both an API key and a service URL.",
        azure: "Azure Speech requires an API key and region."
    };
    const korean = {
        groq: "Groq 키 하나로 Whisper 기반 고정밀 자막을 사용할 수 있습니다.",
        openai: "OpenAI 키 하나로 고정밀 자막을 사용할 수 있습니다.",
        gladia: "Gladia는 무료 제공량이 넉넉한 편이라 긴 사용에 적합합니다.",
        speechmatics: "Speechmatics는 악센트와 다양한 발화에 강한 편입니다.",
        ibm: "IBM Watson은 API 키와 서비스 URL이 모두 필요합니다.",
        azure: "Azure Speech는 API 키와 리전이 필요합니다."
    };
    return (getAppLanguage() === 'ko' ? korean : english)[provider] || (getAppLanguage() === 'ko' ? korean.groq : english.groq);
}

function updateApiSummary() {
    const summary = document.getElementById('api-mode-summary');
    if (!summary) return;
    const enabled = document.getElementById('personal-api-enabled')?.checked;
    if (!enabled) { summary.textContent = uiText('serverCredit'); return; }
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const model = document.getElementById('stt-model')?.value || '';
    summary.textContent = getAppLanguage() === 'ko'
        ? `내 ${provider.toUpperCase()} API 키 사용 중${model ? ` · ${model}` : ""}`
        : `Using my ${provider.toUpperCase()} API key${model ? ` · ${model}` : ""}`;
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
    updateProviderModelOptions();
    if (keyInput) keyInput.value = key;
    if (storageInput) storageInput.value = storage;
    saveApiSettings();
    return true;
}

function getCloudRecordingOptions(provider) {
    if (provider === 'azure' && MediaRecorder.isTypeSupported?.('audio/ogg;codecs=opus')) return { mimeType: 'audio/ogg;codecs=opus' };
    if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) return { mimeType: 'audio/webm;codecs=opus' };
    return {};
}

// ── AI 설정 ───────────────────────────────────────────────

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

function toggleAiSettings() {
    const panel = document.getElementById('ai-settings-panel');
    const btn = document.getElementById('ai-settings-toggle');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (btn) btn.textContent = panel.classList.contains('collapsed') ? uiText('materialSettings') : uiText('closeSettings');
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

function updateAiSummary() {
    const summary = document.getElementById('ai-mode-summary');
    if (!summary) return;
    const enabled = document.getElementById('ai-personal-api-enabled')?.checked;
    if (!enabled) { summary.textContent = uiText('serverCredit'); return; }
    const provider = document.getElementById('ai-provider')?.value || 'gemini';
    const model = document.getElementById('ai-model')?.value || '';
    summary.textContent = `내 ${provider.toUpperCase()} API 키 사용 중${model ? ` · ${model}` : ""}`;
}

function getMinutesType() {
    return document.getElementById('minutes-type')?.value || 'lecture';
}

// ── 수업명 ────────────────────────────────────────────────

function getLessonMeta() {
    const titleInput = document.getElementById('lesson-title');
    return { title: (titleInput?.value || "").trim() };
}

function restoreLessonMeta() {
    try {
        const meta = JSON.parse(localStorage.getItem(LESSON_META_KEY) || "{}");
        const titleInput = document.getElementById('lesson-title');
        if (titleInput && meta.title) titleInput.value = meta.title;
    } catch (e) {}
}

function saveLessonMeta() {
    localStorage.setItem(LESSON_META_KEY, JSON.stringify(getLessonMeta()));
}