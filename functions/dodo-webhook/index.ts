/**
 * Klar — dodo-webhook Edge Function
 *
 * Receives Dodo Payments webhook events, verifies the Standard Webhooks
 * signature, and keeps the `subscriptions` table in sync. Replaces the old
 * Lemon Squeezy webhook handler (functions/paddle-webhook — despite the
 * name, that one always handled Lemon Squeezy, never actually Paddle) now
 * that Lemon Squeezy has rejected the account entirely and Dodo Payments
 * has been approved as the new processor.
 *
 * verify_jwt is deliberately false: Dodo has no Supabase user JWT to
 * present when calling this webhook. Authenticity is instead established
 * by the Standard Webhooks HMAC-SHA256 signature check below
 * (verifyDodoSignature), the same pattern the old LS webhook used
 * correctly (see functions/paddle-webhook for the prior art, and the
 * bug it had for a while when this was set to verify_jwt:true by mistake
 * — don't repeat that here).
 *
 * Required env vars (set in Supabase Dashboard -> Edge Functions -> Secrets):
 *   DODO_WEBHOOK_SECRET       — from Dodo Dashboard -> Settings -> Webhooks
 *                                -> your endpoint -> Signing Secret
 *                                (starts with "whsec_")
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime
 *   SUPABASE_URL              — auto-injected by Supabase runtime
 *
 * Dodo Payments webhook docs: https://docs.dodopayments.com (Standard
 * Webhooks spec: https://www.standardwebhooks.com)
 *
 * ── SETUP NOTE FOR WHOEVER WIRES THIS UP ──────────────────────────────────
 * DODO_PRODUCT_TO_PLAN below is now filled in (8 real GBP/ZAR Essential/Pro
 * products created 2026-09-24 — Family is comingSoon:true, not sold yet).
 * Still outstanding before this actually activates a tier for anyone:
 *   1. Register this function's URL as a webhook endpoint in Dodo's
 *      dashboard, generate the signing secret, set DODO_WEBHOOK_SECRET.
 *   2. Add DODO_API_KEY (used by dodo-create-checkout and delete-account).
 *   3. Fire a real test event from Dodo's dashboard and check this
 *      function's logs — the exact field names inside `data` (e.g.
 *      subscription id, customer id) are read defensively below with a
 *      few likely name variants, since they weren't confirmed against a
 *      live payload at the time this was written. Adjust FIELD NAME
 *      fallbacks below if a real event doesn't match.
 * ───────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dodo product id → Klar plan id. Filled in 2026-09-24 — see
// setup note above. Until filled in, every event is logged and skipped
// (never silently mis-entitles someone to the wrong plan).
const DODO_PRODUCT_TO_PLAN: Record<string, string> = {
  "pdt_0NoJDtd4UIDCgzYaptMvc": "essential", // Essential — Monthly (GBP)
  "pdt_0NoJEEMSLOCo6C8sqztxY": "essential", // Essential — Annual (GBP)
  "pdt_0NoJEVP7EHKn8c4mCircV": "pro",       // Pro — Monthly (GBP)
  "pdt_0NoJFEKVrHFJqOAdEPyFJ": "pro",       // Pro — Annual (GBP)
  "pdt_0NoJFRhpBtlzppOv1pfRz": "essential", // Essential — Monthly (ZAR)
  "pdt_0NoJFirrvgRlUTdI9dEFf": "essential", // Essential — Annual (ZAR)
  "pdt_0NoKAMoDsgJb9uY3nWYy8": "pro",       // Pro — Monthly (ZAR)
  "pdt_0NoKAdYYZ3pUHv3TZRwjI": "pro",       // Pro — Annual (ZAR)
};

// Dodo subscription status → Klar's internal status vocabulary.
const DODO_STATUS_MAP: Record<string, string> = {
  active: "active",
  on_hold: "past_due",
  failed: "past_due",
  cancelled: "cancelled",
  expired: "cancelled",
  paused: "past_due",
};

// ── Standard Webhooks signature verification ────────────────────────────────
// Spec: https://www.standardwebhooks.com — three headers (webhook-id,
// webhook-timestamp, webhook-signature), signed content is
// "{id}.{timestamp}.{raw body}", HMAC-SHA256 keyed by the base64 portion of
// the "whsec_" secret, signature header holds one or more "v1,<base64sig>"
// entries space-separated (support key rotation — any match is valid).
async function verifyDodoSignature(
  rawBody: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  secret: string,
): Promise<boolean> {
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  // Standard Webhooks replay protection: reject timestamps too far from now
  // (either direction) so a captured request+signature can't be replayed
  // indefinitely. 5-minute tolerance matches the spec's recommended window.
  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const toleranceSeconds = 5 * 60;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) return false;

  const secretBytes = base64Decode(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signedContent));
  const expected = base64Encode(new Uint8Array(sigBuffer));

  // webhook-signature can carry multiple "v1,<sig>" entries space-separated
  // (used during secret rotation) — any match is a valid signature.
  const candidates = webhookSignature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  return candidates.some((c) => timingSafeEqual(c, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) {
    console.error("DODO_WEBHOOK_SECRET is not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const rawBody = await req.text();

  const isValid = await verifyDodoSignature(
    rawBody,
    req.headers.get("webhook-id"),
    req.headers.get("webhook-timestamp"),
    req.headers.get("webhook-signature"),
    secret,
  );
  if (!isValid) {
    console.warn("Dodo webhook signature verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  // Dodo's documented envelope: { business_id, timestamp, type, data }
  const eventType = event?.type as string | undefined;
  const data = event?.data as Record<string, unknown> | undefined;

  if (!eventType || !data) {
    return new Response("Bad Request: missing type or data", { status: 400 });
  }

  console.log(`Processing Dodo event: ${eventType}`);

  // FIELD NAME fallbacks — see setup note at top of file. Adjust these if a
  // real event from your Dodo dashboard uses different key names.
  const subId = String(data.subscription_id ?? data.id ?? "");
  const customerId = String(
    (data.customer_id as string) ??
      ((data.customer as Record<string, unknown>)?.customer_id as string) ??
      "",
  );
  const productId = String(
    data.product_id ??
      (Array.isArray(data.product_cart) ? (data.product_cart[0] as Record<string, unknown>)?.product_id : undefined) ??
      "",
  );
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const supabaseUserId = metadata.supabase_user_id as string | undefined;
  const periodEnd =
    (data.next_billing_date as string) ??
    (data.current_period_end as string) ??
    null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (eventType) {
      // ── subscription created / activated ────────────────────────────────
      case "subscription.active": {
        if (!subId || !supabaseUserId) {
          console.error("subscription.active missing subId or supabase_user_id metadata", { subId, hasMetadata: !!supabaseUserId });
          return ok({ skipped: "missing ids — see setup note in source" });
        }
        const plan = DODO_PRODUCT_TO_PLAN[productId];
        if (!plan) {
          console.error(`subscription.active: unmapped product_id "${productId}" — add it to DODO_PRODUCT_TO_PLAN`);
          return ok({ skipped: "unmapped product_id" });
        }
        const { error } = await sb.from("subscriptions").upsert(
          {
            user_id: supabaseUserId,
            processor: "dodo",
            processor_subscription_id: subId,
            processor_customer_id: customerId || null,
            plan_id: plan,
            status: "active",
            current_period_end: periodEnd,
          },
          { onConflict: "processor_subscription_id" },
        );
        if (error) throw error;
        console.log(`subscription.active → user=${supabaseUserId} plan=${plan}`);
        break;
      }

      // ── subscription renewed (recurring charge succeeded) ───────────────
      case "subscription.renewed": {
        if (!subId) break;
        const { error } = await sb
          .from("subscriptions")
          .update({ status: "active", current_period_end: periodEnd, updated_at: new Date().toISOString() })
          .eq("processor_subscription_id", subId);
        if (error) throw error;
        console.log(`subscription.renewed → sub=${subId}`);
        break;
      }

      // ── any subscription field changed (plan switch, etc.) ──────────────
      case "subscription.updated": {
        if (!subId) break;
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const plan = DODO_PRODUCT_TO_PLAN[productId];
        if (plan) payload.plan_id = plan;
        if (periodEnd) payload.current_period_end = periodEnd;
        const { error } = await sb.from("subscriptions").update(payload).eq("processor_subscription_id", subId);
        if (error) throw error;
        console.log(`subscription.updated → sub=${subId}`);
        break;
      }

      // ── failed renewal placed on hold / initial mandate failed ──────────
      case "subscription.on_hold":
      case "subscription.failed": {
        if (!subId) break;
        const { error } = await sb
          .from("subscriptions")
          .update({ status: DODO_STATUS_MAP[eventType.split(".")[1]] ?? "past_due", updated_at: new Date().toISOString() })
          .eq("processor_subscription_id", subId);
        if (error) throw error;
        console.log(`${eventType} → sub=${subId} → past_due`);
        break;
      }

      // ── cancelled ─────────────────────────────────────────────────────
      case "subscription.cancelled": {
        if (!subId) break;
        const { error } = await sb
          .from("subscriptions")
          .update({ status: "cancelled", current_period_end: periodEnd, updated_at: new Date().toISOString() })
          .eq("processor_subscription_id", subId);
        if (error) throw error;
        console.log(`subscription.cancelled → sub=${subId}`);
        break;
      }

      // ── one-time/recurring payment events — informational only for now,
      //    subscription.* events are what actually drive entitlement ──────
      case "payment.succeeded":
      case "payment.failed":
        console.log(`${eventType} (informational, no entitlement change)`);
        break;

      default:
        console.log(`Unhandled Dodo event: ${eventType} — ignoring`);
    }

    return ok({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error handling Dodo event ${eventType}:`, msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
