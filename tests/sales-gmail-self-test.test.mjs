import test from 'node:test';
import assert from 'node:assert/strict';
import {sendSalesGmailSelfTest} from '../server/sales-gmail-self-test.mjs';
const env={STOCKWISE_SALES_SELF_TEST_ENABLED:'true',STOCKWISE_SALES_SEND_ENABLED:'false',STOCKWISE_SALES_GMAIL_FROM:'nexops2026test@gmail.com'};
const input={env,recipient:'nexops2026test@gmail.com',subject:'Stockwise self test',body:'Internal smoke test',unsubscribeUrl:'https://example.com/optout',unsubscribeMailto:'unsubscribe@example.com',contactId:'123e4567-e89b-12d3-a456-426614174000',idempotencyKey:'self-test-unique-12345'};
const refresh=async()=>({ok:true,accessToken:'test-access'});
const reserve=async()=>({ok:true,reservationId:'123e4567-e89b-12d3-a456-426614174001'});
test('never sends to an external address',async()=>{
 let calls=0;
 const r=await sendSalesGmailSelfTest({...input,recipient:'outside@example.com',fetchImpl:async()=>{calls++;}});
 assert.equal(r.ok,false);assert.equal(calls,0);
});
test('never sends with main send enabled',async()=>{
 const r=await sendSalesGmailSelfTest({...input,env:{...env,STOCKWISE_SALES_SEND_ENABLED:'true'}});
 assert.equal(r.ok,false);
});
test('self test marks confirmed provider id as sent',async()=>{
 let state;
 const r=await sendSalesGmailSelfTest({...input,refresh,reserve,mark:async x=>{state=x.state;return {ok:true};},
  fetchImpl:async()=>({ok:true,json:async()=>({id:'gmail-message-id'})})});
 assert.equal(r.ok,true);assert.equal(state,'sent');
});
test('network failure becomes uncertain, never retries',async()=>{
 let calls=0,state;
 const r=await sendSalesGmailSelfTest({...input,refresh,reserve,mark:async x=>{state=x.state;return {ok:true};},
  fetchImpl:async()=>{calls++;throw new Error('timeout');}});
 assert.equal(r.ok,false);assert.equal(r.status,'uncertain');assert.equal(state,'uncertain');assert.equal(calls,1);
});
test('refuses send without reservation',async()=>{
 let calls=0;
 const r=await sendSalesGmailSelfTest({...input,refresh,reserve:async()=>({ok:false}),fetchImpl:async()=>{calls++;}});
 assert.equal(r.ok,false);assert.equal(calls,0);
});
