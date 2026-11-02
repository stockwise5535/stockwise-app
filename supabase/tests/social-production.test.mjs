import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite');
const source=await readFile(new URL('../../docs/proposals/SOCIAL_AUTOPILOT_PRODUCTION.sql',import.meta.url),'utf8');
const rollback=await readFile(new URL('../../docs/proposals/SOCIAL_AUTOPILOT_ROLLBACK_EMPTY.sql',import.meta.url),'utf8');
const audit=await readFile(new URL('../../docs/proposals/SOCIAL_INTEGRATION_READONLY.sql',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',O='22222222-2222-4222-8222-222222222222',W='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444';
// Replace deployment IDs only in the disposable test copy; never use production data.
const scope=(sql,ids)=>sql.replace(/target_(admin|org|workspace) uuid := (?:NULL|'[0-9a-f-]+')/g,(_,key)=>`target_${key} uuid := ${ids[key]===null?'NULL':"'"+ids[key]+"'"}`);
const apply=scope(source,{admin:A,org:O,workspace:W});
const unconfigured=scope(source,{admin:null,org:null,workspace:null});
async function fixture(development=false){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`);
 await db.exec(await readFile(new URL('../../docs/proposals/SOCIAL_DASHBOARD_FOUNDATION.sql',import.meta.url),'utf8'));
 if(development)await db.exec(`
 drop policy own_admin_record on public.nexops_growth_admins;revoke select on public.nexops_growth_admins from authenticated;
 drop policy own_org_membership on public.nexops_organization_memberships;drop policy own_workspace_membership on public.nexops_workspace_memberships;
 drop policy member_organization on public.nexops_organizations;drop policy member_workspace on public.nexops_workspaces;
 create function public.nexops_workspace_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.nexops_workspace_memberships where workspace_id=p_id and user_id=auth.uid()
$$;
 create function public.nexops_org_member(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.nexops_organization_memberships where organization_id=p_id and user_id=auth.uid())
$$;
 revoke all on function public.nexops_workspace_role(uuid),public.nexops_org_member(uuid) from public,anon;grant execute on function public.nexops_workspace_role(uuid),public.nexops_org_member(uuid) to authenticated;
 create policy org_member on public.nexops_organizations for select to authenticated using(public.nexops_org_member(id));
 create policy org_members on public.nexops_organization_memberships for select to authenticated using(public.nexops_org_member(organization_id));
 create policy workspace_member on public.nexops_workspaces for select to authenticated using(public.nexops_workspace_role(id) is not null);
 create policy workspace_members on public.nexops_workspace_memberships for select to authenticated using(public.nexops_workspace_role(workspace_id) is not null);
 create or replace function public.nexops_is_growth_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.nexops_growth_admins where user_id=auth.uid())$$;`);
 await db.query('insert into auth.users values($1,now()),($2,now())',[A,B]);
 await db.query('insert into public.nexops_organizations(id,name,created_by)values($1,$2,$3)',[O,'Existing',A]);
 await db.query("insert into public.nexops_organization_memberships values($1,$2,'owner')",[O,A]);
 await db.query('insert into public.nexops_workspaces(id,organization_id,name)values($1,$2,$3)',[W,O,'Existing']);
 await db.query("insert into public.nexops_workspace_memberships values($1,$2,'owner')",[W,A]);
 await db.query('insert into public.nexops_growth_admins values($1),($2)',[A,B]);
 await db.query("insert into public.nexops_organizations(id,name,created_by)values('55555555-5555-4555-8555-555555555555','Other organization',$1)",[B]);
 await db.query("insert into public.nexops_organization_memberships values('55555555-5555-4555-8555-555555555555',$1,'owner')",[B]);return db;
}
const scalar=async(db,q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
async function snapshot(db){const data=[];for(const t of ['nexops_organizations','nexops_organization_memberships','nexops_workspaces','nexops_workspace_memberships','nexops_growth_admins'])data.push((await db.query(`select * from public.${t} order by 1`)).rows);return JSON.stringify(data)+JSON.stringify((await db.query(`select c.relname,c.relacl::text,c.relrowsecurity,
 (select jsonb_agg(to_jsonb(a) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0) columns,
 (select jsonb_agg(to_jsonb(k) order by k.conname) from pg_constraint k where k.conrelid=c.oid) constraints,
 (select jsonb_agg(to_jsonb(p) order by p.polname) from pg_policy p where p.polrelid=c.oid) policies
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not like 'nexops_social_%' order by c.relname`)).rows)+JSON.stringify((await db.query(`select p.oid::regprocedure::text,p.prosrc,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'nexops_social_%' order by 1`)).rows)+JSON.stringify((await db.query('select * from public.nexops_organizations')).rows);}
async function rejected(db,sql,pattern){await assert.rejects(db.exec(sql),pattern);await db.exec('rollback');assert.equal(await scalar(db,"select count(*)::int from pg_class where relname like 'nexops_social_%'"),0);}
for(const development of [false,true])test(`add-only apply/re-audit preserves ${development?'development-compatible':'minimal'} foundation and OFF state`,async()=>{
 const db=await fixture(development);try{
 const before=await snapshot(db);
 await db.exec(await readFile(new URL('../../docs/proposals/SOCIAL_BASELINE_SECURITY_REVIEW.sql',import.meta.url),'utf8'));
 assert.equal(await snapshot(db),before);await db.exec(apply);assert.equal(await snapshot(db),before);
 assert.equal(await scalar(db,"select count(*)::int from pg_class where relname like 'nexops_social_%' and relkind='r'"),8);
 assert.equal(await scalar(db,'select count(*)::int from public.nexops_social_policy where enabled'),0);
 await db.query('insert into public.nexops_social_policy(organization_id)values($1)',[O]);assert.equal(await scalar(db,'select enabled from public.nexops_social_policy'),false);
 const results=await db.exec(audit);const rows=results.find(r=>r.fields?.some(f=>f.name==='category')).rows;
 const sns=rows.filter(r=>r.item.startsWith('nexops_social_')&&!['07_DATA'].includes(r.category));assert.ok(sns.length>=40);assert.deepEqual(sns.filter(r=>r.status!=='PASS'),[]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
 assert.equal(await scalar(db,'select public.nexops_social_admin($1)',[O]),true);
 await assert.rejects(db.query('select public.nexops_social_claim_tick($1)',[O]),/permission denied/);
 await assert.rejects(db.query('insert into public.nexops_growth_admins values($1)',[W]),/permission denied/);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);await db.exec('set role authenticated');
 assert.equal(await scalar(db,'select count(*)::int from public.nexops_social_policy'),0);
 await assert.rejects(db.query('select public.nexops_social_set_policy($1,true,$2,$3)',[O,'a'.repeat(64),'b'.repeat(64)]),/Access denied/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.nexops_social_policy'),/permission denied/);
 await db.exec('reset role;set role service_role');assert.equal((await scalar(db,'select public.nexops_social_claim_run($1,$2,$3)',[O,'a'.repeat(64),'b'.repeat(64)])).claimed,false);
 await assert.rejects(db.query('delete from public.nexops_social_policy'),/permission denied/);
 }finally{await db.close();}
});
test('missing target, administrator assignment and unconfirmed user stop atomically',async()=>{
 const db=await fixture();try{await rejected(db,unconfigured,/UUIDs required/);await db.exec('delete from public.nexops_growth_admins');await rejected(db,apply,/assignment missing/);await db.query('insert into public.nexops_growth_admins values($1)',[A]);await db.query('update auth.users set email_confirmed_at=null where id=$1',[A]);await rejected(db,apply,/assignment missing/);}finally{await db.close();}
});
test('unknown RLS, administrator body, TRUNCATE and inherited column writes stop without repairs',async()=>{
 const db=await fixture();try{
 await db.exec('create policy leaked on public.nexops_organizations for select to authenticated using(true)');await rejected(db,apply,/policy count/);await db.exec('drop policy leaked on public.nexops_organizations');
 await db.exec('grant truncate on public.nexops_growth_admins to authenticated');await rejected(db,apply,/unsafe existing privileges/);await db.exec('revoke truncate on public.nexops_growth_admins from authenticated');
 await db.exec('create role unsafe;grant unsafe to authenticated;grant update(user_id) on public.nexops_growth_admins to unsafe');await rejected(db,apply,/unsafe existing privileges/);await db.exec('revoke unsafe from authenticated');
 await db.exec("create or replace function public.nexops_is_growth_admin() returns boolean language sql stable security definer set search_path='' as $$select true$$");await rejected(db,apply,/authorization function/);
 }finally{await db.close();}
});
test('partial existing object and repeated apply never overwrite',async()=>{
 const db=await fixture();try{await db.exec('create table public.nexops_social_foreign(id int)');await assert.rejects(db.exec(apply),/existing SNS object/);await db.exec('rollback;drop table public.nexops_social_foreign');await db.exec(apply);const before=await snapshot(db);await assert.rejects(db.exec(apply),/existing SNS object/);await db.exec('rollback');assert.equal(await snapshot(db),before);}finally{await db.close();}
});
test('empty rollback restores baseline; nonempty/foreign marker/dependency refuses',async()=>{
 const db=await fixture();try{
 const before=await snapshot(db);await db.exec(apply);await db.query('insert into public.nexops_social_policy(organization_id)values($1)',[O]);await assert.rejects(db.exec(rollback),/SNS data exists/);await db.exec('rollback;delete from public.nexops_social_policy');
 await db.exec("comment on table public.nexops_social_policy is 'foreign'");await assert.rejects(db.exec(rollback),/unrecognized SNS table/);await db.exec("rollback;comment on table public.nexops_social_policy is 'nexops-social-b6915d7-additive-v1'");
 await db.exec('create view public.external_dependency as select * from public.nexops_social_posts');await assert.rejects(db.exec(rollback),/depend/);await db.exec('rollback;drop view public.external_dependency');
 await db.exec(rollback);assert.equal(await snapshot(db),before);assert.equal(await scalar(db,"select count(*)::int from pg_class where relname like 'nexops_social_%'"),0);
 }finally{await db.close();}
});

test('production worker grants support budgets/dedup/unknown hold and direct adapter writes',async()=>{
 const db=await fixture(true);const hash='a'.repeat(64),binding='b'.repeat(64);
 const rpc=(n,args)=>scalar(db,`select public.nexops_social_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 try{
 await db.exec(apply);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
 await rpc('set_policy',[O,true,hash,binding]);await db.exec('reset role;set role service_role');
 assert.equal(await rpc('claim_tick',[O]),true);assert.equal(await rpc('claim_tick',[O]),false);
 const run=await rpc('claim_run',[O,hash,binding]);assert.equal(run.claimed,true);assert.equal((await rpc('claim_run',[O,hash,binding])).claimed,false);
 for(let i=0;i<6;i++)assert.equal(await rpc('reserve_ai',[run.runId]),true);assert.equal(await rpc('reserve_ai',[run.runId]),false);
 assert.equal(await rpc('candidate',[run.runId,'x','Checked copy',hash,'[]',null]),true);assert.equal(await rpc('candidate',[run.runId,'x','Other copy',binding,'[]',null]),false);
 const claim=await rpc('claim_post',[run.runId,'x',hash]);assert.equal(claim.claimed,true);
 await rpc('complete_post',[run.runId,'x',claim.token,null]);assert.equal((await rpc('claim_run',[O,hash,binding])).reason,'UNKNOWN_DELIVERY_HELD');
 await db.query("update public.nexops_social_posts set metrics='{}',metrics_updated_at=now() where run_id=$1",[run.runId]);
 await db.query("update public.nexops_social_runs set state='completed' where id=$1",[run.runId]);
 await db.query("insert into public.nexops_social_snapshots(organization_id,period_start,period_end,payload)values($1,now()-interval '1 day',now(),'{}')",[O]);
 await db.query("insert into public.nexops_social_alerts(organization_id,code)values($1,'LOCAL_TEST')",[O]);
 await db.exec('reset role;set role authenticated');await rpc('set_policy',[O,false,null,null]);
 assert.equal(await scalar(db,'select enabled from public.nexops_social_policy'),false);
 }finally{await db.close();}
});
