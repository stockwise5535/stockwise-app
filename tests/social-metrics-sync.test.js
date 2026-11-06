import test from 'node:test';
import assert from 'node:assert/strict';
import {syncSocialMetrics,createSocialMetricsSyncHandler} from '../server/social-metrics-sync.js';
import {normalizeMetrics,readBufferGrowth} from '../server/buffer-growth.js';
const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_WRITES_ALLOWED:'false',NEXOPS_SOCIAL_EMERGENCY_STOP:'true',
 NEXOPS_SOCIAL_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',BUFFER_ORGANIZATION_ID:'buffer-org',
 BUFFER_LINKEDIN_CHANNEL_ID:'li',BUFFER_THREADS_CHANNEL_ID:'th',BUFFER_X_CHANNEL_ID:'tw',BUFFER_API_KEY:'fixture-buffer',SUPABASE_SERVICE_ROLE_KEY:'fixture-worker',CRON_SECRET:'s'.repeat(40)};
const time=Date.parse('2026-11-02T09:00:00Z'),period={start:'2026-10-03T00:00:00.000Z',end:'2026-11-02T00:00:00.000Z'};
function fixture(){let saved=null,calls=0,writes=0;
 const snapshot={organization:{id:'buffer-org'},status:'complete',fetchedAt:new Date(time).toISOString(),period,channels:[['linkedin','li'],['threads','th'],['x','tw']].map(([service,id])=>({service,id,metrics:normalizeMetrics([{type:'clicks',value:0,unit:'count'}])}))};
 const store={savedSnapshot:async(org,p)=>{assert.equal(org,env.NEXOPS_SOCIAL_ORGANIZATION_ID);assert.deepEqual(p,period);return saved;},snapshot:async(org,value)=>{assert.equal(org,env.NEXOPS_SOCIAL_ORGANIZATION_ID);saved=structuredClone(value);writes++;}};
 const read=async(params,auth)=>{calls++;assert.equal(params.maxPosts,200);assert.equal(params.maxPages,4);assert.equal(params.pageSize,50);assert.deepEqual(params.channelIds,{linkedin:'li',threads:'th',twitter:'tw'});assert.equal(auth.apiKey,env.BUFFER_API_KEY);return structuredClone(snapshot);};
 return {snapshot,store,read,get saved(){return saved;},get calls(){return calls;},get writes(){return writes;},setSaved:value=>{saved=value;},run:overrides=>syncSocialMetrics({env,store,read,now:()=>time,...overrides})};
}
test('metrics sync works with publishing OFF, emergency stop ON and no AI configuration; durable cache avoids repeat reads',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'updated');assert.equal((await f.run()).status,'cached');assert.equal(f.calls,1);assert.equal(f.writes,1);
 assert.equal(f.saved.channels[0].metrics.clicks.value,0);assert.equal(f.saved.channels[0].metrics.impressions.value,null);assert.equal(f.saved.channels[0].metrics.impressions.status,'not_fetched');
});
test('partial/missing-channel results stay partial and are cached without manufacturing zeros',async()=>{
 const f=fixture();f.snapshot.status='partial';f.snapshot.channels.pop();assert.equal((await f.run()).status,'partial');assert.equal((await f.run()).status,'partial');assert.equal(f.calls,1);assert.equal(f.saved.channels.length,2);
});
test('wrong organization, channels, stale cache and future cache are not reused; untrusted upstream cannot be stored',async()=>{
 for(const alter of [s=>{s.organization.id='other';},s=>{s.channels[0].id='other';},s=>{s.channels[1]=s.channels[0];},s=>{s.fetchedAt='2026-10-01T00:00:00Z';},s=>{s.fetchedAt='2027-01-01T00:00:00Z';}]){
  const f=fixture(),saved=structuredClone(f.snapshot);alter(saved);f.setSaved(saved);assert.equal((await f.run()).status,'updated');assert.equal(f.calls,1);
 }
 const f=fixture();f.snapshot.channels[0].id='other';await assert.rejects(f.run(),/SYNC_RESPONSE_REJECTED/);assert.equal(f.writes,0);
});
test('preview/configuration/abort/read failure never consume posting reservations or persist results',async()=>{
 const f=fixture();await assert.rejects(f.run({env:{...env,VERCEL_ENV:'preview'}}),/PRODUCTION_REQUIRED/);
 await assert.rejects(f.run({env:{...env,BUFFER_X_CHANNEL_ID:'li'}}),/SOCIAL_MAPPING_REQUIRED/);
 await assert.rejects(f.run({env:{...env,SUPABASE_SERVICE_ROLE_KEY:''}}),/SYNC_CONFIGURATION_REQUIRED/);
 await assert.rejects(f.run({signal:AbortSignal.abort()}));await assert.rejects(f.run({read:async()=>{throw Error('provider-secret');}}));assert.equal(f.writes,0);assert.equal(f.calls,0);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
test('private sync rejects invalid cron auth, methods, preview and caller-supplied query targets before any store',async()=>{
 let stores=0;const h=createSocialMetricsSyncHandler({env,storeFactory:()=>{stores++;},fetchImpl:async()=>{throw Error('no alert configured');}});
 for(const [req,code]of [[{method:'POST'},405],[{method:'GET'},401],[{method:'GET',headers:{authorization:'Bearer '+env.CRON_SECRET},url:'/api/internal/social-metrics-sync?org=other'},400]]){const r=response();await h(req,r);assert.equal(r.code,code);}assert.equal(stores,0);
 const r=response();await createSocialMetricsSyncHandler({env:{...env,VERCEL_ENV:'preview'}})({method:'GET',headers:{authorization:'Bearer '+env.CRON_SECRET}},r);assert.equal(r.code,403);
});
test('handler returns fixed sanitized failures, partial notifications and deadline cancellation',async()=>{
 const req={method:'GET',url:'/api/internal/social-metrics-sync',headers:{authorization:'Bearer '+env.CRON_SECRET}};
 for(const [sync,code] of [[async()=>{throw Error('private-provider-body');},503],[async()=>({status:'partial'}),200]]){
  const r=response();await createSocialMetricsSyncHandler({env,storeFactory:()=>({}),sync})(req,r);assert.equal(r.code,code);assert.ok(!JSON.stringify(r.body).includes('private-provider-body'));assert.equal(r.headers['Cache-Control'],'no-store');
 }
 const r=response();await createSocialMetricsSyncHandler({env,timeoutMs:5,storeFactory:()=>({}),sync:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('secret'))))})(req,r);assert.equal(r.code,504);
});
test('real Buffer reader used by sync emits only fixed GraphQL queries with bounded inputs',async()=>{
 const f=fixture(),documents=[];
 const fetchImpl=async(_url,init)=>{const {query,variables}=JSON.parse(init.body);documents.push(query);assert.ok(query.startsWith('query'));assert.ok(!query.includes('mutation'));
 let data;if(query.includes('account'))data={account:{organizations:[{id:'buffer-org',name:'Fixture'}]}};
 else if(query.includes('channels('))data={channels:[{id:'li',service:'linkedin',name:'LI',isDisconnected:false},{id:'th',service:'threads',name:'TH',isDisconnected:false},{id:'tw',service:'twitter',name:'X',isDisconnected:false}]};
 else if(query.includes('aggregatedPostMetrics'))data={aggregatedPostMetrics:{metrics:[],metricsUpdatedAt:null}};
 else{assert.ok(variables.first<=50);data={posts:{edges:[],pageInfo:{hasNextPage:false}}};}return {ok:true,json:async()=>({data})};};
 assert.equal((await f.run({read:(params,auth)=>readBufferGrowth(params,{...auth,fetchImpl,now:()=>new Date(time)})})).status,'updated');assert.equal(documents.length,8);
});
