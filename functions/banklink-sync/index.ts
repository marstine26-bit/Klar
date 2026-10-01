/**
 * Klar — banklink-sync Edge Function
 *
 * Pulls fresh transactions for the signed-in user's linked Banklink account, on
 * demand ("Sync Now" button), mirroring saltedge-sync's job but against
 * Banklink's actual API shape:
 *   1. Look up this user's linked account from banklink_connections (populated by
 *      banklink-webhook's link_request.completed handler once they finish the
 *      hosted Connect Bank flow started by banklink-connect).
 *   2. POST /accounts/{id}/sync — triggers Banklink to fetch latest data from the
 *      bank. Returns only {synced, skipped} counts, not the transactions
 *      themselves (confirmed from Banklink's live API reference — this is NOT
 *      the same shape as Salt Edge's single combined sync call).
 *   3. GET /accounts/{id}/transactions — fetch the actual transaction list
 *      (cursor-paginated, confirmed max 500/page, default 100 — one page is
 *      enough here since the client already dedupes by external_id against
 *      transactions it's already imported).
 *
 * verify_jwt is true: only the signed-in user can sync their own connection —
 * their banklink_connections row is looked up by user_id, so there's no way to
 * target another user's account_id even if one were guessed.
 *
 * Required env vars: BANKLINK_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (the last to read banklink_connections, which has no
 * public RLS policy — the signed-in user's own JWT can't read it directly).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BANKLINK_API_KEY = Deno.env.get("BANKLINK_API_KEY");
const BANKLINK_BASE = "https://api.banklink.co.za/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

// Mirrors the CAT_MAP convention already established in saltedge-sync for this
// same "map the provider's raw category/description into one of Klar's own
// categories" job — Banklink doesn't return a category field at all (confirmed:
// its transaction shape is {id, account_id, external_id, date, description,
// amount, currency, direction, balance, reference, created_at}, no category),
// so there's nothing to map here yet; left for a future pass (e.g. simple
// keyword matching against `description`, same idea Salt Edge's mapCategory()
// solves differently because IT does get a category from the provider).

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (!BANKLINK_API_KEY) {
    console.error("BANKLINK_API_KEY is not set");
    return json({ error: "Bank sync is not configured yet — please try again later" }, 503);
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

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: connections, error: connErr } = await sb
    .from("banklink_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "linked")
    .not("account_id", "is", null);

  if (connErr) {
    console.error("banklink-sync: failed to look up connections", connErr);
    return json({ error: "Could not look up your bank connection — please try again" }, 502);
  }
  if (!connections?.length) {
    return json({ accounts: [], transactions: [], connection_count: 0 }, 200);
  }

  const allTransactions: unknown[] = [];
  const accountSummaries: unknown[] = [];

  for (const conn of connections) {
    try {
      // Trigger a fresh pull from the bank first — mirrors clicking "Sync Now":
      // the GET right after only returns what Banklink already has stored, so
      // skipping this step would show stale data until Banklink's own next
      // scheduled refresh.
      await fetch(`${BANKLINK_BASE}/accounts/${conn.account_id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${BANKLINK_API_KEY}` },
      });

      const txRes = await fetch(`${BANKLINK_BASE}/accounts/${conn.account_id}/transactions`, {
        headers: { Authorization: `Bearer ${BANKLINK_API_KEY}` },
      });
      const txData = await txRes.json();
      if (!txRes.ok) {
        console.error(`banklink-sync: failed to fetch transactions for ${conn.account_id}`, txRes.status, txData);
        continue;
      }

      const transactions = Array.isArray(txData.data) ? txData.data : [];
      for (const t of transactions) {
        allTransactions.push({
          banklink_id: t.external_id || t.id,
          account_number: conn.account_number,
          bank: conn.bank,
          date: t.date,
          description: t.description,
          amount: Math.abs(Number(t.amount) || 0),
          type: t.direction === "credit" ? "income" : "expense",
          currency: t.currency || "ZAR",
        });
      }
      accountSummaries.push({
        account_id: conn.account_id,
        account_number: conn.account_number,
        bank: conn.bank,
      });

      await sb
        .from("banklink_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`banklink-sync: error syncing account ${conn.account_id}:`, msg);
    }
  }

  return json(
    { accounts: accountSummaries, transactions: allTransactions, connection_count: accountSummaries.length },
    200,
  );
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
