-- Optional OWNER read-only evidence for a labeled hosted verification run.
-- psql -X -v ON_ERROR_STOP=1 -v verification_run='hosted-verification-UUID' -f this-file
-- Select the independently confirmed DEVELOPMENT database. No credentials/records returned.
-- Ordinary user sessions intentionally cannot read the raw event/operational tables.
begin read only;
select count(*) as event_count,count(distinct user_id) as distinct_test_users,
 count(distinct event_id) as distinct_event_ids
from public.nexops_events where properties->>'referral_source'=:'verification_run';
select event_name,count(*) as event_count from public.nexops_events
where properties->>'referral_source'=:'verification_run' group by event_name order by event_name;
with test_users as (
 select distinct user_id from public.nexops_events where properties->>'referral_source'=:'verification_run'
), scoped_workspaces as (
 select id from public.nexops_workspaces where
 (is_starter and created_by in(select user_id from test_users))
 or name like 'Nexops DEVELOPMENT VERIFICATION '||:'verification_run'||' %'
)
select 'nexops_data_imports' as table_name,count(*) as operational_rows from public.nexops_data_imports where workspace_id in(select id from scoped_workspaces)
union all select 'nexops_exceptions',count(*) from public.nexops_exceptions where workspace_id in(select id from scoped_workspaces)
union all select 'nexops_actions',count(*) from public.nexops_actions where workspace_id in(select id from scoped_workspaces)
union all select 'nexops_action_exceptions',count(*) from public.nexops_action_exceptions where workspace_id in(select id from scoped_workspaces)
union all select 'nexops_decisions',count(*) from public.nexops_decisions where workspace_id in(select id from scoped_workspaces)
union all select 'nexops_agent_runs',count(*) from public.nexops_agent_runs where workspace_id in(select id from scoped_workspaces);
commit;
