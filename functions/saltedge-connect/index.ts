import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SALTEDGE_APP_ID = Deno.env.get('SALTEDGE_APP_ID')!;
const SALTEDGE_SECRET = Deno.env.get('SALTEDGE_SECRET')!;
const SALTEDGE_BASE = 'https://www.saltedge.com/api/v5';
// Was hardcoded to 'https://klarmoney.netlify.app/...', then updated to
// 'https://klar.marcelmoyo.workers.dev/...' during a prior domain move -- both were
// stale by the time a user actually completed a real bank link, bouncing them back to
// an origin with none of their session data, so the '?bank_connected=1' handler on the
// real production app never ran and the sync-after-connect flow silently never fired.
// Now on the permanent custom domain (klarfinance.co.za, live via Cloudflare Worker
// custom domain as of the 2026-09-27 DNS migration), pointed at the clean /app path
// (the app file was later renamed to app/index.html, served natively -- no filename
// in this URL to go stale again). Update this again if the app's origin ever changes.
const RETURN_BASE = 'https://klarfinance.co.za/app';

const seHeaders = {
  'App-id': SALTEDGE_APP_ID,
  'Secret': SALTEDGE_SECRET,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401, headers: cors });

  // Get or create Saltedge customer
  const { data: existing } = await supabase
    .from('klar_bank_connections')
    .select('saltedge_customer_id')
    .eq('user_id', user.id)
    .not('saltedge_customer_id', 'is', null)
    .limit(1)
    .maybeSingle();

  let customerId = existing?.saltedge_customer_id;

  if (!customerId) {
    const custRes = await fetch(`${SALTEDGE_BASE}/customers`, {
      method: 'POST',
      headers: seHeaders,
      body: JSON.stringify({ data: { identifier: user.id } }),
    });
    const custData = await custRes.json();
    customerId = custData.data?.id;
    if (!customerId) {
      return new Response(JSON.stringify({ error: 'Failed to create customer', details: custData }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    await supabase.from('klar_bank_connections').insert({ user_id: user.id, saltedge_customer_id: customerId });
  }

  // Create connect session
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);

  const sessRes = await fetch(`${SALTEDGE_BASE}/connect_sessions/create`, {
    method: 'POST',
    headers: seHeaders,
    body: JSON.stringify({
      data: {
        customer_id: customerId,
        consent: {
          scopes: ['account_details', 'transactions_details'],
          from_date: fromDate.toISOString().slice(0, 10),
        },
        attempt: {
          return_to: `${RETURN_BASE}?bank_connected=1`,
          fetch_scopes: ['accounts', 'transactions'],
        },
      },
    }),
  });

  const sessData = await sessRes.json();
  const connectUrl = sessData.data?.connect_url;

  if (!connectUrl) {
    return new Response(JSON.stringify({ error: 'Failed to create session', details: sessData }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ connect_url: connectUrl, customer_id: customerId }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
