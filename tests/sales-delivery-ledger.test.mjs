import test from 'node:test';
import assert from 'node:assert/strict';
import {markSalesDelivery} from '../server/sales-delivery-ledger.mjs';
const reservationId='123e4567-e89b-12d3-a456-426614174000';
test('marks confirmed sent only with provider message ID',async()=>{
 const r=await markSalesDelivery({reservationId,state:'sent',providerMessageId:'gmail-id'},async(name,args)=>{
  assert.equal(name,'sales_mark_send_result');assert.equal(args.p_provider_message_id,'gmail-id');return {ok:true,data:true};
 });assert.equal(r.ok,true);
});
test('allows uncertain state without provider ID',async()=>{
 const r=await markSalesDelivery({reservationId,state:'uncertain'},async()=>({ok:true,data:true}));
 assert.equal(r.ok,true);
});
test('rejects false confirmed sent',async()=>assert.equal((await markSalesDelivery({reservationId,state:'sent'})).ok,false));
test('fails closed on database error',async()=>assert.equal((await markSalesDelivery({reservationId,state:'uncertain'},async()=>({ok:false}))).ok,false));
