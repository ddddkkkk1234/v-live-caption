// ============================================================
// auth.js
// Supabase 인증, 플랜/사용량 관리, 결제
// 의존: constants.js, ui.js, settings.js
// ============================================================

let supabaseClient = null;
let currentUser = null;
let currentSession = null;
let authConfigError = "";
let publicConfig = null;

// ── Supabase 초기화 ───────────────────────────────────────

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

// ── 인증 상태 ─────────────────────────────────────────────

async function initAuthState() {
    // If not explicitly logged out, start as premium demo user by default for live preview
    if (!localStorage.getItem('vlive_logged_out') && !currentUser) {
        localStorage.setItem(PLAN_KEY, 'premium');
        currentUser = {
            id: "local-vip",
            email: "premium-user@livecaption.com"
        };
    }
    
    renderAuthState();
    try {
        const client = await ensureSupabaseClient();
        const { data } = await client.auth.getSession();
        currentSession = data?.session || null;
        if (currentSession?.user) {
            currentUser = currentSession.user;
            localStorage.removeItem('vlive_logged_out');
        }
        enforcePremiumRequiresAuth();
        renderAuthState();
        if (currentUser) await fetchServerUsage();
        client.auth.onAuthStateChange((_event, session) => {
            currentSession = session || null;
            currentUser = currentSession?.user || null;
            if (currentUser) {
                localStorage.removeItem('vlive_logged_out');
            }
            enforcePremiumRequiresAuth();
            renderAuthState();
            if (currentUser) fetchServerUsage();
            if (currentUser) closeAuthModal();
        });
    } catch (e) {
        enforcePremiumRequiresAuth();
        renderAuthState();
    }
}

function loginAsMockPremium() {
    localStorage.removeItem('vlive_logged_out');
    localStorage.setItem(PLAN_KEY, 'premium');
    currentUser = {
        id: "local-vip",
        email: "premium-user@livecaption.com"
    };
    renderAuthState();
    renderPremiumState();
    closeAuthModal();
    showToast("Premium 데모 권한이 활성화되었습니다! 👑");
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
    if (mypageBtn) {
        const textSpan = mypageBtn.querySelector('.btn-text');
        const buttonLabel = currentUser ? uiText('myPage') : uiText('login');
        if (textSpan) {
            textSpan.textContent = buttonLabel;
        }
        mypageBtn.title = buttonLabel;
        mypageBtn.setAttribute('aria-label', buttonLabel);

        const avatarImg = mypageBtn.querySelector('.mypage-avatar-3d');
        if (avatarImg) {
            let src = "avatar_3d_guest.jpg";
            let tier = "guest";
            if (currentUser) {
                const plan = getPlan();
                if (plan === 'premium') {
                    src = "avatar_3d_vip.jpg";
                    tier = "premium";
                } else if (plan === 'team') {
                    src = "avatar_3d_team.jpg";
                    tier = "team";
                } else {
                    src = "user_3d_avatar.jpg";
                    tier = "free";
                }
            }
            avatarImg.src = src;
            mypageBtn.dataset.tier = tier;
        }
    }
    renderAccountPanel();
}

function enforcePremiumRequiresAuth() {
    if (!currentUser && getPlan() !== 'free') {
        localStorage.setItem(PLAN_KEY, 'free');
        renderPremiumState();
    }
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
    if (!email) { showToast("이메일을 입력해 주세요.", "error"); return; }
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

// ── 플랜 / 사용량 ─────────────────────────────────────────

function getPlan() {
    const plan = localStorage.getItem(PLAN_KEY);
    return ['premium', 'team'].includes(plan) ? plan : 'free';
}

function isPremiumPlan() { return getPlan() !== 'free'; }

function getPlanLimits() { return isPremiumPlan() ? PREMIUM_LIMITS : FREE_LIMITS; }

function getTodayKey() { return new Date().toISOString().slice(0, 10); }

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

function getUsageMeterText(limits = getPlanLimits(), usage = getUsage()) {
    return getAppLanguage() === 'ko'
        ? `클라우드 ${formatMinutes(usage.cloudSeconds)}/${formatMinutes(limits.cloudSeconds)} · AI ${usage.aiRequests}/${limits.aiRequests} · 최종변환 ${usage.finalTranscribes}/${limits.finalTranscribes}`
        : `Cloud ${formatMinutes(usage.cloudSeconds)}/${formatMinutes(limits.cloudSeconds)} · AI ${usage.aiRequests}/${limits.aiRequests} · Final transcribes ${usage.finalTranscribes}/${limits.finalTranscribes}`;
}

function renderPremiumState() {
    const plan = getPlan();
    const limits = getPlanLimits();
    const usage = getUsage();
    document.body.classList.toggle('premium-plan', plan !== 'free');
    const badge = document.getElementById('plan-badge');
    if (badge) badge.textContent = plan === 'free' ? 'Free' : (plan === 'team' ? 'Team' : 'Premium');
    const meter = document.getElementById('premium-meter');
    if (meter) meter.textContent = getUsageMeterText(limits, usage);
    const historyLimit = document.getElementById('history-limit-label');
    if (historyLimit) historyLimit.textContent = `저장 기록 ${getHistory().length}/${limits.historyItems}`;
    const card = document.getElementById('premium-card');
    if (card && plan !== 'free') card.classList.remove('attention');
    renderAccountPanel();
    initAds();
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

function activatePremiumDemo() {
    if (!currentUser) { openAuthModal("Premium 기능을 사용하려면 먼저 로그인하세요."); return; }
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

// ── 결제 ──────────────────────────────────────────────────

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