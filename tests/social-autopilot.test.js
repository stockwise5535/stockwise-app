import test from 'node:test';
import assert from 'node:assert/strict';
import {runSocialCycle} from '../server/social-cycle.js';
import {FACTS_VERSION,compose,analyzeSocial} from '../server/social-content.js';
import {approvedPostCatalog,validateStockEntry} from '../server/social-stock.js';
import {createSocialAI} from '../server/social-ai.js';
import {runtimeBinding,activationConfiguration} from '../server/social-runtime.js';
import {notifySocial} from '../server/social-notifier.js';
import {createSocialJobHandler} from '../server/social-job.js';
import {createBufferAdapter} from '../services/buffer-adapter.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SOCIAL_EVIDENCE} from '../server/social-evidence.js';
const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_WRITES_ALLOWED:'true',NEXOPS_SOCIAL_EMERGENCY_STOP:'false',NEXOPS_SOCIAL_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',BUFFER_ORGANIZATION_ID:'org',BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw',BUFFER_API_KEY:'fixture-buffer',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-fixture',NEXOPS_SOCIAL_ALERT_URL:'https://alerts.example.test/social',NEXOPS_SOCIAL_ALERT_HOST:'alerts.example.test',NEXOPS_SOCIAL_ALERT_SECRET:'fixture-alert-secret',CRON_SECRET:'f'.repeat(40)};
function fixture(options={}){
 const events=[],posts=[],alerts=[],requests=[],binding=runtimeBinding(env);let tick=false,enabled=options.enabled??true;
 const store={claimTick:async()=>{if(tick)return false;tick=true;return true;},snapshot:async()=>events.push('snapshot'),reconcile:async()=>{events.push('reconcile');return options.reconciliation;},
 claimRun:async()=>enabled?{claimed:true,runId:'run',day:'2099-01-02'}:{claimed:false,reason:'DISABLED_OR_VERSION_CHANGED'},
 recent:async()=>options.prior||[],usedStock:async()=>{events.push('stock_history');return (options.used||[]).map(content_hash=>({content_hash}));},
 reserveAI:async()=>{throw Error('AI_BUDGET_MUST_NEVER_BE_USED');},
 candidate:async(_run,network,candidate,blocked)=>{posts.push({network,candidate,blocked});if(options.stopDuringCandidate)enabled=false;return !options.duplicate;},
 claimPost:async()=>({claimed:enabled,token:'token'}),complete:async(_run,network,_token,provider)=>{if(options.completionFailure)throw Error();posts.push({network,state:provider?'provider_accepted':'delivery_unknown'});},
 policy:async()=>({enabled,revision:1,facts_hash:FACTS_VERSION,binding_hash:binding.hash}),dispatchAllowed:async()=>enabled,finish:async()=>{},alert:async(_org,code,delivered)=>alerts.push({code,delivered})};
 const read=async()=>({fetchedAt:'2099-01-02T09:00:00Z',period:{start:'2098-12-03T00:00:00.000Z',end:'2099-01-02T00:00:00.000Z'},channels:['linkedin','threads','x'].map(service=>({service,disconnected:options.disconnected||false,metrics:{impressions:{status:'available',value:0,unit:'count'}},posts:[]}))});
 const fetchImpl=async(url,init)=>{
  requests.push(url);assert.ok(url===env.NEXOPS_SOCIAL_ALERT_URL||url==='https://api.buffer.com','Only Buffer and fixed notification transport allowed');
  if(url===env.NEXOPS_SOCIAL_ALERT_URL)return {ok:!options.alertFailure};
  const {query}=JSON.parse(init.body);if(query.startsWith('mutation')){assert.match(query,/aiAssisted: false/);events.push('mutation');if(options.unknown)throw Error('private-upstream-error');return {ok:true,json:async()=>({data:{createPost:{post:{id:'post'+events.length}}}})};}
  return {ok:true,json:async()=>({data:{channels:[{id:'li',service:'linkedin',isQueuePaused:false},{id:'th',service:'threads',isQueuePaused:false},{id:'tw',service:'twitter',isQueuePaused:false}]}})};
 };
 return {events,posts,alerts,requests,run:overrides=>runSocialCycle({env,store,read,fetchImpl,now:()=>new Date('2099-01-02T09:00:00Z'),...overrides})};
}
test('all 45 literal stock entries use only validated facts, have unique text and respect each network length',()=>{
 const catalog=approvedPostCatalog();assert.equal(catalog.length,45);assert.equal(new Set(catalog.map(p=>p.contentHash)).size,45);
 for(const n of ['linkedin','threads','x'])assert.equal(catalog.filter(p=>p.network===n).length,15);
 const entry=JSON.parse(readFileSync(new URL('../server/social-stock.json',import.meta.url)))[0];
 for(const changed of [{...entry,text:'Guaranteed 99% savings'},{...entry,factIds:['invented']},{...entry,extra:'private'}])assert.throws(()=>validateStockEntry(changed));
});
test('verified public claims remain pinned to reviewed product source fingerprints',()=>{
 for(const [path,hash]of Object.entries(SOCIAL_EVIDENCE))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),hash);
 for(const plan of [{hook:0,factIds:['unverified']},{hook:0,factIds:['inventory_csv'],text:'Unsupported'}])assert.throws(()=>compose('x',plan));
});
test('zero-cost cycle uses literal approved stock on three channels without any AI key, ACK or AI budget reservation',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'completed');assert.deepEqual(r.outcomes.map(o=>o.network),['linkedin','threads','x']);assert.equal(f.events.filter(e=>e==='mutation').length,3);
 const catalog=approvedPostCatalog();for(const p of f.posts.filter(p=>p.candidate))assert.equal(p.candidate.text,catalog.find(c=>c.id===p.candidate.id).text);
 assert.equal((await f.run()).reason,'DAILY_EXECUTION_ALREADY_RESERVED');assert.equal(f.events.filter(e=>e==='mutation').length,3);
});
test('even configured paid credentials cannot cause AI provider or metadata traffic',async()=>{
 const original=globalThis.fetch;let globalCalls=0;
 globalThis.fetch=async()=>{globalCalls++;throw Error('UNEXPECTED_GLOBAL_NETWORK');};
 try{
  const f=fixture();assert.equal((await f.run({env:{...env,NEXOPS_SOCIAL_AI_KEY:'unused-fixture-key',NEXOPS_SOCIAL_AI_PRICING_ACK:'unused'}})).status,'completed');
  assert.ok(f.requests.every(u=>!u.includes('openai')));
  let calls=0;const ai=createSocialAI({env,fetchImpl:async()=>{calls++;throw Error();}});
  await assert.rejects(ai.generate('x',{}),/AI_DISABLED_ZERO_COST/);await assert.rejects(ai.review('x',{}),/AI_DISABLED_ZERO_COST/);assert.equal(calls,0);assert.equal(globalCalls,0);
  for(const path of ['server/social-ai.js','server/social-cycle.js','server/social-control.js'])assert.doesNotMatch(readFileSync(new URL('../'+path,import.meta.url),'utf8'),/https:\/\/api\.openai\.com|chat\/completions|\/v1\/models/);
 }finally{globalThis.fetch=original;}
});
test('AI-provider URLs cannot be used as notification targets',async()=>{
 let calls=0;const e={...env,NEXOPS_SOCIAL_ALERT_URL:'https://api.openai.com/v1/chat/completions',NEXOPS_SOCIAL_ALERT_HOST:'api.openai.com'};
 assert.throws(()=>activationConfiguration(e),/ALERT_CONFIGURATION_REQUIRED/);assert.equal(await notifySocial(e,'FIXTURE',async()=>{calls++;}),false);assert.equal(calls,0);
});
test('all-time reserved/published content is never reused even when recent history is empty',async()=>{
 const catalog=approvedPostCatalog(),used=catalog.filter(p=>p.id.endsWith('-01')).map(p=>p.contentHash),f=fixture({used});await f.run();
 assert.ok(f.posts.filter(p=>p.candidate).every(p=>!used.includes(p.candidate.contentHash)));
});
test('exhaustion in any network stops all posting and records a fixed notification',async()=>{
 const f=fixture({used:approvedPostCatalog().filter(p=>p.network==='x').map(p=>p.contentHash)}),r=await f.run();
 assert.equal(r.reason,'STOCK_EXHAUSTED');assert.equal(f.events.includes('mutation'),false);assert.equal(f.alerts[0].code,'STOCK_EXHAUSTED');assert.equal(f.posts[0].blocked,'STOCK_EXHAUSTED');
});
test('all unused stock exhausted stops, while recent topic cooldown selects a different approved entry',async()=>{
 const f=fixture({used:approvedPostCatalog().map(p=>p.contentHash)});assert.equal((await f.run()).reason,'STOCK_EXHAUSTED');assert.equal(f.events.includes('mutation'),false);
 const g=fixture({prior:[{network:'x',fact_ids:['inventory_csv'],day:'2099-01-01'}]});await g.run();assert.notDeepEqual(g.posts.find(p=>p.network==='x'&&p.candidate).candidate.factIds,['inventory_csv']);
});
test('database duplicate race never dispatches an already-reserved candidate',async()=>{
 const f=fixture({duplicate:true});assert.equal((await f.run()).reason,'DUPLICATE_CONTENT');assert.equal(f.events.includes('mutation'),false);
});
test('OFF, preview, emergency stop and disconnected channels never dispatch',async()=>{
 const f=fixture({enabled:false});assert.equal((await f.run()).status,'not_started');assert.deepEqual(f.events,['snapshot','reconcile']);
 for(const e of [{...env,VERCEL_ENV:'preview'},{...env,NEXOPS_SOCIAL_WRITES_ALLOWED:'false'},{...env,NEXOPS_SOCIAL_EMERGENCY_STOP:'true'}]){
  let calls=0;await assert.rejects(createBufferAdapter({env:e,fetch:async()=>{calls++;}}).createPost({network:'x'}),/WRITE_DISABLED/);assert.equal(calls,0);await assert.rejects(fixture().run({env:e}),/DISABLED/);
 }
 const bad=fixture({disconnected:true});assert.equal((await bad.run()).reason,'CHANNEL_DISCONNECTED');assert.equal(bad.events.includes('mutation'),false);
});
test('stop during candidate processing prevents publication',async()=>{const f=fixture({stopDuringCandidate:true});await f.run();assert.equal(f.events.includes('mutation'),false);});
test('UTC boundary remains fail-closed',async()=>{const f=fixture();assert.equal((await f.run({now:()=>new Date('2099-01-02T23:59:30Z')})).status,'failed');assert.equal(f.events.includes('mutation'),false);});
test('ambiguous dispatch stops all remaining networks and is never retried',async()=>{
 const f=fixture({unknown:true,alertFailure:true});assert.equal((await f.run()).reason,'UNKNOWN_DELIVERY_HELD');assert.equal(f.posts.filter(p=>p.state==='delivery_unknown').length,1);assert.ok(f.alerts.every(a=>!a.delivered));await f.run();assert.equal(f.events.filter(e=>e==='mutation').length,1);
});
test('crash after provider acceptance leaves durable unresolved state without resending',async()=>{const f=fixture({completionFailure:true});assert.equal((await f.run()).status,'failed');await f.run();assert.equal(f.events.filter(e=>e==='mutation').length,1);});
test('failed or unconfirmed prior publication blocks the whole new run',async()=>{
 for(const [reconciliation,reason]of [[{failed:1},'PROVIDER_PUBLICATION_FAILED'],[{unconfirmed:1},'POST_STATUS_READ_FAILED']]){const f=fixture({reconciliation});assert.equal((await f.run()).reason,reason);assert.equal(f.events.includes('mutation'),false);}
});
test('analytics retain measured zero and omit missing values without feeding generation',()=>{const d=analyzeSocial({channels:[{service:'x',metrics:{impressions:{status:'not_fetched',value:null},clicks:{status:'available',value:0,unit:'count'}},posts:[]}]});assert.equal(d[0].metrics.clicks.value,0);assert.equal('impressions'in d[0].metrics,false);});
test('private job rejects invalid scheduler auth and preview before DB construction',async()=>{
 let calls=0;const h=createSocialJobHandler({env:{...env,VERCEL_ENV:'preview'},storeFactory:()=>{calls++;}}),r={setHeader(){},status(n){this.n=n;return this;},json(){return this;}};
 await h({method:'GET',url:'/api/internal/social-cycle',headers:{}},r);assert.equal(r.n,401);await h({method:'GET',url:'/api/internal/social-cycle',headers:{authorization:'Bearer '+env.CRON_SECRET}},r);assert.equal(r.n,403);assert.equal(calls,0);
});
