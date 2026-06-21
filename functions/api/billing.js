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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Billing-Secret, stripe-signature",
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

async function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Check timestamp tolerance (e.g., 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = new Uint8Array(
      signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(signedPayload)
    );
  } catch (e) {
    return false;
  }
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

  // Get raw body for signature verification
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature") || "";

  // 1. Verify Stripe Webhook Signature
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, env.PAYMENT_WEBHOOK_SECRET);
  if (!isValid) {
    return jsonResponse({ error: "Invalid stripe signature." }, 401, headers);
  }

  // 2. Parse the verified payload
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400, headers);
  }

  // 3. Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data?.object || {};
    const clientReferenceId = session.client_reference_id || "";
    
    // clientReferenceId format: USER_ID:PLAN
    const [userId, requestedPlan] = clientReferenceId.split(":");
    if (!userId) {
      return jsonResponse({ error: "Missing client_reference_id (userId)." }, 400, headers);
    }

    const email = session.customer_details?.email || "";
    const plan = normalizePlan(requestedPlan);

    try {
      await upsertProfile({ env, userId, email, plan });
      return jsonResponse({ ok: true, plan, userId }, 200, headers);
    } catch (dbError) {
      return jsonResponse({ error: `DB Update failed: ${dbError.message}` }, 500, headers);
    }
  }

  return jsonResponse({ ok: true, message: `Ignored event type: ${event.type}` }, 200, headers);
}
