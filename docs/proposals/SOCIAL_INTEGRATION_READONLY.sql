-- Inspection only. Verify the project is the actual production Supabase project.
-- Never infer it from the local .vercel link (which points to a different project).
begin read only;
select current_database() as database_name,current_user as inspection_role,current_setting('transaction_read_only') as read_only;
with expected(name) as(values
 ('profiles'),('skus'),('subscriptions'),('early_access_requests'),
 ('nexops_organizations'),('nexops_organization_memberships'),('nexops_workspaces'),
 ('nexops_workspace_memberships'),('nexops_growth_admins'),
 ('nexops_social_policy'),('nexops_social_runs'),('nexops_social_ticks'),
 ('nexops_social_posts'),('nexops_social_budget'),('nexops_social_snapshots'),
 ('nexops_social_alerts'),('nexops_social_audit'))
select e.name,c.oid is not null as present,c.relrowsecurity as rls_enabled
from expected e left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.name order by e.name;
select tablename,policyname,roles,cmd from pg_policies
where schemaname='public' and tablename like 'nexops_%' order by tablename,policyname;
select p.oid::regprocedure as signature,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') as anonymous_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'execute') as worker_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname='nexops_is_growth_admin' or p.proname like 'nexops_social_%') order by p.proname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name like 'nexops_%' and grantee in ('PUBLIC','anon','authenticated','service_role') order by table_name,grantee,privilege_type;
select to_regclass('cron.job') is not null as database_cron_catalog_present;
commit;
-- This does not verify the intended person's membership: inspect only the
-- approved administrator/organization/workspace identifiers separately, read-only.
-- Do not export user rows, tokens, environment values or cron command bodies.
