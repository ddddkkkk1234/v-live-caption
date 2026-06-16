let proInterval = null;
let isProRunning = false;
let audioContext = null;
let stream = null;
let sessionRecorder = null;
let sessionRecordingChunks = [];
let lastSessionRecording = null;
let sessionRecordingStartedAt = 0;
let lastSessionRecordingDurationMs = 0;
let lastLoggedText = ""; 
let lastLowSignalLogAt = 0;
let lastHistorySaveAt = 0;
let transcriptText = "";
let captionSegments = [];
let sessionCaptionStartedAt = 0;
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
const CAPTION_SEGMENTS_KEY = 'vlive_caption_segments';
const TRANSLATION_MIN_INTERVAL_MS = 2500;
const MIC_PERMISSION_VALUE = "__request_mic_permission";
const DISPLAY_TRANSCRIPT_LIMIT = 3000;
const HISTORY_SAVE_INTERVAL_MS = 15000;
const LOCAL_WHISPER_MODEL = "Xenova/whisper-tiny";
const FALLBACK_WHISPER_MODEL = "Xenova/whisper-base";
const LOCAL_MIN_RMS = 0.003; // 더 민감하게 수정 (기존 0.008)

const CAPTURE_TIMING = { localRecordMs: 2000, cloudRecordMs: 3500, restartDelayMs: 300 };
const PLAN_KEY = 'vlive_plan';
const USAGE_KEY = 'vlive_usage_daily';
const LESSON_META_KEY = 'vlive_lesson_meta';
const FREE_LIMITS = {
    cloudSeconds: 10 * 60,
    aiRequests: 3,
    finalTranscribes: 1,
    historyItems: 10
};
const PREMIUM_LIMITS = {
    cloudSeconds: 600 * 60,
    aiRequests: 300,
    finalTranscribes: 60,
    historyItems: 100
};
const UI_LANGUAGE_KEY = 'vlive_ui_language';
const UI_TEXT = {
    en: {
        navLive: "Live captions",
        navHistory: "History",
        navGuide: "Guide",
        statusReady: "Ready",
        micLevel: "Mic level",
        myPage: "My page",
        login: "Log in",
        heroTitle: "Live lecture captions",
        heroBody: "Share captions on screen and by link during class, then create lecture notes, SRT/VTT, and PDF after the session.",
        micLabel: "Available microphone",
        micSelect: "Select an available microphone",
        micPermission: "Allow microphone permission",
        modeLabel: "Caption mode",
        localMode: "Process on this device",
        cloudMode: "High-accuracy cloud",
        settings: "Settings",
        translationLabel: "Translation language",
        noTranslation: "No translation",
        lessonTitle: "Class title",
        lessonPlaceholder: "e.g. Grade 9 Science Unit 2",
        lessonNote: "The class title is saved with history. Speaker separation or institution-owned API keys are available in advanced settings.",
        premiumExperiment: "Lecture Premium preview",
        premiumPreview: "View Lecture Premium",
        freePreview: "View Free",
        flowLiveTitle: "Live captions",
        flowLiveBody: "Show microphone audio as large captions in real time.",
        flowShareTitle: "Student link sharing",
        flowShareBody: "Send captions to student screens with a QR link.",
        flowNotesTitle: "Class materials",
        flowNotesBody: "Turn captions into lecture notes, SRT/VTT, and PDF.",
        sampleTitle: "Sample output",
        sampleBody: "After class, organize the transcript into review-ready material.",
        sampleApply: "Load sample",
        lectureNote: "Lecture note",
        sampleLessonTitle: "Grade 9 Science: Current and Voltage",
        sampleLessonBody: "Organize key concepts, confusing terms, review questions, and next-class tasks into one document.",
        subtitleFile: "Caption file",
        subtitleFileBody: "Create timestamped caption files ready for recorded lecture uploads.",
        cloudHigh: "High-accuracy cloud",
        serverCredit: "Using LiveNote server credits · No API key setup needed",
        advancedSettings: "Advanced settings",
        closeSettings: "Close settings",
        advancedApi: "Advanced API settings",
        useMyApi: "Use my API key",
        provider: "Provider",
        model: "Model",
        apiKey: "API key",
        keyStorage: "Key storage",
        saveBrowser: "Save in this browser",
        saveSession: "Save for this session only",
        extraSettings: "Extra settings",
        extraPlaceholder: "Service URL or region",
        diarization: "Use speaker separation",
        providerHelp: "Free/Premium can use LiveNote server credits immediately. Only developers or institutions need their own API key.",
        apiCostNote: "If you use your own API key, provider costs may apply instead of LiveNote usage limits. Keys are saved only in this browser.",
        groqKeyTest: "Enter Groq key for testing",
        makeGroqKey: "Create Groq API key",
        makeOpenAiKey: "Create OpenAI API key",
        joinGladia: "Join Gladia",
        joinSpeechmatics: "Join Speechmatics",
        fontSize: "Font size",
        textColor: "Text color",
        captionBackground: "Caption background",
        opacity: "Opacity",
        settingsNote: "Changes apply immediately to live captions, shared view, and PIP mode, and are saved in this browser.",
        livePanel: "Live captions",
        reset: "Reset",
        largeCaption: "Large caption",
        defaultView: "Default view",
        pipMode: "PIP mode",
        classMaterials: "Class materials",
        materialSettings: "Material settings",
        advancedAiApi: "Advanced class-material API settings",
        aiEmpty: "After class, create key summaries, review points, and assignment hints.",
        questionPlaceholder: "Ask a question about the captions",
        send: "Send",
        meetingMinutes: "Meeting minutes",
        lectureNotes: "Lecture notes",
        consultingRecord: "Consulting record",
        createMaterials: "Create materials",
        copyMarkdown: "Copy Markdown",
        downloadMd: "Download MD",
        startCaptions: "Start captions",
        endSession: "End session",
        summarize: "Summarize",
        downloadTxt: "Download TXT",
        downloadRecording: "Download recording",
        finalTranscribe: "Final transcribe",
        shareStudentLink: "Share student link",
        debugReady: "System ready.",
        sharedBeta: "Shared view beta",
        backToLive: "Back to live captions",
        roomId: "Room ID",
        roomPlaceholder: "Enter or generate a room ID",
        generateId: "Generate ID",
        currentStatus: "Current status",
        waiting: "Waiting to connect...",
        role: "Role",
        senderRole: "Send captions (phone)",
        receiverRole: "Receive captions (PC/tablet)",
        sharePlaceholder: "Create a room ID to generate a share link.",
        copyLink: "Copy link",
        stageLink: "Stage link",
        makeQr: "Create QR",
        audienceNote: "Audience members can join receiver mode by link or QR. Stage mode is for projectors and large screens.",
        sharedView: "Shared view",
        stageMode: "Stage mode",
        stageEnd: "Exit stage",
        clearScreen: "Clear screen",
        connect: "Connect",
        disconnect: "Disconnect",
        savedHistory: "Saved caption history",
        deleteAll: "Delete all",
        privacy: "Privacy Policy",
        terms: "Terms",
        contact: "Contact",
        authTitle: "Premium login",
        authNote: "Log in first to connect Premium features to your account.",
        close: "Close",
        googleContinue: "Continue with Google",
        emailLink: "Email link",
        authStatus: "Log in to use Premium features.",
        accountTitle: "My page",
        accountNote: "Check your account, plan, and usage.",
        email: "Email",
        currentPlan: "Current plan",
        cloudUsage: "Cloud usage",
        aiUsage: "AI usage",
        premiumUpgrade: "Upgrade to Premium",
        logout: "Log out",
        pricingTitle: "Switch to Lecture Premium",
        pricingBody: "Keep basic accessibility captions free, and test Premium only for class-material generation, caption files, and long-session conversion.",
        freePrice: "$0",
        freeCaption: "Basic accessibility captions",
        freeFeature1: "Local live captions",
        freeFeature2: "TXT download",
        freeFeature3: "3 material generations",
        freeFeature4: "10 cloud minutes",
        premiumPrice: "$9.99/month",
        premiumCaption: "Automated lecture captions and class materials",
        premiumFeature1: "600 high-accuracy cloud minutes without API keys",
        premiumFeature2: "300 class-material/question requests without API keys",
        premiumFeature3: "SRT/VTT/PDF export",
        premiumFeature4: "60 long-recording final conversions",
        startPremium: "Start $9.99/month",
        viewSample: "View sample",
        proPrice: "$19.99+/month",
        proCaption: "Operations for instructors and schools",
        proFeature1: "Higher limits for long classes/sessions",
        proFeature2: "Advanced shared-room features",
        proFeature3: "History search/folders",
        proFeature4: "Education support",
        contactUs: "Contact us",
        limitReached: "Free limit reached",
        upgradeReason: "Continue with Premium.",
        upgradeCloud: "600 high-accuracy cloud minutes",
        upgradeAi: "300 class-material requests",
        upgradeExport: "SRT/VTT/PDF saving",
        viewPremium: "View Premium",
        later: "Later"
    },
    ko: {
        navLive: "실시간 자막",
        navHistory: "지난 자막",
        navGuide: "사용 가이드",
        statusReady: "시스템 준비됨",
        micLevel: "마이크 감도",
        myPage: "마이페이지",
        login: "로그인",
        heroTitle: "강의 실시간 자막 송출",
        heroBody: "강의 중 자막을 화면과 링크로 공유하고, 종료 후 강의노트와 SRT/VTT/PDF를 만듭니다.",
        micLabel: "이용 가능한 마이크",
        micSelect: "이용 가능한 마이크 선택",
        micPermission: "마이크 권한 허용하기",
        modeLabel: "자막 모드 선택 (Mode)",
        localMode: "내 기기에서 처리",
        cloudMode: "클라우드 고정밀",
        settings: "Settings",
        translationLabel: "번역 언어",
        noTranslation: "번역 안 함",
        lessonTitle: "수업명",
        lessonPlaceholder: "예: 중3 과학 2단원",
        lessonNote: "수업명은 지난 자막에 함께 저장됩니다. 화자 구분이나 기관 자체 키는 고급 설정에서 선택할 수 있습니다.",
        premiumExperiment: "강의자료 Premium 실험",
        premiumPreview: "강의 Premium 보기",
        freePreview: "Free로 보기",
        flowLiveTitle: "실시간 자막",
        flowLiveBody: "마이크 소리를 바로 큰 자막으로 보여줍니다.",
        flowShareTitle: "학생 링크 공유",
        flowShareBody: "QR 링크로 학생 화면에 자막을 보냅니다.",
        flowNotesTitle: "강의자료 생성",
        flowNotesBody: "강의노트와 SRT/VTT/PDF로 정리합니다.",
        sampleTitle: "샘플 결과물",
        sampleBody: "강의가 끝나면 자막 원문을 복습자료 형태로 정리합니다.",
        sampleApply: "샘플 적용",
        lectureNote: "강의노트",
        sampleLessonTitle: "중3 과학: 전류와 전압",
        sampleLessonBody: "핵심 개념 3개, 헷갈리는 용어, 복습 질문, 다음 수업 과제를 한 문서로 정리합니다.",
        subtitleFile: "자막 파일",
        subtitleFileBody: "녹화 강의 업로드에 바로 쓰는 시간표시 자막 파일을 만듭니다.",
        cloudHigh: "클라우드 고정밀",
        serverCredit: "LiveNote 서버 크레딧 사용 중 · API 키 설정 없이 사용",
        advancedSettings: "고급 설정",
        closeSettings: "설정 닫기",
        advancedApi: "고급 API 설정",
        useMyApi: "내 API 키 사용",
        provider: "제공업체",
        model: "모델",
        apiKey: "API 키",
        keyStorage: "키 저장 위치",
        saveBrowser: "이 브라우저에 저장",
        saveSession: "이번 세션만 저장",
        extraSettings: "추가 설정",
        extraPlaceholder: "서비스 URL 또는 리전",
        diarization: "화자 분리 사용",
        providerHelp: "Free/Premium은 LiveNote 서버 크레딧으로 바로 사용할 수 있습니다. 개발자나 기관만 자체 API 키를 선택하세요.",
        apiCostNote: "내 API 키를 쓰면 LiveNote 사용량 한도 대신 해당 API 제공업체 비용이 직접 발생합니다. 키는 이 브라우저에만 저장됩니다.",
        groqKeyTest: "Groq 키 테스트 입력",
        makeGroqKey: "Groq API 키 만들기",
        makeOpenAiKey: "OpenAI API 키 만들기",
        joinGladia: "Gladia 가입",
        joinSpeechmatics: "Speechmatics 가입",
        fontSize: "글자 크기 (Size)",
        textColor: "글자 색상 (Color)",
        captionBackground: "자막 배경색 (Background)",
        opacity: "배경 투명도 (Opacity)",
        settingsNote: "변경한 설정은 실시간 자막, 공유 보기, PIP 모드에 즉시 반영되고 이 브라우저에 저장됩니다.",
        livePanel: "실시간 자막",
        reset: "초기화",
        largeCaption: "큰 자막",
        defaultView: "기본 화면",
        pipMode: "PIP 모드",
        classMaterials: "강의자료",
        materialSettings: "자료 설정",
        advancedAiApi: "강의자료 고급 API 설정",
        aiEmpty: "강의가 끝나면 핵심 요약, 복습 포인트, 과제 힌트를 자료로 정리합니다.",
        questionPlaceholder: "자막 내용에 대해 질문하세요",
        send: "전송",
        meetingMinutes: "회의록",
        lectureNotes: "강의 노트",
        consultingRecord: "상담 기록",
        createMaterials: "자료 만들기",
        copyMarkdown: "Markdown 복사",
        downloadMd: "MD 다운로드",
        startCaptions: "자막 시작",
        endSession: "세션 종료",
        summarize: "핵심 정리",
        downloadTxt: "TXT 다운로드",
        downloadRecording: "녹음 다운로드",
        finalTranscribe: "최종 변환",
        shareStudentLink: "학생 링크 공유",
        debugReady: "시스템 준비 완료.",
        sharedBeta: "공유 보기 베타",
        backToLive: "실시간 자막으로 돌아가기",
        roomId: "방 번호 (Room ID)",
        roomPlaceholder: "방 번호를 입력하거나 생성하세요",
        generateId: "ID 생성",
        currentStatus: "현재 상태",
        waiting: "연결 대기 중...",
        role: "역할 선택",
        senderRole: "보내기 (휴대폰용)",
        receiverRole: "받아보기 (PC/태블릿용)",
        sharePlaceholder: "방 번호를 만들면 공유 링크가 생성됩니다.",
        copyLink: "링크 복사",
        stageLink: "송출 링크",
        makeQr: "QR 만들기",
        audienceNote: "청중은 링크나 QR로 바로 받아보기 모드에 들어올 수 있습니다. 송출 모드는 프로젝터/큰 화면용입니다.",
        sharedView: "공유 보기",
        stageMode: "송출 모드",
        stageEnd: "송출 종료",
        clearScreen: "화면 비우기",
        connect: "연결하기",
        disconnect: "연결 해제",
        savedHistory: "저장된 자막 기록",
        deleteAll: "전체 삭제",
        privacy: "개인정보처리방침",
        terms: "이용약관",
        contact: "문의하기",
        authTitle: "Premium 로그인",
        authNote: "Premium 기능을 계정에 연결하려면 먼저 로그인하세요.",
        close: "닫기",
        googleContinue: "Google로 계속",
        emailLink: "이메일 링크",
        authStatus: "Premium 기능을 사용하려면 로그인하세요.",
        accountTitle: "마이페이지",
        accountNote: "계정, 플랜, 사용량을 확인합니다.",
        email: "이메일",
        currentPlan: "현재 플랜",
        cloudUsage: "클라우드 사용량",
        aiUsage: "AI 사용량",
        premiumUpgrade: "Premium 업그레이드",
        logout: "로그아웃",
        pricingTitle: "강의용 Premium으로 전환",
        pricingBody: "기본 접근성 자막은 무료로 유지하고, 강의자료 생성·자막 파일·장시간 변환만 Premium으로 실험합니다.",
        freePrice: "0원",
        freeCaption: "기본 접근성 자막",
        freeFeature1: "로컬 실시간 자막",
        freeFeature2: "TXT 다운로드",
        freeFeature3: "자료 정리 3회",
        freeFeature4: "클라우드 10분",
        premiumPrice: "월 9,900원",
        premiumCaption: "강의 자막과 수업자료 자동화",
        premiumFeature1: "API 키 없이 클라우드 고정밀 600분",
        premiumFeature2: "API 키 없이 강의자료/질문 300회",
        premiumFeature3: "SRT/VTT/PDF 내보내기",
        premiumFeature4: "긴 녹음 최종 변환 60회",
        startPremium: "월 9,900원 시작",
        viewSample: "샘플 보기",
        proPrice: "월 19,900원~",
        proCaption: "강사·교육기관용 운영 기능",
        proFeature1: "긴 강의/세션 한도 확대",
        proFeature2: "공유 방 고급 기능",
        proFeature3: "기록 검색/폴더",
        proFeature4: "교육기관 문의 대응",
        contactUs: "문의하기",
        limitReached: "무료 한도에 도달했습니다",
        upgradeReason: "Premium으로 계속 사용할 수 있습니다.",
        upgradeCloud: "고정밀 클라우드 600분",
        upgradeAi: "강의자료 300회",
        upgradeExport: "SRT/VTT/PDF 저장",
        viewPremium: "Premium 보기",
        later: "나중에"
    }
};
const UI_TEXT_KEYS = Object.keys(UI_TEXT.en);
const UI_TEXT_LOOKUP = UI_TEXT_KEYS.reduce((map, key) => {
    map[UI_TEXT.en[key]] = key;
    map[UI_TEXT.ko[key]] = key;
    return map;
}, {});
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
let currentUser = null;
let currentSession = null;
let authConfigError = "";
let publicConfig = null;

