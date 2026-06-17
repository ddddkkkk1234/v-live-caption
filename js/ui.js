// ============================================================
// ui.js
// UI 제어: 언어전환, 스타일, 토스트, 상태표시, 모달, 네비게이션
// 의존: constants.js (UI_TEXT, UI_TEXT_LOOKUP)
// ============================================================

let toastTimer = null;

// ── 언어 ──────────────────────────────────────────────────

function getAppLanguage() {
    const selected = document.getElementById('lang-select')?.value || localStorage.getItem(UI_LANGUAGE_KEY) || 'en';
    return selected === 'ko' ? 'ko' : 'en';
}

function uiText(key) {
    return (UI_TEXT[getAppLanguage()] || UI_TEXT.en)[key] || UI_TEXT.en[key] || key;
}

function initLanguageControls() {
    const selector = document.getElementById('lang-select');
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const saved = ['en', 'ko', 'ja'].includes(urlLang) ? urlLang : (localStorage.getItem(UI_LANGUAGE_KEY) || 'en');
    if (selector) {
        selector.value = ['en', 'ko', 'ja'].includes(saved) ? saved : 'en';
        selector.addEventListener('change', () => {
            localStorage.setItem(UI_LANGUAGE_KEY, selector.value || 'en');
            applyUiLanguage();
            renderPremiumState();
            renderAuthState();
            renderHistory();
        });
    }
    applyUiLanguage();
}

function preserveTextWhitespace(original, replacement) {
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    return `${leading}${replacement}${trailing}`;
}

function translateInlineText(value, dict) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const directKey = UI_TEXT_LOOKUP[normalized];
    if (directKey && dict[directKey]) return preserveTextWhitespace(value, dict[directKey]);
    const stripped = normalized.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const prefix = normalized.slice(0, normalized.indexOf(stripped));
    const strippedKey = UI_TEXT_LOOKUP[stripped];
    if (strippedKey && dict[strippedKey]) return preserveTextWhitespace(value, `${prefix}${dict[strippedKey]}`);
    return value;
}

function applyUiLanguage() {
    const lang = getAppLanguage();
    const dict = UI_TEXT[lang] || UI_TEXT.en;
    document.documentElement.lang = lang;
    document.querySelectorAll('body *').forEach((el) => {
        if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) return;
        el.childNodes.forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            node.nodeValue = translateInlineText(node.nodeValue, dict);
        });
        if (el.placeholder) {
            const key = UI_TEXT_LOOKUP[el.placeholder.trim()];
            if (key && dict[key]) el.placeholder = dict[key];
        }
        if (el.title) {
            const key = UI_TEXT_LOOKUP[el.title.trim()];
            if (key && dict[key]) el.title = dict[key];
        }
        const aria = el.getAttribute('aria-label');
        if (aria) {
            const key = UI_TEXT_LOOKUP[aria.trim()];
            if (key && dict[key]) el.setAttribute('aria-label', dict[key]);
        }
    });
    document.querySelectorAll('option').forEach((option) => {
        const normalized = option.textContent.trim().replace(/\s+/g, ' ');
        const key = UI_TEXT_LOOKUP[normalized];
        if (key && dict[key]) option.textContent = dict[key];
    });
    updateApiSummary();
    updateAiSummary();
}

// ── 스타일 ────────────────────────────────────────────────

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

// ── 토스트 / 로그 / 상태 ──────────────────────────────────

function showToast(message, type = "success", duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimer = setTimeout(() => { toast.className = "toast"; }, duration);
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

const setStatus = (status, active = false) => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (text) text.innerText = status.toUpperCase();
    if (dot) { if (active) dot.classList.add('active'); else dot.classList.remove('active'); }
};

// ── 네비게이션 / 모드 전환 ────────────────────────────────

function switchMode(mode) {
    document.querySelectorAll('.container').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const targetContainer = document.getElementById(mode + '-container');
    if (targetContainer) {
        targetContainer.classList.add('active');
        targetContainer.style.display = 'flex';
    }
    const targetNavItem = document.querySelector(`.nav-item[data-nav="${mode}"]`);
    if (targetNavItem) targetNavItem.classList.add('active');
    if (mode === 'mic') renderHistory();
    stopProRec();
}

// ── 패널 토글 ─────────────────────────────────────────────

function toggleSettingsPanel() {
    const card = document.getElementById('settings-card');
    const btn = document.getElementById('settings-toggle');
    if (!card) return;
    card.classList.toggle('collapsed');
    if (btn) btn.classList.toggle('active', !card.classList.contains('collapsed'));
}

function toggleFooterExtras() {
    const extras = document.getElementById('footer-extras');
    const btn = document.getElementById('footer-extras-toggle');
    if (!extras) return;
    extras.classList.toggle('collapsed');
    if (btn) btn.textContent = extras.classList.contains('collapsed') ? '더보기 ▾' : '접기 ▴';
}

function toggleFocusMode() {
    document.body.classList.toggle('caption-focus');
    const btn = document.getElementById('focus-mode-btn');
    if (btn) btn.textContent = document.body.classList.contains('caption-focus') ? uiText('defaultView') : uiText('largeCaption');
}

// ── 텍스트 헬퍼 ───────────────────────────────────────────

const appendPlainText = (target, text, suffix = "") => {
    if (!target || !text) return;
    target.append(document.createTextNode(text + suffix));
};

const setPlainText = (target, text) => {
    if (!target) return;
    target.textContent = text;
};

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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── AdSense ───────────────────────────────────────────────

