/**
 * Klar — banklink-webhook Edge Function
 *
 * Receives webhook deliveries from Banklink (https://banklink.co.za), the South
 * African open-banking aggregator being evaluated as the SA replacement for the
 * UK-only, currently non-functional Salt Edge integration (see saltedge-connect/
 * saltedge-sync — kept in place but unreachable from the UI since the SA-only v1
 * launch). Specifically handles the "pulse.delivered" event, sent each time a
 * scheduled Pulse (Banklink's name for a recurring bank-data sync job) runs and
 * delivers transactions.
 *
 * verify_jwt is deliberately false: Banklink's servers call this directly with no
 * Supabase user session to present. Authenticity is instead established by
 * verifying the Banklink-Signature header below — same shape of problem, same
 * general approach (HMAC signature, timing-safe comparison, replay-window check)
 * already solved once in this codebase for Dodo's webhook (see dodo-webhook/
 * index.ts's verifyDodoSignature) — but NOT the same scheme, so not shared code:
 * Dodo (Standard Webhooks) signs "{id}.{timestamp}.{body}" and sends a base64
 * signature; Banklink signs "{timestamp}.{raw body}" and sends a HEX signature in
 * a differently-shaped header (t=<unix>,v1=<hex>, sometimes carrying two v1 values
 * for 24h after a secret rotation — both must be accepted, either match is valid).
 *
 * ── SETUP NOTE ────────────────────────────────────────────────────────────────
 * Requires TWO separate secrets (Supabase Dashboard -> Edge Functions -> Secrets):
 *   BANKLINK_API_KEY          — already set; this function doesn't call the
 *                                Banklink API directly, but shares the secret
 *                                namespace with whatever eventually calls
 *                                GET/POST /accounts etc.
 *   BANKLINK_WEBHOOK_SECRET   — Banklink dashboard -> Settings -> Webhook signing.
 *                                THIS is what verifies incoming deliveries. Not
 *                                set yet as of this function's first deploy --
 *                                until it is, every delivery is rejected (401)
 *                                rather than silently trusted with no signature
 *                                check at all.
 *
 * ── KNOWN GAP, NOT SILENTLY ASSUMED AWAY ────────────────────────────────────
 * Banklink's webhook payload identifies a delivery by pulse_id / account_number /
 * reference -- it does NOT carry a Klar user_id, because there is currently no
 * self-serve "Connect Bank" flow that would create that mapping (Pulses are being
 * created manually in Banklink's own dashboard right now, one at a time, for
 * manual testing -- not through Banklink's POST /link-requests hosted-link flow,
 * which is what a real multi-user "Connect Bank" button would need). So every
 * verified delivery is stored in the banklink_deliveries staging table with
 * user_id left null, NOT merged into any user's S.transactions. Wiring that up
 * (building the actual Connect Bank flow via /link-requests, verifying the org
 * with Banklink, mapping a Pulse's reference back to a specific Supabase user)
 * is a separate, larger follow-up -- this function's job is just to correctly and
 * safely receive and verify what Banklink sends today.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BANKLINK_WEBHOOK_SECRET = Deno.env.get("BANKLINK_WEBHOOK_SECRET");

// Reject deliveries whose timestamp is further from "now" than this, in either
// direction -- per Banklink's docs ("reject timestamps older than five minutes").
const MAX_SKEW_SECONDS = 5 * 60;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!BANKLINK_WEBHOOK_SECRET) {
    console.error("BANKLINK_WEBHOOK_SECRET is not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("Banklink-Signature");
  const eventHeader = req.headers.get("Banklink-Event");
  const deliveryId = req.headers.get("Banklink-Delivery");

  const verified = await verifyBanklinkSignature(rawBody, sigHeader, BANKLINK_WEBHOOK_SECRET);
  if (!verified) {
    console.warn("banklink-webhook: signature verification failed", { eventHeader, deliveryId });
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  const event = (payload.event as string) ?? eventHeader ?? "";
  if (event !== "pulse.delivered") {
    // link_request.completed / access_request.completed share the same signed
    // envelope but aren't relevant until the real Connect Bank flow is built —
    // acknowledge so Banklink doesn't retry, but don't store or process them.
    console.log(`banklink-webhook: received "${event}", not handled yet — acknowledging only`);
    return new Response("OK", { status: 200 });
  }

  if (!deliveryId) {
    return new Response("Bad Request: missing Banklink-Delivery header", { status: 400 });
  }

  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Upsert on banklink_delivery_id so a retried delivery (Banklink retries on
    // non-2xx/timeout) doesn't create a duplicate row if we'd already succeeded
    // once but something downstream failed before returning 200.
    const { error } = await sb.from("banklink_deliveries").upsert(
      {
        banklink_delivery_id: deliveryId,
        event,
        pulse_id: (payload.pulse_id as string) || null,
        account_number: (payload.account_number as string) || null,
        reference: (payload.reference as string) || null,
        transactions,
      },
      { onConflict: "banklink_delivery_id" },
    );
    if (error) throw error;

    console.log(`banklink-webhook: stored delivery ${deliveryId}, ${transactions.length} transaction(s), pulse_id=${payload.pulse_id ?? "none"}`);
    return new Response("OK", { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("banklink-webhook: failed to store delivery:", msg);
    // 500 so Banklink retries -- this is a storage failure, not a bad request.
    return new Response("Internal Server Error", { status: 500 });
  }
});

/**
 * Verifies a Banklink-Signature header of the form:
 *   t=<unix seconds>,v1=<hex>[,v1=<hex>]
 * where each v1 is HMAC-SHA256 of "{t}.{raw body}" keyed with the webhook signing
 * secret, hex-encoded. Two v1 values may be present for 24h after a secret
 * rotation -- accept either. Rejects timestamps more than MAX_SKEW_SECONDS from
 * now in either direction.
 */
async function verifyBanklinkSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader) return false;

  let timestamp: string | undefined;
  const candidateSigs: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) candidateSigs.push(value);
  }
  if (!timestamp || candidateSigs.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_SKEW_SECONDS) return false;

  const signedContent = `${timestamp}.${rawBody}`;
  const expectedHex = await hmacSha256Hex(secret, signedContent);

  return candidateSigs.some((sig) => timingSafeEqual(sig, expectedHex));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
