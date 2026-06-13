const PROVIDERS = {
  gemini: {
    defaultModel: "gemini-1.5-flash",
    models: new Set(["gemini-1.5-flash", "gemini-1.5-pro"]),
  },
  openai: {
    defaultModel: "gpt-4o-mini",
    models: new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]),
  },
  groq: {
    defaultModel: "llama-3.1-8b-instant",
    models: new Set(["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]),
  },
};

const jsonHeaders = (request, env) => {
  const origin = request.headers.get("Origin") || "";
  const selfOrigin = new URL(request.url).origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || selfOrigin)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : selfOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
};

const jsonResponse = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers });

const cleanString = (value) => String(value || "").trim();

const getProviderConfig = (providerName) => {
  if (providerName === "default") return { provider: "gemini", config: PROVIDERS.gemini };
  const config = PROVIDERS[providerName];
  return config ? { provider: providerName, config } : null;
};

const resolveApiKey = (provider, body, env) => {
  const userKey = cleanString(body.apiKey);
  if (userKey) return userKey;
  if (provider === "gemini") return cleanString(env.GEMINI_API_KEY || env.GOOGLE_AI_KEY);
  if (provider === "openai") return cleanString(env.OPENAI_API_KEY);
  if (provider === "groq") return cleanString(env.GROQ_API_KEY);
  return "";
};

const getMinutesLabels = (minutesType) => {
  if (minutesType === "lecture") {
    return {
      title: "강의 노트",
      sections: ["핵심 개념", "강의 흐름", "중요 설명", "복습할 내용", "질문 또는 추가 확인"],
    };
  }
  if (minutesType === "consulting") {
    return {
      title: "상담 기록",
      sections: ["핵심 요약", "상담 내용", "확인된 요구사항", "다음 조치", "주의할 메모"],
    };
  }
  return {
    title: "회의록",
    sections: ["핵심 요약", "주요 안건", "결정 사항", "다음 할 일", "중요한 발언 또는 메모"],
  };
};

const buildPrompt = (transcript, question, mode, options = {}) => {
  if (question) {
    return `자막 내용:\n${transcript}\n\n질문:\n${question}\n\n위 자막 내용에 근거해서 한국어로 간결하고 정확하게 답변해 주세요.`;
  }
  if (mode === "translate") {
    const target = options.targetLanguage === "en" ? "영어" : "한국어";
    return `다음 실시간 자막 조각을 ${target}로 자연스럽게 번역해 주세요.

규칙:
- 번역문만 출력하세요.
- 자막에 없는 내용은 추가하지 마세요.
- 말이 끊긴 짧은 조각이면 가능한 범위에서 자연스럽게 번역하세요.

자막:
${transcript}`;
  }
  if (mode === "minutes") {
    const labels = getMinutesLabels(options.minutesType);
    return `다음 자막 내용을 ${labels.title}로 정리해 주세요.

출력은 반드시 Markdown 형식으로 작성하고, 아래 구조를 유지해 주세요.

# ${labels.title}

## ${labels.sections[0]}
- 

## ${labels.sections[1]}
- 

## ${labels.sections[2]}
- 확인된 내용이 없으면 "확인된 내용 없음"이라고 적어 주세요.

## ${labels.sections[3]}
- 담당자나 기한이 명확하지 않으면 추측하지 말고 "담당자 미정", "기한 미정"으로 적어 주세요.

## ${labels.sections[4]}
- 

규칙:
- 자막에 없는 내용은 추측하지 마세요.
- 반복되거나 잘못 인식된 표현은 자연스럽게 정리하세요.
- 너무 길게 쓰지 말고 실무자가 바로 복사해 쓸 수 있게 작성하세요.

자막 내용:
${transcript}`;
  }
  return `다음 자막 내용을 한국어로 3줄 이내로 핵심 요약해 주세요.\n\n${transcript}`;
};

async function callGemini({ apiKey, model, prompt }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 700,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new ResponseError(data.error?.message || "AI 요청에 실패했습니다.", response.status || 502);
  }
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new ResponseError(data.promptFeedback?.blockReason || "응답 내용이 없습니다.", 502);
  return aiText;
}

async function callOpenAiCompatible({ endpoint, apiKey, model, prompt }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "너는 실시간 자막 내용을 정리하는 한국어 보조 도구다. 자막에 없는 내용은 추측하지 않는다." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ResponseError(data.error?.message || "AI 요청에 실패했습니다.", response.status);
  }
  const aiText = data.choices?.[0]?.message?.content;
  if (!aiText) throw new ResponseError("AI 응답 내용이 없습니다.", 502);
  return aiText;
}

class ResponseError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: jsonHeaders(context.request, context.env) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request, env);

  try {
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 250000) {
      return jsonResponse({ result: "요청 본문이 너무 큽니다." }, 413, headers);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ result: "JSON 요청만 지원합니다." }, 415, headers);
    }

    const body = await request.json();
    const transcript = cleanString(body.text);
    const userQuestion = cleanString(body.question);
    const requestedMode = cleanString(body.mode);
    const mode = ["minutes", "translate"].includes(requestedMode) ? requestedMode : "summary";
    const minutesType = cleanString(body.minutesType);
    const targetLanguage = cleanString(body.targetLanguage);

    if (transcript.length < 5) {
      return jsonResponse({ result: "요약할 자막 내용이 부족합니다." }, 400, headers);
    }
    if (transcript.length > 20000) {
      return jsonResponse({ result: "자막이 너무 깁니다. 일부만 선택해 다시 시도해 주세요." }, 413, headers);
    }
    if (userQuestion.length > 1000) {
      return jsonResponse({ result: "질문이 너무 깁니다." }, 413, headers);
    }

    const providerInfo = getProviderConfig(cleanString(body.provider) || "default");
    if (!providerInfo) {
      return jsonResponse({ result: "지원하지 않는 AI 제공업체입니다." }, 400, headers);
    }

    const { provider, config } = providerInfo;
    const apiKey = resolveApiKey(provider, body, env);
    if (!apiKey) {
      return jsonResponse({ result: "AI API 키가 설정되지 않았습니다." }, 503, headers);
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
        prompt,
      });
    } else if (provider === "groq") {
      result = await callOpenAiCompatible({
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey,
        model,
        prompt,
      });
    }

    return jsonResponse({ result, provider, model }, 200, headers);
  } catch (err) {
    if (err instanceof ResponseError) {
      return jsonResponse({ result: `AI 오류: ${err.message}` }, err.status, headers);
    }
    const message = err.name === "TimeoutError" ? "AI 요청 시간이 초과되었습니다." : "AI 연결 오류가 발생했습니다.";
    return jsonResponse({ result: message }, 500, headers);
  }
}
