export const FREE_LIMITS = {
  cloudSeconds: 10 * 60,
  aiRequests: 3,
  finalTranscribes: 1,
};

export const PREMIUM_LIMITS = {
  cloudSeconds: 600 * 60,
  aiRequests: 300,
  finalTranscribes: 60,
};

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const getBearerToken = (request) => {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
};

export const hasUsageConfig = (env) =>
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY;

export async function getSupabaseUser({ env, token }) {
  if (!token || !hasUsageConfig(env)) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function supabaseRest({ env, path, method = "GET", body, prefer = "return=representation" }) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getServerAccount({ request, env }) {
  if (!hasUsageConfig(env)) return null;
  const token = getBearerToken(request);
  const user = await getSupabaseUser({ env, token });
  if (!user?.id) return null;
  const profileRows = await supabaseRest({
    env,
    path: `profiles?id=eq.${encodeURIComponent(user.id)}&select=plan`,
  });
  return { user, plan: profileRows?.[0]?.plan || "free" };
}

export async function getUsageRow({ env, userId }) {
  const date = todayKey();
  const rows = await supabaseRest({
    env,
    path: `usage_daily?user_id=eq.${encodeURIComponent(userId)}&date=eq.${date}&select=*`,
  });
  const row = rows?.[0] || {};
  return {
    date,
    cloudSeconds: Number(row.cloud_seconds) || 0,
    aiRequests: Number(row.ai_requests) || 0,
    finalTranscribes: Number(row.final_transcribes) || 0,
  };
}

export async function assertQuota({ env, account, metric, amount = 1 }) {
  if (!account?.user?.id) return { ok: true };
  const usage = await getUsageRow({ env, userId: account.user.id });
  const limits = account.plan === "free" ? FREE_LIMITS : PREMIUM_LIMITS;
  if ((Number(usage[metric]) || 0) + amount > (Number(limits[metric]) || 0)) {
    return { ok: false, usage, limits, plan: account.plan };
  }
  return { ok: true, usage, limits, plan: account.plan };
}

export async function incrementServerUsage({ env, account, metric, amount = 1 }) {
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
      updated_at: new Date().toISOString(),
    }],
  });
}
