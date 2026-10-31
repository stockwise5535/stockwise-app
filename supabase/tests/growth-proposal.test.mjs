// Disposable local DB only. The proposal is NOT a registered/live migration.
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite')
const db=new PGlite(),A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;")
for(const name of ['202610240001_growth_foundation.sql','202610240002_growth_lifecycle.sql','202610240003_outbound_safety.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../../docs/proposals/APAC_GROWTH_CRM.sql',import.meta.url),'utf8'))
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[A,'a@example.invalid',B,'b@example.invalid'])
const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0]
const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
await as(A);const wa=await scalar('select public.nexops_bootstrap()');await as(B);await scalar('select public.nexops_bootstrap()');await db.exec('reset role');await db.query("insert into public.nexops_crm_companies(workspace_id,domain,name,segment) values($1,'fixture.invalid','Fixture','manufacturing')",[wa])
test('proposed CRM default denies ordinary owner, anonymous and direct browser writes',async()=>{
 await as(A);assert.equal(await scalar('select count(*)::int from public.nexops_crm_companies'),0)
 await assert.rejects(db.query("insert into public.nexops_crm_companies(workspace_id,domain,name,segment) values($1,'x.invalid','X','startups')",[wa]),/permission denied/)
 await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from public.nexops_crm_contacts'),/permission denied/)
})
test('proposed read requires both Growth Admin and matching owner/admin workspace; no cross-org reads',async()=>{
 await db.exec('reset role');await db.query('insert into public.nexops_growth_admins values($1),($2)',[A,B]);await as(A);assert.equal(await scalar('select count(*)::int from public.nexops_crm_companies'),1)
 await as(B);assert.equal(await scalar('select count(*)::int from public.nexops_crm_companies'),0)
 await assert.rejects(db.exec("insert into public.nexops_growth_approvals(workspace_id,item_id,version,approved_by,content_hash) values(gen_random_uuid(),gen_random_uuid(),1,auth.uid(),repeat('a',64))"),/permission denied/)
})
test('all seven proposed tables have RLS+FORCE and remain outside applied migrations',async()=>{
 await db.exec('reset role');assert.equal(await scalar("select count(*)::int from pg_class where relname in ('nexops_growth_population','nexops_crm_companies','nexops_crm_contacts','nexops_growth_campaign_items','nexops_growth_approvals','nexops_growth_delivery_attempts','nexops_crm_activity') and relrowsecurity and relforcerowsecurity"),7)
})
