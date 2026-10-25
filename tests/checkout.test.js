// All provider/Auth/database operations are injected fixtures. No real network or billing.
import test,{after,before} from 'node:test'
import assert from 'node:assert/strict'
import {createCheckoutHandler} from '../api/create-checkout-session.js'
import {createWebhookHandler} from '../api/stripe-webhook.js'
import {beginCheckout} from '../src/billing/checkout.js'
import Stripe from 'stripe'
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333'
const env={NEXOPS_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'fixture-server-secret',STRIPE_PRICE_BASIC:'price_Basic',STRIPE_PRICE_PRO:'price_Pro',SUPABASE_URL:'https://db.example.test',SUPABASE_ANON_KEY:'fixture-public-key',SUPABASE_SERVICE_ROLE_KEY:'fixture-privileged-key',STRIPE_WEBHOOK_SECRET:'fixture-signing-secret',BILLING_RETURN_ORIGIN:'https://app.example.test'}
const user={id:A,email:'canonical@example.test',email_confirmed_at:'2026-10-25T00:00:00Z',role:'authenticated'}
let originalFetch,networkCalls=0
before(()=>{originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected real network')}})
after(()=>{globalThis.fetch=originalFetch;assert.equal(networkCalls,0)})
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(data){this.body=data;return this}}}
const request=(body={planId:'basic',requestId},authorization='Bearer fixture-session')=>({method:'POST',headers:{authorization},body})
function fixture(options={}){
 const calls=[],identities=[],subscriptions=[]
 const auth={auth:{getUser:async token=>{identities.push(token);return options.authResult || {data:{user:options.user || user}}}},from:table=>({select:()=>({eq:(key,id)=>({maybeSingle:async()=>{subscriptions.push({table,key,id});return options.existing || {data:null}}})})})}
 const handler=createCheckoutHandler({env:options.env || env,authFactory:()=>auth,stripeFactory:()=>({checkout:{sessions:{create:async(...args)=>{calls.push(args);if(options.providerError)throw options.providerError;return {url:options.url || 'https://checkout.stripe.com/c/pay/fixture'}}}}})})
 return {handler,calls,identities,subscriptions}
}
async function invoke(f,req=request()){const res=response();await f.handler(req,res);return res}
test('authenticated checkout uses canonical identity, trusted price and fixed quantity/returns only',async()=>{
 const f=fixture(),res=await invoke(f)
 assert.equal(res.statusCode,200);assert.deepEqual(f.identities,['fixture-session'])
 assert.deepEqual(f.subscriptions,[{table:'subscriptions',key:'user_id',id:A}])
 const [params,opts]=f.calls[0]
 assert.deepEqual(params.line_items,[{price:'price_Basic',quantity:1}]);assert.equal(params.customer_email,user.email);assert.equal(params.client_reference_id,A)
 assert.deepEqual(params.metadata,{userId:A,planId:'basic',checkout_version:'authenticated_v1',request_id:requestId})
 assert.deepEqual(params.subscription_data.metadata,params.metadata);assert.equal(params.success_url,'https://app.example.test/?payment=success');assert.equal(params.cancel_url,'https://app.example.test/?payment=cancelled')
 assert.match(opts.idempotencyKey,/^legacy-checkout-v1-[0-9a-f]{64}$/);assert.equal(params.currency,undefined)
 assert.equal(res.headers['Cache-Control'],'no-store')
})
test('unauthenticated, invalid/expired and unconfirmed sessions cannot create checkout',async()=>{
 for(const authorization of [undefined,'','Basic fixture','Bearer bad token']){const f=fixture();const r=await invoke(f,{...request(),headers:{authorization}});assert.equal(r.statusCode,401);assert.equal(f.calls.length,0)}
 for(const authResult of [{error:{message:'secret provider error'}},{data:{user:null}},{data:{user:{...user,email_confirmed_at:null}}},{data:{user:{...user,role:'service_role'}}}]){const f=fixture({authResult});assert.equal((await invoke(f)).statusCode,401);assert.equal(f.calls.length,0)}
})
test('malformed/unknown plans, product/price/currency/quantity and cross-account overrides rejected',async()=>{
 const bad=[null,[],{},'not json',{planId:'enterprise',requestId},{planId:'__proto__',requestId},{planId:['basic'],requestId},{planId:'basic',requestId:'invalid'},...['priceId','currency','quantity','productId','userId','userEmail','workspaceId','accountId','metadata','entitlement'].map(k=>({planId:'basic',requestId,[k]:k==='userId'?B:'tampered'}))]
 for(const body of bad){const f=fixture();const r=await invoke(f,request(body));assert.equal(r.statusCode,400,JSON.stringify(body));assert.equal(f.calls.length,0)}
})
test('billing missing/false/unknown flags stay disabled without initializing Auth or Stripe',async()=>{
 for(const flag of [undefined,'false','TRUE','test']){let touched=false;const handler=createCheckoutHandler({env:{...env,NEXOPS_BILLING_ENABLED:flag},authFactory:()=>{touched=true},stripeFactory:()=>{touched=true}});const r=await invoke({handler});assert.equal(r.statusCode,503);assert.equal(r.body.code,'BILLING_DISABLED');assert.equal(touched,false)}
})
test('missing or unsafe server configuration fails closed with sanitized errors',async()=>{
 for(const field of ['STRIPE_SECRET_KEY','STRIPE_PRICE_BASIC','STRIPE_PRICE_PRO','SUPABASE_URL','SUPABASE_ANON_KEY','BILLING_RETURN_ORIGIN']){const f=fixture({env:{...env,[field]:undefined}});const r=await invoke(f);assert.equal(r.statusCode,503,field);assert.equal(f.calls.length,0);assert.ok(!JSON.stringify(r.body).includes(env.STRIPE_SECRET_KEY))}
 for(const change of [{BILLING_RETURN_ORIGIN:'https://app.example.test/evil?return=bad'},{BILLING_RETURN_ORIGIN:'https://user:pass@app.example.test'},{BILLING_RETURN_ORIGIN:'http://app.example.test'},{STRIPE_PRICE_BASIC:'price_Pro'},{STRIPE_PRICE_BASIC:'arbitrary'},{SUPABASE_URL:'http://db.example.test'}])assert.equal((await invoke(fixture({env:{...env,...change}}))).statusCode,503)
})
test('existing active subscription or unreadable account cannot create duplicate checkout',async()=>{
 for(const existing of [{data:{status:'active'}},{data:{status:'past_due'}},{error:{message:'database secret'}}]){const f=fixture({existing});const r=await invoke(f);assert.ok([409,503].includes(r.statusCode));assert.equal(f.calls.length,0)}
 assert.equal((await invoke(fixture({existing:{data:{status:'canceled'}}}))).statusCode,200)
})
test('same request uses same provider idempotency key; separate users have separate keys',async()=>{
 const f=fixture();await invoke(f);await invoke(f);assert.equal(f.calls[0][1].idempotencyKey,f.calls[1][1].idempotencyKey)
 const other=fixture({user:{...user,id:B}});await invoke(other);assert.notEqual(f.calls[0][1].idempotencyKey,other.calls[0][1].idempotencyKey)
 const changed=fixture();await invoke(changed,request({planId:'pro',requestId}));assert.equal(f.calls[0][1].idempotencyKey,changed.calls[0][1].idempotencyKey)
 const conflict=await invoke(fixture({providerError:{type:'StripeIdempotencyError',message:'sensitive'}}));assert.equal(conflict.statusCode,409);assert.equal(conflict.body.code,'CHECKOUT_CONFLICT')
})
test('provider uncertainty and unsafe redirects expose no provider details or credentials',async()=>{
 for(const option of [{providerError:Error(env.STRIPE_SECRET_KEY)},{url:'https://evil.example.test'},{url:'http://checkout.stripe.com'},{url:'https://checkout.stripe.com.evil.test'}]){const r=await invoke(fixture(option));assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r.body).includes(env.STRIPE_SECRET_KEY))}
 const f=fixture();assert.equal((await invoke(f,{...request(),method:'GET'})).statusCode,405);assert.equal(f.calls.length,0)
})
const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture-user-token',user:{id:A}}}})}}
test('browser sends only plan/request and session bearer; retries retain same request ID',async()=>{
 const calls=[],transport=async(url,options)=>{calls.push({url,...options});return {ok:false,json:async()=>({code:'BILLING_DISABLED',error:'untrusted server text'})}}
 for(let i=0;i<2;i++)await assert.rejects(beginCheckout({client,planId:'basic',fetch:transport}),/Billing is not enabled/)
 assert.equal(calls[0].url,'/api/create-checkout-session');assert.equal(calls[0].headers.Authorization,'Bearer fixture-user-token')
 assert.deepEqual(Object.keys(JSON.parse(calls[0].body)).sort(),['planId','requestId']);assert.equal(calls[0].body,calls[1].body)
 let touched=false;await assert.rejects(beginCheckout({client:null,planId:'pro',fetch:async()=>{touched=true}}),/Sign in/);assert.equal(touched,false)
 const safe=await beginCheckout({client,planId:'pro',fetch:async()=>({ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/fixture'})})});assert.equal(safe,'https://checkout.stripe.com/c/pay/fixture')
 await assert.rejects(beginCheckout({client,planId:'pro',fetch:async()=>({ok:true,json:async()=>({url:'https://evil.example.test'})})}),/could not be confirmed/)
})
function webhookFixture(options={}){
 const writes=[],reads=[]
 const subscription={id:'sub_Fixture',customer:'cus_Fixture',metadata:{userId:A,planId:'basic',checkout_version:'authenticated_v1',request_id:requestId},items:{data:[{price:{id:'price_Basic',recurring:{interval:'month'}},quantity:1}]},status:'active',current_period_end:1800000000,...options.subscription}
 const admin={auth:{admin:{getUserById:async()=>({data:{user:options.user || user}})}},from:()=>({select:()=>({eq:(key,value)=>({maybeSingle:async()=>{reads.push({key,value});return {data:options.binding?.[key] || null}}})}),upsert:async row=>{writes.push(row);return options.writeError?{error:{message:'sensitive'}}:{data:null}}})}
 const handler=createWebhookHandler({env:options.env || env,stripeFactory:()=>({webhooks:{constructEvent:()=>{if(options.badSignature)throw Error('sensitive signing details');return {type:options.type || 'customer.subscription.created',data:{object:{id:'sub_Fixture',subscription:'sub_Fixture'}}}}},subscriptions:{retrieve:async()=>subscription}}),adminFactory:()=>admin})
 return {handler,writes,reads}
}
async function webhook(f){const res=response(),req=Object.assign((async function*(){yield Buffer.from('signed-fixture')})(),{method:'POST',headers:{'stripe-signature':'fixture'}});await f.handler(req,res);return res}
test('signed webhook derives entitlement from allowlisted provider price and canonical Auth user',async()=>{
 const f=webhookFixture();assert.equal((await webhook(f)).statusCode,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].user_id,A);assert.equal(f.writes[0].plan,'basic');assert.equal(f.writes[0].stripe_customer_id,'cus_Fixture')
})
test('webhook disabled, bad signatures, old/tampered metadata, mismatched bindings never grant access',async()=>{
 for(const options of [{env:{...env,NEXOPS_BILLING_ENABLED:'false'}},{badSignature:true},{subscription:{metadata:{userId:A,planId:'pro'}}},{subscription:{metadata:{userId:A,planId:'pro',checkout_version:'authenticated_v1',request_id:requestId}}},{subscription:{items:{data:[{price:{id:'price_Arbitrary',recurring:{}},quantity:1}]}}},{subscription:{items:{data:[{price:{id:'price_Basic',recurring:{}},quantity:5}]}}},{user:{...user,email_confirmed_at:null}},{binding:{stripe_subscription_id:{user_id:B,stripe_customer_id:'cus_Fixture'}}},{binding:{user_id:{stripe_subscription_id:'sub_Other',status:'active'}}}]){const f=webhookFixture(options);const r=await webhook(f);assert.ok(r.statusCode>=400);assert.equal(f.writes.length,0)}
})
test('delayed/duplicate events use current subscription state; persistence failure requests retry',async()=>{
 const f=webhookFixture({subscription:{status:'canceled'}});await webhook(f);await webhook(f);assert.equal(f.writes[0].plan,'free');assert.equal(f.writes[1].status,'canceled')
 const failed=webhookFixture({writeError:true});assert.equal((await webhook(failed)).statusCode,503)
 const invoice=webhookFixture({type:'invoice.payment_failed',subscription:{status:'active'}});await webhook(invoice);assert.equal(invoice.writes[0].status,'active','stale failure must not override current provider status')
})
test('actual Stripe signature verifier rejects tampering before any database/provider lookup',async()=>{
 const stripe=new Stripe('sk_test_fixture_only'),body=JSON.stringify({id:'evt_fixture',object:'event',type:'irrelevant.fixture',data:{object:{}}})
 const signature=stripe.webhooks.generateTestHeaderString({payload:body,secret:env.STRIPE_WEBHOOK_SECRET})
 const handler=createWebhookHandler({env,stripeFactory:()=>stripe,adminFactory:()=>{throw Error('Must not access database')}})
 for(const [payload,expected] of [[body,200],[body+' ',400]]){
  const req=Object.assign((async function*(){yield Buffer.from(payload)})(),{method:'POST',headers:{'stripe-signature':signature}}),res=response()
  await handler(req,res);assert.equal(res.statusCode,expected)
 }
})
