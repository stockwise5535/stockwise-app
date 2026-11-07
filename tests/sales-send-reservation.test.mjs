import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveSalesSend} from '../server/sales-send-reservation.mjs';
const input={contactId:'123e4567-e89b-12d3-a456-426614174000',campaignId:'test',idempotencyKey:'test-unique-key-1234',dailyLimit:3,preflightApproved:true};
test('reserves only with preflight and durable UUID response',async()=>{
 let called=false;
 const r=await reserveSalesSend(input,async(name,args)=>{called=true;assert.equal(name,'sales_reserve_send');assert.equal(args.p_daily_limit,3);return {ok:true,data:'123e4567-e89b-12d3-a456-426614174001'};});
 assert.equal(called,true);assert.equal(r.ok,true);
});
test('never reserves without preflight',async()=>{
 let called=false;const r=await reserveSalesSend({...input,preflightApproved:false},async()=>{called=true;});
 assert.equal(r.ok,false);assert.equal(called,false);
});
test('rejects invalid quota',async()=>assert.equal((await reserveSalesSend({...input,dailyLimit:26})).ok,false));
test('fails closed for DB unavailable',async()=>assert.equal((await reserveSalesSend(input,async()=>({ok:false}))).ok,false));
test('fails closed for denied quota',async()=>assert.equal((await reserveSalesSend(input,async()=>({ok:true,data:null}))).ok,false));
