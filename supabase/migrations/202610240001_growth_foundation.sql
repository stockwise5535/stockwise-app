-- Additive migration; does not modify legacy tables, policies or signup triggers.
begin;
create table public.nexops_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en','ja')),
  marketing_opt_in boolean not null default false,
  trial_start_date timestamptz not null default now(),
  trial_end_date timestamptz not null default (now()+interval '30 days'),
  trial_status text not null default 'free' check (trial_status in ('free','extended','ended')),
  created_at timestamptz not null default now(),
  check(trial_end_date > trial_start_date)
);
create table public.nexops_organizations (
  id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.nexops_organization_memberships (
  organization_id uuid not null references public.nexops_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','member')), primary key(organization_id,user_id)
);
create table public.nexops_workspaces (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.nexops_organizations(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 160),
  workspace_type text not null check(workspace_type in ('demo','customer')),
  market text not null default 'OTHER_APAC' check(market in ('JP','SG','AU','NZ','HK','KR','TW','OTHER_APAC')),
  locale text not null default 'en' check(locale in ('en','ja')),
  created_by uuid not null references auth.users(id), is_starter boolean not null default false,
  request_id uuid not null default gen_random_uuid(), created_at timestamptz not null default now(),
  unique(created_by,request_id), unique(organization_id,id), check(not is_starter or workspace_type='demo')
);
create unique index nexops_one_starter on public.nexops_workspaces(created_by) where is_starter;
create table public.nexops_workspace_memberships (
  workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','admin','operator','viewer')), primary key(workspace_id,user_id)
);
create index nexops_membership_by_user on public.nexops_workspace_memberships(user_id,workspace_id);
create table public.nexops_activation (
  workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  demo_opened_at timestamptz, today_viewed_at timestamptz, exception_opened_at timestamptz,
  first_value_at timestamptz, csv_uploaded_at timestamptz, activated_at timestamptz,
  primary key(workspace_id,user_id)
);
create table public.nexops_events (
  id bigint generated always as identity primary key, event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.nexops_workspaces(id) on delete cascade,
  event_name text not null, properties jsonb not null default '{}', occurred_at timestamptz not null default now(),
  unique(user_id,event_id)
);
create index nexops_events_funnel on public.nexops_events(event_name,occurred_at,user_id);
create index nexops_events_user on public.nexops_events(user_id,occurred_at);
create table public.nexops_consultation_leads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  submitted_by uuid not null references auth.users(id), request_id uuid not null,
  company text not null check(length(trim(company)) between 1 and 160),
  contact_name text not null check(length(trim(contact_name)) between 1 and 120),
  email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null default '' check(length(role)<=120), industry text not null default '' check(length(industry)<=120),
  market text not null check(market in ('JP','SG','AU','NZ','HK','KR','TW','OTHER_APAC')),
  company_size text not null default 'unspecified' check(company_size in ('unspecified','1-10','11-50','51-200','201+')),
  sku_count integer check(sku_count between 0 and 10000000), supplier_count integer check(supplier_count between 0 and 1000000),
  tools text not null default '' check(length(tools)<=500), main_problem text not null check(length(trim(main_problem)) between 1 and 4000),
  hiring boolean not null default false, pilot_scope text not null default '' check(length(pilot_scope)<=2000),
  source text not null default 'consultation_request', created_at timestamptz not null default now(),
  unique(workspace_id,request_id), unique(workspace_id,id)
);
create table public.nexops_lead_qualification (
  workspace_id uuid not null, lead_id uuid not null,
  score integer not null check(score between 0 and 100),
  status text not null check(status in ('Unqualified','Product User','Potential Business Lead','Qualified Lead','Consultation','Pilot Candidate')),
  reasons jsonb not null default '[]', updated_at timestamptz not null default now(),
  primary key(workspace_id,lead_id), foreign key(workspace_id,lead_id) references public.nexops_consultation_leads(workspace_id,id) on delete cascade
);
create table public.nexops_audit (
  id bigint generated always as identity primary key, workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null, kind text not null, record_id uuid, created_at timestamptz not null default now()
);
create table public.nexops_invitations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(), created_by uuid not null references auth.users(id),
  role text not null default 'viewer' check(role in ('viewer','operator')),
  expires_at timestamptz not null default (now()+interval '7 days'), accepted_by uuid references auth.users(id), accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.nexops_communication_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('welcome','activation_reminder','csv_reminder','consultation_reminder','pilot_followup')),
  status text not null default 'draft' check(status in ('draft','approved','sent','cancelled')),
  created_at timestamptz not null default now(), sent_at timestamptz,
  primary key(user_id,kind)
);
create table public.nexops_growth_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.nexops_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade, requested_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','processing','completed'))
);
-- Future customer operational storage: no demo seed or browser upload path.
create table public.nexops_data_imports (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  source_kind text not null check(source_kind='customer'), filename text not null, imported_at timestamptz not null default now(),
  validation_status text not null check(validation_status in ('pending','valid','invalid')), unique(workspace_id,id)
);
create table public.nexops_exceptions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  import_id uuid not null, status text not null default 'Open', details jsonb not null,
  unique(workspace_id,id), foreign key(workspace_id,import_id) references public.nexops_data_imports(workspace_id,id)
);
create table public.nexops_actions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  status text not null default 'Open', approval_required boolean not null default true,
  unique(workspace_id,id)
);
create table public.nexops_action_exceptions (
  workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  action_id uuid not null, exception_id uuid not null, primary key(workspace_id,action_id,exception_id),
  foreign key(workspace_id,action_id) references public.nexops_actions(workspace_id,id),
  foreign key(workspace_id,exception_id) references public.nexops_exceptions(workspace_id,id)
);
create table public.nexops_decisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  action_id uuid not null, status text not null default 'Pending',
  foreign key(workspace_id,action_id) references public.nexops_actions(workspace_id,id)
);
create table public.nexops_agent_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.nexops_workspaces(id) on delete cascade,
  agent_type text not null, status text not null default 'planned' check(status in ('planned','draft','reviewed','cancelled')),
  created_at timestamptz not null default now()
);