const pipCanvas = document.getElementById('pip-canvas');
const pipVideo = document.getElementById('pip-video');
const pipCtx = pipCanvas.getContext('2d');

window.onload = () => {
    const saved = localStorage.getItem('vlive_transcript');
    transcriptText = saved || "";
    captionSegments = getStoredCaptionSegments();
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
    restoreLessonMeta();
    initLanguageControls();
    updateEngineSettingsVisibility();
    renderHistory();
    initAds();
    renderPremiumState();
    initAuthState();
    handleBillingReturn();
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
    // 1. 모든 컨테이너 숨기기
    document.querySelectorAll('.container').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });
    
    // 2. 모든 네비게이션 아이템 활성화 해제
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // 3. 대상 컨테이너 보이기
    const targetContainer = document.getElementById(mode + '-container');
    if (targetContainer) {
        targetContainer.classList.add('active');
        targetContainer.style.display = 'flex';
    }
    
    // 4. 해당하는 네비게이션 아이템 활성화
    const targetNavItem = document.querySelector(`.nav-item[data-nav="${mode}"]`);
    if (targetNavItem) targetNavItem.classList.add('active');
    
    // 5. 기록 탭이면 렌더링
    if (mode === 'mic') renderHistory();
    
    // 6. 모드 전환 시 녹음 중지
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
    if (qrImage) {
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
    }
    
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
        
        // 버튼 텍스트 피드백
        const btn = document.querySelector('.btn-copy-main');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = getAppLanguage() === "ko" ? "복사 완료!" : "Copied!";
            const originalBg = btn.style.background;
            btn.style.background = "#fff";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = originalBg || "#00E676";
            }, 2000);
        }
    } catch (err) {
        showToast("복사 실패", "error");
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
    if (btn) btn.textContent = active ? uiText('stageEnd') : uiText('stageMode');
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
        if (btn) btn.textContent = uiText('stageMode');
    }
});

