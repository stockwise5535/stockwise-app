import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'
import {TEMPLATE_REGISTRY,templateHash,contentHash,renderApprovedShape,idempotencyKey} from '../../services/outbound-safety.js'
const require=createRequire(import.meta.url),{PGlite}=require(process.env.NEXOPS_PGLITE_PATH || '@electric-sql/pglite')
const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333'
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
async function owner(){await db.exec('reset role')}
async function user(id){await owner();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
async function server(){await owner();await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role')}
const rpc=(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)
let wa,wb,wc,id,token
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`)
for(const filename of ['202610240001_growth_foundation.sql','202610240002_growth_lifecycle.sql','202610240003_outbound_safety.sql'])await db.exec(await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8'))
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now())',[A,'a@example.test',B,'b@example.test',C,'c@example.test'])
await user(A);wa=await rpc('nexops_bootstrap');await user(B);wb=await rpc('nexops_bootstrap');await user(C);wc=await rpc('nexops_bootstrap')
function draft(w,u,kind='welcome',window='once') {return {workspace_id:w,recipient_user_id:u,category:kind,template_id:kind,template_version:1,...renderApprovedShape(kind,{site_url:{verified:true,value:'https://nexops.example.test'}}),source_event:kind==='welcome' && u===A?'sender_connection_test':'local-fixture-only',idempotency_key:idempotencyKey({workspaceId:w,userId:u,eventType:kind,templateId:kind,window})}}
const gate=(decision='AUTO_SEND_ALLOWED')=>({decision,risk_flags:[],reasons:['local test fixture']})
async function classify(messageId,decision='AUTO_SEND_ALLOWED'){const s=await rpc('nexops_load_outbound',[messageId]);await rpc('nexops_record_outbound_gate',[messageId,gate(decision),s.message.content_hash]);return s.message.content_hash}

test('new outbound tables default deny; service template registration preserves version approvals',async()=>{
 await owner();assert.equal(await scalar('select sending_enabled from public.nexops_mail_runtime'),false)
 await user(A);await assert.rejects(db.query('insert into public.nexops_mail_runtime(singleton) values(true)'),/permission denied/)
 await assert.rejects(rpc('nexops_register_email_template',[{}]),/permission denied/)
 await server();for(const t of Object.values(TEMPLATE_REGISTRY))await rpc('nexops_register_email_template',[{...t,content_hash:templateHash(t)}])
 await rpc('nexops_register_email_template',[{...TEMPLATE_REGISTRY.welcome,content_hash:templateHash(TEMPLATE_REGISTRY.welcome)}])
 await assert.rejects(rpc('nexops_register_email_template',[{...TEMPLATE_REGISTRY.welcome,content_hash:'0'.repeat(64)}]),/new version/)
 await user(A);assert.equal(await scalar('select count(*)::int from public.nexops_email_templates'),0)
 await assert.rejects(rpc('nexops_approve_email_template',['welcome',1,templateHash(TEMPLATE_REGISTRY.welcome)]),/administrator/)
})
test('canonical recipient and source workspace enforced; enqueue deduplicates without reusing changed content',async()=>{
 await server();id=await rpc('nexops_enqueue_outbound',[draft(wa,A)])
 assert.equal(await rpc('nexops_enqueue_outbound',[draft(wa,A)]),id)
 await assert.rejects(rpc('nexops_enqueue_outbound',[{...draft(wa,A),body:'Changed content'}]),/different content/)
 await assert.rejects(rpc('nexops_enqueue_outbound',[draft(wa,B)]),/workspace recipient/)
 await assert.rejects(rpc('nexops_enqueue_outbound',[{...draft(wa,A),category:'wrong'}]),/category mismatch/)
 const s=await rpc('nexops_load_outbound',[id]);assert.equal(s.message.recipient_email,'a@example.test');assert.equal(s.message.content_hash,contentHash(s.message))
 await user(B);assert.equal(await scalar('select count(*)::int from public.nexops_outbound_messages'),0)
 await user(A);assert.equal(await scalar('select count(*)::int from public.nexops_outbound_messages'),1)
 await assert.rejects(rpc('nexops_enqueue_outbound',[draft(wa,A)]),/permission denied/)
 await assert.rejects(rpc('nexops_claim_outbound',[id,s.message.content_hash,'AUTO_SEND_ALLOWED']),/permission denied/)
})
test('explicit reviewer required; every review choice is appended and edits bind the exact hash',async()=>{
 await user(A);await assert.rejects(rpc('nexops_review_outbound',[id,'Approve and Send',null,null,'Reviewed']),/Assigned outbound reviewer/)
 await owner();await db.query('insert into public.nexops_outbound_reviewers values($1,$2)',[wa,A]);await db.query('insert into public.nexops_growth_admins values($1)',[A])
 await user(A)
 for(const action of ['Reject','Cancel','Save as Draft','Approve and Send'])await rpc('nexops_review_outbound',[id,action,null,null,'Local human review'])
 await rpc('nexops_review_outbound',[id,'Edit and Send','Reviewed subject','Reviewed body','Local edit review'])
 assert.equal(await scalar('select count(*)::int from public.nexops_outbound_history where message_id=$1 and actor_id=$2',[id,A]),5)
 const m=(await db.query('select * from public.nexops_outbound_messages where id=$1',[id])).rows[0]
 assert.equal(m.reviewed_hash,contentHash(m));assert.equal(m.reviewed_by,A);assert.equal(m.status,'queued');assert.equal(m.gate_outcome,null)
 await user(B);await assert.rejects(rpc('nexops_review_outbound',[id,'Reject',null,null,'Unauthorized']),/reviewer/)
})
test('sender is disabled until a verified connection and explicit administrator enable',async()=>{
 await user(A);await assert.rejects(rpc('nexops_enable_mail',[true]),/Tested Gmail connection/)
 await server();const hash=await classify(id,'HUMAN_REVIEW_REQUIRED')
 assert.equal((await rpc('nexops_claim_outbound',[id,hash,'HUMAN_REVIEW_REQUIRED'])).reason,'sender_disabled_or_unverified')
 await rpc('nexops_record_mail_connection',['a@example.test'])
 const senderContext=await rpc('nexops_sender_test_context');assert.equal(senderContext.user_id,A);assert.equal(senderContext.workspace_id,wa)
 await assert.rejects(rpc('nexops_record_mail_connection',['other@example.test']),/Sender change/)
 await user(A);await rpc('nexops_enable_mail',[true]);await rpc('nexops_approve_email_template',['welcome',1,templateHash(TEMPLATE_REGISTRY.welcome)])
 await server();const claimed=await rpc('nexops_claim_outbound',[id,hash,'HUMAN_REVIEW_REQUIRED']);assert.equal(claimed.claimed,true);token=claimed.claimToken
 assert.equal((await rpc('nexops_claim_outbound',[id,hash,'HUMAN_REVIEW_REQUIRED'])).claimed,false)
})
test('ambiguous/sent deliveries cannot be requeued, and claim tokens protect outcome logging',async()=>{
 await server();await assert.rejects(rpc('nexops_complete_outbound',[id,crypto.randomUUID(),'sent','fake-provider-id']),/claim mismatch/)
 await rpc('nexops_complete_outbound',[id,token,'delivery_unknown',null])
 await user(A);await assert.rejects(rpc('nexops_confirm_mail_test',[id]),/self-addressed/)
 await user(A);await assert.rejects(rpc('nexops_review_outbound',[id,'Approve and Send',null,null,'Try again']),/cannot be requeued/)
 await server();const s=await rpc('nexops_load_outbound',[id]);assert.equal(s.message.status,'delivery_unknown')
 const next=await rpc('nexops_enqueue_outbound',[draft(wa,A,'welcome','second-window')]),hash=await classify(next)
 assert.equal((await rpc('nexops_claim_outbound',[next,hash,'AUTO_SEND_ALLOWED'])).reason,'sender_delivery_test_required')
})
test('automatic claims require current template approval, classification and current consent',async()=>{
 await server();const next=await rpc('nexops_enqueue_outbound',[draft(wb,B)]),hash=await classify(next)
 assert.equal((await rpc('nexops_claim_outbound',[next,'0'.repeat(64),'AUTO_SEND_ALLOWED'])).claimed,false)
 assert.equal((await rpc('nexops_claim_outbound',[next,hash,'AUTO_SEND_ALLOWED'])).reason,'sender_delivery_test_required')
 const own=await rpc('nexops_enqueue_outbound',[draft(wa,A,'welcome','verified-self-test')]);await user(A);await rpc('nexops_review_outbound',[own,'Approve and Send',null,null,'Reviewed test fixture'])
 await owner();await db.query("update public.nexops_outbound_messages set status='sent',provider_id='local-provider-fixture' where id=$1",[own]);await user(A);await rpc('nexops_confirm_mail_test',[own]);await server()
 const claim=await rpc('nexops_claim_outbound',[next,hash,'AUTO_SEND_ALLOWED']);assert.equal(claim.claimed,true)
 await rpc('nexops_complete_outbound',[next,claim.claimToken,'sent','local-test-provider-id'])
 const repeated=await rpc('nexops_enqueue_outbound',[draft(wa,A,'welcome','second-window')]),repeatedHash=await classify(repeated);assert.equal((await rpc('nexops_claim_outbound',[repeated,repeatedHash,'AUTO_SEND_ALLOWED'])).reason,'rate_limit')
 const reminder=await rpc('nexops_enqueue_outbound',[draft(wc,C,'activation_reminder')]),reminderHash=await classify(reminder)
 assert.equal((await rpc('nexops_claim_outbound',[reminder,reminderHash,'AUTO_SEND_ALLOWED'])).reason,'recipient_or_consent_changed')
 await user(C);await rpc('nexops_set_preferences',[true,'en'])
 await server();assert.equal((await rpc('nexops_claim_outbound',[reminder,reminderHash,'AUTO_SEND_ALLOWED'])).reason,'template_not_approved_for_auto_send')
 await user(A);await rpc('nexops_approve_email_template',['activation_reminder',1,templateHash(TEMPLATE_REGISTRY.activation_reminder)])
 await user(C);await rpc('nexops_set_preferences',[false,'en'])
 await server();assert.equal((await rpc('nexops_claim_outbound',[reminder,reminderHash,'AUTO_SEND_ALLOWED'])).reason,'recipient_or_consent_changed')
})
test('suppression and global quota are rechecked atomically even for approved content',async()=>{
 await user(C);await rpc('nexops_set_preferences',[true,'en']);await owner();await db.exec("insert into public.nexops_email_suppressions(email,reason) values('c@example.test','unsubscribed')")
 await server();const reminder=await rpc('nexops_enqueue_outbound',[draft(wc,C,'activation_reminder')]),hash=await classify(reminder)
 assert.equal((await rpc('nexops_claim_outbound',[reminder,hash,'AUTO_SEND_ALLOWED'])).reason,'recipient_suppressed_or_removed')
 await owner();await db.exec('update public.nexops_mail_runtime set hourly_limit=10,daily_limit=1')
 const report=await db.query("select relname,relrowsecurity from pg_class where relname in ('nexops_outbound_messages','nexops_email_templates','nexops_outbound_history','nexops_outbound_reviewers','nexops_mail_runtime','nexops_email_suppressions')")
 assert.equal(report.rows.length,6);assert.ok(report.rows.every(r=>r.relrowsecurity))
 const D='44444444-4444-4444-8444-444444444444';await owner();await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'d@example.test',now())",[D]);await user(D);const wd=await rpc('nexops_bootstrap');await server();const fourth=await rpc('nexops_enqueue_outbound',[draft(wd,D)]),fourthHash=await classify(fourth);assert.equal((await rpc('nexops_claim_outbound',[fourth,fourthHash,'AUTO_SEND_ALLOWED'])).reason,'rate_limit');await owner();await db.exec('update public.nexops_mail_runtime set hourly_limit=1,daily_limit=50');await server();assert.equal((await rpc('nexops_claim_outbound',[fourth,fourthHash,'AUTO_SEND_ALLOWED'])).reason,'rate_limit')
 await owner();await db.query("insert into public.nexops_communication_state(user_id,kind) values($1,'welcome'),($2,'activation_reminder'),($3,'activation_reminder')",[A,B,C]);await server();const candidates=await rpc('nexops_lifecycle_outbound_candidates',[10]);assert.equal(candidates.length,1);assert.equal(candidates[0].user_id,A);await assert.rejects(rpc('nexops_lifecycle_outbound_candidates',[1000]),/1-10/)
 await owner();const inventory=await db.exec(await readFile(new URL('../hosted_catalog_inventory.sql',import.meta.url),'utf8'));assert.equal(inventory[2].rows.length,26);assert.ok(inventory[2].rows.every(row=>row.present && row.rls_enabled))
 await db.close()
})
