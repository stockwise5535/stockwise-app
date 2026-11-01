import test from 'node:test';
import assert from 'node:assert/strict';
import {runSocialCycle} from '../server/social-cycle.js';
import {FACTS_VERSION,compose,analyzeSocial} from '../server/social-content.js';
import {createSocialAI} from '../server/social-ai.js';
import {runtimeBinding} from '../server/social-runtime.js';
import {createSocialJobHandler} from '../server/social-job.js';
import {createBufferAdapter} from '../services/buffer-adapter.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SOCIAL_EVIDENCE} from '../server/social-evidence.js';
export const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_WRITES_ALLOWED:'true',NEXOPS_SOCIAL_EMERGENCY_STOP:'false',NEXOPS_SOCIAL_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',BUFFER_ORGANIZATION_ID:'org',BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw',BUFFER_API_KEY:'fixture-buffer',NEXOPS_SOCIAL_AI_KEY:'fixture-ai',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-fixture',NEXOPS_SOCIAL_AI_PRICING_ACK:'gpt-4.1-mini-input10-output50-per-million-v1',NEXOPS_SOCIAL_ALERT_URL:'https://alerts.example.test/social',NEXOPS_SOCIAL_ALERT_HOST:'alerts.example.test',NEXOPS_SOCIAL_ALERT_SECRET:'fixture-alert-secret',CRON_SECRET:'f'.repeat(40)};
function fixture(options={}){
  const events=[],posts=[],alerts=[],binding=runtimeBinding(env);
  let tick=false,enabled=options.enabled??true,aiCalls=0;
  const store={
    claimTick:async()=>{if(tick)return false;tick=true;return true;},
    snapshot:async()=>events.push('snapshot'),reconcile:async()=>events.push('reconcile'),
    claimRun:async()=>enabled?{claimed:true,runId:'run',day:'2099-01-02'}:{claimed:false,reason:'DISABLED_OR_VERSION_CHANGED'},
    recent:async()=>options.prior || [],
    reserveAI:async()=>{events.push('budget');return enabled&&++aiCalls<=6&&!options.budgetFailure;},
    candidate:async(_run,network,candidate,blocked)=>{posts.push({network,candidate,blocked});return true;},
    claimPost:async()=>{events.push('claim');return {claimed:enabled,token:'token'};},
    complete:async(_run,network,_token,provider)=>{if(options.completionFailure)throw Error();posts.push({network,state:provider?'provider_accepted':'delivery_unknown'});},
    policy:async()=>({enabled,revision:1,facts_hash:FACTS_VERSION,binding_hash:binding.hash}),
    dispatchAllowed:async()=>enabled,finish:async()=>{},alert:async(_org,code,delivered)=>alerts.push({code,delivered}),
  };
  const ai={generate:async(network,context)=>{events.push('generate');if(options.inspect)options.inspect(context);return options.plan || {hook:0,factIds:['demo','exceptions']};},review:async()=>{events.push('review');if(options.stopDuringReview)enabled=false;return options.review??true;}};
  const read=async()=>({fetchedAt:'2099-01-02T09:00:00Z',period:{start:'2098-12-03T00:00:00.000Z',end:'2099-01-02T00:00:00.000Z'},channels:['linkedin','threads','x'].map(service=>({service,disconnected:options.disconnected || false,metrics:{impressions:{status:'available',value:0,unit:'count'}},posts:[]}))});
  const fetchImpl=async(url,init)=>{
    if(url===env.NEXOPS_SOCIAL_ALERT_URL)return {ok:!options.alertFailure};
    assert.equal(url,'https://api.buffer.com');const {query}=JSON.parse(init.body);
    if(query.startsWith('mutation')){assert.match(query,/assets: \[\]/);assert.match(query,/needsApproval: false/);assert.match(query,/saveToDraft: false/);assert.match(query,/aiAssisted: true/);events.push('mutation');if(options.unknown)throw Error('must not echo credential');return {ok:true,json:async()=>({data:{createPost:{post:{id:'post'+events.length}}}})};}
    return {ok:true,json:async()=>({data:{channels:[{id:'li',service:'linkedin',isQueuePaused:false},{id:'th',service:'threads',isQueuePaused:false},{id:'tw',service:'twitter',isQueuePaused:false}]}})};
  };
  return {events,posts,alerts,store,run:(overrides={})=>runSocialCycle({env,store,ai,read,fetchImpl,now:()=>new Date('2099-01-02T09:00:00Z'),...overrides})};
}
test('autopilot composes only catalog claims and rejects unknown text, claims and shapes',()=>{
  for(const network of ['linkedin','threads','x'])assert.ok(compose(network,{hook:0,factIds:['demo']}).text.includes('synthetic'));
  for(const plan of [{hook:0,factIds:['unverified']},{hook:0,factIds:['demo'],text:'Guaranteed 99% savings'},{hook:0,factIds:['demo','demo']}])assert.throws(()=>compose('x',plan));
});
test('verified product claims are pinned to reviewed source fingerprints',()=>{
  for(const [path,hash] of Object.entries(SOCIAL_EVIDENCE))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),hash,'Source changed: review public facts before reactivation');
});
test('disconnected channel stops the entire publishing cycle',async()=>{
  const f=fixture({disconnected:true});assert.equal((await f.run()).reason,'CHANNEL_DISCONNECTED');assert.equal(f.events.includes('mutation'),false);
});
test('autopilot production-only gate blocks every nonproduction Buffer write before transport',async()=>{
  for(const e of [{...env,VERCEL_ENV:'preview'},{...env,VERCEL_ENV:'development'},{...env,NEXOPS_SOCIAL_WRITES_ALLOWED:'false'},{...env,NEXOPS_SOCIAL_EMERGENCY_STOP:'true'}]){
    let calls=0;await assert.rejects(createBufferAdapter({env:e,fetch:async()=>{calls++;}}).createPost({network:'x'}),/WRITE_DISABLED/);assert.equal(calls,0);
    await assert.rejects(fixture().run({env:e}),/DISABLED/);
  }
});
test('autopilot publishes one per fixed network only after reserved AI generation and review',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,'completed');assert.deepEqual(r.outcomes.map(o=>o.network),['linkedin','threads','x']);
  assert.equal(f.events.filter(e=>e==='mutation').length,3);assert.equal(f.events.filter(e=>e==='budget').length,6);
  assert.deepEqual(f.events.slice(2,6),['budget','generate','budget','review']);assert.equal(f.alerts.length,0);
  assert.equal((await f.run()).reason,'DAILY_EXECUTION_ALREADY_RESERVED');assert.equal(f.events.filter(e=>e==='mutation').length,3);
});
test('OFF still collects daily metrics but never generates or publishes',async()=>{
  const f=fixture({enabled:false});assert.equal((await f.run()).status,'not_started');assert.deepEqual(f.events,['snapshot','reconcile']);
});
test('review rejection, budget exhaustion and fabricated content are logged without dispatch',async()=>{
  for(const options of [{review:false},{budgetFailure:true},{plan:{hook:0,factIds:['invented']}}]){
    const f=fixture(options);await f.run();assert.equal(f.events.includes('mutation'),false);assert.equal(f.posts.filter(p=>p.blocked).length,3);assert.equal(f.alerts.length,3);
  }
});
test('normalized exact duplicates and recent same-topic variants never dispatch',async()=>{
  const copy=compose('x',{hook:0,factIds:['demo','exceptions']});
  const f=fixture({prior:[{network:'x',content_hash:copy.contentHash,fact_ids:copy.factIds,day:'2098-01-01'},{network:'threads',content_hash:'other',fact_ids:['exceptions','demo'],day:'2099-01-01'}]});
  const r=await f.run();assert.equal(r.outcomes.filter(o=>o.state==='provider_accepted').length,1);
});
test('stop during processing prevents every following dispatch',async()=>{
  const f=fixture({stopDuringReview:true});await f.run();assert.equal(f.events.includes('mutation'),false);
});
test('UTC date boundary never schedules a second days post from an earlier day quota',async()=>{
  const f=fixture();const r=await f.run({now:()=>new Date('2099-01-02T23:59:30Z')});assert.equal(r.status,'failed');assert.equal(f.events.includes('mutation'),false);
});
test('ambiguous dispatch is held and never retried; failed notifications are recorded',async()=>{
  const f=fixture({unknown:true,alertFailure:true});await f.run();assert.equal(f.posts.filter(p=>p.state==='delivery_unknown').length,3);
  assert.ok(f.alerts.every(a=>!a.delivered));await f.run();assert.equal(f.events.filter(e=>e==='mutation').length,3);
});
test('crash after provider acceptance leaves durable sending unresolved, no repeated publication',async()=>{
  const f=fixture({completionFailure:true});assert.equal((await f.run()).status,'failed');assert.equal(f.events.filter(e=>e==='mutation').length,1);
  await f.run();assert.equal(f.events.filter(e=>e==='mutation').length,1);
});
test('AI performance context uses only measured numbers and verified prior topics',()=>{
  const d=analyzeSocial({channels:[{service:'x',metrics:{impressions:{status:'not_fetched',value:null},clicks:{status:'available',value:0,unit:'count'}},posts:[]}]});
  assert.equal(d[0].metrics.clicks.value,0);assert.equal('impressions' in d[0].metrics,false);
});
test('AI transport is bounded, fixed-model and does not retry or leak provider errors',async()=>{
  let calls=0;
  const ai=createSocialAI({env,fetchImpl:async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');const b=JSON.parse(init.body);assert.equal(b.model,'gpt-4.1-mini');assert.equal(b.max_completion_tokens,600);assert.equal(b.tools,undefined);return {ok:false};}});
  await assert.rejects(ai.generate('x',{}),{message:'AI_REQUEST_FAILED'});assert.equal(calls,1);
  const corrupt=createSocialAI({env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})})});
  await assert.rejects(corrupt.review('x',{text:'safe'}),/REJECTED/);
});
test('AI review requires strict boolean output and validates reported token ceilings',async()=>{
  const client=(content,usage={prompt_tokens:100,completion_tokens:20,total_tokens:120})=>createSocialAI({env,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage})})});
  assert.equal(await client({approved:true}).review('x',{text:'safe'}),true);
  assert.equal(await client({approved:true,extra:'untrusted'}).review('x',{text:'safe'}),false);
  assert.equal(await client({approved:'true'}).review('x',{text:'safe'}),false);
  await assert.rejects(client({approved:true},{prompt_tokens:10000,completion_tokens:20,total_tokens:10020}).review('x',{text:'safe'}),/REJECTED/);
});
test('job needs scheduler secret and production gate before constructing any DB client',async()=>{
  let calls=0;const handler=createSocialJobHandler({env:{...env,VERCEL_ENV:'preview'},storeFactory:()=>{calls++;}});
  const res={setHeader(){},status(n){this.n=n;return this;},json(b){this.b=b;return this;}};
  await handler({method:'GET',url:'/api/internal/social-cycle',headers:{}},res);assert.equal(res.n,401);
  await handler({method:'GET',url:'/api/internal/social-cycle',headers:{authorization:'Bearer '+env.CRON_SECRET}},res);assert.equal(res.n,403);assert.equal(calls,0);
});
