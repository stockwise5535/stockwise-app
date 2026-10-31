-- DRAFT FOR HUMAN REVIEW ONLY. NOT A REGISTERED MIGRATION. DO NOT APPLY WITHOUT APPROVAL.
-- Local disposable tests may validate this proposal. No live schema/RLS is changed.
-- Existing nexops_* auth.uid(), internal-admin and workspace roles remain authoritative.
begin;
create table public.nexops_growth_population (
 user_id uuid primary key references auth.users(id),
 classification text not null default 'unknown' check(classification in ('unknown','real_customer','test','internal')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 check(classification='unknown' or (verified_by is not null and verified_at is not null))
);
create table public.nexops_crm_companies (
 workspace_id uuid not null references public.nexops_workspaces(id),id uuid not null default gen_random_uuid(),
 domain text not null check(domain=lower(domain)),name text not null,segment text not null check(segment in ('startups','ecommerce','manufacturing')),
 evidence jsonb not null default '[]',icp_score integer not null default 0 check(icp_score between 0 and 100),
 status text not null default 'research_required' check(status in ('research_required','qualified_candidate','contacted','replied','meeting','stopped','bounced')),
 primary key(workspace_id,id),unique(workspace_id,domain)
);
create table public.nexops_crm_contacts (
 workspace_id uuid not null,company_id uuid not null,id uuid not null default gen_random_uuid(),
 email text not null check(email=lower(trim(email))),role text,country text,consent boolean not null default false,
 stopped boolean not null default false,bounced boolean not null default false,suppressed boolean not null default false,
 legal_review jsonb,primary key(workspace_id,id),unique(workspace_id,email),
 foreign key(workspace_id,company_id) references public.nexops_crm_companies(workspace_id,id)
);
create table public.nexops_growth_campaign_items (
 workspace_id uuid not null references public.nexops_workspaces(id),id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('email','social')),payload jsonb not null,version integer not null default 1 check(version>0),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','review','approved','sending','scheduled','published','measured','sent','delivery_unknown','blocked','cancelled')),
 primary key(workspace_id,id)
);
create table public.nexops_growth_approvals (
 workspace_id uuid not null,item_id uuid not null,version integer not null,approved_by uuid not null references auth.users(id),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),approved_at timestamptz not null default now(),
 primary key(workspace_id,item_id,version),foreign key(workspace_id,item_id) references public.nexops_growth_campaign_items(workspace_id,id)
);
create table public.nexops_growth_delivery_attempts (
 workspace_id uuid not null,item_id uuid not null,id uuid not null default gen_random_uuid(),
 identity_hash text not null check(identity_hash ~ '^[a-f0-9]{64}$'),provider_id text,attempted_at timestamptz not null default now(),
 state text not null check(state in ('sending','scheduled','sent','delivery_unknown','failed')),
 primary key(workspace_id,id),unique(workspace_id,identity_hash),foreign key(workspace_id,item_id) references public.nexops_growth_campaign_items(workspace_id,id)
);
create table public.nexops_crm_activity (
 workspace_id uuid not null references public.nexops_workspaces(id),id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('research','draft','approval','attempt','reply','stop','bounce','meeting','audit')),
 record_id uuid,source_event_id text,actor_id uuid references auth.users(id),details jsonb not null default '{}',created_at timestamptz not null default now(),
 primary key(workspace_id,id),unique(workspace_id,source_event_id)
);
create index nexops_growth_attempt_limits on public.nexops_growth_delivery_attempts(workspace_id,attempted_at,state);
alter table public.nexops_growth_population enable row level security;
alter table public.nexops_growth_population force row level security;
revoke all on public.nexops_growth_population from public,anon,authenticated;
grant select on public.nexops_growth_population to authenticated;
create policy population_internal on public.nexops_growth_population for select to authenticated using(public.nexops_is_growth_admin());
do $$ declare t text;begin foreach t in array array['nexops_crm_companies','nexops_crm_contacts','nexops_growth_campaign_items','nexops_growth_approvals','nexops_growth_delivery_attempts','nexops_crm_activity'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy internal_workspace_read on public.%I for select to authenticated using(public.nexops_is_growth_admin() and public.nexops_workspace_role(workspace_id) in (''owner'',''admin''))',t);
end loop;end $$;
-- Intentionally no browser DML grants and NO new security-definer function.
-- Before approval/application: implement reviewed auth.uid()-bound transactional
-- CRUD/review/claim RPCs, immutable audit writes, suppression reconciliation and
-- read-only population-scoped aggregate API. This proposal alone is not a working CRM backend.
commit;