create function public.nexops_workspace_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.nexops_workspace_memberships where workspace_id=p_id and user_id=auth.uid()
$$;
create function public.nexops_org_member(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nexops_organization_memberships where organization_id=p_id and user_id=auth.uid())
$$;
-- Default-deny all direct writes, including future operations and audit state.
do $$ declare t text; begin
 foreach t in array array['profiles','organizations','organization_memberships','workspaces','workspace_memberships','activation','events','consultation_leads','lead_qualification','audit','invitations','communication_state','growth_admins','deletion_requests','data_imports','exceptions','actions','action_exceptions','decisions','agent_runs'] loop
  execute format('alter table public.nexops_%I enable row level security',t);
  execute format('revoke all on public.nexops_%I from public, anon, authenticated',t);
 end loop;
end $$;
grant select on public.nexops_profiles,public.nexops_organizations,public.nexops_organization_memberships,public.nexops_workspaces,public.nexops_workspace_memberships,public.nexops_activation,public.nexops_consultation_leads,public.nexops_lead_qualification,public.nexops_audit,public.nexops_invitations,public.nexops_communication_state,public.nexops_deletion_requests to authenticated;
create policy profile_self on public.nexops_profiles for select to authenticated using(user_id=auth.uid());
create policy org_member on public.nexops_organizations for select to authenticated using(public.nexops_org_member(id));
create policy org_members on public.nexops_organization_memberships for select to authenticated using(public.nexops_org_member(organization_id));
create policy workspace_member on public.nexops_workspaces for select to authenticated using(public.nexops_workspace_role(id) is not null);
create policy workspace_members on public.nexops_workspace_memberships for select to authenticated using(public.nexops_workspace_role(workspace_id) is not null);
create policy activation_self on public.nexops_activation for select to authenticated using(user_id=auth.uid() and public.nexops_workspace_role(workspace_id) is not null);
create policy lead_member on public.nexops_consultation_leads for select to authenticated using(public.nexops_workspace_role(workspace_id) in ('owner','admin','operator'));
create policy qualification_member on public.nexops_lead_qualification for select to authenticated using(public.nexops_workspace_role(workspace_id) in ('owner','admin','operator'));
create policy audit_manager on public.nexops_audit for select to authenticated using(public.nexops_workspace_role(workspace_id) in ('owner','admin'));
create policy invite_manager on public.nexops_invitations for select to authenticated using(public.nexops_workspace_role(workspace_id) in ('owner','admin'));
create policy communication_self on public.nexops_communication_state for select to authenticated using(user_id=auth.uid());
create policy deletion_self on public.nexops_deletion_requests for select to authenticated using(user_id=auth.uid());

