import { assertQuota, getServerAccount, incrementServerUsage } from "./_usage.js";

const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
const POLL_INTERVAL_MS = 1000;
const POLL_DEADLINE_MS = 22000;

const PROVIDERS = {
  groq: {
    type: "openai-compatible",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    defaultModel: "whisper-large-v3",
    models: new Set(["whisper-large-v3", "whisper-large-v3-turbo"]),
  },
  openai: {
    type: "openai-compatible",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    defaultModel: "gpt-4o-mini-transcribe",
    models: new Set(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]),
  },
  gladia: {
    type: "gladia",
    defaultModel: "standard",
    models: new Set(["standard"]),
  },
  speechmatics: {
    type: "speechmatics",
    defaultModel: "enhanced",
    models: new Set(["enhanced", "standard"]),
  },
  ibm: {
    type: "ibm",
    defaultModel: "ko-KR_BroadbandModel",
    models: new Set(["ko-KR_BroadbandModel", "en-US_BroadbandModel"]),
  },
  azure: {
    type: "azure",
    defaultModel: "conversation",
    models: new Set(["conversation"]),
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
};

const jsonResponse = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers });

const cleanString = (value) => String(value || "").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeLanguage = (language, provider) => {
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
};

const getProviderConfig = (providerName) => {
  if (providerName === "default") return { provider: "groq", config: PROVIDERS.groq };
  const config = PROVIDERS[providerName];
  return config ? { provider: providerName, config } : null;
};

const resolveApiKey = (provider, formData, env, usesServerCredit) => {
  const userKey = cleanString(formData.get("apiKey"));
  if (userKey) return userKey;
  if (usesServerCredit) {
    if (provider === "groq") return cleanString(env.GROQ_API_KEY);
    if (provider === "openai") return cleanString(env.OPENAI_API_KEY);
    if (provider === "gladia") return cleanString(env.GLADIA_API_KEY);
    if (provider === "speechmatics") return cleanString(env.SPEECHMATICS_API_KEY);
    if (provider === "ibm") return cleanString(env.IBM_STT_API_KEY);
    if (provider === "azure") return cleanString(env.AZURE_SPEECH_KEY);
  }
  return "";
};

const speakerLabel = (speaker) => {
  const raw = cleanString(speaker);
  if (!raw) return "발화자";
  const match = raw.match(/\d+/);
  if (!match) return `발화자 ${raw}`;
  const index = Number(match[0]);
  const letterIndex = index > 0 ? index - 1 : index;
  const letter = String.fromCharCode(65 + Math.max(0, Math.min(25, letterIndex)));
  return `발화자 ${letter}`;
};

const parseGladiaText = (data, diarization = false) => {
  const transcription = data?.result?.transcription || data?.transcription || data?.result;
  if (typeof transcription === "string") return transcription;
  if (typeof transcription?.full_transcript === "string") return transcription.full_transcript;
  if (Array.isArray(transcription?.utterances)) {
    if (diarization) {
      return transcription.utterances
        .map((item) => `${speakerLabel(item.speaker || item.speaker_id)}: ${item.text || item.transcript || ""}`.trim())
        .join("\n");
    }
    return transcription.utterances.map((item) => item.text || item.transcript || "").join(" ");
  }
  return data?.text || "";
};

async function transcribeOpenAiCompatible({ audioFile, apiKey, model, language, config }) {
  const outbound = new FormData();
  outbound.append("file", audioFile, "audio.webm");
  outbound.append("model", model);
  if (language) outbound.append("language", language);

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(25000),
    body: outbound,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError(data.error?.message || "음성 인식 요청에 실패했습니다.", response.status);
  return data.text || "";
}

