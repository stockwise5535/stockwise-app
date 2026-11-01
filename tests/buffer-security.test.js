import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {readBufferGrowth} from '../server/buffer-growth.js';
const input={organizationId:'org',start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'};
test('credentials missing fails closed',async()=>{
  await assert.rejects(readBufferGrowth(input,{apiKey:''}),{code:'MISSING_CREDENTIAL'});
});
test('upstream authorization, rate and network failures are sanitized',async()=>{
  for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'ACCESS_DENIED'],[429,'RATE_LIMITED'],[500,'UPSTREAM_ERROR']]) {
    await assert.rejects(readBufferGrowth(input,{apiKey:'secret',fetchImpl:async()=>({ok:false,status})}),{code});
  }
  await assert.rejects(readBufferGrowth(input,{apiKey:'secret',fetchImpl:async()=>{throw Error('secret');}}),{message:'NETWORK_ERROR'});
});
test('fixed query, fixed destination, redirect refusal and no key in body',async()=>{
  let called=false;
  await assert.rejects(readBufferGrowth({...input,query:'mutation { deletePost }'}, {apiKey:'secret',fetchImpl:async(url,o)=>{
    called=true; assert.equal(url,'https://api.buffer.com/'); assert.equal(o.redirect,'error');
    assert.equal(o.headers.Authorization,'Bearer secret');
    const body=JSON.parse(o.body); assert.match(body.query,/^query/); assert.doesNotMatch(o.body,/mutation|secret/);
    return {ok:true,json:async()=>({errors:[{message:'secret'}]})};
  }}),{message:'GRAPHQL_ERROR'});
  assert.equal(called,true);
});
test('unrelated organization is rejected before channel queries',async()=>{
  let calls=0;
  await assert.rejects(readBufferGrowth(input,{apiKey:'secret',fetchImpl:async()=>{
    calls++; return {ok:true,json:async()=>({data:{account:{organizations:[]}}})};
  }}),{code:'ORGANIZATION_NOT_ACCESSIBLE'});
  assert.equal(calls,1);
});
test('client source does not import server adapter or Buffer key',()=>{
  function walk(dir) { for(const e of readdirSync(dir,{withFileTypes:true})) {
    const p=`${dir}/${e.name}`; if(e.isDirectory()) walk(p);
    else assert.doesNotMatch(readFileSync(p,'utf8'),/BUFFER_API_KEY|NEXOPS_SOCIAL_AI_KEY|CRON_SECRET|NEXOPS_SOCIAL_ALERT_SECRET|server\/buffer-growth|server\/social-(?:cycle|store|ai|control)/);
  }}
  walk(new URL('../src',import.meta.url).pathname);
});
