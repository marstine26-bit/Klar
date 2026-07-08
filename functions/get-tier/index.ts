/**
 * Klar — get-tier Edge Function
 *
 * Returns the authoritative subscription tier for the authenticated user.
 * Called by the client on login, app start, and after Paddle checkout.
 *
 * Request:
 *   POST /functions/v1/get-tier
 *   Authorization: Bearer <supabase_user_jwt>
 *
 * Response 200:
 *   { tier: 'free'|'essential'|'pro'|'family', status: string, expires: string|null }
 *
 * The function deliberately stays minimal — single DB read, no joins —
 * to keep latency well under 150 ms.
 *
 * Required env vars (auto-injected by Supabase runtime):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FREE_RESPONSE = { tier: "free", status: "none", expires: null };

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight (Paddle checkout runs in an overlay on the same origin,
  //    but the app may be served from Netlify, localhost, etc.)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── Extract JWT from Authorization header ─────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(FREE_RESPONSE, 200); // Unauthenticated → free
  }
  const jwt = authHeader.slice(7);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Verify the JWT by constructing an auth client with it ─────────────────
  // Using the anon client + global header validates the token via Supabase Auth
  // without a separate HTTP round-trip.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    // Invalid or expired JWT — enforce free tier
    return jsonResponse(FREE_RESPONSE, 200);
  }

  // ── Query subscriptions with service role (bypasses RLS) ─────────────────
  // Using service role here to avoid any RLS policy misconfiguration causing
  // false "free" responses. The user identity has already been verified above.
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sub, error: dbError } = await sb
    .from("subscriptions")
    .select("plan_id, status, current_period_end")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dbError) {
    console.error("get-tier DB error:", dbError.message);
    // Fail open with free — never accidentally grant paid access on error
    return jsonResponse(FREE_RESPONSE, 200);
  }

  // ── No subscription row → free ────────────────────────────────────────────
  if (!sub) {
    return jsonResponse(FREE_RESPONSE, 200);
  }

  const { plan_id, status, current_period_end } = sub;

  // ── Evaluate whether the subscription is actually active ─────────────────
  const isCancelled = status === "cancelled";
  const isPeriodExpired =
    current_period_end != null &&
    new Date(current_period_end) < new Date();

  if (isCancelled && isPeriodExpired) {
    // Fully expired cancellation — downgrade to free
    return jsonResponse({ tier: "free", status, expires: current_period_end ?? null }, 200);
  }

  // active | trialing | past_due | paused | cancelled-but-still-in-period
  // All of these retain access until period end (Paddle semantics).
  const tier = (plan_id as string) || "free";

  return jsonResponse({
    tier,
    status,
    expires: current_period_end ?? null,
  }, 200);
});

// ── Helper ────────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "no-store",
    },
  });
}