async function transcribeGladia({ audioFile, apiKey, language, diarization }) {
  const uploadForm = new FormData();
  uploadForm.append("audio", audioFile, "audio.webm");

  const uploadResponse = await fetch("https://api.gladia.io/v2/upload", {
    method: "POST",
    headers: { "x-gladia-key": apiKey },
    signal: AbortSignal.timeout(15000),
    body: uploadForm,
  });
  const uploadData = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) throw new ResponseError(uploadData.error || uploadData.message || "Gladia 업로드에 실패했습니다.", uploadResponse.status);

  const audioUrl = uploadData.audio_url || uploadData.url;
  if (!audioUrl) throw new ResponseError("Gladia 업로드 결과에서 audio_url을 찾지 못했습니다.", 502);

  const startResponse = await fetch("https://api.gladia.io/v2/transcription", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-gladia-key": apiKey },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      audio_url: audioUrl,
      detect_language: !language,
      language: language || undefined,
      diarization: Boolean(diarization),
    }),
  });
  const startData = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok) throw new ResponseError(startData.error || startData.message || "Gladia 변환 요청에 실패했습니다.", startResponse.status);

  const resultUrl = startData.result_url || (startData.id ? `https://api.gladia.io/v2/transcription/${startData.id}` : "");
  if (!resultUrl) return parseGladiaText(startData, diarization);

  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollResponse = await fetch(resultUrl, {
      headers: { "x-gladia-key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    const pollData = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) throw new ResponseError(pollData.error || pollData.message || "Gladia 결과 조회에 실패했습니다.", pollResponse.status);
    if (["done", "completed", "success"].includes(String(pollData.status || "").toLowerCase())) {
      return parseGladiaText(pollData, diarization);
    }
    if (["error", "failed"].includes(String(pollData.status || "").toLowerCase())) {
      throw new ResponseError("Gladia 음성 인식 작업이 실패했습니다.", 502);
    }
  }
  throw new ResponseError("Gladia 결과 대기 시간이 초과되었습니다.", 504);
}

async function transcribeSpeechmatics({ audioFile, apiKey, model, language, diarization }) {
  const jobForm = new FormData();
  jobForm.append("config", JSON.stringify({
    type: "transcription",
    transcription_config: {
      language: language || "ko",
      operating_point: model,
      diarization: diarization ? "speaker" : undefined,
    },
  }));
  jobForm.append("data_file", audioFile, "audio.webm");

  const jobResponse = await fetch("https://asr.api.speechmatics.com/v2/jobs", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
    body: jobForm,
  });
  const jobData = await jobResponse.json().catch(() => ({}));
  if (!jobResponse.ok) throw new ResponseError(jobData.error || jobData.detail || "Speechmatics 작업 생성에 실패했습니다.", jobResponse.status);

  const jobId = jobData.id || jobData.job?.id;
  if (!jobId) throw new ResponseError("Speechmatics 작업 ID를 찾지 못했습니다.", 502);

  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const statusResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new ResponseError(statusData.error || statusData.detail || "Speechmatics 상태 조회에 실패했습니다.", statusResponse.status);
    const status = String(statusData.job?.status || statusData.status || "").toLowerCase();
    if (status === "done") {
      const transcriptResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}/transcript?format=txt`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const text = await transcriptResponse.text();
      if (!transcriptResponse.ok) throw new ResponseError(text || "Speechmatics 결과 조회에 실패했습니다.", transcriptResponse.status);
      return text;
    }
    if (["rejected", "failed", "error"].includes(status)) {
      throw new ResponseError("Speechmatics 음성 인식 작업이 실패했습니다.", 502);
    }
  }
  throw new ResponseError("Speechmatics 결과 대기 시간이 초과되었습니다.", 504);
}

async function transcribeIbm({ audioFile, apiKey, model, providerExtra }) {
  const serviceUrl = cleanString(providerExtra).replace(/\/+$/, "");
  if (!serviceUrl) throw new ResponseError("IBM Watson 서비스 URL이 필요합니다.", 400);

  const response = await fetch(`${serviceUrl}/v1/recognize?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`apikey:${apiKey}`)}`,
      "Content-Type": audioFile.type || "audio/webm",
    },
    signal: AbortSignal.timeout(25000),
    body: audioFile,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError(data.error || "IBM Watson 음성 인식 요청에 실패했습니다.", response.status);
  return (data.results || [])
    .map((item) => item.alternatives?.[0]?.transcript || "")
    .join(" ");
}

async function transcribeAzure({ audioFile, apiKey, language, providerExtra }) {
  const region = cleanString(providerExtra);
  if (!region) throw new ResponseError("Azure Speech 리전이 필요합니다.", 400);
  const azureLanguage = language || "ko-KR";
  const contentType = audioFile.type && audioFile.type.includes("ogg")
    ? "audio/ogg; codecs=opus"
    : audioFile.type || "audio/webm";

  const response = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(azureLanguage)}&format=simple`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": contentType,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(25000),
    body: audioFile,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ResponseError(data.error?.message || "Azure Speech 음성 인식 요청에 실패했습니다.", response.status);
  return data.DisplayText || data.NBest?.[0]?.Display || "";
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
    if (contentLength > MAX_AUDIO_SIZE) {
      return jsonResponse({ error: "오디오 파일이 너무 큽니다." }, 413, headers);
    }

    const formData = await request.formData();
    const audioFile = formData.get("file");

    if (!audioFile || typeof audioFile === "string") {
      return jsonResponse({ error: "오디오 파일이 누락되었습니다." }, 400, headers);
    }
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return jsonResponse({ error: "오디오 파일이 너무 큽니다." }, 413, headers);
    }
    if (audioFile.type && !audioFile.type.startsWith("audio/")) {
      return jsonResponse({ error: "오디오 파일만 업로드할 수 있습니다." }, 415, headers);
    }

    const requestedProvider = cleanString(formData.get("provider")) || "default";
    const providerInfo = getProviderConfig(requestedProvider);
    if (!providerInfo) {
      return jsonResponse({ error: "지원하지 않는 음성 인식 제공업체입니다." }, 400, headers);
    }

    const { provider, config } = providerInfo;
    const usesServerCredit = requestedProvider === "default";
    const estimatedSeconds = Math.max(1, Math.ceil(Number(formData.get("durationSeconds")) || 4));
    const usageMetric = cleanString(formData.get("usageMetric")) === "finalTranscribes"
      ? "finalTranscribes"
      : "cloudSeconds";
    const usageAmount = usageMetric === "finalTranscribes" ? 1 : estimatedSeconds;
    const account = usesServerCredit ? await getServerAccount({ request, env }) : null;
    if (usesServerCredit && !account?.user?.id) {
      return jsonResponse({
        error: "클라우드 고정밀 자막은 로그인 후 사용할 수 있습니다. 무료 접근성 자막은 로컬 모드에서 계속 사용할 수 있습니다.",
        code: "login_required",
      }, 401, headers);
    }
    const quota = usesServerCredit
      ? await assertQuota({ env, account, metric: usageMetric, amount: usageAmount })
      : { ok: true };
    if (!quota.ok) {
      return jsonResponse({
        error: "무료 클라우드 자막 시간이 모두 사용되었습니다. Premium으로 고정밀 자막 시간을 늘릴 수 있습니다.",
        code: "quota_exceeded",
        usage: quota.usage,
        limits: quota.limits,
      }, 402, headers);
    }
    const apiKey = resolveApiKey(provider, formData, env, usesServerCredit);
    if (!apiKey) {
      return jsonResponse({ error: "음성 인식 API 키가 설정되지 않았습니다." }, 503, headers);
    }

    const requestedModel = cleanString(formData.get("model"));
    const model = config.models.has(requestedModel) ? requestedModel : config.defaultModel;
    const rawLanguage = cleanString(formData.get("language"));
    const language = normalizeLanguage(rawLanguage, provider);
    const providerExtra = cleanString(formData.get("providerExtra"));
    const diarization = cleanString(formData.get("diarization")) === "true";

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

    return jsonResponse({ text, provider, model }, 200, headers);
  } catch (err) {
    if (err instanceof ResponseError) {
      return jsonResponse({ error: err.message }, err.status, headers);
    }
    const message = err.name === "TimeoutError"
      ? "음성 인식 요청 시간이 초과되었습니다."
      : "음성 인식 서버 오류가 발생했습니다.";
    return jsonResponse({ error: message }, 500, headers);
  }
}
