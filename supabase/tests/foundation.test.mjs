import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { PGlite } = require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite')
const db = new PGlite()
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222', C='33333333-3333-4333-8333-333333333333'
const uuid = () => crypto.randomUUID()
const scalar = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0]
async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated') }
let wa,wb,real,invite
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now()); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
await db.exec(await readFile(new URL('../migrations/202610240001_growth_foundation.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../migrations/202610240002_growth_lifecycle.sql',import.meta.url),'utf8'))
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,null)',[A,'owner@example.test',B,'other@example.test',C,'pending@example.test'])

test('atomic bootstrap is idempotent and creates metadata-only demo with free trial', async () => {
 await asUser(A); wa=await scalar('select public.nexops_bootstrap()'); assert.equal(await scalar('select public.nexops_bootstrap()'),wa)
 assert.equal(await scalar('select count(*)::int from public.nexops_workspaces'),1)
 assert.equal(await scalar('select workspace_type from public.nexops_workspaces where id=$1',[wa]),'demo')
 assert.equal(await scalar('select role from public.nexops_workspace_memberships where workspace_id=$1',[wa]),'owner')
 assert.equal(await scalar("select extract(day from trial_end_date-trial_start_date)::int from public.nexops_profiles"),30)
 await assert.rejects(db.exec("select * from public.nexops_exceptions"),/permission denied/)
 await asUser(B); wb=await scalar('select public.nexops_bootstrap()'); assert.notEqual(wa,wb)
 await asUser(C); await assert.rejects(db.exec('select public.nexops_bootstrap()'),/Confirmed sign-in/)
})
test('RLS isolates organizations workspaces profiles leads and blocks direct membership escalation', async () => {
 await asUser(A)
 assert.equal(await scalar('select count(*)::int from public.nexops_workspaces where id=$1',[wb]),0)
 assert.equal(await scalar('select count(*)::int from public.nexops_profiles where user_id=$1',[B]),0)
 await assert.rejects(db.query('insert into public.nexops_workspace_memberships values($1,$2,$3)',[wb,A,'owner']),/permission denied/)
 await assert.rejects(db.query("select public.nexops_track_event('today_viewed',$1,'{}',$2)",[wb,uuid()]),/access denied/)
 await db.exec('reset role; set role anon'); await assert.rejects(db.exec('select public.nexops_bootstrap()'),/permission denied/)
})
test('workspace create is idempotent and rejects malformed fields atomically', async () => {
 await asUser(A); const id=uuid()
 real=await scalar("select public.nexops_create_workspace('APAC customer','SG','en',$1)",[id])
 assert.equal(await scalar("select public.nexops_create_workspace('Retry','SG','en',$1)",[id]),real)
 await assert.rejects(db.query("select public.nexops_create_workspace('Bad','INVALID','en',$1)",[uuid()]),/check constraint/)
 assert.equal(await scalar('select count(*)::int from public.nexops_workspaces'),2)
})
test('activation requires all three steps, records once, rejects unsafe props and demo CSV claims', async () => {
 await asUser(A)
 const track=async(name,id=uuid())=>db.query('select public.nexops_track_event($1,$2,$3,$4)',[name,wa,{workspace_type:'demo',data_mode:'synthetic'},id])
 await track('today_viewed'); await track('exception_opened')
 assert.equal(await scalar('select activated_at from public.nexops_activation where workspace_id=$1',[wa]),null)
 const id=uuid(); await track('recommended_action_viewed',id); await track('recommended_action_viewed',id)
 assert.ok(await scalar('select activated_at from public.nexops_activation where workspace_id=$1',[wa]))
 await assert.rejects(track('csv_upload_completed'),/customer workspace/)
 await assert.rejects(db.query("select public.nexops_track_event('today_viewed',$1,$2,$3)",[wa,{email:'private@example.test'},uuid()]),/Unsafe event/)
 await assert.rejects(db.query("select public.nexops_track_event('activation_completed',$1,'{}',$2)",[wa,uuid()]),/Unsupported event/)
})
test('consultation persists idempotently with qualification but does not expose it to other tenants', async () => {
 await asUser(A)
 const details={company:'APAC Devices',contact_name:'Test contact',email:'contact@example.test',role:'Supply chain manager',market:'SG',company_size:'51-200',sku_count:200,supplier_count:20,main_problem:'Supplier delays',tools:'Spreadsheet',hiring:true,pilot_scope:'Review supply risks'}
 const request=uuid()
 const lead=await scalar('select public.nexops_submit_consultation($1,$2,$3)',[wa,details,request])
 assert.equal(await scalar('select public.nexops_submit_consultation($1,$2,$3)',[wa,details,request]),lead)
 assert.equal(await scalar('select status from public.nexops_lead_qualification where lead_id=$1',[lead]),'Qualified Lead')
 await asUser(B); assert.equal(await scalar('select count(*)::int from public.nexops_consultation_leads'),0)
 await assert.rejects(db.query('select public.nexops_submit_consultation($1,$2,$3)',[wa,details,uuid()]),/denied/)
})
test('invites are expiring single-use bearer links; viewer cannot access lead PII or escalate', async () => {
 await asUser(A); invite=await scalar("select public.nexops_create_invite($1,'viewer')",[wa])
 await assert.rejects(db.query("select public.nexops_create_invite($1,'owner')",[wa]),/check constraint/)
 await asUser(B); assert.equal(await scalar('select public.nexops_accept_invite($1)',[invite]),wa)
 assert.equal(await scalar('select public.nexops_accept_invite($1)',[invite]),wa)
 assert.equal(await scalar('select count(*)::int from public.nexops_consultation_leads'),0)
 await assert.rejects(db.query("select public.nexops_create_invite($1,'operator')",[wa]),/denied/)
 await db.exec('reset role'); await db.query('update public.nexops_invitations set expires_at=now()-interval \'1 day\' where token=$1',[invite])
 await asUser(B); await assert.rejects(db.query('select public.nexops_accept_invite($1)',[invite]),/expired/)
})
test('growth metrics require explicit internal grant; account preferences cannot self-promote', async () => {
 await asUser(A); await assert.rejects(db.exec('select public.nexops_growth_metrics()'),/admin access/)
 await assert.rejects(db.query('insert into public.nexops_growth_admins values($1)',[A]),/permission denied/)
 await db.exec('reset role'); await db.query('insert into public.nexops_growth_admins values($1)',[A])
 await asUser(A); const metrics=await scalar('select public.nexops_growth_metrics()')
 assert.equal(metrics.registered_users,3); assert.equal(metrics.activated_users,1); assert.equal(metrics.visitors,null)
 await db.exec("select public.nexops_set_preferences(true,'en')"); assert.equal(await scalar('select marketing_opt_in from public.nexops_profiles'),true)
 await db.exec('select public.nexops_request_deletion()'); assert.equal(await scalar('select marketing_opt_in from public.nexops_profiles'),false)
 assert.equal(await scalar('select count(*)::int from public.nexops_deletion_requests'),1)
})
test('lifecycle queues only eligible cohort drafts, respects opt-in and never repeats', async () => {
 const d='55555555-5555-4555-8555-555555555555'
 await db.exec('reset role')
 await db.query("insert into auth.users(id,email,email_confirmed_at,created_at) values($1,'registered@example.test',now(),now()-interval '2 days')",[d])
 await db.exec('set role service_role')
 assert.equal(Number(await scalar("select public.nexops_prepare_lifecycle(now()-interval '7 days')")),2) // B welcome + D welcome; A deletion, C unconfirmed
 assert.equal(Number(await scalar("select public.nexops_prepare_lifecycle(now()-interval '7 days')")),0)
 await db.exec('reset role');assert.equal(await scalar('select count(*)::int from public.nexops_communication_state where user_id=$1',[d]),1)
 await asUser(d);await db.exec("select public.nexops_set_preferences(true,'en')")
 await db.exec('reset role; set role service_role');assert.equal(Number(await scalar("select public.nexops_prepare_lifecycle(now()-interval '7 days')")),1)
 await asUser(d);await db.exec("select public.nexops_set_preferences(false,'en')")
 assert.equal(await scalar("select status from public.nexops_communication_state where kind='activation_reminder'"),'cancelled')
})
test('weekly internal reporting queries execute against the same structured records', async () => {
 await db.exec('reset role')
 const reports=await db.exec(await readFile(new URL('../weekly_growth_report.sql',import.meta.url),'utf8'))
 assert.ok(reports.length>=2)
 assert.equal(reports.at(-1).rows.length,5)
 assert.equal(reports.at(-1).rows[0].step,'Registered')
})
test('activation event is server-generated once and operational demo rows never entered database', async () => {
 await db.exec('reset role')
 assert.equal(await scalar("select count(*)::int from public.nexops_events where user_id=$1 and event_name='activation_completed'",[A]),1)
 for(const table of ['data_imports','exceptions','actions','decisions']) assert.equal(await scalar(`select count(*)::int from public.nexops_${table}`),0)
 await assert.rejects(db.query("insert into public.nexops_data_imports(workspace_id,source_kind,filename,validation_status) values($1,'customer','sample.csv','pending')",[wa]),/customer workspace/)
 await asUser(A); await assert.rejects(db.query('select public.nexops_prepare_lifecycle(now())'),/permission denied/)
 await db.exec('reset role')
 const rows=(await db.query("select relname,relrowsecurity from pg_class where relname like 'nexops_%' and relkind='r'")).rows
 assert.ok(rows.every(r=>r.relrowsecurity))
 await db.close()
})
