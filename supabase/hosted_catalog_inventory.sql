-- Run with owner-level access against the explicitly verified development database.
-- Read-only, no user/contact data, no migration statements or policy changes.
begin read only;
select current_database() as database_name,current_user as inspection_role,
 to_regclass('supabase_migrations.schema_migrations') is not null as cli_history_available;
with expected(name) as (values
 ('nexops_profiles'),('nexops_organizations'),('nexops_organization_memberships'),
 ('nexops_workspaces'),('nexops_workspace_memberships'),('nexops_activation'),('nexops_events'),
 ('nexops_consultation_leads'),('nexops_lead_qualification'),('nexops_audit'),('nexops_invitations'),
 ('nexops_communication_state'),('nexops_growth_admins'),('nexops_deletion_requests'),
 ('nexops_data_imports'),('nexops_exceptions'),('nexops_actions'),('nexops_action_exceptions'),('nexops_decisions'),('nexops_agent_runs'))
select e.name,c.oid is not null as present,c.relrowsecurity as rls_enabled
from expected e left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.name and c.relkind in ('r','p') order by e.name;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename like 'nexops\_%' escape '\' order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name like 'nexops\_%' escape '\'
 and grantee in ('anon','authenticated','PUBLIC') order by table_name,grantee,privilege_type;
select p.oid::regprocedure as function_signature,p.prosecdef as security_definer,
 array(select setting from unnest(p.proconfig) as setting where setting like 'search_path=%') as search_path,
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'nexops\_%' escape '\' order by p.proname;
select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgenabled as enabled,pn.nspname as function_schema,p.proname as function_name
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal and ((n.nspname='auth' and c.relname='users') or (n.nspname='public' and c.relname like 'nexops\_%' escape '\'))
order by n.nspname,c.relname,t.tgname;
commit;
-- If cli_history_available is true, separately inspect only version/name metadata:
-- select version,name from supabase_migrations.schema_migrations order by version;
-- If history is absent or objects exist without history, compare definitions first.
-- Never infer "not applied" from an anonymous REST denial or absent CLI history.
