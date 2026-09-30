/**
 * Klar — groq-chat Edge Function
 *
 * Server-managed proxy for the AI Advisor. Previously the client called
 * api.groq.com directly using a personal Groq API key the user had to paste
 * into Settings -- meaning AI features were bring-your-own-key only, on
 * EVERY plan, contradicting the pricing/FAQ copy that says AI Advisor is
 * "included in Essential plan at no extra charge." This function closes
 * that gap: Klar now holds its own Groq key server-side, and the client
 * calls this function instead of api.groq.com directly.
 *
 * Deliberately a thin passthrough, not a rewrite of the three call sites'
 * request-building logic (autoMoSummary's monthly AI summary, sendChat's
 * main AI Advisor chat, and the grocery-price-estimate helper) -- each
 * already builds the exact Groq chat-completions body it needs; this
 * function just forwards {model, messages, max_tokens, temperature} to
 * Groq using the server's key instead of a user-supplied one, and passes
 * the response straight back. Client-side tier gating (klHasTier('essential'))
 * is unchanged and still the first check before this is ever called.
 *
 * verify_jwt is deliberately true: only a real, signed-in user can reach
 * this. It does not independently re-check the Essential/Pro tier
 * server-side (the client already gates this, and re-checking would need
 * an extra DB round-trip per chat message) -- acceptable at beta scale,
 * worth revisiting if this needs hardening before a wider launch.
 *
 * Required env var (Supabase Dashboard -> Edge Functions -> Secrets):
 *   GROQ_API_KEY — console.groq.com -> API Keys
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    console.error("GROQ_API_KEY is not set");
    return json({ error: "AI Advisor is not configured yet — please try again later" }, 503);
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { model, messages, max_tokens, temperature } = body;
  if (!model || !Array.isArray(messages)) {
    return json({ error: "model and messages are required" }, 400);
  }

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(max_tokens !== undefined ? { max_tokens } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
      }),
    });

    const data = await groqRes.text();
    return new Response(data, {
      status: groqRes.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("groq-chat: request to Groq failed:", msg);
    return json({ error: "Could not reach AI service — please try again" }, 502);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
