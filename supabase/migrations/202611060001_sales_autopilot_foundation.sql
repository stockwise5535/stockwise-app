-- Sales autopilot foundation. Review before applying to Supabase.
-- No public/client access. Only trusted server-side service role may use tables.
create table if not exists public.sales_contacts (
 id uuid primary key default gen_random_uuid(),
 organization_id text not null,
 email text not null,
 source_url text not null,
 contact_basis text not null,
 jurisdiction text not null,
 source_terms_verified boolean not null default false,
 contact_basis_verified boolean not null default false,
 suppressed_at timestamptz,
 replied_at timestamptz,
 created_at timestamptz not null default now(),
 constraint sales_contacts_email_not_blank check (length(trim(email)) > 3),
 constraint sales_contacts_organization_not_blank check (length(trim(organization_id)) > 0),
 unique (organization_id, email)
);
create table if not exists public.sales_outreach_events (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.sales_contacts(id) on delete restrict,
 event_key text not null unique,
 event_type text not null check(event_type in ('accepted','delivered','reply','unsubscribe','complaint','hard_bounce','uncertain')),
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.sales_send_ledger (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null references public.sales_contacts(id) on delete restrict,
 campaign_id text not null,
 idempotency_key text not null unique,
 state text not null default 'reserved' check(state in ('reserved','sent','uncertain','cancelled')),
 provider_message_id text unique,
 reserved_at timestamptz not null default now(),
 sent_at timestamptz,
 constraint sales_ledger_campaign_not_blank check(length(trim(campaign_id)) > 0)
);
create table if not exists public.sales_oauth_credentials (
 provider text primary key check(provider='gmail'),
 account_email text not null,
 encrypted_refresh_token jsonb not null,
 granted_scope text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.sales_oauth_transactions (
 state_hash text primary key,
 encrypted_verifier jsonb not null,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists sales_contacts_suppressed_idx on public.sales_contacts(suppressed_at) where suppressed_at is not null;
create index if not exists sales_events_contact_idx on public.sales_outreach_events(contact_id,occurred_at desc);
create index if not exists sales_ledger_contact_idx on public.sales_send_ledger(contact_id,reserved_at desc);
alter table public.sales_contacts enable row level security;
alter table public.sales_outreach_events enable row level security;
alter table public.sales_send_ledger enable row level security;
alter table public.sales_oauth_credentials enable row level security;
alter table public.sales_oauth_transactions enable row level security;
-- Explicitly revoke API access for browser roles; no permissive RLS policies.
revoke all on public.sales_contacts,public.sales_outreach_events,public.sales_send_ledger,public.sales_oauth_credentials,public.sales_oauth_transactions from anon,authenticated;
-- Irreversible suppression: neither application nor accidental UPDATE can
-- clear opt-outs, complaints, or hard bounces.
create or replace function public.sales_contact_suppression_guard()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.suppressed_at is not null and new.suppressed_at is null then
  raise exception 'sales_contact_suppression_cannot_be_cleared';
 end if;
 if old.replied_at is not null and new.replied_at is null then
  raise exception 'sales_contact_reply_cannot_be_cleared';
 end if;
 return new;
end $$;
drop trigger if exists sales_contacts_suppression_guard on public.sales_contacts;
create trigger sales_contacts_suppression_guard before update on public.sales_contacts
for each row execute function public.sales_contact_suppression_guard();
-- Events are immutable; ingestion must update sales_contacts suppression
-- within the same DB transaction before acknowledging an opt-out.
create or replace function public.sales_events_immutable()
returns trigger language plpgsql as $$
begin
 raise exception 'sales_events_are_immutable';
end $$;
drop trigger if exists sales_events_no_update_delete on public.sales_outreach_events;
create trigger sales_events_no_update_delete before update or delete on public.sales_outreach_events
for each row execute function public.sales_events_immutable();
