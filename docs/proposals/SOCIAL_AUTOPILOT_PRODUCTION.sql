-- ADD-ONLY production proposal for integration b6915d7; NOT executed on production.
-- Existing foundation objects/data/ACLs are never rewritten. Unknown baselines STOP.
-- Target UUIDs confirmed by user from production read-only query; rechecked at apply time.
-- Keep Vercel WRITES_ALLOWED=false, EMERGENCY_STOP=true and all schedulers OFF.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_catalog.pg_advisory_xact_lock(68269157);
do $preflight$
declare
 target_admin uuid := 'cbe5e792-8741-4f0d-b0eb-663fdc32628f'; -- required: existing confirmed Growth administrator
 target_org uuid := 'f60bb887-d9d6-42ae-9235-8e7079fb17ef'; -- required: exact server-side NexOps organization
 target_workspace uuid := 'af7bfc3b-b13d-4a66-8800-99ab55dfaca2'; -- required: workspace belonging to target_org
 t text; f record; r record;
begin
 if target_admin is null or target_org is null or target_workspace is null then
  raise exception 'STOP: exact existing administrator/organization/workspace UUIDs required';
 end if;
 if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
  raise exception 'STOP: service_role BYPASSRLS required'; end if;
 foreach t in array array['nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins'] loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||t) and relkind='r' and relrowsecurity) then
   raise exception 'STOP: missing table or disabled RLS: %',t; end if;
  -- Table owners, inherited ownership and TRUNCATE bypass row policies.
  for r in select oid,rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated') loop
   if r.rolsuper or r.rolbypassrls or pg_has_role(r.oid,(select relowner from pg_class where oid=to_regclass('public.'||t)),'USAGE')
    or has_table_privilege(r.oid,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    or has_any_column_privilege(r.oid,'public.'||t,'INSERT,UPDATE,REFERENCES') then
    raise exception 'STOP: unsafe existing privileges on % for %; review separately',t,r.rolname; end if;
  end loop;
  if has_table_privilege('anon','public.'||t,'SELECT') then raise exception 'STOP: anonymous foundation access: %',t; end if;
  if t<>'nexops_growth_admins' and not has_table_privilege('authenticated','public.'||t,'SELECT') then
   raise exception 'STOP: required authenticated foundation SELECT missing: %',t; end if;
  if (select count(*) from pg_policy where polrelid=to_regclass('public.'||t)) <> (case when t='nexops_growth_admins' and not has_table_privilege('authenticated','public.'||t,'SELECT') then 0 else 1 end) then
   raise exception 'STOP: unexpected existing policy count: %',t; end if;
 end loop;
 -- Column-level grants can bypass table-level write revocations.
 if exists(select 1 from information_schema.column_privileges where table_schema='public'
  and table_name in ('nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins')
  and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE','REFERENCES')) then
  raise exception 'STOP: existing column write grants require separate review'; end if;
 -- Exact known SELECT-only policy shapes; no USING(true), write or extra permissive policies accepted.
 if exists(select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins') and (
   p.polcmd<>'r' or not p.polpermissive or p.polroles<>array[(select oid from pg_roles where rolname='authenticated')]::oid[]
   or not exists(select 1 from (values
('nexops_growth_admins','own_admin_record','3a807491e0a912fbfbee0ffa087b82f6','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_organization_memberships','own_org_membership','3a807491e0a912fbfbee0ffa087b82f6','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_organizations','member_organization','bf266763489f1b244aaddd1ffaffa3a8','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_workspace_memberships','own_workspace_membership','3a807491e0a912fbfbee0ffa087b82f6','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_workspaces','member_workspace','b16381337cb5dd508401d6625166bb2b','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_organization_memberships','org_members','43ac1c4a3386ee2a1b31adcd089a0c32','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_organizations','org_member','5fde6675eb85813314037f8dfdad5ee3','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_workspace_memberships','workspace_members','b3b66ddaffca75c3af514014cfbd95e4','d41d8cd98f00b204e9800998ecf8427e'),
('nexops_workspaces','workspace_member','c96d06913f42fc2457ecd01f6cdb3faa','d41d8cd98f00b204e9800998ecf8427e')
   ) known(tab,policy,qual,chk) where known.tab=c.relname and known.policy=p.polname
     and known.qual=md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) and known.chk=md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')))
  )) then raise exception 'STOP: unknown existing RLS definition; do not replace it'; end if;
 if to_regprocedure('public.nexops_is_growth_admin()') is null then raise exception 'STOP: existing administrator RPC missing'; end if;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('nexops_is_growth_admin','nexops_org_member','nexops_workspace_role') loop
  if f.prorettype<>(case when f.proname='nexops_workspace_role' then 'text'::regtype else 'boolean'::regtype end)
   or f.proretset or f.prokind<>'f' or not f.prosecdef or f.provolatile<>'s' or f.proconfig is distinct from array['search_path=""']::text[]
   or f.prolang<>(select oid from pg_language where lanname='sql')
   or not exists(select 1 from (values
('nexops_is_growth_admin','','ef2d442812f793daef7603b227b97b0a'),
('nexops_is_growth_admin','','68f8a3170392a4021e09101942c16fef'),
('nexops_org_member','uuid','3b750319c8d9ab27a432409f74e3d32d'),
('nexops_workspace_role','uuid','9d0f7f083fb443c5256d5144b8ebd7fa')
   ) known(name,args,body) where known.name=f.proname and known.args=oidvectortypes(f.proargtypes) and known.body=md5(btrim(f.prosrc)))
   or has_function_privilege('anon',f.oid,'EXECUTE') or not has_function_privilege('authenticated',f.oid,'EXECUTE') then
   raise exception 'STOP: unknown or exposed existing authorization function: %',f.proname; end if;
  if pg_has_role('authenticated',f.proowner,'USAGE') or pg_has_role('anon',f.proowner,'USAGE') then
   raise exception 'STOP: client role owns authorization function';end if;
 end loop;
 -- Required columns/types and existing PK/FK compatibility are checked by these typed reads and CREATE references.
 if not exists(select 1 from auth.users u join public.nexops_growth_admins a on a.user_id=u.id
  join public.nexops_organization_memberships m on m.user_id=u.id and m.organization_id=target_org and m.role in ('owner','admin')
  join public.nexops_workspaces w on w.organization_id=m.organization_id and w.id=target_workspace
  join public.nexops_workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=u.id
  where u.id=target_admin and u.email_confirmed_at is not null) then
  raise exception 'STOP: confirmed administrator, organization or workspace assignment missing';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'nexops_social_%')
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'nexops_social_%') then
  raise exception 'STOP: existing SNS object; do not reapply or overwrite';end if;
