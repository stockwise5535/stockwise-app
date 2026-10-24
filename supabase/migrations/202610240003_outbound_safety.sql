-- Outbound preparation only. No provider calls, secrets, scheduled jobs or enabled sender.
begin;
create table public.nexops_email_templates (
 template_id text not null,version integer not null check(version>0),category text not null,
 subject_template text not null,body_template text not null,allowed_variables jsonb not null,
 automatic_send_allowed boolean not null,requires_consent boolean not null,requires_human_review boolean not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 approved_date timestamptz,approved_by uuid references auth.users(id),primary key(template_id,version)
);
create table public.nexops_outbound_reviewers (
 workspace_id uuid not null,user_id uuid not null,primary key(workspace_id,user_id),
 foreign key(workspace_id,user_id) references public.nexops_workspace_memberships(workspace_id,user_id) on delete cascade
);
create table public.nexops_email_suppressions (
 email text not null check(email=lower(trim(email))),category text not null default '*',
 reason text not null check(reason in ('unsubscribed','suppressed','invalid')),created_at timestamptz not null default now(),
 primary key(email,category)
);
create table public.nexops_mail_runtime (
 singleton boolean primary key default true check(singleton),sending_enabled boolean not null default false,
 sender_email text,oauth_verified_at timestamptz,delivery_test_verified_at timestamptz,delivery_test_message_id uuid,
 hourly_limit integer not null default 10 check(hourly_limit between 1 and 10),
 daily_limit integer not null default 50 check(daily_limit between 1 and 50),
 recipient_interval interval not null default interval '24 hours' check(recipient_interval>=interval '24 hours')
);
insert into public.nexops_mail_runtime(singleton) values(true);
create table public.nexops_outbound_messages (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.nexops_workspaces(id),
 recipient_user_id uuid not null references auth.users(id),recipient_email text not null,
 category text not null,template_id text not null,template_version integer not null,
 subject text not null check(length(subject) between 1 and 300),body text not null check(length(body) between 1 and 20000),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),idempotency_key text not null check(length(idempotency_key)=64),
 source_event text not null check(length(source_event) between 1 and 300),
 related_action_id uuid,related_exception_id uuid,related_consultation_id uuid,
 created_at timestamptz not null default now(),proposed_send_at timestamptz not null default now(),
 status text not null default 'pending_review' check(status in ('draft','pending_review','queued','sending','sent','blocked','rejected','cancelled','delivery_unknown')),
 gate_outcome text check(gate_outcome in ('AUTO_SEND_ALLOWED','HUMAN_REVIEW_REQUIRED','BLOCKED')),
 risk_flags jsonb not null default '[]',review_reasons jsonb not null default '[]',reviewed_hash text,reviewed_by uuid references auth.users(id),
 claimed_at timestamptz,claim_token uuid,provider_id text,finished_at timestamptz,
 unique(workspace_id,idempotency_key),foreign key(template_id,template_version) references public.nexops_email_templates(template_id,version),
 foreign key(workspace_id,related_action_id) references public.nexops_actions(workspace_id,id),
 foreign key(workspace_id,related_exception_id) references public.nexops_exceptions(workspace_id,id),
 foreign key(workspace_id,related_consultation_id) references public.nexops_consultation_leads(workspace_id,id)
);
create index nexops_outbound_rate on public.nexops_outbound_messages(claimed_at,status);
create index nexops_outbound_recipient_rate on public.nexops_outbound_messages(recipient_email,claimed_at);
create table public.nexops_outbound_history (
 id uuid primary key default gen_random_uuid(),message_id uuid not null references public.nexops_outbound_messages(id),
 actor_id uuid references auth.users(id),kind text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create function public.nexops_can_review_outbound(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nexops_outbound_reviewers where workspace_id=w and user_id=auth.uid()) and public.nexops_workspace_role(w) is not null
$$;
do $$ declare t text;begin foreach t in array array['email_templates','outbound_reviewers','email_suppressions','mail_runtime','outbound_messages','outbound_history'] loop
 execute format('alter table public.nexops_%I enable row level security',t);
 execute format('revoke all on public.nexops_%I from public,anon,authenticated',t);
end loop;end $$;
grant select on public.nexops_email_templates,public.nexops_outbound_messages,public.nexops_outbound_history to authenticated;
create function public.nexops_is_growth_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.nexops_growth_admins where user_id=auth.uid())$$;
create policy email_template_admin on public.nexops_email_templates for select to authenticated using(public.nexops_is_growth_admin());
create policy outbound_queue_reader on public.nexops_outbound_messages for select to authenticated using(public.nexops_workspace_role(workspace_id) in ('owner','admin') or public.nexops_can_review_outbound(workspace_id));
create policy outbound_history_reader on public.nexops_outbound_history for select to authenticated using(exists(select 1 from public.nexops_outbound_messages m where m.id=message_id));
create function public.nexops_email_content_hash(p_email text,p_subject text,p_body text) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(p_email||E'\n'||p_subject||E'\n'||p_body,'UTF8')),'hex')$$;
create function public.nexops_register_email_template(p_template jsonb) returns void language plpgsql security definer set search_path='' as $$
declare old public.nexops_email_templates;
begin
 select * into old from public.nexops_email_templates where template_id=p_template->>'template_id' and version=(p_template->>'version')::integer for update;
 if old.template_id is not null then if old.content_hash<>p_template->>'content_hash' then raise exception 'Template changes require a new version';end if;return;end if;
 insert into public.nexops_email_templates(template_id,version,category,subject_template,body_template,allowed_variables,automatic_send_allowed,requires_consent,requires_human_review,content_hash)
 values(p_template->>'template_id',(p_template->>'version')::integer,p_template->>'category',p_template->>'subject_template',p_template->>'body_template',p_template->'allowed_variables',(p_template->>'automatic_send_allowed')::boolean,(p_template->>'requires_consent')::boolean,(p_template->>'requires_human_review')::boolean,p_template->>'content_hash');
