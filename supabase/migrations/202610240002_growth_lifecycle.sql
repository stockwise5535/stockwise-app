begin;
create function public.nexops_customer_import_only() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.nexops_workspaces where id=new.workspace_id and workspace_type='customer') then raise exception 'Operational records require a customer workspace'; end if;
 return new;
end $$;
create trigger nexops_customer_data_only before insert or update on public.nexops_data_imports for each row execute function public.nexops_customer_import_only();
do $$ declare t text; begin foreach t in array array['exceptions','actions','action_exceptions','decisions','agent_runs'] loop execute format('create trigger nexops_customer_data_only before insert or update on public.nexops_%I for each row execute function public.nexops_customer_import_only()',t); end loop; end $$;
revoke all on function public.nexops_customer_import_only() from public,anon,authenticated;
-- Prepares drafts only. Service-role scheduler needs explicit campaign cohort cutoff.
create function public.nexops_prepare_lifecycle(p_campaign_start timestamptz) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_campaign_start is null then raise exception 'Explicit campaign cohort required'; end if;
 insert into public.nexops_communication_state(user_id,kind)
 select p.user_id,kind from public.nexops_profiles p join auth.users u on u.id=p.user_id
 cross join lateral (
  select 'welcome'::text as kind
  union all select 'activation_reminder' where p.marketing_opt_in and p.trial_start_date<=now()-interval '24 hours' and not exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and a.activated_at is not null)
  union all select 'csv_reminder' where p.marketing_opt_in and p.trial_start_date<=now()-interval '72 hours' and exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and a.activated_at is not null) and not exists(select 1 from public.nexops_activation a where a.user_id=p.user_id and a.csv_uploaded_at is not null)
  union all select 'consultation_reminder' where p.marketing_opt_in and exists(select 1 from public.nexops_events e where e.user_id=p.user_id and e.event_name='consultation_clicked' and e.occurred_at<=now()-interval '24 hours') and not exists(select 1 from public.nexops_consultation_leads l where l.submitted_by=p.user_id)
 ) candidates
 where p.trial_start_date>=p_campaign_start and u.email_confirmed_at is not null and not exists(select 1 from public.nexops_deletion_requests d where d.user_id=p.user_id)
 on conflict do nothing;
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.nexops_prepare_lifecycle(timestamptz) from public,anon,authenticated;
grant execute on function public.nexops_prepare_lifecycle(timestamptz) to service_role;
commit;
