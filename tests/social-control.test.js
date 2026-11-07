import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialControlHandler} from '../server/social-control.js';
import {FACTS_VERSION} from '../server/social-content.js';
const user='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',workspace='33333333-3333-4333-8333-333333333333';
const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_WRITES_ALLOWED:'true',NEXOPS_SOCIAL_EMERGENCY_STOP:'false',NEXOPS_SOCIAL_ORGANIZATION_ID:org,BUFFER_ORGANIZATION_ID:'buffer-org',BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw',BUFFER_API_KEY:'synthetic-private',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',NEXOPS_SOCIAL_AI_KEY:'synthetic-ai',NEXOPS_SOCIAL_AI_PRICING_ACK:'gpt-4.1-mini-input10-output50-per-million-v1',NEXOPS_SOCIAL_ALERT_URL:'https://alerts.example.test/social',NEXOPS_SOCIAL_ALERT_HOST:'alerts.example.test',NEXOPS_SOCIAL_ALERT_SECRET:'synthetic-notification'};
function setup(options={}){
  const writes=[],network=[];
  const authFactory=()=>({auth:{getUser:async()=>options.badToken?{error:{status:401}}:{data:{user:{id:user,role:'authenticated',email_confirmed_at:'2026-01-01'}}}},rpc:async(name,args)=>{
    if(name==='nexops_is_growth_admin')return options.authUnavailable?{error:{}}:{data:options.admin??true};
    assert.equal(name,'nexops_social_set_policy');writes.push(args);return {data:{enabled:args.turn_on}};
  },from:table=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[]}),maybeSingle:async()=>({data:table==='nexops_social_policy'?{enabled:options.enabled??false}:table==='nexops_workspaces'?{id:workspace,organization_id:options.otherOrg?'other':org}:table==='nexops_organization_memberships'?{organization_id:org,user_id:user,role:'owner'}:{workspace_id:workspace,user_id:user}})};return q;
  }});
  const fetchImpl=async(url,init)=>{
    network.push(url);
    if(url==='https://api.openai.com/v1/models/gpt-4.1-mini'){assert.equal(init.method,'GET');assert.equal(init.body,undefined);return {ok:!options.modelFailure,json:async()=>({id:'gpt-4.1-mini'})};}
    if(url===env.NEXOPS_SOCIAL_ALERT_URL)return {ok:!options.alertFailure};
    const query=JSON.parse(init.body).query;assert.match(query,/^query/);
    return {ok:true,json:async()=>query.includes('account')?{data:{account:{organizations:[{id:'buffer-org'}]}}}:{data:{channels:[{id:'li',service:'linkedin',isQueuePaused:false},{id:'th',service:'threads',isQueuePaused:false},{id:options.wrongChannel?'wrong':'tw',service:'twitter',isQueuePaused:false}]}}};
  };
  const handler=createSocialControlHandler({env:{...env,...options.env},authFactory,fetchImpl});
  return {writes,network,async call(method='GET',body){
    const res={setHeader(){},status(n){this.n=n;return this;},json(b){this.body=b;return this;}};
    await handler({method,url:'/api/growth/social-automation'+(method==='GET'?'?workspaceId='+workspace:''),headers:options.noAuth?{}:{authorization:'Bearer fixture-user'},body},res);return res;
  }};
}
const enable={workspaceId:workspace,action:'enable',factsVersion:FACTS_VERSION,acceptAutomaticPublishing:true,acceptBudget:true};
test('automation management requires verified user, Growth Admin and exact organization',async()=>{
  for(const [options,status] of [[{noAuth:true},401],[{badToken:true},401],[{admin:false},403],[{otherOrg:true},403],[{authUnavailable:true},503]]){
    const f=setup(options);assert.equal((await f.call()).n,status);assert.equal(f.writes.length,0);
  }
});
test('automation defaults OFF and activation requires explicit version and budget acknowledgments',async()=>{
  const f=setup();const r=await f.call();assert.equal(r.body.policy.enabled,false);assert.equal(r.body.limits.postsPerDay,3);
  assert.equal((await f.call('POST',{...enable,acceptAutomaticPublishing:false})).n,400);
  assert.equal((await f.call('POST',{...enable,acceptBudget:false})).n,400);
  assert.equal((await f.call('POST',{...enable,factsVersion:'stale'})).n,400);
  assert.equal((await f.call('POST',{...enable,organizationId:'other'})).n,400);assert.equal(f.writes.length,0);
});
test('automation enable verifies only fixed targets and notification route, with no post mutation',async()=>{
  const f=setup();const r=await f.call('POST',enable);assert.equal(r.n,200);assert.equal(f.writes.length,1);assert.equal(f.writes[0].o,org);assert.equal(f.writes[0].facts,FACTS_VERSION);assert.equal(f.writes[0].turn_on,true);assert.equal(f.network.length,3);
  for(const options of [{wrongChannel:true},{alertFailure:true},{env:{NEXOPS_SOCIAL_WRITES_ALLOWED:'false'}}]){
    const bad=setup(options);assert.notEqual((await bad.call('POST',enable)).n,200);assert.equal(bad.writes.length,0);
  }
});
test('preview cannot enable; stop remains available without AI/provider credentials',async()=>{
  const preview=setup({env:{VERCEL_ENV:'preview'}});assert.equal((await preview.call('POST',enable)).n,403);assert.equal(preview.network.length,0);
  const f=setup({env:{NEXOPS_SOCIAL_AI_KEY:'',BUFFER_API_KEY:'',NEXOPS_SOCIAL_EMERGENCY_STOP:'true'}});
  assert.equal((await f.call('POST',{workspaceId:workspace,action:'disable'})).n,200);assert.equal(f.writes[0].turn_on,false);assert.equal(f.network.length,0);
});

const offEnv={NEXOPS_SOCIAL_WRITES_ALLOWED:'false',NEXOPS_SOCIAL_EMERGENCY_STOP:'true'};
test('OFF readiness checks fixed Buffer/model/notification without enabling or generating',async()=>{
 const f=setup({env:offEnv}),r=await f.call('POST',{workspaceId:workspace,action:'check'});
 assert.equal(r.n,200);assert.equal(r.body.ready,true);assert.equal(r.body.publicationEnabled,false);assert.equal(r.body.aiGenerationTested,false);
 assert.equal(f.writes.length,0);assert.equal(f.network.length,4);assert.ok(!f.network.some(u=>u.includes('completions')));
});
test('readiness cannot bypass authorization, OFF gates, pricing, mapping or model/alert failures',async()=>{
 const on=setup();assert.equal((await on.call('POST',{workspaceId:workspace,action:'check'})).n,409);assert.equal(on.writes.length,0);assert.equal(on.network.length,0);
 for(const options of [{noAuth:true},{admin:false},{otherOrg:true},{enabled:true},{wrongChannel:true},{modelFailure:true},{alertFailure:true},{env:{NEXOPS_SOCIAL_AI_PRICING_ACK:''}}]){
  const f=setup({...options,env:{...offEnv,...options.env}});
  assert.notEqual((await f.call('POST',{workspaceId:workspace,action:'check'})).n,200);assert.equal(f.writes.length,0);
 }
});
