// Offline verification only: no network, credentials or provider delivery.
import test from 'node:test'
import assert from 'node:assert/strict'
import {TEMPLATE_REGISTRY,templateHash,renderApprovedShape,evaluateOutbound,dispatchOutbound} from '../services/outbound-safety.js'
const variables={site_url:{value:'https://nexops.example.test',verified:true}}
function fixture(){return {automaticDeliveryVerified:true,message:{id:'external-verification-fixture',recipient_email:'verified@example.test',template_id:'activation_reminder',template_version:1,category:'activation_reminder',status:'pending_review',...renderApprovedShape('activation_reminder',variables)},recipient:{registered:true,emailVerified:true,email:'verified@example.test',marketingOptIn:true},templateApproval:{status:'approved',approved_date:'2026-10-24',version:1,content_hash:templateHash(TEMPLATE_REGISTRY.activation_reminder)},verifiedVariables:variables}}
const cases={compensation:'We will provide compensation.',refund:'We will refund the charges.',damages:'We will pay damages.',legal_liability:'We accept liability.',contract_changes:'We approve the contract changes.',price_changes:'We approve a price change.',po_quantity_changes:'Increase the PO order quantity.',supplier_changes:'Replace the supplier.',expedite_cost_commitments:'We will cover all expedite costs.',unsupported_claims:'Customers achieved 90% savings.',uncertain_freeform_ai:'Perhaps an AI could promise a better result.'}
for(const [name,body] of Object.entries(cases))test(`external safety matrix: ${name} never automatically allowed`,()=>{const s=fixture();assert.ok(['HUMAN_REVIEW_REQUIRED','BLOCKED'].includes(evaluateOutbound({...s.message,body},s).decision))})
for(const [name,patch]of Object.entries({unsubscribed:{marketingOptIn:false},suppressed:{suppressed:true},category_optout:{categoryOptOut:true}}))test(`external safety matrix: ${name} blocked`,()=>{const s=fixture();assert.equal(evaluateOutbound(s.message,{...s,recipient:{...s.recipient,...patch}}).decision,'BLOCKED')})
test('external safety matrix: duplicate event blocked',()=>{const s=fixture();assert.equal(evaluateOutbound(s.message,{...s,duplicate:true}).decision,'BLOCKED')})
test('uncertain AI classification cannot allow exact approved copy',()=>{const s=fixture();assert.equal(evaluateOutbound(s.message,{...s,classifier:{decision:'uncertain'}}).decision,'HUMAN_REVIEW_REQUIRED')})
for(const failure of ['timeout','missing_provider_id','lost_audit_response'])test(`UNKNOWN_DELIVERY semantics: ${failure} is held without retry`,async()=>{
 const s=fixture();let sends=0;const statuses=[]
 const store={load:async()=>s,recordGate:async()=>{},recordConnection:async()=>{},claim:async()=>({claimed:true,claimToken:'fixture'}),complete:async(_id,_token,status)=>{if(failure==='lost_audit_response'&&status==='sent')throw Error('lost response');statuses.push(status);s.message.status=status}}
 const provider={verifyConnection:async()=>({sender:'sender@example.test'}),send:async()=>{sends++;if(failure!=='lost_audit_response')throw Error(failure);return {providerId:'fixture-provider-id'}}}
 const first=await dispatchOutbound(s.message.id,{store,provider,enabled:true,verifiedVariables:variables});assert.equal(first.delivery,'delivery_unknown');assert.ok(first.risk_flags.includes('no_automatic_retry'));assert.deepEqual(statuses,['delivery_unknown'])
 await dispatchOutbound(s.message.id,{store,provider,enabled:true,verifiedVariables:variables});assert.equal(sends,1)
})
