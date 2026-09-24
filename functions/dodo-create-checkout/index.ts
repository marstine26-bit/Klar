/**
 * Klar — dodo-create-checkout Edge Function
 *
 * Creates a Dodo Payments hosted Checkout Session for a plan the client
 * asked for, and returns the checkout_url to redirect the browser to.
 *
 * This replaces the old Lemon Squeezy flow, which built a static checkout
 * URL client-side (klOpenLsCheckout() in Klar Rebrand.html) — LS variant
 * checkout links could be assembled directly in the browser with query
 * params. Dodo's flow is server-side: POST /checkouts with your secret API
 * key returns a one-time checkout_url, so this has to happen in an Edge
 * Function rather than client JS (the API key must never reach the browser).
 *
 * verify_jwt is deliberately true: only a real, currently-authenticated
 * user can create a checkout for themselves. The Supabase user id is read
 * from the verified JWT (never trusted from the request body) and attached
 * to the checkout as metadata.supabase_user_id, so the dodo-webhook handler
 * can identify who a subscription belongs to when Dodo calls back.
 *
 * Request:
 *   POST /functions/v1/dodo-create-checkout
 *   Authorization: Bearer <supabase_user_jwt>
 *   Body: { planId: 'essential'|'pro'|'family', billing: 'monthly'|'annual' }
 *
 * Response 200: { checkout_url: string }
 *
 * Required env vars (set in Supabase Dashboard -> Edge Functions -> Secrets):
 *   DODO_API_KEY               — Dodo Dashboard -> Settings -> API Keys
 *   SUPABASE_URL, SUPABASE_ANON_KEY  — auto-injected by Supabase runtime
 *
 * ── SETUP NOTE ─────────────────────────────────────────────────────────────
 * DODO_PRODUCTS below is now filled in (8 real GBP/ZAR Essential/Pro
 * products created 2026-09-24), same ids mirrored into dodo-webhook's
 * DODO_PRODUCT_TO_PLAN. Family is comingSoon:true and intentionally not
 * sold — a checkout attempt for it still correctly falls through to the
 * "not yet configured" error below rather than a broken checkout_url.
 * ───────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// plan_billing_currency -> Dodo product id. Mirrors the old KL_LS_VARIANTS
// shape in Klar Rebrand.html. Fill in once products exist in Dodo's
// dashboard — same product ids as DODO_PRODUCT_TO_PLAN in dodo-webhook.
const DODO_PRODUCTS: Record<string, string> = {
  "essential_monthly_gbp": "pdt_0NoJDtd4UIDCgzYaptMvc",
  "essential_annual_gbp":  "pdt_0NoJEEMSLOCo6C8sqztxY",
  "pro_monthly_gbp":       "pdt_0NoJEVP7EHKn8c4mCircV",
  "pro_annual_gbp":        "pdt_0NoJFEKVrHFJqOAdEPyFJ",
  // family_* intentionally omitted — Family plan is comingSoon:true, not sold yet.
  "essential_monthly_zar": "pdt_0NoJFRhpBtlzppOv1pfRz",
  "essential_annual_zar":  "pdt_0NoJFirrvgRlUTdI9dEFf",
  "pro_monthly_zar":       "pdt_0NoKAMoDsgJb9uY3nWYy8",
  "pro_annual_zar":        "pdt_0NoKAdYYZ3pUHv3TZRwjI",
};

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
    return json({ error: "Method Not Allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }
  const jwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const dodoApiKey = Deno.env.get("DODO_API_KEY");

  if (!dodoApiKey) {
    console.error("DODO_API_KEY is not set");
    return json({ error: "Payments are not configured yet — please try again later" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const planId = body.planId as string | undefined;
  const billing = body.billing as string | undefined;
  const currency = body.currency as string | undefined; // 'gbp' | 'zar', passed by the client from S.prefs.region

  if (!planId || !billing || !currency) {
    return json({ error: "planId, billing, and currency are required" }, 400);
  }

  const key = `${planId}_${billing}_${currency}`;
  const productId = DODO_PRODUCTS[key];
  if (!productId) {
    console.error(`dodo-create-checkout: unmapped plan key "${key}" — add it to DODO_PRODUCTS`);
    return json({ error: "Plan not yet configured — check back soon" }, 400);
  }

  // Where the app should live — used both as the checkout's return_url and
  // to keep the redirect same-origin (never trust an origin passed by the
  // client for this).
  const appOrigin = "https://klar.marcelmoyo.workers.dev";

  try {
    const dodoRes = await fetch("https://live.dodopayments.com/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dodoApiKey}`,
      },
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: { email: user.email, name: user.user_metadata?.name ?? user.email },
        return_url: `${appOrigin}/app`,
        metadata: { supabase_user_id: user.id },
      }),
    });

    if (!dodoRes.ok) {
      const errText = await dodoRes.text();
      console.error("dodo-create-checkout: Dodo API error", dodoRes.status, errText);
      return json({ error: "Could not start checkout — please try again" }, 502);
    }

    const dodoData = await dodoRes.json();
    const checkoutUrl = dodoData.checkout_url as string | undefined;
    if (!checkoutUrl) {
      console.error("dodo-create-checkout: no checkout_url in Dodo response", dodoData);
      return json({ error: "Could not start checkout — please try again" }, 502);
    }

    return json({ checkout_url: checkoutUrl }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("dodo-create-checkout: request to Dodo failed:", msg);
    return json({ error: "Could not reach payment provider — please try again" }, 502);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