create function public.nexops_provision_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.nexops_profiles(user_id,trial_start_date,trial_end_date,created_at) values(new.id,new.created_at,new.created_at+interval '30 days',new.created_at) on conflict do nothing;
 insert into public.nexops_events(event_id,user_id,event_name,occurred_at) values(gen_random_uuid(),new.id,'signup_completed',new.created_at);
 return new;
end $$;
create trigger nexops_auth_signup after insert on auth.users for each row execute function public.nexops_provision_profile();
insert into public.nexops_profiles(user_id,trial_start_date,trial_end_date,created_at) select id,created_at,created_at+interval '30 days',created_at from auth.users on conflict do nothing;

create function public.nexops_bootstrap() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); o uuid; w uuid;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Confirmed sign-in required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,1));
 select id into w from public.nexops_workspaces where created_by=u and is_starter;
 if w is not null then return w; end if;
 insert into public.nexops_organizations(name,created_by) values('My organization',u) returning id into o;
 insert into public.nexops_organization_memberships values(o,u,'owner');
 insert into public.nexops_workspaces(organization_id,name,workspace_type,created_by,is_starter) values(o,'My demo workspace','demo',u,true) returning id into w;
 insert into public.nexops_workspace_memberships values(w,u,'owner');
 insert into public.nexops_activation(workspace_id,user_id) values(w,u);
 return w;
end $$;
create function public.nexops_create_workspace(p_name text,p_market text,p_locale text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); o uuid; w uuid;
begin
 perform public.nexops_bootstrap();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,1));
 select id into w from public.nexops_workspaces where created_by=u and request_id=p_request_id;
 if w is not null then return w; end if;
 select organization_id into o from public.nexops_workspaces where created_by=u and is_starter;
 insert into public.nexops_workspaces(organization_id,name,workspace_type,market,locale,created_by,request_id) values(o,trim(p_name),'customer',p_market,p_locale,u,p_request_id) returning id into w;
 insert into public.nexops_workspace_memberships values(w,u,'owner');
 insert into public.nexops_activation(workspace_id,user_id) values(w,u);
 insert into public.nexops_audit(workspace_id,actor_id,kind,record_id) values(w,u,'workspace_created',w);
 return w;
