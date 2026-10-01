/**
 * Klar — banklink-webhook Edge Function
 *
 * Receives signed webhook deliveries from Banklink (https://banklink.co.za), the
 * South African open-banking aggregator being evaluated as the SA replacement
 * for the UK-only, currently non-functional Salt Edge integration (see
 * saltedge-connect/saltedge-sync — kept in place but unreachable from the UI
 * since the SA-only v1 launch). Handles two events:
 *   - link_request.completed — a user finished (or cancelled) the hosted
 *     "Connect Bank" flow started by banklink-connect. Resolves their
 *     banklink_connections row from 'pending' to 'linked' (or 'cancelled'),
 *     looking up the account's id via GET /accounts since the webhook payload
 *     only carries account_number, not the id banklink-sync needs.
 *   - pulse.delivered — a scheduled Pulse (manually configured in Banklink's
 *     own dashboard, not yet created programmatically per-user) ran and
 *     delivered transactions. Stored in the banklink_deliveries staging table,
 *     unattributed to a user — Pulses aren't part of the self-serve flow yet.
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
 * Requires TWO separate secrets (Supabase Dashboard -> Edge Functions -> Secrets),
 * both already set: BANKLINK_API_KEY (also used directly by banklink-connect and
 * banklink-sync) and BANKLINK_WEBHOOK_SECRET (Banklink dashboard -> Settings ->
 * Webhook signing — THIS is what verifies incoming deliveries; until it's set,
 * every delivery is rejected with 500 rather than silently trusted unverified).
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

  if (!deliveryId) {
    return new Response("Bad Request: missing Banklink-Delivery header", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // link_request.completed is how a self-serve "Connect Bank" attempt
  // (banklink-connect) resolves — reference is the Supabase user_id we set when
  // creating the link request, and link_request_id lets us find the exact
  // pending row (a user could in principle have more than one pending request).
  // account_number is in this payload, but the account's id (needed for
  // /accounts/{id}/sync and /accounts/{id}/transactions in banklink-sync) is
  // NOT — Banklink's webhook schema only exposes account_number here, so it
  // must be resolved separately via GET /accounts and matched.
  if (event === "link_request.completed") {
    const linkRequestId = payload.link_request_id as string | undefined;
    const accountNumber = payload.account_number as string | null | undefined;
    const reference = payload.reference as string | undefined;

    if (!linkRequestId || !reference) {
      console.error("banklink-webhook: link_request.completed missing link_request_id or reference", { linkRequestId, reference });
      return new Response("OK", { status: 200 }); // ack anyway — nothing we can do with this delivery, don't make Banklink retry forever
    }

    let accountId: string | null = null;
    const banklinkApiKey = Deno.env.get("BANKLINK_API_KEY");
    if (accountNumber && banklinkApiKey) {
      try {
        const accRes = await fetch("https://api.banklink.co.za/v1/accounts", {
          headers: { Authorization: `Bearer ${banklinkApiKey}` },
        });
        const accData = await accRes.json();
        const match = (accData.data || []).find((a: { account_number?: string }) => a.account_number === accountNumber);
        accountId = match?.id ?? null;
      } catch (e) {
        console.error("banklink-webhook: failed to resolve account_id from account_number", e);
      }
    }

    const { error } = await sb
      .from("banklink_connections")
      .update({
        status: accountNumber ? "linked" : "cancelled",
        account_number: accountNumber ?? null,
        account_id: accountId,
        updated_at: new Date().toISOString(),
      })
      .eq("link_request_id", linkRequestId)
      .eq("user_id", reference);

    if (error) {
      console.error("banklink-webhook: failed to update connection", error);
      return new Response("Internal Server Error", { status: 500 });
    }

    console.log(`banklink-webhook: link_request ${linkRequestId} completed for user ${reference}, account_id=${accountId ?? "unresolved"}`);
    return new Response("OK", { status: 200 });
  }

  if (event !== "pulse.delivered") {
    // access_request.completed shares the same signed envelope but isn't used
    // by this flow (access requests are one-time, non-persistent — Klar only
    // uses persistent link requests) — acknowledge so Banklink doesn't retry.
    console.log(`banklink-webhook: received "${event}", not handled — acknowledging only`);
    return new Response("OK", { status: 200 });
  }

  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

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
