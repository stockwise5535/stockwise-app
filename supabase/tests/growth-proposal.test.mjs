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
test('proposal binds approval to current hash and actor, invalidates edits, and atomically reserves once',async()=>{
 await as(A)
 const save=async payload=>Object.values((await db.query('select public.nexops_crm_save_draft($1,$2::jsonb,$3)',[wa,JSON.stringify(payload),'email'])).rows[0])[0]
 const id=await save({recipient:'one@example.invalid',body:'fixture'})
 let item=(await db.query('select * from public.nexops_growth_campaign_items where id=$1',[id])).rows[0]
 await assert.rejects(db.query('select public.nexops_crm_approve($1,$2,1,$3)',[wa,id,'f'.repeat(64)]),/mismatch/)
 await db.query('select public.nexops_crm_approve($1,$2,1,$3)',[wa,id,item.content_hash])
 assert.equal(await scalar("select count(*)::int from public.nexops_growth_approvals where approved_by=auth.uid()"),1)
 await db.query('select public.nexops_crm_save_draft($1,$2::jsonb,$3,$4)',[wa,JSON.stringify({recipient:'one@example.invalid',body:'changed'}),'email',id])
 await assert.rejects(db.query('select public.nexops_crm_claim($1,$2,1,$3)',[wa,id,item.content_hash]),/denied/)
 item=(await db.query('select * from public.nexops_growth_campaign_items where id=$1',[id])).rows[0];assert.equal(item.version,2);assert.equal(item.status,'draft')
 await as(B);await assert.rejects(db.query('select public.nexops_crm_approve($1,$2,2,$3)',[wa,id,item.content_hash]),/access denied/)
 await as(A);await db.query('select public.nexops_crm_approve($1,$2,2,$3)',[wa,id,item.content_hash])
 const results=await Promise.allSettled([1,2].map(()=>db.query('select public.nexops_crm_claim($1,$2,2,$3)',[wa,id,item.content_hash])))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 assert.equal(await scalar('select count(*)::int from public.nexops_growth_delivery_attempts'),1)
 await assert.rejects(db.query('select public.nexops_crm_save_draft($1,$2::jsonb,$3,$4)',[wa,'{"body":"edited"}','email',id]),/immutable/)
 await db.exec('reset role');await assert.rejects(db.exec('update public.nexops_growth_approvals set approved_at=now()'),/append only/)
 await assert.rejects(db.exec('delete from public.nexops_crm_activity'),/append only/)
})
test('proposal denies forged approval actors, duplicate payloads and quota exhaustion',async()=>{
 await as(A)
 const payload=JSON.stringify({recipient:'quota@example.invalid',body:'unique'})
 const id=Object.values((await db.query('select public.nexops_crm_save_draft($1,$2::jsonb,$3)',[wa,payload,'email'])).rows[0])[0]
 const item=(await db.query('select * from public.nexops_growth_campaign_items where id=$1',[id])).rows[0]
 await db.exec('reset role')
 await assert.rejects(db.query('insert into public.nexops_growth_approvals(workspace_id,item_id,version,approved_by,content_hash) values($1,$2,1,$3,$4)',[wa,id,B,item.content_hash]),/actor mismatch/)
 await as(A)
 await db.query('select public.nexops_crm_approve($1,$2,1,$3)',[wa,id,item.content_hash])
 await db.query('select public.nexops_crm_approve($1,$2,1,$3)',[wa,id,item.content_hash])
 assert.equal(Number((await db.query("select count(*) from public.nexops_crm_activity where source_event_id=$1",['approval:'+id+':1'])).rows[0].count),1)
 await db.query('select public.nexops_crm_claim($1,$2,1,$3)',[wa,id,item.content_hash])
 const duplicate=Object.values((await db.query('select public.nexops_crm_save_draft($1,$2::jsonb,$3)',[wa,payload,'email'])).rows[0])[0]
 await db.query('select public.nexops_crm_approve($1,$2,1,$3)',[wa,duplicate,item.content_hash])
 await assert.rejects(db.query('select public.nexops_crm_claim($1,$2,1,$3)',[wa,duplicate,item.content_hash]),/unique constraint/)
 await db.exec('reset role')
 await db.query("insert into public.nexops_growth_delivery_attempts(workspace_id,item_id,identity_hash,state) select $1,$2,md5(i::text)||md5(i::text),'sending' from generate_series(1,8) i",[wa,id])
 await as(A);await assert.rejects(db.query('select public.nexops_crm_claim($1,$2,1,$3)',[wa,duplicate,item.content_hash]),/Rate limited/)
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.nexops_crm_claim($1,$2,1,$3)',[wa,duplicate,item.content_hash]),/permission denied/)
})
test('proposal rollback refuses records; empty disposable rollback preserves all foundation tables',async()=>{
 await db.exec('reset role')
 const rollback=await readFile(new URL('../../docs/proposals/APAC_GROWTH_CRM_ROLLBACK.sql',import.meta.url),'utf8')
 await assert.rejects(db.exec(rollback),/CRM records exist/);await db.exec('rollback')
 // Destructive cleanup is ONLY inside this disposable in-memory test database.
 await db.exec('truncate public.nexops_crm_activity,public.nexops_growth_delivery_attempts,public.nexops_growth_approvals,public.nexops_growth_campaign_items,public.nexops_crm_contacts,public.nexops_crm_companies,public.nexops_growth_population')
 await db.exec(rollback)
 assert.equal(await scalar("select count(*)::int from pg_tables where schemaname='public' and tablename like 'nexops_%'"),26)
 assert.equal(await scalar('select count(*)::int from public.nexops_workspaces'),2)
})
