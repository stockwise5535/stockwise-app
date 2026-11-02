-- READ ONLY: evidence missing from the supplied seven-row REVIEW CSV.
-- No user rows, function bodies, credentials or cron command bodies are output.
begin read only;
select c.relname as item,c.relrowsecurity as rls,r.rolname,
 has_table_privilege(r.oid,c.oid,'SELECT') as can_select,
 has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE') as can_write,
 has_table_privilege(r.oid,c.oid,'TRUNCATE') as can_truncate,
 has_table_privilege(r.oid,c.oid,'TRIGGER,REFERENCES') as can_trigger_or_reference,
 has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES') as column_write,
 r.rolsuper,r.rolbypassrls,pg_has_role(r.oid,c.relowner,'USAGE') as owns_table
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r
where n.nspname='public' and c.relname in ('nexops_growth_admins','nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships') and r.rolname in ('anon','authenticated') order by 1,3;
select c.relname as item,p.polname,p.polcmd,p.polpermissive,
 array(select coalesce(r.rolname::text,'PUBLIC') from unnest(p.polroles) x left join pg_roles r on r.oid=x order by 1) as roles,
 md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) as qual_hash,
 md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) as check_hash
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('nexops_growth_admins','nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships') order by 1,2;
select p.oid::regprocedure::text as item,md5(btrim(p.prosrc)) as body_hash,
 pg_get_function_result(p.oid) as returns,l.lanname,p.provolatile,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 pg_has_role('authenticated',p.proowner,'USAGE') as client_owns_function
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.proname in ('nexops_is_growth_admin','nexops_org_member','nexops_workspace_role') order by 1;
rollback;
