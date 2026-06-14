import { hasUsageConfig, supabaseRest } from "./_usage.js";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Billing-Secret",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
};

const jsonResponse = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers });

const normalizePlan = (plan) => (["premium", "team"].includes(plan) ? plan : "premium");

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
      updated_at: new Date().toISOString(),
    }],
  });
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: jsonHeaders(context.request, context.env) });
}

export async function onRequestPost(context) {
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
