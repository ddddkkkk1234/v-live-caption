// ============================================================
// history.js
// 자막 기록 저장·불러오기·렌더링, TXT/SRT/VTT/PDF/MD 내보내기
// 의존: constants.js, ui.js, auth.js, settings.js
// ============================================================

// ── 기록 CRUD ─────────────────────────────────────────────

function getHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

function setHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, getPlanLimits().historyItems)));
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
    if (titleInput) { titleInput.value = item.lessonTitle || item.title || ""; saveLessonMeta(); }
    setTranscriptText(item.text, { segments: item.segments || [] });
    switchMode('youtube');
}

function downloadHistoryItem(id) {
    const item = getHistory().find((entry) => entry.id === id);
    if (!item) return;
    downloadTextFile(item.text, `LiveNote_자막_${item.id}.txt`);
}

function deleteHistoryItem(id) {
    if (confirm("이 기록을 삭제할까요?")) {
        setHistory(getHistory().filter((entry) => entry.id !== id));
        renderHistory();
    }
}

function clearAllHistory() {
    if (confirm("모든 지난 자막을 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) {
        setHistory([]);
        renderHistory();
    }
}

// ── 자막 세그먼트 ─────────────────────────────────────────

function synthesizeCaptionSegments(text) {
    return String(text || "")
        .split(/\n+/)
        .map((line) => cleanText(line))
        .filter(Boolean)
        .map((line, index) => ({ text: line, start: index * 4, end: index * 4 + 4 }));
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
    } catch (e) { return []; }
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

function getCaptionSegments() {
    if (captionSegments.length) return captionSegments;
    return synthesizeCaptionSegments(transcriptText);
}

// ── 내보내기 ──────────────────────────────────────────────

function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function downloadBlob(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function downloadTranscript() {
    const text = transcriptText.trim();
    if (!text) return alert("내용이 없습니다.");
    saveHistorySnapshot(text);
    downloadTextFile(text, "LiveNote_자막.txt");
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
        return `WEBVTT\n\n${segments.map((s) => `${formatCueTime(s.start, ".")} --> ${formatCueTime(s.end, ".")}\n${s.text}`).join("\n\n")}\n`;
    }
    return `${segments.map((s, i) => `${i + 1}\n${formatCueTime(s.start)} --> ${formatCueTime(s.end)}\n${s.text}`).join("\n\n")}\n`;
}

function downloadTimedCaption(format) {
    const normalizedFormat = format === "vtt" ? "vtt" : "srt";
    if (!isPremiumPlan()) { showUpgradePrompt("SRT/VTT 자막 내보내기는 Premium 기능입니다."); return; }
    const segments = getCaptionSegments();
    if (!segments.length) return alert("내보낼 자막이 없습니다.");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(buildCaptionExport(normalizedFormat), `LiveNote_자막_${stamp}.${normalizedFormat}`);
}

function downloadSrtCaption() { downloadTimedCaption("srt"); }
function downloadVttCaption() { downloadTimedCaption("vtt"); }

function getSmartMinutesText() {
    const saved = localStorage.getItem('vlive_last_minutes') || "";
    const aiText = document.getElementById('youtube-ai')?.innerText || "";
    return (saved || aiText).trim();
}

async function copySmartMinutes() {
    const text = getSmartMinutesText();
    if (!text) return alert("복사할 강의자료가 없습니다.");
    try { await navigator.clipboard.writeText(text); log("강의자료 Markdown을 복사했습니다."); }
    catch (e) { alert("브라우저에서 클립보드 복사를 허용하지 않았습니다."); }
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
    if (!isPremiumPlan()) { showUpgradePrompt("강의자료 PDF 저장은 Premium 기능입니다."); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const lessonTitle = getLessonMeta().title || "강의노트";
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
    html2pdf().set(opt).from(element).save()
        .then(() => showToast("PDF 다운로드가 완료되었습니다."))
        .catch(err => { console.error("PDF 생성 오류:", err); showToast("PDF 생성 중 오류가 발생했습니다.", "error"); });
}

// ── 샘플 데이터 ───────────────────────────────────────────

function loadSampleLesson() {
    const titleInput = document.getElementById('lesson-title');
    if (titleInput) { titleInput.value = "중3 과학: 전류와 전압"; saveLessonMeta(); }
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
            "# 강의자료: 전류와 전압", "",
            "## 핵심 개념",
            "- 전류: 전하가 일정한 방향으로 이동하는 흐름",
            "- 전압: 전류가 흐르게 만드는 전기적인 압력",
            "- 저항: 전류의 흐름을 방해하는 정도", "",
            "## 복습 질문",
            "1. 전압이 같을 때 저항이 커지면 전류는 어떻게 변할까요?",
            "2. 옴의 법칙에서 전류, 전압, 저항은 어떤 관계일까요?", "",
            "## 다음 수업 과제",
            "- 회로도에서 전류 방향을 표시하고 전압/저항 값을 이용해 전류를 계산해 오기"
        ].join("\n"));
        localStorage.setItem('vlive_last_minutes', aiArea.innerText);
    }
    saveHistorySnapshot(transcriptText);
    showToast("샘플 강의와 자료를 불러왔습니다.");
}function saveCaptionSegments() {
    localStorage.setItem(CAPTION_SEGMENTS_KEY, JSON.stringify(captionSegments.slice(-500)));
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