async function ensureSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) {
        authConfigError = "Supabase client library is not loaded.";
        throw new Error(authConfigError);
    }
    const configRes = await fetch('/api/config');
    if (!configRes.ok) {
        authConfigError = "/api/config is not available in this environment.";
        throw new Error(authConfigError);
    }
    const config = await configRes.json();
    publicConfig = config;
    const supabaseKey = config.supabaseAnonKey || config.supabaseKey;
    if (!config.supabaseUrl || !supabaseKey) {
        authConfigError = "SUPABASE_URL and SUPABASE_ANON_KEY are required.";
        throw new Error(authConfigError);
    }
    authConfigError = "";
    supabaseClient = supabase.createClient(config.supabaseUrl, supabaseKey);
    return supabaseClient;
}

async function getPublicConfig() {
    if (publicConfig) return publicConfig;
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error("서비스 설정을 불러오지 못했습니다.");
    publicConfig = await res.json();
    return publicConfig;
}

async function toggleSharedConnection() {
    const btn = document.getElementById('shared-connect-btn');
    const status = document.getElementById('shared-status');
    const room = document.getElementById('room-id').value;
    const role = document.getElementById('role-select').value;
    
    if (!room) return alert(getAppLanguage() === 'ko' ? "방 번호를 입력해주세요." : "Enter a room ID first.");

    if (!btn.classList.contains('btn-stop')) {
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

        btn.innerText = uiText('disconnect');
        btn.classList.replace('btn-start', 'btn-stop');
        status.innerText = getAppLanguage() === 'ko'
            ? `${room}번 방에 ${role === 'sender' ? '전송' : '수신'} 모드로 연결됨`
            : `Connected to room ${room} in ${role === 'sender' ? 'sender' : 'receiver'} mode`;
        status.style.color = "var(--primary)";

        if (role === 'receiver') {
            // 수신 모드: 실시간 구독 시작
            roomSubscription = supabaseClient
                .channel(`room-${room}`)
                .on('broadcast', { event: 'caption' }, (payload) => {
                    const sharedText = document.getElementById('shared-text');
                    if (sharedText.innerText.includes("방 번호를 입력하고") || sharedText.innerText.includes("Enter a room ID")) sharedText.innerText = "";
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
        btn.innerText = uiText('connect');
        btn.classList.replace('btn-stop', 'btn-start');
        status.innerText = uiText('waiting');
        status.style.color = "var(--text-muted)";
    }
}

// 텍스트를 외부로 공유하는 함수
async function broadcastText(text) {
    const btn = document.getElementById('shared-connect-btn');
    const room = document.getElementById('room-id').value;
    const role = document.getElementById('role-select').value;

    if (btn.classList.contains('btn-stop') && role === 'sender' && room && supabaseClient) {
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
    if (btn) btn.textContent = document.body.classList.contains('caption-focus') ? uiText('defaultView') : uiText('largeCaption');
}

function toggleSettingsPanel() {
    const card = document.getElementById('settings-card');
    const btn = document.getElementById('settings-toggle');
    if (!card) return;
    card.classList.toggle('collapsed');
    if (btn) {
        btn.classList.toggle('active', !card.classList.contains('collapsed'));
    }
}

function toggleFooterExtras() {
    const extras = document.getElementById('footer-extras');
    const btn = document.getElementById('footer-extras-toggle');
    if (!extras) return;
    extras.classList.toggle('collapsed');
    if (btn) {
        btn.textContent = extras.classList.contains('collapsed') ? '더보기 ▾' : '접기 ▴';
    }
}

function getAppLanguage() {
    const selected = document.getElementById('lang-select')?.value || localStorage.getItem(UI_LANGUAGE_KEY) || 'en';
    return selected === 'ko' ? 'ko' : 'en';
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

function uiText(key) {
    return (UI_TEXT[getAppLanguage()] || UI_TEXT.en)[key] || UI_TEXT.en[key] || key;
}

function getRecognitionLanguage() {
    const value = document.getElementById('lang-select')?.value || 'en';
    return value === 'en-AU' ? 'en' : value;
}

function getRecognitionLanguageForServer() {
    return document.getElementById('lang-select')?.value || 'en';
}

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
    if (providerHelp) providerHelp.textContent = getProviderHelp(provider);
}

function getProviderHelp(provider) {
    const english = {
        groq: "Use one Groq key for Whisper-based high-accuracy captions.",
        openai: "Use one OpenAI key for high-accuracy captions. It can also work well for AI class-material generation.",
        gladia: "Gladia can be useful for longer usage. The server uploads short recorded chunks and receives the result.",
        speechmatics: "Speechmatics is strong for accents and varied speech. Short audio chunks are submitted as jobs.",
        ibm: "IBM Watson requires both an API key and a service URL.",
        azure: "Azure Speech requires an API key and region. Some browser recording formats may fail depending on the environment."
    };
    const korean = {
        groq: "Groq 키 하나로 Whisper 기반 고정밀 자막을 사용할 수 있습니다.",
        openai: "OpenAI 키 하나로 고정밀 자막을 사용할 수 있습니다. AI 자막 정리와도 같은 키를 재사용하기 좋습니다.",
        gladia: "Gladia는 무료 제공량이 넉넉한 편이라 긴 사용에 적합합니다. 서버가 짧게 녹음한 음성 조각을 업로드하고 결과를 받아옵니다.",
        speechmatics: "Speechmatics는 악센트와 다양한 발화에 강한 편입니다. 짧은 음성 조각을 작업으로 등록한 뒤 결과를 받아옵니다.",
        ibm: "IBM Watson은 API 키와 서비스 URL이 모두 필요합니다.",
        azure: "Azure Speech는 API 키와 리전이 필요합니다. 현재 브라우저 녹음 포맷에 따라 일부 환경에서 실패할 수 있습니다."
    };
    return (getAppLanguage() === 'ko' ? korean : english)[provider] || (getAppLanguage() === 'ko' ? korean.groq : english.groq);
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
    showToast("내 Groq API 키를 이번 세션에 적용했습니다.");
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
        summary.textContent = uiText('serverCredit');
        return;
    }
    const provider = document.getElementById('stt-provider')?.value || 'groq';
    const model = document.getElementById('stt-model')?.value || '';
    summary.textContent = getAppLanguage() === 'ko'
        ? `내 ${provider.toUpperCase()} API 키 사용 중${model ? ` · ${model}` : ""}`
        : `Using my ${provider.toUpperCase()} API key${model ? ` · ${model}` : ""}`;
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

function getLessonMeta() {
    const titleInput = document.getElementById('lesson-title');
    const title = (titleInput?.value || "").trim();
    return { title };
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

function getPlan() {
    const plan = localStorage.getItem(PLAN_KEY);
    return ['premium', 'team'].includes(plan) ? plan : 'free';
}

function isPremiumPlan() {
    return getPlan() !== 'free';
}

function getPlanLimits() {
    return isPremiumPlan() ? PREMIUM_LIMITS : FREE_LIMITS;
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getUsage() {
    const today = getTodayKey();
    try {
        const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
        if (parsed.date === today) {
            return {
                date: today,
                cloudSeconds: Number(parsed.cloudSeconds) || 0,
                aiRequests: Number(parsed.aiRequests) || 0,
                finalTranscribes: Number(parsed.finalTranscribes) || 0
            };
        }
    } catch (e) {}
    return { date: today, cloudSeconds: 0, aiRequests: 0, finalTranscribes: 0 };
}

function setUsage(usage) {
    localStorage.setItem(USAGE_KEY, JSON.stringify({
        date: getTodayKey(),
        cloudSeconds: Math.max(0, Number(usage.cloudSeconds) || 0),
        aiRequests: Math.max(0, Number(usage.aiRequests) || 0),
        finalTranscribes: Math.max(0, Number(usage.finalTranscribes) || 0)
    }));
    renderPremiumState();
}

function hasQuota(metric, amount = 1) {
    const limits = getPlanLimits();
    const usage = getUsage();
    return (Number(usage[metric]) || 0) + amount <= (Number(limits[metric]) || 0);
}

function incrementUsage(metric, amount = 1) {
    const usage = getUsage();
    usage[metric] = (Number(usage[metric]) || 0) + amount;
    setUsage(usage);
}

async function fetchServerUsage() {
    if (!currentSession?.access_token) return;
    try {
        const res = await fetch('/api/usage', {
            headers: { Authorization: `Bearer ${currentSession.access_token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.usage) return;
        localStorage.setItem(USAGE_KEY, JSON.stringify({
            date: data.usage.date || getTodayKey(),
            cloudSeconds: Number(data.usage.cloudSeconds) || 0,
            aiRequests: Number(data.usage.aiRequests) || 0,
            finalTranscribes: Number(data.usage.finalTranscribes) || 0
        }));
        if (data.plan) localStorage.setItem(PLAN_KEY, data.plan);
        renderPremiumState();
    } catch (e) {}
}

function formatMinutes(seconds) {
    return getAppLanguage() === 'ko' ? `${Math.floor(seconds / 60)}분` : `${Math.floor(seconds / 60)} min`;
}

function renderPremiumState() {
    const plan = getPlan();
    const limits = getPlanLimits();
    const usage = getUsage();
    document.body.classList.toggle('premium-plan', plan !== 'free');

    const badge = document.getElementById('plan-badge');
    if (badge) badge.textContent = plan === 'free' ? 'Free' : (plan === 'team' ? 'Team' : 'Premium');

    const meter = document.getElementById('premium-meter');
    if (meter) {
        meter.textContent = getUsageMeterText(limits, usage);
    }

    const historyLimit = document.getElementById('history-limit-label');
    if (historyLimit) historyLimit.textContent = `저장 기록 ${getHistory().length}/${limits.historyItems}`;

    const card = document.getElementById('premium-card');
    if (card && plan !== 'free') card.classList.remove('attention');

    renderAccountPanel();
    initAds();
}

function activatePremiumDemo() {
    if (!currentUser) {
        openAuthModal("Premium 기능을 사용하려면 먼저 로그인하세요.");
        return;
    }
    openPricingModal();
}

function enablePremiumDemo() {
    showToast("보안상 데모로 Premium 권한을 켤 수 없습니다. 결제 링크 또는 관리자 웹훅으로만 적용됩니다.", "error", 6200);
}

function resetFreePlanDemo() {
    localStorage.setItem(PLAN_KEY, 'free');
    renderPremiumState();
    renderHistory();
    showToast("Free plan restored.");
}

function showUpgradePrompt(reason = getAppLanguage() === 'ko' ? "Premium 기능입니다." : "This is a Premium feature.") {
    const suffix = getAppLanguage() === 'ko'
        ? "Premium으로 업그레이드하면 계속 사용할 수 있습니다."
        : "Upgrade to Premium to keep using it.";
    showToast(`${reason} ${suffix}`, "error", 5200);
    const card = document.getElementById('premium-card');
    if (card) card.classList.add('attention');
    openUpgradeModal(reason);
}

function getUsageMeterText(limits = getPlanLimits(), usage = getUsage()) {
    return getAppLanguage() === 'ko'
        ? `클라우드 ${formatMinutes(usage.cloudSeconds)}/${formatMinutes(limits.cloudSeconds)} · AI ${usage.aiRequests}/${limits.aiRequests} · 최종변환 ${usage.finalTranscribes}/${limits.finalTranscribes}`
        : `Cloud ${formatMinutes(usage.cloudSeconds)}/${formatMinutes(limits.cloudSeconds)} · AI ${usage.aiRequests}/${limits.aiRequests} · Final transcribes ${usage.finalTranscribes}/${limits.finalTranscribes}`;
}

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
    if (!currentUser) {
        openAuthModal("Premium 기능을 사용하려면 먼저 로그인하세요.");
        return;
    }
    openPricingModal();
}

async function startCheckout(plan = "premium") {
    if (!currentUser) {
        closePricingModal();
        openAuthModal("결제를 시작하려면 먼저 로그인하세요.");
        return;
    }
    try {
        const config = await getPublicConfig();
        const paymentUrl = plan === "pro" ? config.paymentUrlPro : config.paymentUrlPremium;
        if (paymentUrl) {
            const url = new URL(paymentUrl, window.location.href);
            url.searchParams.set("email", currentUser.email || "");
            url.searchParams.set("plan", plan);
            window.location.href = url.toString();
            return;
        }
        window.location.href = `mailto:smarttool_lee@naver.com?subject=LiveNote ${encodeURIComponent(plan)} 결제 문의&body=${encodeURIComponent(`계정: ${currentUser.email || currentUser.id}\n플랜: ${plan}\n`)}`;
    } catch (e) {
        showToast("결제 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error", 5200);
    }
}

async function handleBillingReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") !== "success") return;
    const applyBilling = async () => {
        if (!currentSession?.access_token) return false;
        await fetchServerUsage();
        if (!isPremiumPlan()) return false;
        showToast("결제가 확인되어 Premium이 적용되었습니다.");
        const url = new URL(window.location.href);
        url.searchParams.delete("billing");
        url.searchParams.delete("plan");
        window.history.replaceState({}, "", url.toString());
        return true;
    };
    setTimeout(async () => {
        if (!(await applyBilling())) {
            openAuthModal("결제 확인을 계정에 연결하려면 로그인하세요. 결제 직후라면 잠시 후 새로고침해 주세요.");
        }
    }, 800);
}

async function initAuthState() {
    renderAuthState();
    try {
        const client = await ensureSupabaseClient();
        const { data } = await client.auth.getSession();
        currentSession = data?.session || null;
        currentUser = currentSession?.user || null;
        enforcePremiumRequiresAuth();
        renderAuthState();
        if (currentUser) await fetchServerUsage();
        client.auth.onAuthStateChange((_event, session) => {
            currentSession = session || null;
            currentUser = currentSession?.user || null;
            enforcePremiumRequiresAuth();
            renderAuthState();
            if (currentUser) fetchServerUsage();
            if (currentUser) closeAuthModal();
        });
    } catch (e) {
        enforcePremiumRequiresAuth();
        renderAuthState(e.message || "Auth is not configured.");
    }
}

function renderAuthState(message = "") {
    const authStatus = document.getElementById('auth-status');
    const premiumBtn = document.getElementById('premium-activate-btn');
    const mypageBtn = document.getElementById('mypage-btn');
    if (authStatus) {
        authStatus.textContent = currentUser
            ? `로그인됨: ${currentUser.email || currentUser.id}`
            : (message || authConfigError || "Premium 기능을 사용하려면 로그인하세요.");
    }
    if (premiumBtn) premiumBtn.textContent = "Premium";
    if (mypageBtn) mypageBtn.textContent = currentUser ? uiText('myPage') : uiText('login');
    renderAccountPanel();
}

function enforcePremiumRequiresAuth() {
    if (!currentUser && getPlan() !== 'free') {
        localStorage.setItem(PLAN_KEY, 'free');
        renderPremiumState();
    }
}

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
    if (!currentUser) {
        openAuthModal("마이페이지와 Premium 기능을 사용하려면 로그인하세요.");
        return;
    }
    renderAccountPanel();
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.add('active');
}

function closeAccountModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.remove('active');
}

function renderAccountPanel() {
    const usage = getUsage();
    const limits = getPlanLimits();
    const email = document.getElementById('account-email');
    const plan = document.getElementById('account-plan');
    const cloud = document.getElementById('account-cloud-usage');
    const ai = document.getElementById('account-ai-usage');
    if (email) email.textContent = currentUser?.email || "-";
    if (plan) plan.textContent = getPlan() === 'free' ? "Free" : (getPlan() === 'team' ? "Team" : "Premium");
    if (cloud) cloud.textContent = `${formatMinutes(usage.cloudSeconds)}/${formatMinutes(limits.cloudSeconds)}`;
    if (ai) ai.textContent = `${usage.aiRequests}/${limits.aiRequests}`;
}

async function signInWithGoogle() {
    try {
        const client = await ensureSupabaseClient();
        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
        if (error) throw error;
    } catch (e) {
        renderAuthState(e.message || "Google login failed.");
        showToast("로그인 설정을 확인해 주세요.", "error", 5200);
    }
}

async function sendMagicLink() {
    const emailInput = document.getElementById('auth-email');
    const email = emailInput?.value.trim();
    if (!email) {
        showToast("이메일을 입력해 주세요.", "error");
        return;
    }
    try {
        const client = await ensureSupabaseClient();
        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.href }
        });
        if (error) throw error;
        showToast("로그인 링크를 이메일로 보냈습니다.");
    } catch (e) {
        renderAuthState(e.message || "Email login failed.");
        showToast("이메일 로그인 설정을 확인해 주세요.", "error", 5200);
    }
}

async function signOut() {
    try {
        const client = await ensureSupabaseClient();
        await client.auth.signOut();
    } catch (e) {}
    currentUser = null;
    currentSession = null;
    localStorage.setItem(PLAN_KEY, 'free');
    enforcePremiumRequiresAuth();
    renderAuthState();
    renderPremiumState();
    showToast("로그아웃했습니다.");
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
        summary.textContent = uiText('serverCredit');
        return;
    }
    const provider = document.getElementById('ai-provider')?.value || 'gemini';
    const model = document.getElementById('ai-model')?.value || '';
    summary.textContent = `내 ${provider.toUpperCase()} API 키 사용 중${model ? ` · ${model}` : ""}`;
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
    return document.getElementById('minutes-type')?.value || 'lecture';
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
        log("번역 자막에는 내 AI API 키를 입력하거나 내 API 키 사용을 꺼주세요.", true);
        return source;
    }
    const usesServerCredit = aiSettings.provider === 'default';
    if (usesServerCredit && !currentUser) {
        openAuthModal("번역 자막은 로그인 후 사용할 수 있습니다.");
        return source;
    }
    if (usesServerCredit && !hasQuota('aiRequests', 1)) {
        showUpgradePrompt("무료 AI 번역 횟수를 모두 사용했습니다.");
        return source;
    }
    try {
        translationInFlight = true;
        lastTranslationAt = now;
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {})
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
        if (usesServerCredit && res.ok) incrementUsage('aiRequests', 1);
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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
        const lang = getRecognitionLanguageForServer();
        const sttSettings = getSttRequestSettings();
        const usesServerCredit = sttSettings.provider === 'default';
        if (usesServerCredit && !currentUser) {
            openAuthModal("긴 녹음 최종 변환은 로그인 후 사용할 수 있습니다.");
            return;
        }
        if (usesServerCredit && !hasQuota('finalTranscribes', 1)) {
            showUpgradePrompt("무료 최종 변환 횟수를 모두 사용했습니다.");
            return;
        }
        const formData = new FormData();
        formData.append('file', lastSessionRecording, lastSessionRecording.type.includes('ogg') ? 'recording.ogg' : 'recording.webm');
        formData.append('durationSeconds', Math.max(1, Math.ceil((lastSessionRecordingDurationMs || 0) / 1000)));
        formData.append('usageMetric', 'finalTranscribes');
        if (lang !== 'auto') formData.append('language', lang);
        formData.append('provider', sttSettings.provider);
        if (sttSettings.provider !== 'default') {
            if (!sttSettings.apiKey) {
                alert("내 API 키를 입력하거나 내 API 키 사용을 꺼주세요.");
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
        if (usesServerCredit) incrementUsage('finalTranscribes', 1);
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
    if (isPremiumPlan()) {
        document.querySelectorAll('.ad-slot').forEach((slot) => slot.classList.remove('is-ready'));
        return;
    }
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
    
    // UI 업데이트
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
                if (rms < LOCAL_MIN_RMS) {
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
    
    // UI 업데이트
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

async function callAI(question = null, mode = "summary") {
    const text = transcriptText.trim();
    if (text.length < 5) return log(getAppLanguage() === 'ko' ? "데이터 부족" : "Not enough caption text.", true);
    const aiArea = document.getElementById('youtube-ai');
    if (!aiArea) return;
    const trimmedQuestion = question ? question.trim() : "";
    const isMinutesMode = mode === "minutes";
    if (trimmedQuestion) {
        appendAiMessage(aiArea, "Q: ", trimmedQuestion);
        document.getElementById('chat-input').value = "";
    } else if (isMinutesMode) {
        setPlainText(aiArea, getAppLanguage() === 'ko' ? "강의자료를 작성 중..." : "Creating class materials...");
    } else {
        setPlainText(aiArea, getAppLanguage() === 'ko' ? "분석 중..." : "Analyzing...");
    }
    try {
        const aiSettings = getAiRequestSettings();
        if (aiSettings.provider !== 'default' && !aiSettings.apiKey) {
            log("내 AI API 키를 입력하거나 내 API 키 사용을 꺼주세요.", true);
            if (!trimmedQuestion) setPlainText(aiArea, "내 AI API 키를 입력하거나 내 API 키 사용을 꺼주세요.");
            return;
        }
        const usesServerCredit = aiSettings.provider === 'default';
        if (usesServerCredit && !currentUser) {
            openAuthModal("강의자료 정리는 로그인 후 사용할 수 있습니다. 기본 실시간 자막은 로그인 없이 사용할 수 있습니다.");
            return;
        }
        if (usesServerCredit && !hasQuota('aiRequests', 1)) {
            const message = "무료 AI 정리 횟수를 모두 사용했습니다.";
            if (trimmedQuestion) appendAiMessage(aiArea, "A: ", `${message} Premium으로 강의자료, 질문, 번역 한도를 늘릴 수 있습니다.`);
            else setPlainText(aiArea, `${message}\n\nPremium으로 업그레이드하면 강의자료, 질문, 번역을 계속 사용할 수 있습니다.`);
            showUpgradePrompt(message);
            return;
        }
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {})
            },
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
        if (usesServerCredit && res.ok) incrementUsage('aiRequests', 1);
        const result = data.result || "결과 오류";
        if (trimmedQuestion) appendAiMessage(aiArea, "A: ", result);
        else {
            setPlainText(aiArea, result);
            if (isMinutesMode) localStorage.setItem('vlive_last_minutes', result);
        }
        aiArea.scrollTop = aiArea.scrollHeight;
    } catch (e) { log("AI 오류", true); }
}