end $$;
create function public.nexops_track_event(p_event_name text,p_workspace_id uuid,p_properties jsonb,p_event_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n integer; k text;
begin
 if u is null or public.nexops_workspace_role(p_workspace_id) is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 if p_event_name not in ('login_completed','demo_workspace_opened','today_viewed','exception_opened','recommended_action_viewed','csv_upload_started','csv_upload_completed','consultation_clicked','consultation_submitted','supplier_monitoring_viewed','invite_sent','invite_accepted') then raise exception 'Unsupported event'; end if;
 if jsonb_typeof(p_properties)<>'object' or length(p_properties::text)>2000 then raise exception 'Invalid event properties'; end if;
 for k in select jsonb_object_keys(p_properties) loop
  if k not in ('locale','market','workspace_type','data_mode','screen','referral_source') or jsonb_typeof(p_properties->k)<>'string' or length(p_properties->>k)>80 then raise exception 'Unsafe event property'; end if;
 end loop;
 if p_event_name='csv_upload_completed' and (not exists(select 1 from public.nexops_workspaces where id=p_workspace_id and workspace_type='customer') or not exists(select 1 from public.nexops_data_imports where workspace_id=p_workspace_id and validation_status='valid')) then raise exception 'CSV activation requires a validated import in a customer workspace'; end if;
 insert into public.nexops_events(event_id,user_id,workspace_id,event_name,properties) values(p_event_id,u,p_workspace_id,p_event_name,p_properties || (select jsonb_build_object('workspace_type',workspace_type,'data_mode',case when workspace_type='demo' then 'synthetic' else 'customer' end) from public.nexops_workspaces where id=p_workspace_id)) on conflict do nothing;
 get diagnostics n=row_count; if n=0 then return; end if;
 if p_event_name='login_completed' and exists(select 1 from public.nexops_events where user_id=u and occurred_at<date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') then
  insert into public.nexops_events(event_id,user_id,workspace_id,event_name) select gen_random_uuid(),u,p_workspace_id,'user_returned' where not exists(select 1 from public.nexops_events where user_id=u and event_name='user_returned' and occurred_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
 end if;
 insert into public.nexops_activation(workspace_id,user_id) values(p_workspace_id,u) on conflict do nothing;
 update public.nexops_activation set
  demo_opened_at=case when p_event_name='demo_workspace_opened' then coalesce(demo_opened_at,now()) else demo_opened_at end,
  today_viewed_at=case when p_event_name='today_viewed' then coalesce(today_viewed_at,now()) else today_viewed_at end,
  exception_opened_at=case when p_event_name='exception_opened' then coalesce(exception_opened_at,now()) else exception_opened_at end,
  first_value_at=case when p_event_name='recommended_action_viewed' then coalesce(first_value_at,now()) else first_value_at end,
  csv_uploaded_at=case when p_event_name='csv_upload_completed' then coalesce(csv_uploaded_at,now()) else csv_uploaded_at end
 where workspace_id=p_workspace_id and user_id=u;
 update public.nexops_activation set activated_at=now() where workspace_id=p_workspace_id and user_id=u and activated_at is null and today_viewed_at is not null and exception_opened_at is not null and first_value_at is not null;
 get diagnostics n=row_count;
 if n>0 then insert into public.nexops_events(event_id,user_id,workspace_id,event_name) values(gen_random_uuid(),u,p_workspace_id,'activation_completed'); end if;
end $$;
create function public.nexops_submit_consultation(p_workspace_id uuid,p_details jsonb,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); l uuid; score integer:=0; signals jsonb:='[]'; qualified text;
begin
 if public.nexops_workspace_role(p_workspace_id) not in ('owner','admin','operator') or public.nexops_workspace_role(p_workspace_id) is null then raise exception 'Lead write denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,2));
 select id into l from public.nexops_consultation_leads where workspace_id=p_workspace_id and request_id=p_request_id;
 if l is not null then return l; end if;
 insert into public.nexops_consultation_leads(workspace_id,submitted_by,request_id,company,contact_name,email,role,industry,market,company_size,sku_count,supplier_count,tools,main_problem,hiring,pilot_scope)
 values(p_workspace_id,u,p_request_id,trim(p_details->>'company'),trim(p_details->>'contact_name'),lower(trim(p_details->>'email')),coalesce(p_details->>'role',''),coalesce(p_details->>'industry',''),p_details->>'market',coalesce(p_details->>'company_size','unspecified'),nullif(p_details->>'sku_count','')::integer,nullif(p_details->>'supplier_count','')::integer,coalesce(p_details->>'tools',''),trim(p_details->>'main_problem'),coalesce((p_details->>'hiring')::boolean,false),coalesce(p_details->>'pilot_scope','')) returning id into l;
 if split_part(lower(p_details->>'email'),'@',2) not in ('gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','live.com') then score:=score+20; signals:=signals||'"business_email_signal"'::jsonb; end if;
 if lower(p_details->>'role') ~ '(supply|procure|operations|logistic|purchas)' then score:=score+20; signals:=signals||'"operations_role"'::jsonb; end if;
 if coalesce(p_details->>'company_size','unspecified') not in ('unspecified','1-10') then score:=score+10; end if;
 if coalesce(nullif(p_details->>'sku_count','')::integer,0)>=100 then score:=score+10; end if;
 if coalesce(nullif(p_details->>'supplier_count','')::integer,0)>=10 then score:=score+10; end if;
 score:=score+20; signals:=signals||'"consultation_requested"'::jsonb;
 qualified:=case when score>=60 then 'Qualified Lead' when score>=30 then 'Potential Business Lead' else 'Product User' end;
 insert into public.nexops_lead_qualification values(p_workspace_id,l,score,qualified,signals,now());
 insert into public.nexops_audit(workspace_id,actor_id,kind,record_id) values(p_workspace_id,u,'consultation_submitted',l);
 perform public.nexops_track_event('consultation_submitted',p_workspace_id,'{}',p_request_id);
 return l;
end $$;
create function public.nexops_create_invite(p_workspace_id uuid,p_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare token_id uuid;
begin
 if coalesce(public.nexops_workspace_role(p_workspace_id),'') not in ('owner','admin') then raise exception 'Invite denied' using errcode='42501'; end if;
 insert into public.nexops_invitations(workspace_id,created_by,role) values(p_workspace_id,auth.uid(),p_role) returning token into token_id;
 perform public.nexops_track_event('invite_sent',p_workspace_id,'{}',gen_random_uuid());
 return token_id;
end $$;
create function public.nexops_accept_invite(p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.nexops_invitations; o uuid;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirmed sign-in required' using errcode='42501'; end if;
 select * into i from public.nexops_invitations where token=p_token for update;
 if i.id is null or i.expires_at<=now() or (i.accepted_by is not null and i.accepted_by<>auth.uid()) then raise exception 'Invalid or expired invitation'; end if;
 if i.accepted_by=auth.uid() then return i.workspace_id; end if;
 select organization_id into o from public.nexops_workspaces where id=i.workspace_id;
 insert into public.nexops_organization_memberships values(o,auth.uid(),'member') on conflict do nothing;
 insert into public.nexops_workspace_memberships values(i.workspace_id,auth.uid(),i.role) on conflict do nothing;
 update public.nexops_invitations set accepted_by=auth.uid(),accepted_at=now() where id=i.id;
 perform public.nexops_track_event('invite_accepted',i.workspace_id,'{}',i.id);
 return i.workspace_id;
end $$;
create function public.nexops_set_preferences(p_marketing_opt_in boolean,p_locale text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_marketing_opt_in is null then raise exception 'Sign-in and explicit preference required'; end if;
 update public.nexops_profiles set marketing_opt_in=p_marketing_opt_in,locale=p_locale where user_id=auth.uid();
 if not p_marketing_opt_in then update public.nexops_communication_state set status='cancelled' where user_id=auth.uid() and kind<>'welcome' and status in ('draft','approved'); end if;
end $$;
create function public.nexops_request_deletion() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign-in required'; end if;
 insert into public.nexops_deletion_requests(user_id) values(auth.uid()) on conflict do nothing;
 update public.nexops_profiles set marketing_opt_in=false where user_id=auth.uid();
 update public.nexops_communication_state set status='cancelled' where user_id=auth.uid() and status in ('draft','approved');
end $$;
create function public.nexops_growth_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.nexops_growth_admins where user_id=auth.uid()) then raise exception 'Growth admin access required' using errcode='42501'; end if;
 return jsonb_build_object(
  'visitors',null,'signup_starts',null,
  'registered_users',(select count(*) from public.nexops_profiles),
  'activated_users',(select count(distinct user_id) from public.nexops_activation where activated_at is not null),
  'csv_upload_users',(select count(distinct user_id) from public.nexops_activation where csv_uploaded_at is not null),
  'activated_csv_users',(select count(distinct user_id) from public.nexops_activation where activated_at is not null and csv_uploaded_at is not null),
  'activated_consultation_users',(select count(distinct l.submitted_by) from public.nexops_consultation_leads l where exists(select 1 from public.nexops_activation a where a.user_id=l.submitted_by and a.activated_at is not null)),
  'returning_users',(select count(distinct user_id) from public.nexops_events where event_name='user_returned'),
  'consultation_leads',(select count(*) from public.nexops_consultation_leads),
  'qualified_companies',(select count(distinct lower(l.company)) from public.nexops_consultation_leads l join public.nexops_lead_qualification q on q.lead_id=l.id and q.workspace_id=l.workspace_id where q.status in ('Qualified Lead','Consultation','Pilot Candidate'))
 );
end $$;
-- Minimize callable surface. No generic SQL, arbitrary actor or client-writable audit RPC.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'nexops_%' loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  if f.proname<>'nexops_provision_profile' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
commit;