end $preflight$;
create function public.nexops_social_admin(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.nexops_is_growth_admin() and exists(select 1 from public.nexops_organization_memberships where organization_id=o and user_id=auth.uid() and role in ('owner','admin'))
$$;
create table public.nexops_social_policy (
 organization_id uuid primary key references public.nexops_organizations(id), enabled boolean not null default false,
 revision integer not null default 0, facts_hash text, binding_hash text, updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.nexops_social_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.nexops_organizations(id), day date not null,
 policy_revision integer not null, state text not null default 'running' check(state in ('running','completed','failed')),
 ai_calls integer not null default 0 check(ai_calls between 0 and 6), reserved_cents integer not null default 0 check(reserved_cents between 0 and 120),
 expires_at timestamptz not null default now()+interval '10 minutes', created_at timestamptz not null default now(), unique(organization_id,day)
);
create table public.nexops_social_ticks (
 organization_id uuid not null references public.nexops_organizations(id), day date not null default (now() at time zone 'UTC')::date,
 created_at timestamptz not null default now(), primary key(organization_id,day)
);
create table public.nexops_social_posts (
 organization_id uuid not null references public.nexops_organizations(id), day date not null, network text not null check(network in ('linkedin','threads','x')),
 run_id uuid not null references public.nexops_social_runs(id), state text not null check(state in ('planned','blocked','sending','provider_accepted','delivery_unknown','published','error')),
 content_hash text, text text, fact_ids jsonb, reason text, claim_token uuid, provider_id text, metrics jsonb check(metrics is null or octet_length(metrics::text)<=20000), metrics_updated_at timestamptz, updated_at timestamptz not null default now(),
 primary key(organization_id,day,network), unique(organization_id,network,content_hash), check(text is null or length(text)<=3000)
);
create table public.nexops_social_budget (
 organization_id uuid not null references public.nexops_organizations(id), month date not null,
 reserved_cents integer not null default 0 check(reserved_cents between 0 and 4000), primary key(organization_id,month)
);
create table public.nexops_social_snapshots (
 organization_id uuid not null references public.nexops_organizations(id), period_start timestamptz not null, period_end timestamptz not null,
 payload jsonb not null check(octet_length(payload::text)<=2000000), updated_at timestamptz not null default now(), primary key(organization_id,period_start,period_end)
);
create table public.nexops_social_alerts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.nexops_organizations(id),
 code text not null check(code ~ '^[A-Z_]{1,80}$'), delivered boolean not null default false, created_at timestamptz not null default now()
);
create table public.nexops_social_audit (
 id bigint generated always as identity primary key, organization_id uuid not null references public.nexops_organizations(id),
 actor_id uuid references auth.users(id), action text not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['policy','runs','ticks','posts','budget','snapshots','alerts','audit'] loop
 execute format('alter table public.%I enable row level security','nexops_social_'||t);
 execute format('revoke all on public.%I from public,anon,authenticated','nexops_social_'||t);
 execute format('grant select on public.%I to authenticated','nexops_social_'||t);
 execute format('revoke all on public.%I from service_role','nexops_social_'||t);
 execute format('grant select on public.%I to service_role','nexops_social_'||t);
 execute format('create policy internal_read on public.%I for select to authenticated using(public.nexops_social_admin(organization_id))','nexops_social_'||t);
 end loop;
end $$;
create function public.nexops_social_set_policy(o uuid, turn_on boolean, facts text, binding text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.nexops_social_policy;
begin
 if not public.nexops_social_admin(o) then raise exception 'Access denied' using errcode='42501'; end if;
 if turn_on and (facts is null or binding is null or facts !~ '^[0-9a-f]{64}$' or binding !~ '^[0-9a-f]{64}$') then raise exception 'Version required';end if;
 insert into public.nexops_social_policy(organization_id) values(o) on conflict do nothing;
 select * into p from public.nexops_social_policy where organization_id=o for update;
 update public.nexops_social_policy set enabled=turn_on,revision=revision+1,facts_hash=case when turn_on then facts else facts_hash end,binding_hash=case when turn_on then binding else binding_hash end,updated_by=auth.uid(),updated_at=now() where organization_id=o returning * into p;
 insert into public.nexops_social_audit(organization_id,actor_id,action) values(o,auth.uid(),case when turn_on then 'enabled' else 'disabled' end);
 return to_jsonb(p);
end $$;
create function public.nexops_social_claim_run(o uuid,facts text,binding text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.nexops_social_policy;r public.nexops_social_runs; d date:=(now() at time zone 'UTC')::date;
begin
 select * into p from public.nexops_social_policy where organization_id=o for update;
 if p.organization_id is null or not p.enabled or p.facts_hash is distinct from facts or p.binding_hash is distinct from binding then return jsonb_build_object('claimed',false,'reason','DISABLED_OR_VERSION_CHANGED');end if;
 if exists(select 1 from public.nexops_social_posts where organization_id=o and state in ('sending','delivery_unknown')) then return jsonb_build_object('claimed',false,'reason','UNKNOWN_DELIVERY_HELD');end if;
 insert into public.nexops_social_runs(organization_id,day,policy_revision) values(o,d,p.revision) on conflict do nothing returning * into r;
 return jsonb_build_object('claimed',r.id is not null,'runId',r.id,'day',d,'reason',case when r.id is null then 'DAILY_RUN_ALREADY_RESERVED' else null end);
end $$;
create function public.nexops_social_claim_tick(o uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.nexops_social_ticks(organization_id) values(o) on conflict do nothing;return found;
end $$;
create function public.nexops_social_reserve_ai(run uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.nexops_social_runs;p public.nexops_social_policy;m date;spent integer;
begin
 select * into r from public.nexops_social_runs where id=run;
 select * into p from public.nexops_social_policy where organization_id=r.organization_id for update;
 select * into r from public.nexops_social_runs where id=run for update;
 if r.id is null or p.organization_id is null or r.state<>'running' or r.expires_at<=now() or not p.enabled or p.revision<>r.policy_revision or r.ai_calls>=6 then return false;end if;
 m:=date_trunc('month',r.day)::date;
 insert into public.nexops_social_budget(organization_id,month) values(r.organization_id,m) on conflict do nothing;
 select reserved_cents into spent from public.nexops_social_budget where organization_id=r.organization_id and month=m for update;
 if spent+20>4000 then return false;end if;
 update public.nexops_social_budget set reserved_cents=reserved_cents+20 where organization_id=r.organization_id and month=m;
 update public.nexops_social_runs set ai_calls=ai_calls+1,reserved_cents=reserved_cents+20 where id=run;
 return true;
end $$;
create function public.nexops_social_candidate(run uuid,network_name text,copy text,hash text,ids jsonb,blocked text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.nexops_social_runs;
begin
 select * into r from public.nexops_social_runs where id=run and state='running' and expires_at>now();
 if r.id is null or network_name not in ('linkedin','threads','x') then return false;end if;
 if blocked is null and (hash is null or hash !~ '^[0-9a-f]{64}$' or copy is null or length(copy)>3000) then return false;end if;
 insert into public.nexops_social_posts(organization_id,day,network,run_id,state,content_hash,text,fact_ids,reason)
 values(r.organization_id,r.day,network_name,r.id,case when blocked is null then 'planned' else 'blocked' end,case when blocked is null then hash else null end,copy,ids,blocked) on conflict do nothing;
 return found;
end $$;
create function public.nexops_social_claim_post(run uuid,network_name text,hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.nexops_social_runs;p public.nexops_social_policy;token uuid:=gen_random_uuid();
begin
 select * into r from public.nexops_social_runs where id=run;
 select * into p from public.nexops_social_policy where organization_id=r.organization_id for update;
 if r.id is null or p.organization_id is null or not p.enabled or p.revision<>r.policy_revision or r.expires_at<=now() or r.state<>'running' then return jsonb_build_object('claimed',false);end if;
 if exists(select 1 from public.nexops_social_posts where organization_id=r.organization_id and network=network_name and state in ('sending','delivery_unknown')) then return jsonb_build_object('claimed',false);end if;
 update public.nexops_social_posts set state='sending',claim_token=token,updated_at=now() where run_id=run and network=network_name and state='planned' and content_hash=hash;
 return jsonb_build_object('claimed',found,'token',token);
end $$;
create function public.nexops_social_complete_post(run uuid,network_name text,token uuid,provider text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.nexops_social_posts set state=case when provider is null then 'delivery_unknown' else 'provider_accepted' end,provider_id=provider,updated_at=now() where run_id=run and network=network_name and state='sending' and claim_token=token;
 if not found then raise exception 'Claim mismatch';end if;
end $$;
revoke all on function public.nexops_social_admin(uuid),public.nexops_social_set_policy(uuid,boolean,text,text) from public,anon;
grant execute on function public.nexops_social_admin(uuid),public.nexops_social_set_policy(uuid,boolean,text,text) to authenticated;
revoke all on function public.nexops_social_claim_run(uuid,text,text),public.nexops_social_reserve_ai(uuid),public.nexops_social_candidate(uuid,text,text,text,jsonb,text),public.nexops_social_claim_post(uuid,text,text),public.nexops_social_complete_post(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.nexops_social_claim_tick(uuid) from public,anon,authenticated;
grant execute on function public.nexops_social_claim_tick(uuid) to service_role;
grant execute on function public.nexops_social_claim_run(uuid,text,text),public.nexops_social_reserve_ai(uuid),public.nexops_social_candidate(uuid,text,text,text,jsonb,text),public.nexops_social_claim_post(uuid,text,text),public.nexops_social_complete_post(uuid,text,uuid,text) to service_role;

grant update on public.nexops_social_runs,public.nexops_social_posts to service_role;
grant insert,update on public.nexops_social_snapshots to service_role;
grant insert on public.nexops_social_alerts to service_role;
-- Restrict inherited/default sequence ACLs too; only SECURITY DEFINER RPC inserts audit rows.
revoke all on sequence public.nexops_social_audit_id_seq from public,anon,authenticated,service_role;
do $mark$ declare r record; begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'nexops_social_%' loop
 execute format('comment on table public.%I is %L',r.relname,'nexops-social-b6915d7-additive-v1');end loop;
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'nexops_social_%' loop
 execute format('comment on function %s is %L',r.signature,'nexops-social-b6915d7-additive-v1');end loop;
end $mark$;
-- No policy rows seeded: absence means OFF. No cron, Auth, legacy data or base ACL changes.
commit;
