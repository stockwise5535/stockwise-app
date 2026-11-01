import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialMetricsHandler} from '../server/social-metrics.js';
const userId='11111111-1111-4111-8111-111111111111',organizationId='22222222-2222-4222-8222-222222222222',workspaceId='33333333-3333-4333-8333-333333333333';
const time=Date.parse('2026-11-01T12:00:00Z');
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-test',BUFFER_API_KEY:'private-fixture-key',NEXOPS_SOCIAL_ORGANIZATION_ID:organizationId,BUFFER_ORGANIZATION_ID:'buffer-org',BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw'};
function fixture(options={}) {
  const calls={read:0,auth:0,rpc:0,config:null};
  let admin=options.admin??true,authFailure=false,clock=time;
  const authFactory=()=>({auth:{getUser:async()=>{calls.auth++;return options.identityFailure?{error:{status:401}}:{data:{user:{id:userId,role:'authenticated',email_confirmed_at:'2026-01-01'}}};}},rpc:async(name)=>{assert.equal(name,'nexops_is_growth_admin');calls.rpc++;return authFailure?{error:{message:'private'}}:{data:admin};},from:table=>{
    const filters={};
    const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},maybeSingle:async()=>{
      if(options.lookupFailure) return {error:{message:'private'}};
      if(table==='nexops_workspaces') return {data:{id:workspaceId,organization_id:options.otherOrg?'other':organizationId}};
      if(table==='nexops_organization_memberships') return {data:options.noMember?null:{organization_id:organizationId,user_id:userId,role:options.role || 'owner'}};
      return {data:options.noWorkspaceMember?null:{workspace_id:workspaceId,user_id:userId}};
    }};return q;
  }});
  const read=async(config)=>{calls.read++;calls.config=config;if(options.read) return options.read(config);return {schemaVersion:1,status:'complete',period:{start:config.start,end:config.end},fetchedAt:new Date(time).toISOString(),missingServices:[],channels:[]};};
  const handler=createSocialMetricsHandler({env:options.env || env,authFactory,read,now:()=>clock,timeoutMs:options.timeoutMs || 1000});
  const invoke=async(overrides={})=>{
    const headers={};const res={setHeader:(k,v)=>headers[k]=v,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
    await handler({method:'GET',headers:{authorization:'Bearer fixture-token'},url:`/api/growth/social-metrics?workspaceId=${workspaceId}&start=2026-10-01&end=2026-11-01`,...overrides},res);
    return {status:res.statusCode,body:res.body,headers};
  };
  return {invoke,calls,advance:ms=>{clock+=ms;},revoke:()=>{admin=false;},breakAuth:()=>{authFailure=true;}};
}
test('social API rejects unauthenticated and unsupported methods without provider access',async()=>{
  const f=fixture();assert.equal((await f.invoke({headers:{}})).status,401);assert.equal((await f.invoke({method:'POST'})).status,405);assert.equal(f.calls.read,0);
});
test('social API denies non-admin, wrong org and membership violations',async()=>{
  for(const option of [{admin:false},{admin:'true'},{otherOrg:true},{noMember:true},{noWorkspaceMember:true},{role:'member'}]) {
    const f=fixture(option);assert.equal((await f.invoke()).status,403);assert.equal(f.calls.read,0);
  }
});
test('social API fails closed when token or authorization verification fails',async()=>{
  for(const [option,status] of [[{identityFailure:true},401],[{lookupFailure:true},503]]){
    const f=fixture(option);assert.equal((await f.invoke()).status,status);assert.equal(f.calls.read,0);
  }
  const f=fixture();f.breakAuth();assert.equal((await f.invoke()).status,503);assert.equal(f.calls.read,0);
});
test('social API rejects provider/organization overrides, duplicate params and unbounded dates',async()=>{
  const f=fixture();const base=`/api/growth/social-metrics?workspaceId=${workspaceId}&start=2026-10-01&end=2026-11-01`;
  for(const url of [base+'&organizationId=other',base+'&channelId=other',base+'&start=2026-10-02',base.replace('2026-10-01','2026-08-01'),base.replace('2026-11-01','2026-11-03'),base.replace('2026-10-01','2026-02-30')]) assert.equal((await f.invoke({url})).status,400);
  assert.equal(f.calls.read,0);
});
test('social API uses fixed scope/caps and reauthorizes even cached reads',async()=>{
  const f=fixture();const a=await f.invoke(),b=await f.invoke();assert.equal(a.status,200);assert.equal(b.body.cache.hit,true);assert.equal(f.calls.read,1);assert.equal(f.calls.rpc,2);
  assert.equal(a.headers['Cache-Control'],'no-store');assert.equal(f.calls.config.organizationId,'buffer-org');assert.deepEqual(f.calls.config.channelIds,{linkedin:'li',threads:'th',twitter:'tw'});
  assert.equal(f.calls.config.maxPosts,200);assert.equal(f.calls.config.maxPages,4);assert.equal(f.calls.config.pageSize,50);
  f.revoke();assert.equal((await f.invoke()).status,403);assert.equal(f.calls.read,1);
});
test('social API limits repeated requests including cache hits',async()=>{
  const f=fixture();for(let i=0;i<10;i++) assert.equal((await f.invoke()).status,200);
  const r=await f.invoke();assert.equal(r.status,429);assert.equal(r.headers['Retry-After'],'60');
});
test('social API shares in-flight reads and never returns provider exception text',async()=>{
  let finish;const f=fixture({read:()=>new Promise(resolve=>finish=resolve)});
  const a=f.invoke(),b=f.invoke();await new Promise(r=>setImmediate(r));assert.equal(f.calls.read,1);
  finish({status:'complete',period:{},channels:[],missingServices:[]});assert.equal((await a).status,200);assert.equal((await b).status,200);
  const broken=fixture({read:async()=>{throw Error('private-fixture-key');}});const result=await broken.invoke();assert.equal(result.status,502);assert.deepEqual(result.body,{code:'BUFFER_UNAVAILABLE'});
});
test('social API bounds total time and aborts provider work',async()=>{
  const f=fixture({timeoutMs:15,read:()=>new Promise(()=>{})});const r=await f.invoke();assert.equal(r.status,504);assert.equal(f.calls.config.signal.aborted,true);
});
test('social API rejects missing server mapping without acquiring privileged DB credentials',async()=>{
  const f=fixture({env:{...env,BUFFER_X_CHANNEL_ID:''}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.read,0);
});
test('social API expires cache and does not cache partial responses',async()=>{
  const complete=fixture();await complete.invoke();complete.advance(60001);await complete.invoke();assert.equal(complete.calls.read,2);
  let calls=0;
  const f=fixture({read:async()=>{calls++;return {status:'partial',channels:[],missingServices:['x'],period:{}};}});
  await f.invoke();await f.invoke();assert.equal(calls,2);
});
test('social API authorizes every in-flight waiter independently',async()=>{
  let finish;const f=fixture({read:()=>new Promise(r=>finish=r)});
  const allowed=f.invoke();await new Promise(r=>setImmediate(r));
  f.revoke();assert.equal((await f.invoke()).status,403);assert.equal(f.calls.read,1);
  finish({status:'complete',channels:[],period:{},missingServices:[]});assert.equal((await allowed).status,200);
});
