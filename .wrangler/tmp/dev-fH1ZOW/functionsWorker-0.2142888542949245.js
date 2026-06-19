var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-xzi09F/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/pages-ShTXEH/functionsWorker-0.2142888542949245.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
var FREE_LIMITS = {
  cloudSeconds: 10 * 60,
  aiRequests: 3,
  finalTranscribes: 1
};
var PREMIUM_LIMITS = {
  cloudSeconds: 600 * 60,
  aiRequests: 300,
  finalTranscribes: 60
};
var todayKey = /* @__PURE__ */ __name2(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "todayKey");
var getBearerToken = /* @__PURE__ */ __name2((request) => {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}, "getBearerToken");
var hasUsageConfig = /* @__PURE__ */ __name2((env) => env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY, "hasUsageConfig");
async function getSupabaseUser({ env, token }) {
  if (!token || !hasUsageConfig(env)) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  return res.json();
}
__name(getSupabaseUser, "getSupabaseUser");
__name2(getSupabaseUser, "getSupabaseUser");
async function supabaseRest({ env, path, method = "GET", body, prefer = "return=representation" }) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer
    },
    body: body ? JSON.stringify(body) : void 0
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
__name(supabaseRest, "supabaseRest");
__name2(supabaseRest, "supabaseRest");
async function getServerAccount({ request, env }) {
  if (!hasUsageConfig(env)) return null;
  const token = getBearerToken(request);
  const user = await getSupabaseUser({ env, token });
  if (!user?.id) return null;
  const profileRows = await supabaseRest({
    env,
    path: `profiles?id=eq.${encodeURIComponent(user.id)}&select=plan`
  });
  return { user, plan: profileRows?.[0]?.plan || "free" };
}
__name(getServerAccount, "getServerAccount");
__name2(getServerAccount, "getServerAccount");
async function getUsageRow({ env, userId }) {
  const date = todayKey();
  const rows = await supabaseRest({
    env,
    path: `usage_daily?user_id=eq.${encodeURIComponent(userId)}&date=eq.${date}&select=*`
  });
  const row = rows?.[0] || {};
  return {
    date,
    cloudSeconds: Number(row.cloud_seconds) || 0,
    aiRequests: Number(row.ai_requests) || 0,
    finalTranscribes: Number(row.final_transcribes) || 0
  };
}
__name(getUsageRow, "getUsageRow");
__name2(getUsageRow, "getUsageRow");
async function assertQuota({ env, account, metric, amount = 1 }) {
  if (!account?.user?.id) return { ok: true };
  const usage = await getUsageRow({ env, userId: account.user.id });
  const limits = account.plan === "free" ? FREE_LIMITS : PREMIUM_LIMITS;
  if ((Number(usage[metric]) || 0) + amount > (Number(limits[metric]) || 0)) {
    return { ok: false, usage, limits, plan: account.plan };
  }
  return { ok: true, usage, limits, plan: account.plan };
}
__name(assertQuota, "assertQuota");
__name2(assertQuota, "assertQuota");
async function incrementServerUsage({ env, account, metric, amount = 1 }) {
  if (!account?.user?.id) return;
  const usage = await getUsageRow({ env, userId: account.user.id });
  usage[metric] = (Number(usage[metric]) || 0) + amount;
  await supabaseRest({
    env,
    path: "usage_daily?on_conflict=user_id,date",
    method: "POST",
    prefer: "return=representation,resolution=merge-duplicates",
    body: [{
      user_id: account.user.id,
      date: usage.date,
      cloud_seconds: usage.cloudSeconds,
      ai_requests: usage.aiRequests,
      final_transcribes: usage.finalTranscribes,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }]
  });
}
__name(incrementServerUsage, "incrementServerUsage");
__name2(incrementServerUsage, "incrementServerUsage");
var jsonHeaders = /* @__PURE__ */ __name2((request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin).split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Billing-Secret",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}, "jsonHeaders");
var jsonResponse = /* @__PURE__ */ __name2((body, status, headers) => new Response(JSON.stringify(body), { status, headers }), "jsonResponse");
var normalizePlan = /* @__PURE__ */ __name2((plan) => ["premium", "team"].includes(plan) ? plan : "premium", "normalizePlan");
async function upsertProfile({ env, userId, email, plan }) {
  await supabaseRest({
    env,
    path: "profiles?on_conflict=id",
    method: "POST",
    prefer: "return=representation,resolution=merge-duplicates",
    body: [{
      id: userId,
      email: email || "",
      plan: normalizePlan(plan),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }]
  });
}
__name(upsertProfile, "upsertProfile");
__name2(upsertProfile, "upsertProfile");
async function onRequestOptions(context) {
  return new Response(null, { headers: jsonHeaders(context.request, context.env) });
}
__name(onRequestOptions, "onRequestOptions");
__name2(onRequestOptions, "onRequestOptions");
async function onRequestPost(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request, env);
  if (!hasUsageConfig(env)) {
    return jsonResponse({ error: "Billing requires Supabase service role config." }, 501, headers);
  }
  const body = await request.json().catch(() => ({}));
  const plan = normalizePlan(body.plan);
  const secret = request.headers.get("X-Billing-Secret") || "";
  if (!env.PAYMENT_WEBHOOK_SECRET || secret !== env.PAYMENT_WEBHOOK_SECRET) {
    return jsonResponse({ error: "Invalid billing secret." }, 401, headers);
  }
  const userId = String(body.userId || "").trim();
  if (!userId) return jsonResponse({ error: "Missing userId." }, 400, headers);
  await upsertProfile({ env, userId, email: body.email || "", plan });
  return jsonResponse({ ok: true, plan }, 200, headers);
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
var PROVIDERS = {
  gemini: {
    defaultModel: "gemini-1.5-flash",
    models: /* @__PURE__ */ new Set(["gemini-1.5-flash", "gemini-1.5-pro"])
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    models: /* @__PURE__ */ new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"])
  },
  groq: {
    defaultModel: "llama-3.1-8b-instant",
    models: /* @__PURE__ */ new Set(["llama-3.1-8b-instant", "llama-3.3-70b-versatile"])
  }
};
var jsonHeaders2 = /* @__PURE__ */ __name2((request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin).split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}, "jsonHeaders");
var jsonResponse2 = /* @__PURE__ */ __name2((body, status, headers) => new Response(JSON.stringify(body), { status, headers }), "jsonResponse");
var cleanString = /* @__PURE__ */ __name2((value) => String(value || "").trim(), "cleanString");
var getProviderConfig = /* @__PURE__ */ __name2((providerName) => {
  if (providerName === "default") return { provider: "gemini", config: PROVIDERS.gemini };
  const config = PROVIDERS[providerName];
  return config ? { provider: providerName, config } : null;
}, "getProviderConfig");
var resolveApiKey = /* @__PURE__ */ __name2((provider, body, env) => {
  const userKey = cleanString(body.apiKey);
  if (userKey) return userKey;
  if (provider === "gemini") return cleanString(env.GEMINI_API_KEY || env.GOOGLE_AI_KEY);
  if (provider === "openai") return cleanString(env.OPENAI_API_KEY);
  if (provider === "groq") return cleanString(env.GROQ_API_KEY);
  return "";
}, "resolveApiKey");
var getMinutesLabels = /* @__PURE__ */ __name2((minutesType) => {
  if (minutesType === "lecture") {
    return {
      title: "\uAC15\uC758 \uB178\uD2B8",
      sections: ["\uD575\uC2EC \uAC1C\uB150", "\uAC15\uC758 \uD750\uB984", "\uC911\uC694 \uC124\uBA85", "\uBCF5\uC2B5\uD560 \uB0B4\uC6A9", "\uC9C8\uBB38 \uB610\uB294 \uCD94\uAC00 \uD655\uC778"]
    };
  }
  if (minutesType === "consulting") {
    return {
      title: "\uC0C1\uB2F4 \uAE30\uB85D",
      sections: ["\uD575\uC2EC \uC694\uC57D", "\uC0C1\uB2F4 \uB0B4\uC6A9", "\uD655\uC778\uB41C \uC694\uAD6C\uC0AC\uD56D", "\uB2E4\uC74C \uC870\uCE58", "\uC8FC\uC758\uD560 \uBA54\uBAA8"]
    };
  }
  return {
    title: "\uD68C\uC758\uB85D",
    sections: ["\uD575\uC2EC \uC694\uC57D", "\uC8FC\uC694 \uC548\uAC74", "\uACB0\uC815 \uC0AC\uD56D", "\uB2E4\uC74C \uD560 \uC77C", "\uC911\uC694\uD55C \uBC1C\uC5B8 \uB610\uB294 \uBA54\uBAA8"]
  };
}, "getMinutesLabels");
var buildPrompt = /* @__PURE__ */ __name2((transcript, question, mode, options = {}) => {
  if (question) {
    return `\uC790\uB9C9 \uB0B4\uC6A9:
${transcript}

\uC9C8\uBB38:
${question}

\uC704 \uC790\uB9C9 \uB0B4\uC6A9\uC5D0 \uADFC\uAC70\uD574\uC11C \uD55C\uAD6D\uC5B4\uB85C \uAC04\uACB0\uD558\uACE0 \uC815\uD655\uD558\uAC8C \uB2F5\uBCC0\uD574 \uC8FC\uC138\uC694.`;
  }
  if (mode === "translate") {
    const targetMap = {
      en: "\uC601\uC5B4",
      "en-AU": "\uD638\uC8FC\uC2DD \uC601\uC5B4",
      ko: "\uD55C\uAD6D\uC5B4",
      ja: "\uC77C\uBCF8\uC5B4"
    };
    const target = targetMap[options.targetLanguage] || "\uC601\uC5B4";
    return `\uB2E4\uC74C \uC2E4\uC2DC\uAC04 \uC790\uB9C9 \uC870\uAC01\uC744 ${target}\uB85C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uBC88\uC5ED\uD574 \uC8FC\uC138\uC694.

\uADDC\uCE59:
- \uBC88\uC5ED\uBB38\uB9CC \uCD9C\uB825\uD558\uC138\uC694.
- \uC790\uB9C9\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC740 \uCD94\uAC00\uD558\uC9C0 \uB9C8\uC138\uC694.
- \uB9D0\uC774 \uB04A\uAE34 \uC9E7\uC740 \uC870\uAC01\uC774\uBA74 \uAC00\uB2A5\uD55C \uBC94\uC704\uC5D0\uC11C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uBC88\uC5ED\uD558\uC138\uC694.

\uC790\uB9C9:
${transcript}`;
  }
  if (mode === "minutes") {
    const labels = getMinutesLabels(options.minutesType);
    return `\uB2E4\uC74C \uC790\uB9C9 \uB0B4\uC6A9\uC744 ${labels.title}\uB85C \uC815\uB9AC\uD574 \uC8FC\uC138\uC694.

\uCD9C\uB825\uC740 \uBC18\uB4DC\uC2DC Markdown \uD615\uC2DD\uC73C\uB85C \uC791\uC131\uD558\uACE0, \uC544\uB798 \uAD6C\uC870\uB97C \uC720\uC9C0\uD574 \uC8FC\uC138\uC694.

# ${labels.title}

## ${labels.sections[0]}
- 

## ${labels.sections[1]}
- 

## ${labels.sections[2]}
- \uD655\uC778\uB41C \uB0B4\uC6A9\uC774 \uC5C6\uC73C\uBA74 "\uD655\uC778\uB41C \uB0B4\uC6A9 \uC5C6\uC74C"\uC774\uB77C\uACE0 \uC801\uC5B4 \uC8FC\uC138\uC694.

## ${labels.sections[3]}
- \uB2F4\uB2F9\uC790\uB098 \uAE30\uD55C\uC774 \uBA85\uD655\uD558\uC9C0 \uC54A\uC73C\uBA74 \uCD94\uCE21\uD558\uC9C0 \uB9D0\uACE0 "\uB2F4\uB2F9\uC790 \uBBF8\uC815", "\uAE30\uD55C \uBBF8\uC815"\uC73C\uB85C \uC801\uC5B4 \uC8FC\uC138\uC694.

## ${labels.sections[4]}
- 

\uADDC\uCE59:
- \uC790\uB9C9\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC740 \uCD94\uCE21\uD558\uC9C0 \uB9C8\uC138\uC694.
- \uBC18\uBCF5\uB418\uAC70\uB098 \uC798\uBABB \uC778\uC2DD\uB41C \uD45C\uD604\uC740 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC815\uB9AC\uD558\uC138\uC694.
- \uB108\uBB34 \uAE38\uAC8C \uC4F0\uC9C0 \uB9D0\uACE0 \uC2E4\uBB34\uC790\uAC00 \uBC14\uB85C \uBCF5\uC0AC\uD574 \uC4F8 \uC218 \uC788\uAC8C \uC791\uC131\uD558\uC138\uC694.

\uC790\uB9C9 \uB0B4\uC6A9:
${transcript}`;
  }
  return `\uB2E4\uC74C \uC790\uB9C9 \uB0B4\uC6A9\uC744 \uD55C\uAD6D\uC5B4\uB85C 3\uC904 \uC774\uB0B4\uB85C \uD575\uC2EC \uC694\uC57D\uD574 \uC8FC\uC138\uC694.

${transcript}`;
}, "buildPrompt");
async function callGemini({ apiKey, model, prompt }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(2e4),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 700
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new ResponseError(data.error?.message || "AI \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", response.status || 502);
  }
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new ResponseError(data.promptFeedback?.blockReason || "\uC751\uB2F5 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", 502);
  return aiText;
}
__name(callGemini, "callGemini");
__name2(callGemini, "callGemini");
async function callOpenAiCompatible({ endpoint, apiKey, model, prompt }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(2e4),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "\uB108\uB294 \uC2E4\uC2DC\uAC04 \uC790\uB9C9 \uB0B4\uC6A9\uC744 \uC815\uB9AC\uD558\uB294 \uD55C\uAD6D\uC5B4 \uBCF4\uC870 \uB3C4\uAD6C\uB2E4. \uC790\uB9C9\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC740 \uCD94\uCE21\uD558\uC9C0 \uC54A\uB294\uB2E4." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 700
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ResponseError(data.error?.message || "AI \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", response.status);
  }
  const aiText = data.choices?.[0]?.message?.content;
  if (!aiText) throw new ResponseError("AI \uC751\uB2F5 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", 502);
  return aiText;
}
__name(callOpenAiCompatible, "callOpenAiCompatible");
__name2(callOpenAiCompatible, "callOpenAiCompatible");
var ResponseError = class extends Error {
  static {
    __name(this, "ResponseError");
  }
  static {
    __name2(this, "ResponseError");
  }
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
};
async function onRequestOptions2(context) {
  return new Response(null, { headers: jsonHeaders2(context.request, context.env) });
}
__name(onRequestOptions2, "onRequestOptions2");
__name2(onRequestOptions2, "onRequestOptions");
async function onRequestPost2(context) {
  const { request, env } = context;
  const headers = jsonHeaders2(request, env);
  try {
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 25e4) {
      return jsonResponse2({ result: "\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." }, 413, headers);
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse2({ result: "JSON \uC694\uCCAD\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4." }, 415, headers);
    }
    const body = await request.json();
    const transcript = cleanString(body.text);
    const userQuestion = cleanString(body.question);
    const requestedMode = cleanString(body.mode);
    const mode = ["minutes", "translate"].includes(requestedMode) ? requestedMode : "summary";
    const minutesType = cleanString(body.minutesType);
    const targetLanguage = cleanString(body.targetLanguage);
    if (transcript.length < (mode === "translate" ? 2 : 5)) {
      return jsonResponse2({ result: "\uC694\uC57D\uD560 \uC790\uB9C9 \uB0B4\uC6A9\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4." }, 400, headers);
    }
    if (transcript.length > 2e4) {
      return jsonResponse2({ result: "\uC790\uB9C9\uC774 \uB108\uBB34 \uAE41\uB2C8\uB2E4. \uC77C\uBD80\uB9CC \uC120\uD0DD\uD574 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 413, headers);
    }
    if (userQuestion.length > 1e3) {
      return jsonResponse2({ result: "\uC9C8\uBB38\uC774 \uB108\uBB34 \uAE41\uB2C8\uB2E4." }, 413, headers);
    }
    const requestedProvider = cleanString(body.provider) || "default";
    const providerInfo = getProviderConfig(requestedProvider);
    if (!providerInfo) {
      return jsonResponse2({ result: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 AI \uC81C\uACF5\uC5C5\uCCB4\uC785\uB2C8\uB2E4." }, 400, headers);
    }
    const { provider, config } = providerInfo;
    const usesServerCredit = requestedProvider === "default";
    const account = usesServerCredit ? await getServerAccount({ request, env }) : null;
    if (usesServerCredit && !account?.user?.id) {
      return jsonResponse2({
        result: "\uAC15\uC758\uC790\uB8CC \uC815\uB9AC\uB294 \uB85C\uADF8\uC778 \uD6C4 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8 \uC2E4\uC2DC\uAC04 \uC790\uB9C9\uC740 \uB85C\uADF8\uC778 \uC5C6\uC774 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        code: "login_required"
      }, 401, headers);
    }
    const quota = usesServerCredit ? await assertQuota({ env, account, metric: "aiRequests", amount: 1 }) : { ok: true };
    if (!quota.ok) {
      return jsonResponse2({
        result: "\uBB34\uB8CC \uAC15\uC758\uC790\uB8CC \uC815\uB9AC \uD69F\uC218\uB97C \uBAA8\uB450 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4. Premium\uC73C\uB85C \uAC15\uC758\uC790\uB8CC, \uC9C8\uBB38, \uBC88\uC5ED \uD55C\uB3C4\uB97C \uB298\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        code: "quota_exceeded",
        usage: quota.usage,
        limits: quota.limits
      }, 402, headers);
    }
    const apiKey = resolveApiKey(provider, body, env);
    if (!apiKey) {
      return jsonResponse2({ result: "AI API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }, 503, headers);
    }
    const requestedModel = cleanString(body.model);
    const model = config.models.has(requestedModel) ? requestedModel : config.defaultModel;
    const prompt = buildPrompt(transcript, userQuestion, mode, { minutesType, targetLanguage });
    let result = "";
    if (provider === "gemini") {
      result = await callGemini({ apiKey, model, prompt });
    } else if (provider === "openai") {
      result = await callOpenAiCompatible({
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey,
        model,
        prompt
      });
    } else if (provider === "groq") {
      result = await callOpenAiCompatible({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey,
        model,
        prompt
      });
    }
    if (usesServerCredit) {
      await incrementServerUsage({ env, account, metric: "aiRequests", amount: 1 });
    }
    return jsonResponse2({ result, provider, model }, 200, headers);
  } catch (err) {
    if (err instanceof ResponseError) {
      return jsonResponse2({ result: `AI \uC624\uB958: ${err.message}` }, err.status, headers);
    }
    const message = err.name === "TimeoutError" ? "AI \uC694\uCCAD \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "AI \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
    return jsonResponse2({ result: message }, 500, headers);
  }
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
var jsonHeaders3 = /* @__PURE__ */ __name2((request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin).split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}, "jsonHeaders");
async function onRequestOptions3(context) {
  return new Response(null, { headers: jsonHeaders3(context.request, context.env) });
}
__name(onRequestOptions3, "onRequestOptions3");
__name2(onRequestOptions3, "onRequestOptions");
async function onRequestGet(context) {
  const { request, env } = context;
  return new Response(JSON.stringify({
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseAnonKey: env.SUPABASE_ANON_KEY || "",
    paymentUrlPremium: env.PAYMENT_URL_PREMIUM || "",
    paymentUrlPro: env.PAYMENT_URL_PRO || ""
  }), {
    headers: jsonHeaders3(request, env)
  });
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
var MAX_AUDIO_SIZE = 15 * 1024 * 1024;
var POLL_INTERVAL_MS = 1e3;
var POLL_DEADLINE_MS = 22e3;
var PROVIDERS2 = {
  groq: {
    type: "openai-compatible",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    defaultModel: "whisper-large-v3",
    models: /* @__PURE__ */ new Set(["whisper-large-v3", "whisper-large-v3-turbo"])
  },
  openai: {
    type: "openai-compatible",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    defaultModel: "gpt-4o-mini-transcribe",
    models: /* @__PURE__ */ new Set(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"])
  },
  gladia: {
    type: "gladia",
    defaultModel: "standard",
    models: /* @__PURE__ */ new Set(["standard"])
  },
  speechmatics: {
    type: "speechmatics",
    defaultModel: "enhanced",
    models: /* @__PURE__ */ new Set(["enhanced", "standard"])
  },
  ibm: {
    type: "ibm",
    defaultModel: "ko-KR_BroadbandModel",
    models: /* @__PURE__ */ new Set(["ko-KR_BroadbandModel", "en-US_BroadbandModel"])
  },
  azure: {
    type: "azure",
    defaultModel: "conversation",
    models: /* @__PURE__ */ new Set(["conversation"])
  }
};
var jsonHeaders4 = /* @__PURE__ */ __name2((request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin).split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}, "jsonHeaders");
var jsonResponse3 = /* @__PURE__ */ __name2((body, status, headers) => new Response(JSON.stringify(body), { status, headers }), "jsonResponse");
var cleanString2 = /* @__PURE__ */ __name2((value) => String(value || "").trim(), "cleanString");
var sleep = /* @__PURE__ */ __name2((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "sleep");
var normalizeLanguage = /* @__PURE__ */ __name2((language, provider) => {
  const normalized = language === "en-AU" ? "en" : language;
  if (!["ko", "en", "ja"].includes(normalized)) return "";
  if (provider === "azure") {
    if (language === "en-AU") return "en-AU";
    if (normalized === "ko") return "ko-KR";
    if (normalized === "ja") return "ja-JP";
    return "en-US";
  }
  if (provider === "speechmatics") return normalized;
  return normalized;
}, "normalizeLanguage");
var getProviderConfig2 = /* @__PURE__ */ __name2((providerName) => {
  if (providerName === "default") return { provider: "groq", config: PROVIDERS2.groq };
  const config = PROVIDERS2[providerName];
  return config ? { provider: providerName, config } : null;
}, "getProviderConfig");
var resolveApiKey2 = /* @__PURE__ */ __name2((provider, formData, env) => {
  const userKey = cleanString2(formData.get("apiKey"));
  if (userKey) return userKey;
  if (provider === "groq") return cleanString2(env.GROQ_API_KEY);
  if (provider === "openai") return cleanString2(env.OPENAI_API_KEY);
  if (provider === "gladia") return cleanString2(env.GLADIA_API_KEY);
  if (provider === "speechmatics") return cleanString2(env.SPEECHMATICS_API_KEY);
  if (provider === "ibm") return cleanString2(env.IBM_STT_API_KEY);
  if (provider === "azure") return cleanString2(env.AZURE_SPEECH_KEY);
  return "";
}, "resolveApiKey");
var speakerLabel = /* @__PURE__ */ __name2((speaker) => {
  const raw = cleanString2(speaker);
  if (!raw) return "\uBC1C\uD654\uC790";
  const match2 = raw.match(/\d+/);
  if (!match2) return `\uBC1C\uD654\uC790 ${raw}`;
  const index = Number(match2[0]);
  const letterIndex = index > 0 ? index - 1 : index;
  const letter = String.fromCharCode(65 + Math.max(0, Math.min(25, letterIndex)));
  return `\uBC1C\uD654\uC790 ${letter}`;
}, "speakerLabel");
var parseGladiaText = /* @__PURE__ */ __name2((data, diarization = false) => {
  const transcription = data?.result?.transcription || data?.transcription || data?.result;
  if (typeof transcription === "string") return transcription;
  if (typeof transcription?.full_transcript === "string") return transcription.full_transcript;
  if (Array.isArray(transcription?.utterances)) {
    if (diarization) {
      return transcription.utterances.map((item) => `${speakerLabel(item.speaker || item.speaker_id)}: ${item.text || item.transcript || ""}`.trim()).join("\n");
    }
    return transcription.utterances.map((item) => item.text || item.transcript || "").join(" ");
  }
  return data?.text || "";
}, "parseGladiaText");
async function transcribeOpenAiCompatible({ audioFile, apiKey, model, language, config }) {
  const outbound = new FormData();
  outbound.append("file", audioFile, "audio.webm");
  outbound.append("model", model);
  if (language) outbound.append("language", language);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(25e3),
    body: outbound
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError2(data.error?.message || "\uC74C\uC131 \uC778\uC2DD \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", response.status);
  return data.text || "";
}
__name(transcribeOpenAiCompatible, "transcribeOpenAiCompatible");
__name2(transcribeOpenAiCompatible, "transcribeOpenAiCompatible");
async function transcribeGladia({ audioFile, apiKey, language, diarization }) {
  const uploadForm = new FormData();
  uploadForm.append("audio", audioFile, "audio.webm");
  const uploadResponse = await fetch("https://api.gladia.io/v2/upload", {
    method: "POST",
    headers: { "x-gladia-key": apiKey },
    signal: AbortSignal.timeout(15e3),
    body: uploadForm
  });
  const uploadData = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) throw new ResponseError2(uploadData.error || uploadData.message || "Gladia \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", uploadResponse.status);
  const audioUrl = uploadData.audio_url || uploadData.url;
  if (!audioUrl) throw new ResponseError2("Gladia \uC5C5\uB85C\uB4DC \uACB0\uACFC\uC5D0\uC11C audio_url\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", 502);
  const startResponse = await fetch("https://api.gladia.io/v2/transcription", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gladia-key": apiKey },
    signal: AbortSignal.timeout(15e3),
    body: JSON.stringify({
      audio_url: audioUrl,
      detect_language: !language,
      language: language || void 0,
      diarization: Boolean(diarization)
    })
  });
  const startData = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) throw new ResponseError2(startData.error || startData.message || "Gladia \uBCC0\uD658 \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", startResponse.status);
  const resultUrl = startData.result_url || (startData.id ? `https://api.gladia.io/v2/transcription/${startData.id}` : "");
  if (!resultUrl) return parseGladiaText(startData, diarization);
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollResponse = await fetch(resultUrl, {
      headers: { "x-gladia-key": apiKey },
      signal: AbortSignal.timeout(1e4)
    });
    const pollData = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) throw new ResponseError2(pollData.error || pollData.message || "Gladia \uACB0\uACFC \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", pollResponse.status);
    if (["done", "completed", "success"].includes(String(pollData.status || "").toLowerCase())) {
      return parseGladiaText(pollData, diarization);
    }
    if (["error", "failed"].includes(String(pollData.status || "").toLowerCase())) {
      throw new ResponseError2("Gladia \uC74C\uC131 \uC778\uC2DD \uC791\uC5C5\uC774 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", 502);
    }
  }
  throw new ResponseError2("Gladia \uACB0\uACFC \uB300\uAE30 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", 504);
}
__name(transcribeGladia, "transcribeGladia");
__name2(transcribeGladia, "transcribeGladia");
async function transcribeSpeechmatics({ audioFile, apiKey, model, language, diarization }) {
  const jobForm = new FormData();
  jobForm.append("config", JSON.stringify({
    type: "transcription",
    transcription_config: {
      language: language || "ko",
      operating_point: model,
      diarization: diarization ? "speaker" : void 0
    }
  }));
  jobForm.append("data_file", audioFile, "audio.webm");
  const jobResponse = await fetch("https://asr.api.speechmatics.com/v2/jobs", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15e3),
    body: jobForm
  });
  const jobData = await jobResponse.json().catch(() => ({}));
  if (!jobResponse.ok) throw new ResponseError2(jobData.error || jobData.detail || "Speechmatics \uC791\uC5C5 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", jobResponse.status);
  const jobId = jobData.id || jobData.job?.id;
  if (!jobId) throw new ResponseError2("Speechmatics \uC791\uC5C5 ID\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", 502);
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const statusResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1e4)
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new ResponseError2(statusData.error || statusData.detail || "Speechmatics \uC0C1\uD0DC \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", statusResponse.status);
    const status = String(statusData.job?.status || statusData.status || "").toLowerCase();
    if (status === "done") {
      const transcriptResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}/transcript?format=txt`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(1e4)
      });
      const text = await transcriptResponse.text();
      if (!transcriptResponse.ok) throw new ResponseError2(text || "Speechmatics \uACB0\uACFC \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", transcriptResponse.status);
      return text;
    }
    if (["rejected", "failed", "error"].includes(status)) {
      throw new ResponseError2("Speechmatics \uC74C\uC131 \uC778\uC2DD \uC791\uC5C5\uC774 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", 502);
    }
  }
  throw new ResponseError2("Speechmatics \uACB0\uACFC \uB300\uAE30 \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", 504);
}
__name(transcribeSpeechmatics, "transcribeSpeechmatics");
__name2(transcribeSpeechmatics, "transcribeSpeechmatics");
async function transcribeIbm({ audioFile, apiKey, model, providerExtra }) {
  const serviceUrl = cleanString2(providerExtra).replace(/\/+$/, "");
  if (!serviceUrl) throw new ResponseError2("IBM Watson \uC11C\uBE44\uC2A4 URL\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", 400);
  const response = await fetch(`${serviceUrl}/v1/recognize?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`apikey:${apiKey}`)}`,
      "Content-Type": audioFile.type || "audio/webm"
    },
    signal: AbortSignal.timeout(25e3),
    body: audioFile
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError2(data.error || "IBM Watson \uC74C\uC131 \uC778\uC2DD \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", response.status);
  return (data.results || []).map((item) => item.alternatives?.[0]?.transcript || "").join(" ");
}
__name(transcribeIbm, "transcribeIbm");
__name2(transcribeIbm, "transcribeIbm");
async function transcribeAzure({ audioFile, apiKey, language, providerExtra }) {
  const region = cleanString2(providerExtra);
  if (!region) throw new ResponseError2("Azure Speech \uB9AC\uC804\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", 400);
  const azureLanguage = language || "ko-KR";
  const contentType = audioFile.type && audioFile.type.includes("ogg") ? "audio/ogg; codecs=opus" : audioFile.type || "audio/webm";
  const response = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(azureLanguage)}&format=simple`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": contentType,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(25e3),
    body: audioFile
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError2(data.error?.message || "Azure Speech \uC74C\uC131 \uC778\uC2DD \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", response.status);
  return data.DisplayText || data.NBest?.[0]?.Display || "";
}
__name(transcribeAzure, "transcribeAzure");
__name2(transcribeAzure, "transcribeAzure");
var ResponseError2 = class extends Error {
  static {
    __name(this, "ResponseError2");
  }
  static {
    __name2(this, "ResponseError");
  }
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
};
async function onRequestOptions4(context) {
  return new Response(null, { headers: jsonHeaders4(context.request, context.env) });
}
__name(onRequestOptions4, "onRequestOptions4");
__name2(onRequestOptions4, "onRequestOptions");
async function onRequestPost3(context) {
  const { request, env } = context;
  const headers = jsonHeaders4(request, env);
  try {
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_AUDIO_SIZE) {
      return jsonResponse3({ error: "\uC624\uB514\uC624 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." }, 413, headers);
    }
    const formData = await request.formData();
    const audioFile = formData.get("file");
    if (!audioFile || typeof audioFile === "string") {
      return jsonResponse3({ error: "\uC624\uB514\uC624 \uD30C\uC77C\uC774 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }, 400, headers);
    }
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return jsonResponse3({ error: "\uC624\uB514\uC624 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4." }, 413, headers);
    }
    if (audioFile.type && !audioFile.type.startsWith("audio/")) {
      return jsonResponse3({ error: "\uC624\uB514\uC624 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }, 415, headers);
    }
    const requestedProvider = cleanString2(formData.get("provider")) || "default";
    const providerInfo = getProviderConfig2(requestedProvider);
    if (!providerInfo) {
      return jsonResponse3({ error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC74C\uC131 \uC778\uC2DD \uC81C\uACF5\uC5C5\uCCB4\uC785\uB2C8\uB2E4." }, 400, headers);
    }
    const { provider, config } = providerInfo;
    const usesServerCredit = requestedProvider === "default";
    const estimatedSeconds = Math.max(1, Math.ceil(Number(formData.get("durationSeconds")) || 4));
    const usageMetric = cleanString2(formData.get("usageMetric")) === "finalTranscribes" ? "finalTranscribes" : "cloudSeconds";
    const usageAmount = usageMetric === "finalTranscribes" ? 1 : estimatedSeconds;
    const account = usesServerCredit ? await getServerAccount({ request, env }) : null;
    if (usesServerCredit && !account?.user?.id) {
      return jsonResponse3({
        error: "\uD074\uB77C\uC6B0\uB4DC \uACE0\uC815\uBC00 \uC790\uB9C9\uC740 \uB85C\uADF8\uC778 \uD6C4 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uBB34\uB8CC \uC811\uADFC\uC131 \uC790\uB9C9\uC740 \uB85C\uCEEC \uBAA8\uB4DC\uC5D0\uC11C \uACC4\uC18D \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        code: "login_required"
      }, 401, headers);
    }
    const quota = usesServerCredit ? await assertQuota({ env, account, metric: usageMetric, amount: usageAmount }) : { ok: true };
    if (!quota.ok) {
      return jsonResponse3({
        error: "\uBB34\uB8CC \uD074\uB77C\uC6B0\uB4DC \uC790\uB9C9 \uC2DC\uAC04\uC774 \uBAA8\uB450 \uC0AC\uC6A9\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Premium\uC73C\uB85C \uACE0\uC815\uBC00 \uC790\uB9C9 \uC2DC\uAC04\uC744 \uB298\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        code: "quota_exceeded",
        usage: quota.usage,
        limits: quota.limits
      }, 402, headers);
    }
    const apiKey = resolveApiKey2(provider, formData, env);
    if (!apiKey) {
      return jsonResponse3({ error: "\uC74C\uC131 \uC778\uC2DD API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }, 503, headers);
    }
    const requestedModel = cleanString2(formData.get("model"));
    const model = config.models.has(requestedModel) ? requestedModel : config.defaultModel;
    const rawLanguage = cleanString2(formData.get("language"));
    const language = normalizeLanguage(rawLanguage, provider);
    const providerExtra = cleanString2(formData.get("providerExtra"));
    const diarization = cleanString2(formData.get("diarization")) === "true";
    let text = "";
    if (config.type === "openai-compatible") {
      text = await transcribeOpenAiCompatible({ audioFile, apiKey, model, language, config });
    } else if (config.type === "gladia") {
      text = await transcribeGladia({ audioFile, apiKey, language, diarization });
    } else if (config.type === "speechmatics") {
      text = await transcribeSpeechmatics({ audioFile, apiKey, model, language, diarization });
    } else if (config.type === "ibm") {
      text = await transcribeIbm({ audioFile, apiKey, model, providerExtra });
    } else if (config.type === "azure") {
      text = await transcribeAzure({ audioFile, apiKey, language, providerExtra });
    }
    if (usesServerCredit) {
      await incrementServerUsage({ env, account, metric: usageMetric, amount: usageAmount });
    }
    return jsonResponse3({ text, provider, model }, 200, headers);
  } catch (err) {
    if (err instanceof ResponseError2) {
      return jsonResponse3({ error: err.message }, err.status, headers);
    }
    const message = err.name === "TimeoutError" ? "\uC74C\uC131 \uC778\uC2DD \uC694\uCCAD \uC2DC\uAC04\uC774 \uCD08\uACFC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "\uC74C\uC131 \uC778\uC2DD \uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
    return jsonResponse3({ error: message }, 500, headers);
  }
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
var jsonHeaders5 = /* @__PURE__ */ __name2((request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin).split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8"
  };
}, "jsonHeaders");
var jsonResponse4 = /* @__PURE__ */ __name2((body, status, headers) => new Response(JSON.stringify(body), { status, headers }), "jsonResponse");
async function requireUser(request, env, headers) {
  if (!hasUsageConfig(env)) {
    return { response: jsonResponse4({ error: "Server usage requires SUPABASE_SERVICE_ROLE_KEY." }, 501, headers) };
  }
  const token = getBearerToken(request);
  if (!token) return { response: jsonResponse4({ error: "Missing bearer token." }, 401, headers) };
  const user = await getSupabaseUser({ env, token });
  if (!user?.id) return { response: jsonResponse4({ error: "Invalid session." }, 401, headers) };
  return { user };
}
__name(requireUser, "requireUser");
__name2(requireUser, "requireUser");
async function onRequestOptions5(context) {
  return new Response(null, { headers: jsonHeaders5(context.request, context.env) });
}
__name(onRequestOptions5, "onRequestOptions5");
__name2(onRequestOptions5, "onRequestOptions");
async function onRequestGet2(context) {
  const { request, env } = context;
  const headers = jsonHeaders5(request, env);
  const { user, response } = await requireUser(request, env, headers);
  if (response) return response;
  const profileRows = await supabaseRest({
    env,
    path: `profiles?id=eq.${encodeURIComponent(user.id)}&select=plan`
  });
  return jsonResponse4({
    plan: profileRows?.[0]?.plan || "free",
    usage: await getUsageRow({ env, userId: user.id })
  }, 200, headers);
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequestPost4(context) {
  return jsonResponse4({ error: "Usage is server-managed and read-only from the client." }, 405, jsonHeaders5(context.request, context.env));
}
__name(onRequestPost4, "onRequestPost4");
__name2(onRequestPost4, "onRequestPost");
var routes = [
  {
    routePath: "/api/billing",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/billing",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/stt",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/stt",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/usage",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/usage",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/api/usage",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// C:/Users/ckdwn/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// C:/Users/ckdwn/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-xzi09F/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// C:/Users/ckdwn/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-xzi09F/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.2142888542949245.js.map
