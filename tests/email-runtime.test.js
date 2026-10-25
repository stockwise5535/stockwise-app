import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {emailSendPolicy,restrictedMessageAllowed,TEST_TEMPLATE_IDS} from '../services/email-send-policy.js'
import {gmailTokenProvider} from '../services/gmail-oauth.js'
import {TEMPLATE_REGISTRY,renderApprovedShape,templateHash,contentHash,dispatchOutbound,createGmailSendAdapter} from '../services/outbound-safety.js'
const env={EMAIL_SEND_MODE:'test_recipient',GMAIL_SENDER_EMAIL:'sender@example.test',NEXOPS_GMAIL_APPROVED_SENDER:'sender@example.test',NEXOPS_GMAIL_TEST_RECIPIENT:'tester@example.test'},policy=emailSendPolicy(env)
const vars={site_url:{value:'https://nexops.example.test',verified:true}}
function fixture(kind='welcome'){
 const message={id:'test-runtime-message',template_id:kind,template_version:1,category:kind,recipient_email:policy.testRecipient,status:'queued',source_event:'reviewed_template_test',...renderApprovedShape(kind,vars)}
 const state={message,activationReminderEligible:true,consultationVerified:true,invitationVerified:true,automaticDeliveryVerified:true,reviewedHash:contentHash(message),recipient:{registered:true,emailVerified:true,email:policy.testRecipient,marketingOptIn:true,trialEnd:'2099-01-01'},templateApproval:{status:'approved',approved_date:'2026-10-24',version:1,content_hash:templateHash(TEMPLATE_REGISTRY[kind])}}
 const calls=[];const store={load:async()=>state,recordGate:async(_id,g)=>calls.push('gate:'+g.decision),recordConnection:async()=>calls.push('connection'),claim:async()=>{calls.push('claim');return {claimed:true,claimToken:'fixture'}},complete:async(_id,_token,status)=>{calls.push(status);state.message.status=status}}
 const provider={verifyConnection:async()=>({sender:policy.sender}),send:async()=>{calls.push('send');return {providerId:'fixture-provider'}}}
 return {state,calls,store,provider}
}
const dispatch=w=>dispatchOutbound(w.state.message.id,{...w,enabled:true,verifiedVariables:vars,sendPolicy:policy})
test('default draft_only and unknown/production modes cannot deliver',async()=>{
 assert.equal(emailSendPolicy({}).mode,'draft_only');for(const mode of ['production','auto','', 'test_recipient '])assert.throws(()=>emailSendPolicy({...env,EMAIL_SEND_MODE:mode}))
 const w=fixture();assert.equal((await dispatchOutbound(w.state.message.id,{...w,enabled:true,verifiedVariables:vars})).decision,'BLOCKED');assert.deepEqual(w.calls,[])
 assert.throws(()=>emailSendPolicy({...env,NEXOPS_GMAIL_APPROVED_SENDER:'other@example.test'}));assert.throws(()=>emailSendPolicy({...env,NEXOPS_GMAIL_TEST_RECIPIENT:''}))
})
test('actual worker draft mode blocks before network/config, and never leaks injected secrets',()=>{
 const secret='fixture-never-print-this-secret'
 const r=spawnSync(process.execPath,['scripts/outbound-worker.mjs','--message','11111111-1111-4111-8111-111111111111'],{encoding:'utf8',env:{...process.env,EMAIL_SEND_MODE:'draft_only',GMAIL_CLIENT_SECRET:secret,GMAIL_REFRESH_TOKEN:secret,NEXOPS_GMAIL_SEND_ENABLED:'true'}})
 assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'blocked_draft_only');assert.ok(!(r.stdout+r.stderr).includes(secret))
 const bad=spawnSync(process.execPath,['scripts/outbound-worker.mjs','--verify-connection'],{encoding:'utf8',env:{...process.env,EMAIL_SEND_MODE:'production'}});assert.equal(JSON.parse(bad.stdout).status,'blocked_invalid_email_send_policy')
})
test('transport itself cannot send in draft mode or to another recipient/template',async()=>{
 let network=0
 const adapter=createGmailSendAdapter({sender:policy.sender,getAccessToken:async()=>{network++;return 'fixture'},fetch:async()=>{network++;throw Error('Must not call')}})
 await assert.rejects(adapter.send(fixture().state.message),/policy denied/);assert.equal(network,0)
 const restricted=createGmailSendAdapter({sender:policy.sender,sendPolicy:policy,getAccessToken:async()=>{network++;return 'fixture'},fetch:async()=>{network++;throw Error('Must not call')}})
 await assert.rejects(restricted.send({...fixture().state.message,recipient_email:'customer@example.test'}),/policy denied/);assert.equal(network,0)
 assert.equal(restrictedMessageAllowed({...fixture().state.message,template_id:'csv_reminder'},policy),false)
})
test('only four exact approved individually reviewed templates can pass all test gates',async()=>{
 assert.deepEqual(TEST_TEMPLATE_IDS,['welcome','activation_reminder','consultation_confirmation','workspace_invitation'])
 for(const kind of TEST_TEMPLATE_IDS){const w=fixture(kind);assert.equal((await dispatch(w)).delivery,'sent',kind);assert.deepEqual(w.calls.slice(-3),['claim','send','sent'])}
 for(const kind of ['consultation_confirmation','workspace_invitation']){assert.equal(TEMPLATE_REGISTRY[kind].status,'draft');assert.equal(TEMPLATE_REGISTRY[kind].requires_human_review,true)}
})
test('approval consent suppression duplicate recipient and self-test gates cannot be bypassed by review',async()=>{
 for(const mutate of [w=>w.state.templateApproval.status='draft',w=>w.state.templateApproval.content_hash='stale',w=>w.state.recipient.marketingOptIn=false,w=>w.state.recipient.suppressed=true,w=>w.state.duplicate=true,w=>w.state.message.recipient_email='customer@example.test',w=>w.state.automaticDeliveryVerified=false,w=>{w.state.message.body+=' arbitrary copy';w.state.reviewedHash=contentHash(w.state.message)}]){const w=fixture();mutate(w);assert.equal((await dispatch(w)).decision,'BLOCKED');assert.ok(!w.calls.includes('send'));assert.ok(w.calls.some(c=>c.startsWith('gate:')))}
 const w=fixture();w.state.reviewedHash=null;assert.equal((await dispatch(w)).decision,'HUMAN_REVIEW_REQUIRED');assert.ok(!w.calls.includes('claim'))
})
test('self-test is only reviewed source-bound approved self-addressed message',async()=>{
 const selfPolicy=emailSendPolicy({...env,NEXOPS_GMAIL_TEST_RECIPIENT:env.GMAIL_SENDER_EMAIL})
 assert.equal(restrictedMessageAllowed({template_id:'sender_test',recipient_email:env.GMAIL_SENDER_EMAIL,source_event:'sender_connection_test'},selfPolicy),true)
 assert.equal(restrictedMessageAllowed({template_id:'sender_test',recipient_email:env.GMAIL_SENDER_EMAIL,source_event:'sender_connection_test'},policy),false)
 assert.equal(restrictedMessageAllowed({template_id:'sender_test',recipient_email:env.GMAIL_SENDER_EMAIL,source_event:'freeform'},selfPolicy),false)
})
test('OAuth refresh verifies grants, caches safely, and refreshes after expiry',async()=>{
 let count=0,clock=0
 const get=gmailTokenProvider({clientId:'fixture-client',clientSecret:'fixture-secret',refreshToken:'fixture-refresh',now:()=>clock,fetch:async(_url,o)=>{count++;assert.equal(o.redirect,'error');assert.equal(o.body.get('grant_type'),'refresh_token');return {ok:true,json:async()=>({access_token:'fixture-access',expires_in:120,scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.metadata'})}}})
 assert.equal(await get(),'fixture-access');await get();assert.equal(count,1);clock=61000;await get();assert.equal(count,2)
 for(const data of [{access_token:'fixture-access'},{access_token:'fixture-access',scope:'https://www.googleapis.com/auth/gmail.send'}])await assert.rejects(gmailTokenProvider({clientId:'a',clientSecret:'b',refreshToken:'c',fetch:async()=>({ok:true,json:async()=>data})})(),/grants/)
 await assert.rejects(gmailTokenProvider({clientId:'a',clientSecret:'b',refreshToken:'c',fetch:async()=>({ok:false,json:async()=>({error:'fixture-secret'})})})(),e=>!e.message.includes('fixture-secret'))
})
test('Gmail timeout/missing receipt writes unknown delivery and never retries provider POST',async()=>{
 for(const failure of ['timeout','missing_receipt','http_error']){
  const w=fixture();let sends=0
  w.provider=createGmailSendAdapter({sender:policy.sender,sendPolicy:policy,getAccessToken:async()=>'fixture-access-token',fetch:async(url)=>{
   if(url.endsWith('/profile'))return {ok:true,json:async()=>({emailAddress:policy.sender})}
   sends++;if(failure==='timeout')throw Error('timeout');return {ok:failure!=='http_error',json:async()=>({})}
  }})
  const result=await dispatch(w);assert.equal(result.delivery,'delivery_unknown');assert.ok(w.calls.includes('delivery_unknown'));assert.equal(w.state.message.status,'delivery_unknown');await dispatch(w);assert.equal(sends,1)
 }
})
test('transactional source records and 24-hour reminder eligibility must be verified',async()=>{
 for(const [kind,flag]of [['consultation_confirmation','consultationVerified'],['workspace_invitation','invitationVerified'],['activation_reminder','activationReminderEligible']]){
  const w=fixture(kind);w.state[flag]=false;assert.equal((await dispatch(w)).decision,'BLOCKED');assert.ok(!w.calls.includes('send'))
 }
})
