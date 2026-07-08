/**
 * Klar — ls-webhook Edge Function  (deployed as "paddle-webhook" slug)
 *
 * Receives Lemon Squeezy webhook events, verifies the HMAC-SHA256 signature,
 * and keeps the `subscriptions` table in sync.
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   LEMONSQUEEZY_WEBHOOK_SECRET  — from LS Dashboard → Settings → Webhooks → secret
 *   SUPABASE_SERVICE_ROLE_KEY    — auto-injected by Supabase runtime
 *   SUPABASE_URL                 — auto-injected by Supabase runtime
 *
 * Lemon Squeezy webhook docs: https://docs.lemonsqueezy.com/help/webhooks
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Variant ID → plan mapping ─────────────────────────────────────────────────
// Set these once you create products in Lemon Squeezy Dashboard.
// LS Dashboard → Your Store → Products → [plan] → Variants → copy numeric ID.
const VARIANT_TO_PLAN: Record<string, string> = {
  // GBP variants (UK)
  // "123456": "essential",   // Essential Monthly GBP   — fill in real IDs
  // "123457": "essential",   // Essential Annual  GBP
  // "123458": "pro",          // Pro Monthly       GBP
  // "123459": "pro",          // Pro Annual        GBP
  // ZAR variants (SA)
  // "123460": "essential",   // Essential Monthly ZAR
  // "123461": "essential",   // Essential Annual  ZAR
  // "123462": "pro",          // Pro Monthly       ZAR
  // "123463": "pro",          // Pro Annual        ZAR
};

// ── LS status → our status mapping ───────────────────────────────────────────
const LS_STATUS_MAP: Record<string, string> = {
  active:   "active",
  paused:   "paused",
  past_due: "past_due",
  unpaid:   "past_due",
  cancelled: "cancelled",
  expired:  "cancelled",
};

// ── HMAC-SHA256 signature verification ───────────────────────────────────────
// LS sends X-Signature: <hex-encoded HMAC-SHA256 of raw body>
async function verifyLsSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  return timingSafeEqual(expected, signatureHeader.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function planFromVariant(variantId: string | number | undefined): string {
  if (variantId == null) return "essential";
  const plan = VARIANT_TO_PLAN[String(variantId)];
  return plan ?? "essential";
}

function normStatus(lsStatus: string | undefined): string {
  return LS_STATUS_MAP[lsStatus ?? ""] ?? "active";
}

// Lemon Squeezy puts renewal date in attributes.renews_at (active)
// or attributes.ends_at (cancelled/expired).
function periodEnd(attrs: Record<string, unknown>): string | null {
  const endsAt = attrs?.ends_at as string | null;
  const renewsAt = attrs?.renews_at as string | null;
  return endsAt ?? renewsAt ?? null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) {
    console.error("LEMONSQUEEZY_WEBHOOK_SECRET is not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const rawBody = await req.text();

  const signatureHeader = req.headers.get("X-Signature");
  const isValid = await verifyLsSignature(rawBody, signatureHeader, secret);
  if (!isValid) {
    console.warn("Lemon Squeezy webhook signature verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  // LS event structure: { meta: { event_name, custom_data }, data: { id, attributes } }
  const meta = event?.meta as Record<string, unknown> | undefined;
  const eventName = meta?.event_name as string | undefined;
  const customData = meta?.custom_data as Record<string, unknown> | undefined;
  const dataObj = event?.data as Record<string, unknown> | undefined;
  const attrs = dataObj?.attributes as Record<string, unknown> | undefined;

  if (!eventName || !attrs) {
    return new Response("Bad Request: missing event_name or data.attributes", { status: 400 });
  }

  const lsSubId   = String(dataObj?.id ?? "");                          // numeric string e.g. "789012"
  const lsCustId  = String(attrs?.customer_id ?? "");
  const variantId = attrs?.variant_id as string | number | undefined;
  const supabaseUserId = customData?.supabase_user_id as string | undefined;

  console.log(`Processing LS event: ${eventName}`, { lsSubId, supabaseUserId });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (eventName) {

      // ── subscription_created ───────────────────────────────────────────────
      case "subscription_created": {
        if (!lsSubId || !supabaseUserId) {
          console.error("subscription_created missing lsSubId or supabaseUserId");
          return ok({ skipped: "missing ids" });
        }
        const plan    = planFromVariant(variantId);
        const status  = normStatus(attrs?.status as string);
        const expires = periodEnd(attrs);

        const { error } = await sb.from("subscriptions").upsert({
          user_id:          supabaseUserId,
          ls_subscription_id: lsSubId,
          ls_customer_id:   lsCustId || null,
          plan_id:          plan,
          status,
          current_period_end: expires,
        }, { onConflict: "ls_subscription_id" });

        if (error) throw error;
        console.log(`subscription_created → user=${supabaseUserId} plan=${plan}`);
        break;
      }

      // ── subscription_updated ───────────────────────────────────────────────
      case "subscription_updated": {
        if (!lsSubId) break;
        const plan    = planFromVariant(variantId);
        const status  = normStatus(attrs?.status as string);
        const expires = periodEnd(attrs);

        const payload: Record<string, unknown> = {
          plan_id:            plan,
          status,
          current_period_end: expires,
          updated_at:         new Date().toISOString(),
        };
        if (supabaseUserId) payload.user_id = supabaseUserId;
        if (lsCustId)       payload.ls_customer_id = lsCustId;

        const { error } = await sb.from("subscriptions")
          .update(payload)
          .eq("ls_subscription_id", lsSubId);

        if (error) throw error;
        console.log(`subscription_updated → sub=${lsSubId} plan=${plan} status=${status}`);
        break;
      }

      // ── subscription_cancelled / subscription_expired ─────────────────────
      case "subscription_cancelled":
      case "subscription_expired": {
        if (!lsSubId) break;
        const expires = periodEnd(attrs);

        const { error } = await sb.from("subscriptions")
          .update({
            status:             "cancelled",
            current_period_end: expires,
            updated_at:         new Date().toISOString(),
          })
          .eq("ls_subscription_id", lsSubId);

        if (error) throw error;
        console.log(`${eventName} → sub=${lsSubId}`);
        break;
      }

      // ── subscription_payment_success ──────────────────────────────────────
      case "subscription_payment_success": {
        if (!lsSubId) break;
        const expires = periodEnd(attrs);

        const { error } = await sb.from("subscriptions")
          .update({
            status:             "active",
            current_period_end: expires,
            updated_at:         new Date().toISOString(),
          })
          .eq("ls_subscription_id", lsSubId);

        if (error) throw error;
        console.log(`subscription_payment_success → sub=${lsSubId}`);
        break;
      }

      // ── subscription_payment_failed ───────────────────────────────────────
      case "subscription_payment_failed": {
        if (!lsSubId) break;
        const { error } = await sb.from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("ls_subscription_id", lsSubId);

        if (error) throw error;
        console.log(`subscription_payment_failed → sub=${lsSubId} → past_due`);
        break;
      }

      default:
        console.log(`Unhandled LS event: ${eventName} — ignoring`);
    }

    return ok({ received: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error handling LS event ${eventName}:`, msg);
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
