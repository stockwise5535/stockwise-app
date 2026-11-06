import test from 'node:test';
import assert from 'node:assert/strict';
import checkout from '../api/create-checkout-session.js';
import webhook from '../api/stripe-webhook.js';
import earlyAccess from '../api/save-early-access.js';
import saveSkus from '../api/save-skus.js';
function response(){return {status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
async function isolated(work){
  const names=['STRIPE_SECRET_KEY','STRIPE_PRICE_BASIC','VITE_APP_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]])),original=globalThis.fetch;
  Object.assign(process.env,{STRIPE_SECRET_KEY:'synthetic-stripe-secret',STRIPE_PRICE_BASIC:'price_fixture',VITE_APP_URL:'https://example.test',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role'});
  try{await work();}finally{globalThis.fetch=original;for(const n of names)if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n];}
}
test('existing legacy API method guards are preserved',async()=>{
  for(const handler of [checkout,webhook,earlyAccess,saveSkus]){const r=response();await handler({method:'GET'},r);assert.equal(r.code,405);}
});
test('existing Stripe checkout still builds the same plan/redirect contract without contacting Stripe',async()=>isolated(async()=>{
  let called=0;
  globalThis.fetch=async(url,init)=>{called++;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');assert.equal(init.method,'POST');assert.equal(init.body.get('line_items[0][price]'),'price_fixture');assert.equal(init.body.get('success_url'),'https://example.test/?checkout=success');assert.equal(init.body.get('metadata[userId]'),'user-fixture');return {ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/fixture'})};};
  const r=response();await checkout({method:'POST',headers:{host:'example.test'},body:{userId:'user-fixture'}},r);assert.equal(r.code,200);assert.equal(r.body.url,'https://checkout.stripe.com/c/pay/fixture');assert.equal(called,1);
}));
test('existing Early Access request fields remain compatible with current CRM endpoint',async()=>isolated(async()=>{
  globalThis.fetch=async(url,init)=>{assert.equal(url,'https://example.supabase.co/rest/v1/early_access_requests');const row=JSON.parse(init.body);assert.equal(row.email,'contact@example.test');assert.equal(row.company_name,'Legacy Company');assert.equal(row.source,'stockwise_beta_limit');return {ok:true,json:async()=>[{id:'request-fixture'}]};};
  const r=response();await earlyAccess({method:'POST',body:{email:'contact@example.test',company_name:'Legacy Company',source:'stockwise_beta_limit'}},r);assert.equal(r.code,200);assert.equal(r.body.request.id,'request-fixture');
}));
test('existing SKU save and webhook behavior remain unchanged with mocked transports',async()=>isolated(async()=>{
  const methods=[];globalThis.fetch=async(url,init)=>{assert.ok(url.startsWith('https://example.supabase.co/rest/v1/skus'));methods.push(init.method);return {ok:true};};
  const r=response();await saveSkus({method:'POST',body:{userId:'user-fixture',rows:[{user_id:'user-fixture',name:'Legacy item',stock_qty:42}]}},r);assert.equal(r.code,200);assert.deepEqual(methods,['DELETE','POST']);
  const w=response();await webhook({method:'POST'},w);assert.equal(w.code,200);assert.deepEqual(w.body,{received:true});
}));
