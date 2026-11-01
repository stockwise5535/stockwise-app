-- PROPOSAL ONLY. Apply to a hosted database only after explicit release approval.
-- Assumes the existing three NexOps migrations. Default OFF; no cron registration.
begin;
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
 execute format('grant all on public.%I to service_role','nexops_social_'||t);
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
commit;
