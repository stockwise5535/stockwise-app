import test from 'node:test';
import assert from 'node:assert/strict';
import {readBufferGrowth,normalizeMetrics} from '../server/buffer-growth.js';
export const input={organizationId:'org',start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'};
export function mock({postFailure=false,aggregateFailure=false,pages=2,channels}={}) {
  const calls=[];
  let page=0;
  const fetchImpl=async(url,options)=>{
    const b=JSON.parse(options.body); calls.push({url,options,...b});
    let data;
    if(b.query.includes('account')) data={account:{organizations:[{id:'org',name:'Org'}]}};
    else if(b.query.includes('channels(input')) data={channels:channels || [{id:'ch',name:'Handle',service:'twitter',isDisconnected:false}]};
    else if(b.query.includes('posts(input')) {
      if(postFailure) return {ok:true,json:async()=>({data:{},errors:[{message:'private'}]})};
      page++;
      data={posts:{edges:[{node:{id:'p'+page,channelId:'ch',status:'sent',metrics:[{type:'clicks',value:0,unit:'count'}]}}],pageInfo:{hasNextPage:page<pages,endCursor:'cursor'+page}}};
    } else {
      if(aggregateFailure) return {ok:false,status:429};
      data={aggregatedPostMetrics:{metrics:[{type:'impressions',value:12,unit:'count'}],metricsUpdatedAt:null}};
    }
    return {ok:true,json:async()=>({data})};
  };
  return {calls,fetchImpl,apiKey:'TEST_SECRET'};
}
test('missing metrics are null; real zero remains available',()=>{
  const m=normalizeMetrics([{type:'clicks',value:0,unit:'count'}]);
  assert.equal(m.clicks.value,0); assert.equal(m.clicks.status,'available');
  assert.equal(m.reach.value,null); assert.equal(m.reach.status,'not_fetched');
});
test('pages and channel-specific aggregate normalize into a scoped snapshot',async()=>{
  const m=mock(); const d=await readBufferGrowth(input,m);
  assert.equal(d.channels[0].service,'x'); assert.equal(d.channels[0].posts.length,2);
  assert.equal(d.channels[0].postsComplete,true); assert.equal(d.channels[0].metrics.impressions.value,12);
  assert.equal(d.channels[0].posts[0].metrics.clicks.value,0);
  assert.deepEqual(d.missingServices,['linkedin','threads']); assert.equal(d.status,'partial');
  const aggregate=m.calls.at(-1).variables.input;
  assert.deepEqual(aggregate.channelIds,['ch']); assert.equal(aggregate.startDateTime,new Date(input.start).toISOString());
});
test('page limit and upstream errors are visible, not silent zero totals',async()=>{
  const d=await readBufferGrowth({...input,maxPages:1},mock({aggregateFailure:true}));
  assert.equal(d.channels[0].postsComplete,false);
  assert.deepEqual(d.channels[0].errors,['PAGE_LIMIT','RATE_LIMITED']);
  assert.equal(d.channels[0].metrics.impressions.value,null);
});
test('partial GraphQL post failure retains independent aggregate',async()=>{
  const d=await readBufferGrowth(input,mock({postFailure:true}));
  assert.deepEqual(d.channels[0].errors,['GRAPHQL_ERROR']);
  assert.equal(d.channels[0].metrics.impressions.value,12);
});
test('invalid period rejects before contacting upstream',async()=>{
  const m=mock(); await assert.rejects(readBufferGrowth({...input,end:input.start},m),{code:'INVALID_INPUT'});
  assert.equal(m.calls.length,0);
});
test('fixed channel mapping fails closed on wrong network or missing configured channel',async()=>{
  const m=mock();await assert.rejects(readBufferGrowth({...input,channelIds:{linkedin:'li',threads:'th',twitter:'ch'}},m),{code:'CHANNEL_CONFIGURATION_MISMATCH'});
  assert.equal(m.calls.length,2);
});
test('provider returning a post from another channel is not exposed',async()=>{
  const m=mock({channels:[{id:'other',name:'Other',service:'twitter',isDisconnected:false}]});
  const d=await readBufferGrowth(input,m);assert.equal(d.channels[0].posts.length,0);
  assert.deepEqual(d.channels[0].errors,['CHANNEL_MISMATCH']);
});
test('post cap is explicit and controls requested page size',async()=>{
  const m=mock({pages:3});const d=await readBufferGrowth({...input,maxPosts:1,pageSize:50},m);
  assert.equal(d.channels[0].posts.length,1);assert.equal(d.channels[0].postsComplete,false);
  assert.ok(d.channels[0].errors.includes('POST_LIMIT'));
  assert.equal(m.calls.find(c=>c.query.includes('posts(input')).variables.first,1);
});
