/**
 * Klar — banklink-connect Edge Function
 *
 * Starts the self-serve "Connect Bank" flow for South African users via Banklink
 * (https://banklink.co.za), creating a hosted link-request the client opens in a
 * popup. Mirrors saltedge-connect's shape (same job: get a hosted URL for the
 * signed-in user, record a pending connection row to correlate the completion
 * webhook back to this user), but against Banklink's actual API, which is
 * meaningfully different from Salt Edge's:
 *   - Salt Edge: create a "customer" once, then a "connect session" each time.
 *   - Banklink: one-shot "link request" per connection attempt; no separate
 *     customer concept. The `reference` field (set to this user's Supabase id)
 *     is Banklink's documented mechanism for correlating the webhook back to a
 *     specific one of our users — the exact field name the real API docs use,
 *     confirmed by reading https://banklink.co.za/api-reference.html directly
 *     rather than assumed from the Salt Edge pattern.
 *
 * save_data:true + destinations:[] (both valid per Banklink's docs: "Link
 * requests may use an empty array when save_data is true") means Banklink
 * retains the fetched transactions on its side for us to pull on demand via
 * banklink-sync, rather than requiring a webhook destination at all — the
 * org-level banklink-webhook function still exists and handles
 * link_request.completed (to mark this row 'linked' and resolve the account),
 * but isn't the only way data reaches us.
 *
 * verify_jwt is true: only a real, signed-in user can start a bank link for
 * themselves (matches klHasTier('essential') gating enforced client-side
 * before this is ever called, same as the existing Salt Edge flow).
 *
 * Required env vars (Supabase Dashboard -> Edge Functions -> Secrets):
 *   BANKLINK_API_KEY — Banklink dashboard -> API Keys (sk_live_... in production)
 *   SUPABASE_URL, SUPABASE_ANON_KEY — auto-injected by Supabase runtime
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BANKLINK_API_KEY = Deno.env.get("BANKLINK_API_KEY");
const BANKLINK_BASE = "https://api.banklink.co.za/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (!BANKLINK_API_KEY) {
    console.error("BANKLINK_API_KEY is not set");
    return json({ error: "Bank linking is not configured yet — please try again later" }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  try {
    const linkRes = await fetch(`${BANKLINK_BASE}/link-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BANKLINK_API_KEY}`,
      },
      body: JSON.stringify({
        reference: user.id,
        name: `Klar user ${user.id}`,
        save_data: true,
        destinations: [],
        redirect_url: "https://klarfinance.co.za/app",
      }),
    });

    const linkData = await linkRes.json();
    if (!linkRes.ok) {
      console.error("banklink-connect: Banklink API error", linkRes.status, linkData);
      return json({ error: "Could not start bank connection — please try again" }, 502);
    }

    const linkRequestId = linkData.data?.id;
    const hostedUrl = linkData.data?.url;
    if (!linkRequestId || !hostedUrl) {
      console.error("banklink-connect: no id/url in Banklink response", linkData);
      return json({ error: "Could not start bank connection — please try again" }, 502);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: dbError } = await sb.from("banklink_connections").insert({
      user_id: user.id,
      link_request_id: linkRequestId,
      status: "pending",
    });
    if (dbError) {
      console.error("banklink-connect: failed to record pending connection", dbError);
      return json({ error: "Could not start bank connection — please try again" }, 502);
    }

    return json({ url: hostedUrl }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("banklink-connect: request to Banklink failed:", msg);
    return json({ error: "Could not reach Banklink — please try again" }, 502);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
