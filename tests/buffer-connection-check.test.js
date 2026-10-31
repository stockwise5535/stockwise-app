import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyBufferReadOnly} from '../services/buffer-connection-check.js'
test('unconfigured Buffer makes no request and reports missing, not successful connection',async()=>{
 const result=await verifyBufferReadOnly({env:{},fetch:()=>{throw Error('no request')}})
 assert.equal(result.status,'configuration_required');assert.equal(result.missing.length,5);assert.equal(result.posts_created,0)
})
test('Buffer verification only issues organization/channel queries and matches all three services',async()=>{
 const env={BUFFER_API_KEY:'private-test-key',BUFFER_ORGANIZATION_ID:'org',BUFFER_X_CHANNEL_ID:'x',BUFFER_THREADS_CHANNEL_ID:'t',BUFFER_LINKEDIN_CHANNEL_ID:'l'},queries=[]
 const result=await verifyBufferReadOnly({env,fetch:async(url,options)=>{
  const {query}=JSON.parse(options.body);queries.push(query);assert.match(query,/^query /);assert.doesNotMatch(query,/mutation|createPost/)
  return {ok:true,json:async()=>({data:query.includes('account')?{account:{organizations:[{id:'org',name:'Fixture'}]}}:{channels:[{id:'x',service:'twitter',isQueuePaused:false},{id:'t',service:'threads',isQueuePaused:true},{id:'l',service:'linkedin',isQueuePaused:false}]}})}
 }})
 assert.equal(queries.length,2);assert.equal(result.status,'read_connection_verified');assert.equal(result.channels[1].paused,true);assert.equal(result.schedules_created,0);assert.ok(!JSON.stringify(result).includes(env.BUFFER_API_KEY))
})
test('Buffer provider errors and wrong organization fail closed without leaking credentials',async()=>{
 const result=await verifyBufferReadOnly({env:{BUFFER_API_KEY:'secret-value',BUFFER_ORGANIZATION_ID:'other'},fetch:async()=>{throw Error('secret-value')}})
 assert.equal(result.status,'read_connection_unconfirmed');assert.ok(!JSON.stringify(result).includes('secret-value'))
})
