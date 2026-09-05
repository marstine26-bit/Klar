-- Dedicated, append-only consent audit trail.
-- Closes the gap flagged in klar-open-banking-compliance-roadmap.md #1-4:
-- consent was previously only a field inside the opaque klar_syncs JSON blob
-- (overwritten by later resyncs, no record for guest/local-only users, no
-- IP/user-agent/mechanism metadata). This table is written exclusively by
-- the log-consent Edge Function using the service role key -- no client
-- (anon or authenticated) can read or write it directly, since RLS is
-- enabled with no policies defined (default-deny). Founders read it via
-- the Supabase dashboard SQL editor or the service role.
--
-- HOW TO APPLY: this could not be run automatically -- the project's
-- Supabase MCP connection is currently rejecting the DB password
-- ("password authentication failed for user postgres"), which is a
-- platform-side credential issue, not something fixable from here. Reset
-- the database password in Supabase Dashboard -> Project Settings ->
-- Database, then either re-run this via the MCP connection or paste it
-- into Dashboard -> SQL Editor -> New query and run it there directly.

create table if not exists public.consent_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  device_id        text,
  region           text,
  consent_type     text not null default 'privacy_policy',
  consent_version  integer not null,
  ip_address       text,
  user_agent       text,
  created_at       timestamptz not null default now()
);

create index if not exists consent_events_user_id_idx on public.consent_events(user_id);
create index if not exists consent_events_device_id_idx on public.consent_events(device_id);
create index if not exists consent_events_created_at_idx on public.consent_events(created_at);

alter table public.consent_events enable row level security;
-- Deliberately no policies: RLS defaults to deny-all for anon/authenticated.
-- Only the service_role key (used server-side in the log-consent function)
-- bypasses RLS to insert, and the founder's own dashboard access to read.