function initAds() {
    if (isPremiumPlan()) {
        document.querySelectorAll('.ad-slot').forEach((slot) => slot.classList.remove('is-ready'));
        return;
    }
    document.querySelectorAll('.adsbygoogle').forEach((ad) => {
        const wrapper = ad.closest('.ad-slot');
        if (!ad.dataset.adSlot) {
            if (wrapper) wrapper.classList.remove('is-ready');
            return;
        }
        if (wrapper) wrapper.classList.add('is-ready');
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
        catch (e) { log("광고 로드 대기 중"); }
    });
}

// ── 공유 모달 ─────────────────────────────────────────────

function openShareModal() {
    const url = getShareUrl();
    if (!url) {
        alert(getAppLanguage() === "ko" ? "방 번호를 먼저 입력하고 '연결'을 눌러주세요." : "Please enter a room ID and connect first.");
        return;
    }
    const modal = document.getElementById('share-modal');
    const qrImage = document.getElementById('modal-qr-image');
    const shareInput = document.getElementById('modal-share-url');
    if (shareInput) shareInput.value = url;
    if (qrImage) qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
    if (modal) modal.classList.add('active');
}

function closeShareModal(event) {
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.remove('active');
}

async function copyShareLinkFromModal() {
    const url = getShareUrl();
    try {
        await navigator.clipboard.writeText(url);
        showToast(getAppLanguage() === "ko" ? "공유 링크를 복사했습니다." : "Share link copied.");
        const btn = document.querySelector('.btn-copy-main');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = getAppLanguage() === "ko" ? "복사 완료!" : "Copied!";
            const originalBg = btn.style.background;
            btn.style.background = "#fff";
            setTimeout(() => { btn.innerText = originalText; btn.style.background = originalBg || "#00E676"; }, 2000);
        }
    } catch (err) { showToast("복사 실패", "error"); }
}

// ── 인증 모달 ─────────────────────────────────────────────

function openAuthModal(message = "") {
    const modal = document.getElementById('auth-modal');
    const note = document.getElementById('auth-modal-note');
    if (note) note.textContent = message || authConfigError || "Premium 기능을 계정에 연결하려면 먼저 로그인하세요.";
    if (modal) modal.classList.add('active');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
}

function openMyPage() {
    if (!currentUser) { openAuthModal("마이페이지와 Premium 기능을 사용하려면 로그인하세요."); return; }
    renderAccountPanel();
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.add('active');
}

function closeAccountModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.remove('active');
}

// ── 업그레이드 / 결제 모달 ────────────────────────────────

function openPricingModal() {
    const modal = document.getElementById('pricing-modal');
    if (modal) modal.classList.add('active');
}

function closePricingModal() {
    const modal = document.getElementById('pricing-modal');
    if (modal) modal.classList.remove('active');
}

function openUpgradeModal(reason = getAppLanguage() === 'ko' ? "Premium 기능입니다." : "This is a Premium feature.") {
    const modal = document.getElementById('upgrade-modal');
    const reasonEl = document.getElementById('upgrade-modal-reason');
    const usageEl = document.getElementById('upgrade-usage');
    if (reasonEl) reasonEl.textContent = getAppLanguage() === 'ko'
        ? `${reason} Premium으로 계속 사용할 수 있습니다.`
        : `${reason} Continue with Premium.`;
    if (usageEl) usageEl.textContent = getUsageMeterText();
    if (modal) modal.classList.add('active');
}

function closeUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) modal.classList.remove('active');
}

function continueUpgradeFlow() {
    closeUpgradeModal();
    if (!currentUser) { openAuthModal("Premium 기능을 사용하려면 먼저 로그인하세요."); return; }
    openPricingModal();
}

// ── 스테이지 모드 ─────────────────────────────────────────

async function toggleStageMode(shouldRequestFullscreen = true) {
    document.body.classList.toggle('stage-mode');
    const active = document.body.classList.contains('stage-mode');
    const btn = document.getElementById('stage-mode-btn');
    if (btn) btn.textContent = active ? uiText('stageEnd') : uiText('stageMode');
    if (active && shouldRequestFullscreen) {
        try { await document.getElementById('shared-container')?.requestFullscreen?.(); }
        catch (e) { log("전체 화면 전환은 브라우저에서 허용되지 않았습니다.", true); }
    } else if (!active && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (e) {}
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('stage-mode')) {
        document.body.classList.remove('stage-mode');
        const btn = document.getElementById('stage-mode-btn');
        if (btn) btn.textContent = uiText('stageMode');
    }
});
function renderTranscriptDisplay() {
    const el = document.getElementById('youtube-text');
    if (!el) return;
    const visibleText = transcriptText.length > DISPLAY_TRANSCRIPT_LIMIT
        ? "... " + transcriptText.slice(-DISPLAY_TRANSCRIPT_LIMIT)
        : transcriptText;
    setPlainText(el, visibleText);
}

function setTranscriptText(text, options = {}) {
    transcriptText = text || "";
    localStorage.setItem('vlive_transcript', transcriptText);
    sessionCaptionStartedAt = 0;
    resetCaptionSegments(options.segments || []);
    renderTranscriptDisplay();
}

function appendCaptionChunk(text, durationMs = 4000) {
    if (!text) return;
    if (!sessionCaptionStartedAt) startCaptionTimingSession();
    const separator = transcriptText.trim() ? "\n" : "";
    transcriptText = `${transcriptText.trimEnd()}${separator}${text.trim()}`;
    localStorage.setItem('vlive_transcript', transcriptText);
    addCaptionSegment(text, durationMs);
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

