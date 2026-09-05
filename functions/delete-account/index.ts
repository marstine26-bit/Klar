/**
 * Klar — delete-account Edge Function
 *
 * Permanently deletes the authenticated caller's own account: every row
 * they own across the app's tables, then the underlying Supabase Auth
 * user record itself. This is the piece the client-side "Delete cloud
 * data" button was missing — that button only ever cleared data rows,
 * leaving the auth identity (email, hashed credentials) on Supabase
 * indefinitely, which doesn't match what the privacy policy promises
 * for account erasure.
 *
 * verify_jwt is deliberately true: this must only ever run for a real,
 * currently-authenticated user acting on their own account. There is no
 * path here for one user to delete another's account — the target user
 * id always comes from the verified JWT, never from the request body.
 *
 * Required env vars (auto-injected by Supabase runtime):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env var (set manually in Supabase Dashboard -> Edge Functions ->
 * Secrets -- NOT auto-injected):
 *   LEMONSQUEEZY_API_KEY  -- a Lemon Squeezy API key with permission to
 *     cancel subscriptions (Dashboard -> Settings -> API). Without it,
 *     account deletion still wipes all app data and the auth user as
 *     before, but leaves any active subscription running on Lemon
 *     Squeezy's side undisturbed -- a warning is logged, not an error.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Every table with a user_id column referencing auth.users, deleted
// explicitly rather than assumed to cascade — safe regardless of each
// table's actual FK delete behavior.
const OWNED_TABLES = [
  "klar_syncs",
  "klar_bill_payments",
  "klar_bank_connections",
  "subscriptions",
  "tester_overrides",
];

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }
  const jwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cancel any active Lemon Squeezy subscription BEFORE wiping the row that
  // names it — otherwise account deletion left billing running with no
  // record of which subscription it even was. Best-effort: a failed
  // cancellation must never block honoring the user's erasure request; it
  // just gets surfaced in the response so it can be handled manually.
  const lsApiKey = Deno.env.get("LEMONSQUEEZY_API_KEY");
  let subscriptionCancelError: string | undefined;
  if (lsApiKey) {
    const { data: sub } = await sb
      .from("subscriptions")
      .select("ls_subscription_id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub?.ls_subscription_id && sub.status !== "cancelled") {
      try {
        const lsRes = await fetch(
          `https://api.lemonsqueezy.com/v1/subscriptions/${sub.ls_subscription_id}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.api+json",
              Authorization: `Bearer ${lsApiKey}`,
            },
          },
        );
        if (!lsRes.ok) {
          subscriptionCancelError = `Lemon Squeezy returned ${lsRes.status}`;
          console.error("delete-account: LS cancel failed:", lsRes.status, await lsRes.text());
        }
      } catch (e) {
        subscriptionCancelError = e instanceof Error ? e.message : String(e);
        console.error("delete-account: LS cancel threw:", subscriptionCancelError);
      }
    }
  } else {
    console.warn("delete-account: LEMONSQUEEZY_API_KEY not set — skipping subscription cancellation");
  }

  const tableErrors: Record<string, string> = {};
  for (const table of OWNED_TABLES) {
    const { error } = await sb.from(table).delete().eq("user_id", user.id);
    if (error) tableErrors[table] = error.message;
  }

  const { error: deleteUserError } = await sb.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error("delete-account: auth.admin.deleteUser failed:", deleteUserError.message);
    return json({ error: "Failed to delete account", tableErrors, authError: deleteUserError.message }, 500);
  }

  console.log("delete-account: completed for user", user.id, Object.keys(tableErrors).length ? { tableErrors } : "");
  return json({
    ok: true,
    tableErrors: Object.keys(tableErrors).length ? tableErrors : undefined,
    subscriptionCancelError,
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