end $$;
create function public.nexops_approve_email_template(p_id text,p_version integer,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.nexops_is_growth_admin() then raise exception 'Template administrator required' using errcode='42501';end if;
 update public.nexops_email_templates set status='approved',approved_date=now(),approved_by=auth.uid() where template_id=p_id and version=p_version and content_hash=p_hash;
 if not found then raise exception 'Template version/hash mismatch';end if;
end $$;
create function public.nexops_enqueue_outbound(p_message jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=(p_message->>'recipient_user_id')::uuid;w uuid:=(p_message->>'workspace_id')::uuid;e text;h text;m public.nexops_outbound_messages;
begin
 select lower(email) into e from auth.users where id=u and email_confirmed_at is not null;
 if e is null or not exists(select 1 from public.nexops_workspace_memberships where workspace_id=w and user_id=u) then raise exception 'Confirmed workspace recipient required';end if;
 if not exists(select 1 from public.nexops_email_templates where template_id=p_message->>'template_id' and version=(p_message->>'template_version')::integer and category=p_message->>'category') then raise exception 'Template/category mismatch';end if;
 h:=public.nexops_email_content_hash(e,p_message->>'subject',p_message->>'body');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w::text||coalesce(p_message->>'idempotency_key',''),3));
 select * into m from public.nexops_outbound_messages where workspace_id=w and idempotency_key=p_message->>'idempotency_key';
 if m.id is not null then if m.content_hash<>h or m.recipient_user_id<>u or m.category<>p_message->>'category' or m.template_id<>p_message->>'template_id' or m.template_version<>(p_message->>'template_version')::integer or m.source_event<>p_message->>'source_event' then raise exception 'Idempotency key reused for different content';end if;return m.id;end if;
 insert into public.nexops_outbound_messages(workspace_id,recipient_user_id,recipient_email,category,template_id,template_version,subject,body,content_hash,idempotency_key,source_event,related_action_id,related_exception_id,related_consultation_id,proposed_send_at)
 values(w,u,e,p_message->>'category',p_message->>'template_id',(p_message->>'template_version')::integer,p_message->>'subject',p_message->>'body',h,p_message->>'idempotency_key',p_message->>'source_event',nullif(p_message->>'related_action_id','')::uuid,nullif(p_message->>'related_exception_id','')::uuid,nullif(p_message->>'related_consultation_id','')::uuid,coalesce((p_message->>'proposed_send_at')::timestamptz,now())) returning * into m;
 insert into public.nexops_outbound_history(message_id,kind) values(m.id,'prepared');return m.id;
