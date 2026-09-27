import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SALTEDGE_APP_ID = Deno.env.get('SALTEDGE_APP_ID')!;
const SALTEDGE_SECRET = Deno.env.get('SALTEDGE_SECRET')!;
const SALTEDGE_BASE = 'https://www.saltedge.com/api/v5';

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

// Map Saltedge categories to Klar categories
const CAT_MAP: Record<string, string> = {
  'groceries': 'groceries', 'food_and_drinks': 'food', 'restaurants': 'food',
  'transport': 'transport', 'fuel': 'transport', 'taxi': 'transport',
  'utilities': 'utilities', 'electricity': 'utilities', 'water': 'utilities',
  'rent': 'rent', 'mortgage': 'rent',
  'entertainment': 'entertainment', 'streaming': 'subscriptions',
  'health': 'medical', 'medical': 'medical', 'pharmacy': 'medical',
  'education': 'education', 'salary': 'salary', 'income': 'salary',
  'savings': 'savings', 'investments': 'investments',
  'insurance': 'insurance', 'clothing': 'clothing', 'shopping': 'shopping',
  'travel': 'travel', 'accommodation': 'travel',
  'transfers': 'transfer', 'atm': 'cash', 'cash': 'cash',
  'mobile': 'cellphone', 'internet': 'internet', 'telephone': 'cellphone',
};

function mapCategory(saltedgeCat: string): string {
  const key = (saltedgeCat || '').toLowerCase().replace(/[^a-z_]/g, '_');
  return CAT_MAP[key] || 'other';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401, headers: cors });

  // Get this user's Saltedge customer
  const { data: connRows } = await supabase
    .from('klar_bank_connections')
    .select('*')
    .eq('user_id', user.id)
    .not('saltedge_customer_id', 'is', null);

  if (!connRows?.length) {
    return new Response(JSON.stringify({ transactions: [], accounts: [], message: 'No connections' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const customerId = connRows[0].saltedge_customer_id;

  // Fetch all connections from Saltedge
  const connsRes = await fetch(`${SALTEDGE_BASE}/connections?customer_id=${customerId}`, { headers: seHeaders });
  const connsData = await connsRes.json();
  const connections: any[] = connsData.data || [];

  const allTransactions: any[] = [];
  const allAccounts: any[] = [];

  for (const conn of connections) {
    // Fetch accounts
    const accsRes = await fetch(`${SALTEDGE_BASE}/accounts?connection_id=${conn.id}`, { headers: seHeaders });
    const accsData = await accsRes.json();
    const accounts: any[] = accsData.data || [];

    for (const acc of accounts) {
      allAccounts.push({
        saltedge_id: acc.id,
        connection_id: conn.id,
        provider: conn.provider_name,
        name: acc.name,
        balance: acc.balance,
        currency: acc.currency_code,
        nature: acc.nature,
      });

      // Fetch transactions (last 90 days)
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 90);

      const txnsRes = await fetch(
        `${SALTEDGE_BASE}/transactions?account_id=${acc.id}&from_date=${fromDate.toISOString().slice(0, 10)}`,
        { headers: seHeaders }
      );
      const txnsData = await txnsRes.json();
      const txns: any[] = txnsData.data || [];

      for (const t of txns) {
        allTransactions.push({
          saltedge_id: String(t.id),
          account_name: acc.name,
          provider: conn.provider_name,
          date: t.made_on,
          description: t.description || t.extra?.payee || 'Bank transaction',
          amount: Math.abs(t.amount),
          type: t.amount < 0 ? 'expense' : 'income',
          category: mapCategory(t.category),
          currency: t.currency_code,
        });
      }
    }

    // Update last_sync
    await supabase
      .from('klar_bank_connections')
      .update({ connection_id: conn.id, provider_name: conn.provider_name, last_sync: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('saltedge_customer_id', customerId);
  }

  return new Response(JSON.stringify({ transactions: allTransactions, accounts: allAccounts, connection_count: connections.length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
