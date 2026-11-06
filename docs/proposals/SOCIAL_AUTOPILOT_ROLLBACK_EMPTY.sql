-- DESTRUCTIVE, UNAPPLIED proposal: only the EMPTY installation created by
-- SOCIAL_AUTOPILOT_PRODUCTION.sql. Separate approval required for production.
-- If ANY SNS data exists, retain it and use the application stop switch instead.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_catalog.pg_advisory_xact_lock(68269157);
do $$ declare t text; n bigint; f record; begin
 foreach t in array array['policy','runs','ticks','posts','budget','snapshots','alerts','audit'] loop
  if to_regclass('public.nexops_social_'||t) is null or obj_description(to_regclass('public.nexops_social_'||t),'pg_class') is distinct from 'nexops-social-b6915d7-additive-v1' then
   raise exception 'STOP: missing/unrecognized SNS table';end if;
  execute format('lock table public.%I in access exclusive mode','nexops_social_'||t);
  execute format('select count(*) from public.%I','nexops_social_'||t) into n;
  if n<>0 then raise exception 'STOP: SNS data exists; preserve history and deduplication';end if;
 end loop;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'nexops_social_%')<>8 then raise exception 'STOP: unexpected SNS function count';end if;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'nexops_social_%' loop
  if obj_description(f.oid,'pg_proc') is distinct from 'nexops-social-b6915d7-additive-v1' then raise exception 'STOP: unrecognized SNS function';end if;
 end loop;
end $$;
-- Explicit names, no CASCADE; unexpected dependencies roll back the whole transaction.
drop table public.nexops_social_posts;
drop table public.nexops_social_runs;
drop table public.nexops_social_ticks;
drop table public.nexops_social_budget;
drop table public.nexops_social_snapshots;
drop table public.nexops_social_alerts;
drop table public.nexops_social_audit;
drop table public.nexops_social_policy;
drop function public.nexops_social_admin(uuid);
drop function public.nexops_social_set_policy(uuid,boolean,text,text);
drop function public.nexops_social_claim_run(uuid,text,text);
drop function public.nexops_social_claim_tick(uuid);
drop function public.nexops_social_reserve_ai(uuid);
drop function public.nexops_social_candidate(uuid,text,text,text,jsonb,text);
drop function public.nexops_social_claim_post(uuid,text,text);
drop function public.nexops_social_complete_post(uuid,text,uuid,text);
commit;
