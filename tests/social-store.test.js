import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialStore} from '../server/social-store.js';
function fixture(){
  const updates=[];
  const client={from(table){let update;
    const q={select:()=>q,eq:()=>q,order:()=>q,limit:async(n)=>{assert.equal(n,6);return {data:[{day:'2026-11-01',network:'x',provider_id:'registered-post'}]};},update:body=>{update=body;return q;},then:resolve=>{updates.push({table,update});return Promise.resolve({data:null}).then(resolve);}};
    return q;
  }};
  return {store:createSocialStore({client}),updates};
}
test('daily reconciliation fetches missing registered post IDs without needing complete inventory',async()=>{
  const f=fixture();let id;
  const result=await f.store.reconcile('org',{channels:[{service:'x',id:'fixed-channel',posts:[]}]},async value=>{id=value;return {channelId:'fixed-channel',state:'sent',metrics:[{type:'clicks',value:0,unit:'count'}],metricsUpdatedAt:'2026-11-01T00:00:00Z'};});
  assert.equal(id,'registered-post');assert.equal(result.failed,0);assert.equal(result.unconfirmed,0);
  assert.equal(f.updates[0].update.state,'published');assert.equal(f.updates[0].update.metrics.clicks.value,0);
});
test('reconciliation rejects mismatched channel or failed reads rather than inferring delivery',async()=>{
  for(const reader of [async()=>({channelId:'other',state:'sent'}),async()=>{throw Error('private');}]){
    const f=fixture();const result=await f.store.reconcile('org',{channels:[{service:'x',id:'fixed-channel',posts:[]}]},reader);assert.equal(result.unconfirmed,1);assert.equal(f.updates.length,0);
  }
});
test('persisted snapshot lookup binds exact organization and UTC period before reading payload',async()=>{
 const conditions=[];const payload={status:'partial',channels:[]};
 const client={from(table){assert.equal(table,'nexops_social_snapshots');const q={select(columns){assert.equal(columns,'payload');return q;},eq(k,v){conditions.push([k,v]);return q;},async maybeSingle(){return {data:{payload}};}};return q;}};
 const period={start:'2026-10-03T00:00:00.000Z',end:'2026-11-02T00:00:00.000Z'};
 assert.deepEqual(await createSocialStore({client}).savedSnapshot('fixed-org',period),payload);
 assert.deepEqual(conditions,[['organization_id','fixed-org'],['period_start',period.start],['period_end',period.end]]);
});
test('stock usage lookup searches exact approved hashes across all history with organization scope and a fixed bound',async()=>{
 const seen=[];const hashes=['a'.repeat(64),'b'.repeat(64)];
 const client={from(t){assert.equal(t,'nexops_social_posts');const q={select(s){seen.push(['select',s]);return q;},eq(k,v){seen.push(['eq',k,v]);return q;},in(k,v){seen.push(['in',k,v]);return q;},async limit(n){assert.equal(n,6);return {data:[{content_hash:hashes[0]}],count:1};}};return q;}};
 assert.deepEqual(await createSocialStore({client}).usedStock('fixed-org',hashes),[{content_hash:hashes[0]}]);
 assert.deepEqual(seen,[['select','content_hash'],['eq','organization_id','fixed-org'],['in','content_hash',hashes]]);
 await assert.rejects(createSocialStore({client}).usedStock('fixed-org',[]),/STOCK_INVALID/);
});

test('truncated all-time stock history fails closed rather than reusing unseen text',async()=>{
 const client={from(){const q={select:()=>q,eq:()=>q,in:()=>q,limit:async()=>({data:[],count:1})};return q;}};
 await assert.rejects(createSocialStore({client}).usedStock('org',['a'.repeat(64)]),/STOCK_HISTORY_UNAVAILABLE/);
});
