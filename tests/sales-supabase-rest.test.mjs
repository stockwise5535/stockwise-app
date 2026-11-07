import test from 'node:test';
import assert from 'node:assert/strict';
import {salesSupabaseConfig,salesDbRequest} from '../server/sales-supabase-rest.mjs';
const key='x'.repeat(40);
test('accepts canonical Supabase project URL with optional trailing slash',()=>{
 for(const suffix of ['', '/']){
  assert.deepEqual(salesSupabaseConfig({SUPABASE_URL:'https://fttitlnzimlxmidbgmf.supabase.co'+suffix,SUPABASE_SERVICE_ROLE_KEY:key}),{base:'https://fttitlnzimlxmidbgmf.supabase.co',key});
 }
});
test('rejects unsafe Supabase URL variants and absent service role',()=>{
 for(const url of ['http://fttitlnzimlxmidbgmf.supabase.co','https://evil.example.com','https://fttitlnzimlxmidbgmf.supabase.co/path','https://fttitlnzimlxmidbgmf.supabase.co/?a=1','https://fttitlnzimlxmidbgmf.supabase.co:444']){
  assert.equal(salesSupabaseConfig({SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}),null);
 }
 assert.equal(salesSupabaseConfig({SUPABASE_URL:'https://fttitlnzimlxmidbgmf.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'short'}),null);
});
test('REST adapter does not create a double slash and sends service credentials only to Supabase',async()=>{
 let captured;
 const response=await salesDbRequest({table:'sales_oauth_transactions',method:'POST',body:{state_hash:'hash'}},{SUPABASE_URL:'https://fttitlnzimlxmidbgmf.supabase.co/',SUPABASE_SERVICE_ROLE_KEY:key},async(url,options)=>{
  captured={url,options};return {ok:true,json:async()=>null};
 });
 assert.equal(response.ok,true);
 assert.equal(captured.url,'https://fttitlnzimlxmidbgmf.supabase.co/rest/v1/sales_oauth_transactions');
 assert.equal(captured.options.headers.apikey,key);
});
