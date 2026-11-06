-- b6915d7 integration audit. READ ONLY; no application RPC is executed.
-- Paste this entire file into the VERIFIED production project's SQL Editor.
-- Optional: replace the three NULL::uuid values with the intended public UUIDs.
-- Do not put passwords, tokens, email addresses or API keys here.
-- PASS means this check passed, NOT blanket production authorization.
begin transaction read only;
with
params as (
 select NULL::uuid as admin_user_id, NULL::uuid as organization_id,
        NULL::uuid as workspace_id
),
manifest as (select $audit_manifest$
{
"tables": [
  {"name":"nexops_growth_admins","columns":{"user_id":"uuid"}},
  {"name":"nexops_organization_memberships","columns":{"organization_id":"uuid","user_id":"uuid","role":"text"}},
  {"name":"nexops_organizations","columns":{"id":"uuid","name":"text","created_by":"uuid","created_at":"timestamp with time zone"}},
  {"name":"nexops_social_alerts","columns":{"id":"uuid","organization_id":"uuid","code":"text","delivered":"boolean","created_at":"timestamp with time zone"}},
  {"name":"nexops_social_audit","columns":{"id":"bigint","organization_id":"uuid","actor_id":"uuid","action":"text","created_at":"timestamp with time zone"}},
  {"name":"nexops_social_budget","columns":{"organization_id":"uuid","month":"date","reserved_cents":"integer"}},
  {"name":"nexops_social_policy","columns":{"organization_id":"uuid","enabled":"boolean","revision":"integer","facts_hash":"text","binding_hash":"text","updated_by":"uuid","updated_at":"timestamp with time zone"}},
  {"name":"nexops_social_posts","columns":{"organization_id":"uuid","day":"date","network":"text","run_id":"uuid","state":"text","content_hash":"text","text":"text","fact_ids":"jsonb","reason":"text","claim_token":"uuid","provider_id":"text","metrics":"jsonb","metrics_updated_at":"timestamp with time zone","updated_at":"timestamp with time zone"}},
  {"name":"nexops_social_runs","columns":{"id":"uuid","organization_id":"uuid","day":"date","policy_revision":"integer","state":"text","ai_calls":"integer","reserved_cents":"integer","expires_at":"timestamp with time zone","created_at":"timestamp with time zone"}},
  {"name":"nexops_social_snapshots","columns":{"organization_id":"uuid","period_start":"timestamp with time zone","period_end":"timestamp with time zone","payload":"jsonb","updated_at":"timestamp with time zone"}},
  {"name":"nexops_social_ticks","columns":{"organization_id":"uuid","day":"date","created_at":"timestamp with time zone"}},
  {"name":"nexops_workspace_memberships","columns":{"workspace_id":"uuid","user_id":"uuid","role":"text"}},
  {"name":"nexops_workspaces","columns":{"id":"uuid","organization_id":"uuid","name":"text","created_at":"timestamp with time zone"}}
],
"functions": [
  {"name":"nexops_is_growth_admin","args":"","types":"","names":[],"returns":"boolean","volatility":"s","body_hash":"ef2d442812f793daef7603b227b97b0a","auth":true,"worker":false},
  {"name":"nexops_social_admin","args":"o uuid","types":"uuid","names":["o"],"returns":"boolean","volatility":"s","body_hash":"74339e6de913c32db30fcfe20fbe1dd3","auth":true,"worker":false},
  {"name":"nexops_social_candidate","args":"run uuid, network_name text, copy text, hash text, ids jsonb, blocked text","types":"uuid, text, text, text, jsonb, text","names":["run","network_name","copy","hash","ids","blocked"],"returns":"boolean","volatility":"v","body_hash":"3b58d72a0ca72233e8263e2f888dcdeb","auth":false,"worker":true},
  {"name":"nexops_social_claim_post","args":"run uuid, network_name text, hash text","types":"uuid, text, text","names":["run","network_name","hash"],"returns":"jsonb","volatility":"v","body_hash":"da10487f7e47e74a25297a384fcb16fd","auth":false,"worker":true},
  {"name":"nexops_social_claim_run","args":"o uuid, facts text, binding text","types":"uuid, text, text","names":["o","facts","binding"],"returns":"jsonb","volatility":"v","body_hash":"985e94dd7692da030a0c78a0deeb1bda","auth":false,"worker":true},
  {"name":"nexops_social_claim_tick","args":"o uuid","types":"uuid","names":["o"],"returns":"boolean","volatility":"v","body_hash":"79ef4cb2b18f353fc3c1150d27f9d494","auth":false,"worker":true},
  {"name":"nexops_social_complete_post","args":"run uuid, network_name text, token uuid, provider text","types":"uuid, text, uuid, text","names":["run","network_name","token","provider"],"returns":"void","volatility":"v","body_hash":"74313fba8b9fed603e5297efb787c79f","auth":false,"worker":true},
  {"name":"nexops_social_reserve_ai","args":"run uuid","types":"uuid","names":["run"],"returns":"boolean","volatility":"v","body_hash":"68b5a57adc5722a6f2b99581abf68147","auth":false,"worker":true},
  {"name":"nexops_social_set_policy","args":"o uuid, turn_on boolean, facts text, binding text","types":"uuid, boolean, text, text","names":["o","turn_on","facts","binding"],"returns":"jsonb","volatility":"v","body_hash":"1d0cd3e7d0bec2766afdb7b91aaef11a","auth":true,"worker":false}
],
"policies": [
  {"table":"nexops_growth_admins","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"3a807491e0a912fbfbee0ffa087b82f6","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_organization_memberships","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"3a807491e0a912fbfbee0ffa087b82f6","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_organizations","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"bf266763489f1b244aaddd1ffaffa3a8","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_alerts","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_audit","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_budget","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_policy","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_posts","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_runs","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_snapshots","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_social_ticks","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"7609c3f8e36036679f8563563234f02e","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_workspace_memberships","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"3a807491e0a912fbfbee0ffa087b82f6","check_hash":"d41d8cd98f00b204e9800998ecf8427e"},
  {"table":"nexops_workspaces","cmd":"r","permissive":true,"roles":["authenticated"],"qual":"b16381337cb5dd508401d6625166bb2b","check_hash":"d41d8cd98f00b204e9800998ecf8427e"}
],
"indexes": [
  {"table":"nexops_growth_admins","columns":["user_id"]},
  {"table":"nexops_organization_memberships","columns":["organization_id","user_id"]},
  {"table":"nexops_organizations","columns":["id"]},
  {"table":"nexops_social_alerts","columns":["id"]},
  {"table":"nexops_social_audit","columns":["id"]},
  {"table":"nexops_social_budget","columns":["organization_id","month"]},
  {"table":"nexops_social_policy","columns":["organization_id"]},
  {"table":"nexops_social_posts","columns":["organization_id","day","network"]},
  {"table":"nexops_social_posts","columns":["organization_id","network","content_hash"]},
  {"table":"nexops_social_runs","columns":["id"]},
  {"table":"nexops_social_runs","columns":["organization_id","day"]},
  {"table":"nexops_social_snapshots","columns":["organization_id","period_start","period_end"]},
  {"table":"nexops_social_ticks","columns":["organization_id","day"]},
  {"table":"nexops_workspace_memberships","columns":["workspace_id","user_id"]},
  {"table":"nexops_workspaces","columns":["id"]}
],
"checks": [
  {"table":"nexops_organization_memberships","hash":"287870748df31fa37ef660fedfa4fee9"},
  {"table":"nexops_organizations","hash":"98aca565c5a8263c784dcf4d6074f42c"},
  {"table":"nexops_social_alerts","hash":"36ec1ff97963bd95477049496f8c9d1b"},
  {"table":"nexops_social_budget","hash":"81ed322756aee2b3f68d45f5a5cafbe0"},
  {"table":"nexops_social_posts","hash":"470b760fc1cb19b80dff26e5b268d614"},
  {"table":"nexops_social_posts","hash":"c79ffcc5da305ed3760549aa657aaf45"},
  {"table":"nexops_social_posts","hash":"6b363a10052807ea1ec756d4a96f8499"},
  {"table":"nexops_social_posts","hash":"d9a9f1f207c70045e5836e5820ab1004"},
  {"table":"nexops_social_runs","hash":"fb53df391567ee24d097d9c518f83ea3"},
  {"table":"nexops_social_runs","hash":"d92be4fbc8e2dbde97786ff42e46414c"},
  {"table":"nexops_social_runs","hash":"3a7e6ce7fb518c80f61037ffaab4b4f9"},
  {"table":"nexops_social_snapshots","hash":"5907e35460d97715fc9ed8ff12e139cf"},
  {"table":"nexops_workspace_memberships","hash":"44f0a1fdbec0ac1173ffc27abecaed78"},
  {"table":"nexops_workspaces","hash":"98aca565c5a8263c784dcf4d6074f42c"}
]
}
$audit_manifest$::jsonb as j),
tables as (
 select x->>'name' as name,x->'columns' as columns,
        to_regclass('public.'||(x->>'name')) as oid
 from manifest,jsonb_array_elements(j->'tables') x
),
column_diff as (
 select t.name,jsonb_agg(jsonb_build_object('column',e.key,'expected',e.value,
        'actual',case when a.attnum is not null then format_type(a.atttypid,a.atttypmod) end))
        filter(where a.attnum is null or format_type(a.atttypid,a.atttypmod)<>e.value) as diff
 from tables t cross join lateral jsonb_each_text(t.columns) e
 left join pg_attribute a on a.attrelid=t.oid and a.attname=e.key
       and a.attnum>0 and not a.attisdropped group by t.name
),
role_context as (
 select coalesce((select rolsuper or rolbypassrls from pg_roles where rolname=current_user),false) as bypass
),
table_state as (
 select t.*,c.relrowsecurity as rls,d.diff,
 coalesce(has_table_privilege(current_user,t.oid,'SELECT'),false) as readable,
 (r.bypass or not coalesce(c.relrowsecurity,false) or
   (not c.relforcerowsecurity and pg_has_role(current_user,c.relowner,'USAGE'))) as full_visibility,
 case when to_regrole('anon') is not null then has_table_privilege('anon',t.oid,'SELECT,INSERT,UPDATE,DELETE') end as anon_any,
 case when to_regrole('authenticated') is not null then has_table_privilege('authenticated',t.oid,'SELECT') end as auth_select,
 case when to_regrole('authenticated') is not null then has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE') end as auth_write,
 case when to_regrole('service_role') is not null then has_table_privilege('service_role',t.oid,'SELECT') end as worker_select,
 case when to_regrole('service_role') is not null then has_table_privilege('service_role',t.oid,'INSERT') end as worker_insert,
 case when to_regrole('service_role') is not null then has_table_privilege('service_role',t.oid,'UPDATE') end as worker_update
 from tables t left join pg_class c on c.oid=t.oid join column_diff d using(name) cross join role_context r
),
function_expected as (
 select x as spec,x->>'name' as name,to_regprocedure('public.'||(x->>'name')||'('||(x->>'types')||')') as oid
 from manifest,jsonb_array_elements(j->'functions') x
),
function_state as (
 select e.*,p.prosecdef,p.provolatile::text as volatility,format_type(p.prorettype,null) as return_type,
 coalesce(to_jsonb(p.proargnames),'[]'::jsonb) as arg_names,md5(btrim(p.prosrc)) as body_hash,
 exists(select 1 from unnest(p.proconfig) s where s like 'search_path=%'
        and replace(btrim(substr(s,length('search_path=')+1)),'"','')='') as empty_search_path,
 case when to_regrole('anon') is not null then has_function_privilege('anon',e.oid,'EXECUTE') end as anon_exec,
 case when to_regrole('authenticated') is not null then has_function_privilege('authenticated',e.oid,'EXECUTE') end as auth_exec,
 case when to_regrole('service_role') is not null then has_function_privilege('service_role',e.oid,'EXECUTE') end as worker_exec
 from function_expected e left join pg_proc p on p.oid=e.oid
),
policies as (
 select t.name,p.polname,p.polcmd::text as cmd,p.polpermissive as permissive,
 to_jsonb(array(select coalesce(r.rolname::text,'PUBLIC') from unnest(p.polroles) k
               left join pg_roles r on r.oid=k order by 1)) as roles,
 md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) as qual,
 md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) as check_hash
 from tables t join pg_policy p on p.polrelid=t.oid
),
policy_state as (
 select t.name,t.oid,
 (select count(*) from policies p where p.name=t.name) as actual_count,
 (select count(*) from manifest,jsonb_array_elements(j->'policies') e where e->>'table'=t.name) as expected_count,
 (select count(*) from policies p where p.name=t.name and exists(
   select 1 from manifest,jsonb_array_elements(j->'policies') e where e->>'table'=p.name
   and e->>'cmd'=p.cmd and (e->>'permissive')::boolean=p.permissive and e->'roles'=p.roles
   and e->>'qual'=p.qual and e->>'check_hash'=p.check_hash)) as matched_count
 from tables t
),
unique_state as (
 select e->>'table' as name,e->'columns' as columns,
 exists(select 1 from pg_index i where i.indrelid=to_regclass('public.'||(e->>'table'))
 and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
 and i.indpred is null and i.indexprs is null and
 to_jsonb(array(select a.attname::text from unnest(i.indkey) with ordinality k(num,ord)
   join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.num
   where ord<=i.indnkeyatts order by ord))=e->'columns') as present
 from manifest,jsonb_array_elements(j->'indexes') e
),
check_state as (
 select e->>'table' as name,e->>'hash' as expected_hash,
 exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.'||(e->>'table'))
 and c.contype='c' and c.convalidated and md5(pg_get_constraintdef(c.oid,true))=e->>'hash') as present
 from manifest,jsonb_array_elements(j->'checks') e
),
data_specs as (
 select 'publishing_off'::text as name,
 array['nexops_social_policy']::text[] as needs,
 format('select case when exists(select 1 from public.nexops_social_policy where enabled and (%L::uuid is null or organization_id=%L::uuid)) then 1 else 0 end as n',p.organization_id,p.organization_id) as sql,
 true as extra_ready,true as extra_readable,true as extra_visible from params p
 union all
 select 'any_eligible_admin',array['nexops_growth_admins','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships'],
 'select case when exists(select 1 from public.nexops_growth_admins g join auth.users u on u.id=g.user_id join public.nexops_organization_memberships m on m.user_id=g.user_id and m.role in (''owner'',''admin'') join public.nexops_workspaces w on w.organization_id=m.organization_id join public.nexops_workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=g.user_id where u.email_confirmed_at is not null) then 1 else 0 end as n',
 to_regclass('auth.users') is not null and exists(select 1 from pg_attribute where attrelid=to_regclass('auth.users') and attname='email_confirmed_at' and not attisdropped),
 coalesce(has_table_privilege(current_user,to_regclass('auth.users'),'SELECT'),false),
 r.bypass from role_context r
 union all
 select 'intended_admin',array['nexops_growth_admins','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships'],
 format('select case when exists(select 1 from public.nexops_growth_admins g join auth.users u on u.id=g.user_id join public.nexops_organization_memberships m on m.user_id=g.user_id and m.role in (''owner'',''admin'') join public.nexops_workspaces w on w.organization_id=m.organization_id join public.nexops_workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=g.user_id where u.email_confirmed_at is not null and g.user_id=%L::uuid and m.organization_id=%L::uuid and w.id=%L::uuid) then 1 else 0 end as n',p.admin_user_id,p.organization_id,p.workspace_id),
 p.admin_user_id is not null and p.organization_id is not null and p.workspace_id is not null
 and to_regclass('auth.users') is not null and exists(select 1 from pg_attribute where attrelid=to_regclass('auth.users') and attname='email_confirmed_at' and not attisdropped),
 coalesce(has_table_privilege(current_user,to_regclass('auth.users'),'SELECT'),false),r.bypass
 from params p cross join role_context r
 union all
 select 'database_social_cron',array[]::text[],
 'select count(*)::bigint as n from cron.job j where command like ''%/api/internal/social-cycle%'' or coalesce(to_jsonb(j)->>''jobname'','''') ~* ''nexops.*social|social.*nexops''',
 to_regclass('cron.job') is not null,
 coalesce(has_table_privilege(current_user,to_regclass('cron.job'),'SELECT'),false),r.bypass from role_context r
),
data_ready as (
 select d.*,extra_ready and not exists(select 1 from unnest(needs) n left join table_state t on t.name=n where t.oid is null or t.diff is not null) as ready,
 extra_readable and not exists(select 1 from table_state t where t.name=any(needs) and not t.readable) as readable,
 extra_visible and not exists(select 1 from table_state t where t.name=any(needs) and not coalesce(t.full_visibility,false)) as visible
 from data_specs d
),
data_values as (
 select d.*,case when ready and readable and visible and has_function_privilege(current_user,'pg_catalog.query_to_xml(text,boolean,boolean,text)','EXECUTE')
   then ((xpath('/row/n/text()',query_to_xml(sql,false,true,'')))[1]::text)::bigint end as value from data_ready d
),
report(category,item,status,observed,next_action) as (
 select '01_TABLE',name,case when oid is null then 'MISSING' when diff is not null then 'REVIEW_COLUMNS'
 when not rls or anon_any is distinct from false or auth_select is distinct from true or auth_write is distinct from false or worker_select is distinct from true
 or (name in ('nexops_social_runs','nexops_social_posts','nexops_social_snapshots') and worker_update is distinct from true)
 or (name in ('nexops_social_snapshots','nexops_social_alerts') and worker_insert is distinct from true) then 'REVIEW_PERMISSIONS' else 'PASS' end,
 jsonb_build_object('column_differences',diff,'rls',rls,'anon_any',anon_any,'authenticated_select',auth_select,'authenticated_write',auth_write,'worker_select',worker_select,'worker_insert',worker_insert,'worker_update',worker_update),
 'Reuse compatible objects; propose only missing columns/RLS/grants after review. Never drop or recreate existing data.' from table_state
 union all
 select '02_RLS_POLICY',name,case when oid is null then 'MISSING' when matched_count=expected_count and actual_count=expected_count then 'PASS' else 'REVIEW_POLICY' end,
 jsonb_build_object('expected',expected_count,'actual',actual_count,'matching_reference_shape',matched_count),
 'Inspect existing policy semantics; additional or differently formatted policies may be compatible. Do not replace automatically.' from policy_state
 union all
 select '03_FUNCTION',name||'('||(spec->>'types')||')',case when oid is null then 'MISSING'
 when anon_exec is distinct from false or auth_exec is distinct from (spec->>'auth')::boolean or ((spec->>'worker')::boolean and worker_exec is distinct from true) then 'REVIEW_EXECUTE'
 when not prosecdef or not empty_search_path or volatility<>spec->>'volatility' or return_type<>spec->>'returns' or arg_names<>spec->'names' or body_hash<>spec->>'body_hash' then 'REVIEW_DEFINITION' else 'PASS' end,
 jsonb_build_object('returns',return_type,'argument_names',arg_names,'security_definer',prosecdef,'empty_search_path',empty_search_path,'anon_execute',anon_exec,'authenticated_execute',auth_exec,'worker_execute',worker_exec,'body_matches_reference',body_hash=spec->>'body_hash'),
 'Review exact signature, named arguments, body and grants. Do not invoke the RPC or blindly overwrite a compatible existing function.' from function_state
 union all
 select '04_UNIQUE_KEY',name||':'||columns::text,case when present then 'PASS' else 'MISSING_OR_REVIEW' end,
 jsonb_build_object('valid_immediate_unique_key',present),
 'Required for atomic once/day, post deduplication and budget/snapshot identity. Review duplicates before proposing a unique constraint.' from unique_state
 union all
 select '05_CHECK',name||':'||expected_hash,case when present then 'PASS' else 'MISSING_OR_REVIEW' end,
 jsonb_build_object('matching_validated_check',present),
 'Compare bounds, enum values and payload limits with the reviewed proposal. Formatting/version differences can need manual review.' from check_state
 union all
 select '06_ROLE',name,case when to_regrole(name) is null then 'MISSING' when name='service_role' and not coalesce((select rolbypassrls or rolsuper from pg_roles where rolname=name),false) then 'REVIEW_BYPASS' else 'PASS' end,
 jsonb_build_object('present',to_regrole(name) is not null),
 'Supabase platform roles are prerequisites. Do not create roles or grant bypass privileges from this audit.' from unnest(array['anon','authenticated','service_role']) name
 union all
 select '07_DATA',name,case when name='database_social_cron' and not extra_ready then 'PASS_NO_DATABASE_CRON_CATALOG'
 when not ready or not readable or not visible or value is null then 'UNVERIFIED'
 when name='publishing_off' and value>0 then 'REVIEW_ENABLED_POLICY'
 when name='database_social_cron' and value>0 then 'REVIEW_CRON_REGISTERED'
 when name in ('any_eligible_admin','intended_admin') and value=0 then 'MISSING_ELIGIBLE_ADMIN' else 'PASS' end,
 jsonb_build_object('objects_and_parameters_ready',ready,'select_permission',readable,'full_visibility',visible,'count_or_exists',value),
 case when name='intended_admin' then 'Set the three optional UUIDs to verify the intended confirmed user, Growth Admin, organization owner/admin and workspace membership together.'
 when name='publishing_off' then 'Expected zero enabled rows in the selected scope. Read only: do not disable unrelated organizations or change flags here.'
 when name='database_social_cron' then 'Only database-side matching registrations are counted; command bodies and secrets are not returned.'
 else 'A global eligible admin does not prove the intended account/organization is authorized. Provision only exact reviewed assignments after approval.' end from data_values
 union all
 select '08_AUTH','auth.uid()',case when to_regprocedure('auth.uid()') is not null then 'PASS' else 'MISSING' end,
 jsonb_build_object('auth_users_present',to_regclass('auth.users') is not null),
 'The SQL Editor session is not an application JWT. Actual Auth token validation is not exercised.'
 union all
 select '09_DEFAULT','social_policy.enabled',case when exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=to_regclass('public.nexops_social_policy') and a.attname='enabled' and a.attnotnull and regexp_replace(pg_get_expr(d.adbin,d.adrelid),'[()[:space:]]','','g') in ('false','false::boolean')) then 'PASS' else 'MISSING_OR_REVIEW' end,
 jsonb_build_object('required_default',false), 'Policy must start OFF. This query never inserts or updates a policy.'
 union all
 select '10_EXTERNAL','Vercel_cron_and_environment','UNVERIFIED',null::jsonb,
 'SQL cannot inspect Vercel/GitHub cron, server-only keys or runtime flags. Keep cron unregistered, NEXOPS_SOCIAL_WRITES_ALLOWED=false and emergency stop=true.'
 union all
 select '11_LEGACY',name,case when to_regclass('public.'||name) is not null then 'PRESENT_UNCHANGED' else 'REVIEW_EXISTING_LEGACY_SCHEMA' end,
 jsonb_build_object('present',to_regclass('public.'||name) is not null),
 'Legacy application boundary only. Do not modify profiles/SKUs/subscriptions/CRM or Auth triggers as part of the SNS installation.' from unnest(array['profiles','skus','subscriptions','early_access_requests']) name
)
select category,item,status,observed,next_action from report
union all
select '00_CONTEXT','audit_session','READ_ONLY',jsonb_build_object('database',current_database(),'inspection_role',current_user,'transaction_read_only',current_setting('transaction_read_only'),'integration','b6915d7','target_ids_supplied',(select admin_user_id is not null and organization_id is not null and workspace_id is not null from params),'foundation_tables_present',(select count(*) from tables where name not like 'nexops_social_%' and oid is not null),'social_tables_present',(select count(*) from tables where name like 'nexops_social_%' and oid is not null),'status_counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from report group by status) s)),
 'Metadata and aggregate checks only. Missing/incompatible objects require a separately reviewed minimal diff; no DDL/DML/role/cron/provider action is performed.'
order by category,item;
rollback;
