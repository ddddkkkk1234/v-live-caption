import {
  getBearerToken,
  getSupabaseUser,
  getUsageRow,
  hasUsageConfig,
  supabaseRest,
} from "./_usage.js";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
};

const jsonResponse = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers });

async function requireUser(request, env, headers) {
  if (!hasUsageConfig(env)) {
    return { response: jsonResponse({ error: "Server usage requires SUPABASE_SERVICE_ROLE_KEY." }, 501, headers) };
  }
  const token = getBearerToken(request);
  if (!token) return { response: jsonResponse({ error: "Missing bearer token." }, 401, headers) };
  const user = await getSupabaseUser({ env, token });
  if (!user?.id) return { response: jsonResponse({ error: "Invalid session." }, 401, headers) };
  return { user };
}

export async function onRequestOptions(context) {
  return new Response(null, { headers: jsonHeaders(context.request, context.env) });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request, env);
  const { user, response } = await requireUser(request, env, headers);
  if (response) return response;

  const profileRows = await supabaseRest({
    env,
    path: `profiles?id=eq.${encodeURIComponent(user.id)}&select=plan`,
  });

  return jsonResponse({
    plan: profileRows?.[0]?.plan || "free",
    usage: await getUsageRow({ env, userId: user.id }),
  }, 200, headers);
}

export async function onRequestPost(context) {
  return jsonResponse({ error: "Usage is server-managed and read-only from the client." }, 405, jsonHeaders(context.request, context.env));
}
