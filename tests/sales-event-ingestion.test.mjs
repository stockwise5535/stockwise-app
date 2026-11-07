import test from 'node:test';
import assert from 'node:assert/strict';
import {recordVerifiedSalesEvent} from '../server/sales-event-ingestion.mjs';
const input={contactId:'123e4567-e89b-12d3-a456-426614174000',eventKey:'provider-event-123',eventType:'reply',occurredAt:'2026-11-06T12:00:00Z',sourceVerified:true};
test('records authenticated reply via atomic RPC',async()=>{
 let calls=0;
 const result=await recordVerifiedSalesEvent(input,async(name,body)=>{calls++;assert.equal(name,'sales_record_outreach_event');assert.equal(body.p_event_type,'reply');return {ok:true,data:true};});
 assert.equal(result.ok,true);assert.equal(calls,1);
});
test('never records unauthenticated events',async()=>{
 let calls=0;
 const result=await recordVerifiedSalesEvent({...input,sourceVerified:false},async()=>{calls++;});
 assert.equal(result.ok,false);assert.equal(calls,0);
});
test('rejects unknown event type',async()=>assert.equal((await recordVerifiedSalesEvent({...input,eventType:'open'})).ok,false));
test('fails closed if DB rejects event',async()=>assert.equal((await recordVerifiedSalesEvent(input,async()=>({ok:true,data:false}))).ok,false));
