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
-- Reviewed local-only RPC proposal. No provider operations are performed here.
create function public.nexops_crm_guard(w uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.nexops_is_growth_admin() or coalesce(public.nexops_workspace_role(w),'') not in ('owner','admin') then raise exception 'CRM access denied';end if;
end $$;
create function public.nexops_crm_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'CRM audit is append only';end $$;
create trigger immutable_approval before update or delete on public.nexops_growth_approvals for each row execute function public.nexops_crm_audit_immutable();
create trigger immutable_activity before update or delete on public.nexops_crm_activity for each row execute function public.nexops_crm_audit_immutable();
create function public.nexops_crm_content_guard() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then
  if new.version<>1 or new.status<>'draft' then raise exception 'New items must be draft version 1';end if;
 elsif new.payload is distinct from old.payload then
  if old.status in ('sending','scheduled','published','measured','sent','delivery_unknown') then raise exception 'Claimed content is immutable';end if;
  new.version:=old.version+1;new.status:='draft';
 elsif new.version<>old.version then raise exception 'Version is derived from content';
 end if;
 new.content_hash:=encode(sha256(convert_to(new.payload::text,'UTF8')),'hex');
 return new;
end $$;
create trigger campaign_content before insert or update on public.nexops_growth_campaign_items for each row execute function public.nexops_crm_content_guard();
create function public.nexops_crm_save_draft(w uuid,p_payload jsonb,p_kind text,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 perform public.nexops_crm_guard(w);
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384 then raise exception 'Invalid payload';end if;
 if p_id is null then
  insert into public.nexops_growth_campaign_items(workspace_id,kind,payload,content_hash) values(w,p_kind,p_payload,repeat('0',64)) returning id into result;
 else
  update public.nexops_growth_campaign_items set payload=p_payload where workspace_id=w and id=p_id and kind=p_kind returning id into result;
  if result is null then raise exception 'Item unavailable';end if;
 end if;
 insert into public.nexops_crm_activity(workspace_id,kind,record_id,actor_id) values(w,'draft',result,auth.uid());
 return result;
end $$;
create function public.nexops_crm_approve(w uuid,p_id uuid,p_version integer,p_hash text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.nexops_growth_campaign_items;
begin
 perform public.nexops_crm_guard(w);
 select * into item from public.nexops_growth_campaign_items where workspace_id=w and id=p_id for update;
 if not found or item.version<>p_version or item.content_hash<>p_hash or item.status not in ('draft','review','approved') then raise exception 'Approval content mismatch';end if;
 insert into public.nexops_growth_approvals(workspace_id,item_id,version,approved_by,content_hash) values(w,p_id,p_version,auth.uid(),p_hash) on conflict do nothing;
 update public.nexops_growth_campaign_items set status='approved' where workspace_id=w and id=p_id;
 insert into public.nexops_crm_activity(workspace_id,kind,record_id,actor_id,source_event_id) values(w,'approval',p_id,auth.uid(),'approval:'||p_id::text||':'||p_version::text) on conflict(workspace_id,source_event_id) do nothing;
end $$;
create function public.nexops_crm_approval_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.nexops_crm_guard(new.workspace_id);
 if new.approved_by is distinct from auth.uid() or not exists(select 1 from public.nexops_growth_campaign_items where workspace_id=new.workspace_id and id=new.item_id and version=new.version and content_hash=new.content_hash and status in ('draft','review','approved')) then raise exception 'Approval content or actor mismatch';end if;
 return new;
end $$;
create trigger approval_binding before insert on public.nexops_growth_approvals for each row execute function public.nexops_crm_approval_guard();
revoke all on function public.nexops_crm_approval_guard() from public,anon,authenticated;
-- Reservation only: NOT an authorization to send. Provider safety/consent gates remain required.
create function public.nexops_crm_claim(w uuid,p_id uuid,p_version integer,p_hash text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.nexops_growth_campaign_items; result uuid; identity text;
begin
 perform public.nexops_crm_guard(w);
 -- Serialize quotas and identical content across all items in a workspace.
 perform pg_advisory_xact_lock(hashtextextended(w::text,0));
 select * into item from public.nexops_growth_campaign_items where workspace_id=w and id=p_id for update;
 if not found or item.status<>'approved' or item.version<>p_version or item.content_hash<>p_hash then raise exception 'Claim denied';end if;
 if not exists(select 1 from public.nexops_growth_approvals where workspace_id=w and item_id=p_id and version=p_version and content_hash=p_hash) then raise exception 'Current approval required';end if;
 if (select count(*) from public.nexops_growth_delivery_attempts where workspace_id=w and attempted_at>now()-interval '1 hour')>=10 or (select count(*) from public.nexops_growth_delivery_attempts where workspace_id=w and attempted_at>now()-interval '1 day')>=50 then raise exception 'Rate limited';end if;
 identity:=encode(sha256(convert_to(item.kind||':'||item.content_hash,'UTF8')),'hex');
 insert into public.nexops_growth_delivery_attempts(workspace_id,item_id,identity_hash,state) values(w,p_id,identity,'sending') returning id into result;
 update public.nexops_growth_campaign_items set status='sending' where workspace_id=w and id=p_id;
 insert into public.nexops_crm_activity(workspace_id,kind,record_id,actor_id) values(w,'attempt',p_id,auth.uid());
 return result;
end $$;
revoke all on function public.nexops_crm_guard(uuid),public.nexops_crm_audit_immutable(),public.nexops_crm_content_guard(),public.nexops_crm_save_draft(uuid,jsonb,text,uuid),public.nexops_crm_approve(uuid,uuid,integer,text),public.nexops_crm_claim(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.nexops_crm_save_draft(uuid,jsonb,text,uuid),public.nexops_crm_approve(uuid,uuid,integer,text),public.nexops_crm_claim(uuid,uuid,integer,text) to authenticated;
-- Remaining production blockers: privacy field allowlist, CRUD for contacts/population,
-- suppression/provider reconciliation and distributed production verification.
commit;
