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
