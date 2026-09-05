/**
 * Klar — log-consent Edge Function
 *
 * Writes one row to the append-only `consent_events` table every time a
 * user (signed-in or guest) accepts the privacy policy / region gate.
 * This exists because consent was previously only a field inside the
 * opaque `klar_syncs` JSON blob for signed-in users (overwritten by later
 * resyncs, no audit trail) and not recorded server-side at all for guests
 * — see klar-open-banking-compliance-roadmap.md #1-4. A regulator asking
 * "show me proof user X consented to version Y on date Z" now has a real,
 * timestamped, queryable answer instead of a JSON blob to parse.
 *
 * verify_jwt is deliberately false: guests (no Supabase session at all)
 * must be able to log consent too. When an Authorization header IS
 * present, this function verifies it and records the real user_id;
 * otherwise the event is recorded against the client-supplied device_id
 * only (the same `klar_device_id` localStorage value already used for
 * sync). Either way this is a best-effort, fire-and-forget call from the
 * client — it must never block or fail the consent UI itself.
 *
 * Required env vars (auto-injected by Supabase runtime):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_REGIONS = new Set(["za", "uk", "other", ""]);
const ALLOWED_CONSENT_TYPES = new Set(["privacy_policy", "region_gate"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.slice(0, 128) : null;
  const region = typeof body.region === "string" && ALLOWED_REGIONS.has(body.region) ? body.region : null;
  const consentType = typeof body.consent_type === "string" && ALLOWED_CONSENT_TYPES.has(body.consent_type)
    ? body.consent_type
    : "privacy_policy";
  const consentVersion = Number.isInteger(body.consent_version) ? (body.consent_version as number) : null;

  if (consentVersion == null) {
    return json({ error: "consent_version (integer) is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Optional auth: signed-in callers get their real user_id attached;
  // guests (no header, or an invalid/expired one) still get logged by
  // device_id alone rather than being rejected.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) userId = user.id;
  }

  if (!userId && !deviceId) {
    return json({ error: "Either a valid session or device_id is required" }, 400);
  }

  const ip = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || null;
  const userAgent = req.headers.get("user-agent");

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await sb.from("consent_events").insert({
    user_id: userId,
    device_id: deviceId,
    region,
    consent_type: consentType,
    consent_version: consentVersion,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (error) {
    console.error("log-consent: insert failed:", error.message);
    return json({ error: "Failed to record consent" }, 500);
  }

  return json({ ok: true }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
