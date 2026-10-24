import test from 'node:test'
import assert from 'node:assert/strict'
import {TEMPLATE_REGISTRY,templateHash,contentHash,idempotencyKey,renderApprovedShape,evaluateOutbound,dispatchOutbound,createGmailSendAdapter,buildIdempotentMime,prepareLifecycleOutbound} from '../services/outbound-safety.js'
const variables={site_url:{value:'https://nexops.example.test',verified:true}}
function fixture(kind='welcome'){
 const t=TEMPLATE_REGISTRY[kind],rendered=renderApprovedShape(kind,variables)
 return {automaticDeliveryVerified:true,message:{id:'test-message',recipient_email:'registered@example.test',template_id:kind,template_version:1,category:kind,status:'pending_review',...rendered},recipient:{registered:true,emailVerified:true,email:'registered@example.test',marketingOptIn:true,trialEnd:'2099-01-01T00:00:00Z'},templateApproval:{status:'approved',approved_date:'2026-10-24T00:00:00Z',version:1,content_hash:templateHash(t)},verifiedVariables:variables}
}
test('only exact approved template and verified variables can be automatically allowed',()=>{
 const s=fixture();assert.equal(evaluateOutbound(s.message,s).decision,'AUTO_SEND_ALLOWED')
 for(const patch of [{templateApproval:null},{verifiedVariables:{}},{templateApproval:{...s.templateApproval,version:2}},{templateApproval:{...s.templateApproval,content_hash:'wrong'}}])assert.equal(evaluateOutbound(s.message,{...s,...patch}).decision,'HUMAN_REVIEW_REQUIRED')
 assert.equal(evaluateOutbound(s.message,{...s,recipient:{...s.recipient,trialEnd:'2000-01-01'}}).decision,'HUMAN_REVIEW_REQUIRED')
 assert.equal(evaluateOutbound({...s.message,body:s.message.body+' Extra friendly copy.'},s).decision,'HUMAN_REVIEW_REQUIRED')
 assert.throws(()=>renderApprovedShape('welcome',{site_url:{value:'https://example.test',verified:false}}))
 assert.throws(()=>renderApprovedShape('welcome',{...variables,recipient_name:{value:'invented',verified:true}}))
})
test('legal financial commercial privacy and unsupported claims always require review',()=>{
 const s=fixture()
 for(const text of ['We accept liability.','We guarantee this delivery.','We will refund your freight cost.','Increase the order quantity.','Amending your contract.','Customers achieved 90% savings.','Passport number: private.','As an AI, I suggest this.','Unrecognized free-form copy in another language.']){
  assert.equal(evaluateOutbound({...s.message,body:text},s).decision,'HUMAN_REVIEW_REQUIRED',text)
 }
 assert.equal(evaluateOutbound(s.message,{...s,classifier:{decision:'uncertain'}}).decision,'HUMAN_REVIEW_REQUIRED')
 assert.equal(evaluateOutbound(s.message,{...s,classifier:{decision:'BLOCKED'}}).decision,'BLOCKED')
})
test('suppression consent invalid envelope explicit abuse and duplicates cannot be overridden',()=>{
 const s=fixture('activation_reminder')
 for(const patch of [{suppressed:true},{deletionRequested:true},{emailVerified:false},{marketingOptIn:false},{categoryOptOut:true},{email:'changed@example.test'}])assert.equal(evaluateOutbound(s.message,{...s,recipient:{...s.recipient,...patch}}).decision,'BLOCKED')
 assert.equal(evaluateOutbound(s.message,{...s,duplicate:true}).decision,'BLOCKED')
 assert.equal(evaluateOutbound({...s.message,subject:'Subject\r\nBcc: bad@example.test'},s).decision,'BLOCKED')
 assert.equal(evaluateOutbound({...s.message,body:'Pay or else we expose your information.'},s).decision,'BLOCKED')
 assert.equal(evaluateOutbound({...s.message,body:'Steal their credentials.'},s).decision,'BLOCKED')
 assert.equal(evaluateOutbound({...s.message,category:'welcome'},s).decision,'BLOCKED')
})
test('idempotency includes user workspace event template and stable window, MIME has deterministic Message-ID',()=>{
 const key={workspaceId:'w',userId:'u',eventType:'registration',templateId:'welcome-v1',window:'once'}
 assert.equal(idempotencyKey(key),idempotencyKey({...key}));assert.notEqual(idempotencyKey(key),idempotencyKey({...key,userId:'other'}))
 const s=fixture(),mime=buildIdempotentMime(s.message,'nexops@example.test')
 assert.equal(mime,buildIdempotentMime(s.message,'nexops@example.test'))
 assert.ok(Buffer.from(mime,'base64url').toString().includes('Message-ID: <'))
 assert.equal(contentHash(s.message).length,64)
})
function worker(s,{claim=true,fail=false}={}){
 const calls=[],store={load:async()=>s,recordGate:async()=>calls.push('gate'),recordConnection:async()=>calls.push('verified'),claim:async()=>({claimed:claim,claimToken:'claim',reason:'rate_limit'}),complete:async(_id,_token,status)=>calls.push(status)}
 const provider={verifyConnection:async()=>({sender:'nexops@example.test'}),send:async()=>{calls.push('send');if(fail)throw new Error('timeout');return {providerId:'provider-test-id'}}}
 return {calls,store,provider}
}
test('disabled runtime performs no provider calls; missing review and denied claims never send',async()=>{
 const s=fixture(),w=worker(s)
 assert.equal((await dispatchOutbound(s.message.id,{...w,enabled:false,verifiedVariables:variables})).decision,'BLOCKED');assert.deepEqual(w.calls,[])
 const untested=worker({...s,automaticDeliveryVerified:false});assert.equal((await dispatchOutbound(s.message.id,{...untested,enabled:true,verifiedVariables:variables})).decision,'HUMAN_REVIEW_REQUIRED');assert.ok(!untested.calls.includes('send'))
 const edited={...s,message:{...s.message,body:'Uncertain content'}};const review=worker(edited)
 assert.equal((await dispatchOutbound(edited.message.id,{...review,enabled:true,verifiedVariables:variables})).decision,'HUMAN_REVIEW_REQUIRED');assert.ok(!review.calls.includes('send'))
 const limited=worker(s,{claim:false});assert.equal((await dispatchOutbound(s.message.id,{...limited,enabled:true,verifiedVariables:variables})).decision,'BLOCKED');assert.ok(!limited.calls.includes('send'))
})
test('approved human snapshot still cannot bypass explicit block, and later edits invalidate approval',async()=>{
 const s=fixture();s.message.body='We accept liability.';s.reviewedHash=contentHash(s.message)
 const w=worker(s);assert.equal((await dispatchOutbound(s.message.id,{...w,enabled:true,verifiedVariables:variables})).delivery,'sent')
 s.message.body='Pay or else we expose your information.';s.reviewedHash=contentHash(s.message)
 const blocked=worker(s);assert.equal((await dispatchOutbound(s.message.id,{...blocked,enabled:true,verifiedVariables:variables})).decision,'BLOCKED');assert.ok(!blocked.calls.includes('send'))
 s.message.body='Edited since the review.';const stale=worker(s);assert.equal((await dispatchOutbound(s.message.id,{...stale,enabled:true,verifiedVariables:variables})).decision,'HUMAN_REVIEW_REQUIRED');assert.ok(!stale.calls.includes('send'))
})
test('timeout or crash state is never automatically retried',async()=>{
 const s=fixture(),w=worker(s,{fail:true})
 const result=await dispatchOutbound(s.message.id,{...w,enabled:true,verifiedVariables:variables});assert.equal(result.delivery,'delivery_unknown');assert.equal(w.calls.filter(c=>c==='send').length,1);assert.ok(w.calls.includes('delivery_unknown'))
 for(const status of ['delivery_unknown','sending','sent','draft','cancelled','rejected','blocked']){
  const held=worker({...s,message:{...s.message,status}});await dispatchOutbound(s.message.id,{...held,enabled:true,verifiedVariables:variables});assert.ok(!held.calls.includes('send'))
 }
})
test('Gmail adapter verifies exact account and sends only through a supplied test transport',async()=>{
 const calls=[],adapter=createGmailSendAdapter({sender:'nexops@example.test',getAccessToken:async()=>'local-fixture-token',fetch:async(url,options)=>{calls.push({url,method:options.method || 'GET'});return {ok:true,json:async()=>url.endsWith('/profile')?{emailAddress:'nexops@example.test'}:{id:'local-provider-id'}}}})
 assert.equal((await adapter.verifyConnection()).verified,true)
 assert.equal((await adapter.send(fixture().message)).providerId,'local-provider-id')
 assert.equal(calls[1].method,'POST');assert.ok(calls[1].url.endsWith('/messages/send'))
 const mismatch=createGmailSendAdapter({sender:'other@example.test',getAccessToken:async()=>'local-fixture-token',fetch:async()=>({ok:true,json:async()=>({emailAddress:'nexops@example.test'})})})
 await assert.rejects(mismatch.verifyConnection(),/does not match/)
})

test('existing lifecycle drafts prepare bounded idempotent queue records without sending',async()=>{
 const queued=[],store={lifecycleCandidates:async()=>[{workspace_id:'workspace',user_id:'registered',kind:'welcome'}],enqueue:async m=>{queued.push(m);return m.idempotency_key}}
 const first=await prepareLifecycleOutbound({store,siteUrl:'https://nexops.example.test'}),again=await prepareLifecycleOutbound({store,siteUrl:'https://nexops.example.test'})
 assert.deepEqual(first,again);assert.equal(queued[0].source_event,'lifecycle:welcome');assert.ok(!queued[0].recipient_email);assert.equal(queued[0].body,queued[1].body)
 await assert.rejects(prepareLifecycleOutbound({store,siteUrl:'https://nexops.example.test',limit:1000}),/1–10/)
})
