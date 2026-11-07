import test from 'node:test';
import assert from 'node:assert/strict';
import start from '../api/auth/google/start.js';
import callback from '../api/auth/google/callback.js';

function response(){
 const headers={};
 return {headers,statusCode:200,body:null,
 setHeader(name,value){headers[name.toLowerCase()]=value;return this;},
 status(code){this.statusCode=code;return this;},
 json(value){this.body=value;return this;}
 };
}
async function withSetupDisabled(fn){
 const old=process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED;
 process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED='false';
 try{return await fn();}
 finally{if(old===undefined)delete process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED;else process.env.STOCKWISE_SALES_OAUTH_SETUP_ENABLED=old;}
}
test('OAuth start blocks requests while setup disabled without touching DB or Google',async()=>{
 await withSetupDisabled(async()=>{
  const res=response();
  await start({method:'POST',headers:{}},res);
  assert.equal(res.statusCode,503);
  assert.deepEqual(res.body,{error:'oauth_setup_disabled'});
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.headers['set-cookie'],undefined);
 });
});
test('OAuth start requires POST even when setup disabled',async()=>{
 await withSetupDisabled(async()=>{
  const res=response();
  await start({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'POST');
 });
});
test('OAuth callback blocks while setup disabled and always clears OAuth state cookie',async()=>{
 await withSetupDisabled(async()=>{
  const res=response();
  await callback({method:'GET',query:{},headers:{}},res);
  assert.equal(res.statusCode,503);
  assert.deepEqual(res.body,{error:'oauth_setup_disabled'});
  assert.match(res.headers['set-cookie'],/Max-Age=0/);
  assert.equal(res.headers['cache-control'],'no-store');
 });
});
test('OAuth callback disallows POST',async()=>{
 await withSetupDisabled(async()=>{
  const res=response();
  await callback({method:'POST',query:{},headers:{}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
 });
});