end $$;
create function public.nexops_load_outbound(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('message',to_jsonb(m),'automaticDeliveryVerified',(select delivery_test_verified_at is not null from public.nexops_mail_runtime where singleton),'reviewedHash',m.reviewed_hash,'templateApproval',to_jsonb(t),'recipient',jsonb_build_object(
 'registered',u.id is not null,'emailVerified',u.email_confirmed_at is not null,'email',lower(u.email),
 'trialEnd',p.trial_end_date,'marketingOptIn',p.marketing_opt_in,'deletionRequested',exists(select 1 from public.nexops_deletion_requests d where d.user_id=u.id),
 'suppressed',exists(select 1 from public.nexops_email_suppressions s where s.email=lower(u.email) and s.category in ('*',m.category))))
 from public.nexops_outbound_messages m join auth.users u on u.id=m.recipient_user_id join public.nexops_profiles p on p.user_id=u.id join public.nexops_email_templates t on t.template_id=m.template_id and t.version=m.template_version where m.id=p_id
$$;
create function public.nexops_record_outbound_gate(p_id uuid,p_gate jsonb,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.nexops_outbound_messages set gate_outcome=p_gate->>'decision',risk_flags=p_gate->'risk_flags',review_reasons=p_gate->'reasons',status=case when p_gate->>'decision'='BLOCKED' then 'blocked' when p_gate->>'decision'='AUTO_SEND_ALLOWED' or reviewed_hash=content_hash then 'queued' else 'pending_review' end where id=p_id and content_hash=p_hash and status in ('pending_review','queued');
 if found then insert into public.nexops_outbound_history(message_id,kind,details) values(p_id,'safety_gate',p_gate);end if;
end $$;
create function public.nexops_review_outbound(p_id uuid,p_action text,p_subject text default null,p_body text default null,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare m public.nexops_outbound_messages;before_hash text;
begin
 select * into m from public.nexops_outbound_messages where id=p_id for update;
 if m.id is null or not public.nexops_can_review_outbound(m.workspace_id) then raise exception 'Assigned outbound reviewer required' using errcode='42501';end if;
 if m.status in ('sent','sending','delivery_unknown') then raise exception 'In-flight/sent/ambiguous delivery cannot be requeued';end if;
 if p_action not in ('Approve and Send','Edit and Send','Reject','Cancel','Save as Draft') or length(trim(p_reason)) not between 1 and 2000 then raise exception 'Review action and reason required';end if;
 before_hash:=m.content_hash;
 if p_action='Approve and Send' and ((p_subject is not null and p_subject<>m.subject) or (p_body is not null and p_body<>m.body)) then raise exception 'Use Edit and Send for edited content';end if;
 if p_action in ('Edit and Send','Save as Draft') and (p_subject is not null or p_body is not null) then
  if p_subject is null or p_body is null then raise exception 'Edited subject and body required';end if;
  m.subject:=p_subject;m.body:=p_body;m.content_hash:=public.nexops_email_content_hash(m.recipient_email,m.subject,m.body);
 end if;
 update public.nexops_outbound_messages set subject=m.subject,body=m.body,content_hash=m.content_hash,
 status=case p_action when 'Reject' then 'rejected' when 'Cancel' then 'cancelled' when 'Save as Draft' then 'draft' else 'queued' end,
 gate_outcome=case when before_hash<>m.content_hash then null else gate_outcome end,
 reviewed_by=case when p_action in ('Approve and Send','Edit and Send') then auth.uid() else null end,
 reviewed_hash=case when p_action in ('Approve and Send','Edit and Send') then m.content_hash else null end where id=m.id;
 insert into public.nexops_outbound_history(message_id,actor_id,kind,details) values(m.id,auth.uid(),p_action,jsonb_build_object('reason',p_reason,'before_hash',before_hash,'approved_hash',m.content_hash,'subject',m.subject,'body',m.body));
end $$;
create function public.nexops_record_mail_connection(p_sender text) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.nexops_mail_runtime where singleton and sender_email is not null and sender_email<>lower(p_sender)) then raise exception 'Sender change requires administrative review';end if;
 update public.nexops_mail_runtime set sender_email=lower(p_sender),oauth_verified_at=now() where singleton;end $$;
create function public.nexops_enable_mail(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.nexops_is_growth_admin() then raise exception 'Mail administrator required' using errcode='42501';end if;
 if p_enabled and not exists(select 1 from public.nexops_mail_runtime where singleton and oauth_verified_at>now()-interval '24 hours') then raise exception 'Tested Gmail connection required';end if;
 update public.nexops_mail_runtime set sending_enabled=p_enabled where singleton;
end $$;
create function public.nexops_confirm_mail_test(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.nexops_is_growth_admin() then raise exception 'Mail administrator required' using errcode='42501';end if;
 if not exists(select 1 from public.nexops_outbound_messages m join public.nexops_mail_runtime r on r.singleton join auth.users u on u.id=auth.uid() where m.id=p_id and m.status='sent' and m.provider_id is not null and m.recipient_email=r.sender_email and lower(u.email)=r.sender_email and m.source_event='sender_connection_test' and m.reviewed_hash=m.content_hash) then raise exception 'A confirmed, reviewed self-addressed sender test is required';end if;
 update public.nexops_mail_runtime set delivery_test_verified_at=now(),delivery_test_message_id=p_id where singleton;
 insert into public.nexops_outbound_history(message_id,actor_id,kind) values(p_id,auth.uid(),'sender_test_confirmed');
end $$;
create function public.nexops_claim_outbound(p_id uuid,p_hash text,p_gate text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.nexops_outbound_messages;r public.nexops_mail_runtime;t public.nexops_email_templates;token uuid:=gen_random_uuid();denial text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexops-gmail-rate',4));
 select * into m from public.nexops_outbound_messages where id=p_id for update;
 select * into r from public.nexops_mail_runtime where singleton;
 select * into t from public.nexops_email_templates where template_id=m.template_id and version=m.template_version;
 if m.id is null or m.status<>'queued' or m.content_hash<>p_hash or m.proposed_send_at>now() then denial:='not_queued_or_content_changed';
 elsif m.gate_outcome is distinct from p_gate then denial:='current_safety_gate_required';
 elsif not r.sending_enabled or r.oauth_verified_at is null or r.oauth_verified_at<now()-interval '24 hours' then denial:='sender_disabled_or_unverified';
 elsif r.delivery_test_verified_at is null and (p_gate<>'HUMAN_REVIEW_REQUIRED' or m.recipient_email<>r.sender_email or m.source_event<>'sender_connection_test') then denial:='sender_delivery_test_required';
 elsif not exists(select 1 from auth.users u join public.nexops_profiles p on p.user_id=u.id where u.id=m.recipient_user_id and u.email_confirmed_at is not null and lower(u.email)=m.recipient_email and (not t.requires_consent or p.marketing_opt_in)) then denial:='recipient_or_consent_changed';
 elsif m.category='welcome' and not exists(select 1 from public.nexops_profiles where user_id=m.recipient_user_id and trial_end_date>now()) then denial:='free_access_claim_expired';
 elsif not exists(select 1 from public.nexops_workspace_memberships where workspace_id=m.workspace_id and user_id=m.recipient_user_id) or exists(select 1 from public.nexops_deletion_requests where user_id=m.recipient_user_id) or exists(select 1 from public.nexops_email_suppressions where email=m.recipient_email and category in ('*',m.category)) then denial:='recipient_suppressed_or_removed';
 elsif t.status='retired' then denial:='template_retired';
 elsif p_gate='AUTO_SEND_ALLOWED' and (t.status<>'approved' or not t.automatic_send_allowed or t.requires_human_review or t.approved_date is null) then denial:='template_not_approved_for_auto_send';
 elsif p_gate='HUMAN_REVIEW_REQUIRED' and (m.reviewed_hash is distinct from m.content_hash or not exists(select 1 from public.nexops_outbound_reviewers v join public.nexops_workspace_memberships b on b.workspace_id=v.workspace_id and b.user_id=v.user_id where v.workspace_id=m.workspace_id and v.user_id=m.reviewed_by)) then denial:='current_content_not_reviewed';
 elsif p_gate not in ('AUTO_SEND_ALLOWED','HUMAN_REVIEW_REQUIRED') or p_gate is null then denial:='invalid_gate';
 elsif (select count(*) from public.nexops_outbound_messages where claimed_at>now()-interval '1 hour' and status in ('sending','sent','delivery_unknown'))>=r.hourly_limit or (select count(*) from public.nexops_outbound_messages where claimed_at>now()-interval '1 day' and status in ('sending','sent','delivery_unknown'))>=r.daily_limit or exists(select 1 from public.nexops_outbound_messages where recipient_email=m.recipient_email and claimed_at>now()-r.recipient_interval and status in ('sending','sent','delivery_unknown')) then denial:='rate_limit';
 end if;
 if denial is not null then
  if m.id is not null then insert into public.nexops_outbound_history(message_id,kind,details) values(m.id,'claim_denied',jsonb_build_object('reason',denial));end if;
  return jsonb_build_object('claimed',false,'reason',denial);
 end if;
 update public.nexops_outbound_messages set status='sending',claimed_at=now(),claim_token=token where id=m.id;
 insert into public.nexops_outbound_history(message_id,kind) values(m.id,'send_claimed');
 return jsonb_build_object('claimed',true,'claimToken',token);
end $$;
create function public.nexops_complete_outbound(p_id uuid,p_token uuid,p_status text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','delivery_unknown') or (p_status='sent' and nullif(p_provider_id,'') is null) then raise exception 'Confirmed provider outcome required';end if;
 update public.nexops_outbound_messages set status=p_status,provider_id=p_provider_id,finished_at=now() where id=p_id and claim_token=p_token and status='sending';
 if not found then raise exception 'Message already completed or claim mismatch';end if;
 if p_status='sent' then update public.nexops_communication_state s set status='sent',sent_at=now() from public.nexops_outbound_messages m where m.id=p_id and m.source_event='lifecycle:'||m.category and s.user_id=m.recipient_user_id and s.kind=m.category and s.status in ('draft','approved');end if;
 insert into public.nexops_outbound_history(message_id,kind,details) values(p_id,p_status,jsonb_build_object('provider_id',p_provider_id));
end $$;
create function public.nexops_sender_test_context() returns jsonb language sql stable security definer set search_path='' as $$
 select (select jsonb_build_object('user_id',u.id,'workspace_id',w.id,'sender_email',r.sender_email)
 from public.nexops_mail_runtime r join auth.users u on lower(u.email)=r.sender_email and u.email_confirmed_at is not null
 join public.nexops_workspaces w on w.created_by=u.id and w.is_starter
 join public.nexops_workspace_memberships b on b.workspace_id=w.id and b.user_id=u.id
 where r.singleton and r.oauth_verified_at>now()-interval '24 hours')
$$;
create function public.nexops_lifecycle_outbound_candidates(p_limit integer default 10) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_limit not between 1 and 10 or p_limit is null then raise exception 'Preparation limit must be 1-10';end if;
 return coalesce((select jsonb_agg(to_jsonb(c)) from (
 select s.user_id,s.kind,w.id as workspace_id from public.nexops_communication_state s
 join auth.users u on u.id=s.user_id join public.nexops_profiles p on p.user_id=u.id
 join public.nexops_workspaces w on w.created_by=u.id and w.is_starter
 where s.status in ('draft','approved') and u.email_confirmed_at is not null
 and (s.kind='welcome' or p.marketing_opt_in) and not exists(select 1 from public.nexops_email_suppressions x where x.email=lower(u.email) and x.category in ('*',s.kind)) and not exists(select 1 from public.nexops_deletion_requests d where d.user_id=u.id)
 order by s.created_at,s.user_id,s.kind limit p_limit) c),'[]'::jsonb);
end $$;
-- Server-only functions; frontend can only read its queue and submit authorized reviews.
do $$ declare f text;begin foreach f in array array['nexops_sender_test_context()','nexops_lifecycle_outbound_candidates(integer)','nexops_register_email_template(jsonb)','nexops_enqueue_outbound(jsonb)','nexops_load_outbound(uuid)','nexops_record_outbound_gate(uuid,jsonb,text)','nexops_record_mail_connection(text)','nexops_claim_outbound(uuid,text,text)','nexops_complete_outbound(uuid,uuid,text,text)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);execute format('grant execute on function public.%s to service_role',f);
end loop;end $$;
revoke all on function public.nexops_can_review_outbound(uuid),public.nexops_is_growth_admin(),public.nexops_approve_email_template(text,integer,text),public.nexops_review_outbound(uuid,text,text,text,text),public.nexops_enable_mail(boolean),public.nexops_confirm_mail_test(uuid),public.nexops_email_content_hash(text,text,text) from public,anon,authenticated;
grant execute on function public.nexops_can_review_outbound(uuid),public.nexops_is_growth_admin(),public.nexops_approve_email_template(text,integer,text),public.nexops_review_outbound(uuid,text,text,text,text),public.nexops_enable_mail(boolean),public.nexops_confirm_mail_test(uuid) to authenticated;
commit;
