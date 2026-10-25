import test from 'node:test'
import assert from 'node:assert/strict'
import {loadStarterContext} from '../src/growth/bootstrap.js'
function fixture(){
 const id='test-user',calls=[],counts={bootstrap:0}
 const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture-only',user:{id}}}}),getUser:async()=>({data:{user:{id,email_confirmed_at:'2026-10-25'}}})}}
 const api=Object.fromEntries(Object.entries({workspaces:[{id:'starter',organization_id:'org',created_by:id,is_starter:true,workspace_type:'demo'}],profile:{user_id:id},memberships:[{workspace_id:'starter',user_id:id,role:'owner'}],organizations:[{id:'org',created_by:id}],organizationMemberships:[{organization_id:'org',user_id:id,role:'owner'}],activation:[{workspace_id:'starter',user_id:id}]}).map(([name,data])=>[name,async()=>{calls.push(name);return data}]))
 api.bootstrap=async()=>{counts.bootstrap++;return 'starter'}
 return {client,api,userId:id,counts,calls,wait:async()=>{}}
}
test('valid first authenticated entry bootstraps and validates complete persisted context',async()=>{const f=fixture(),r=await loadStarterContext(f);assert.equal(f.counts.bootstrap,1);assert.equal(r.starterId,'starter');assert.equal(r.profile.user_id,f.userId);assert.equal(r.memberships[0].role,'owner');assert.equal(r.activation.user_id,f.userId);assert.equal(f.calls.length,6)})
test('StrictMode/concurrent remount shares only in-flight work; next login rechecks idempotent RPC',async()=>{const f=fixture();const a=loadStarterContext(f),b=loadStarterContext(f);assert.equal(a,b);assert.equal((await a).starterId,'starter');assert.equal(f.counts.bootstrap,1);await loadStarterContext(f);assert.equal(f.counts.bootstrap,2)})
test('no access token, mismatched identity, or unconfirmed user cannot invoke bootstrap',async()=>{
 for(const change of [f=>f.client.auth.getSession=async()=>({data:{session:null}}),f=>f.client.auth.getUser=async()=>({data:{user:{id:'another-user',email_confirmed_at:'yes'}}}),f=>f.client.auth.getUser=async()=>({data:{user:{id:f.userId,email_confirmed_at:null}}})]){const f=fixture();change(f);await assert.rejects(loadStarterContext(f));assert.equal(f.counts.bootstrap,0)}
})
test('transient RPC/data failure retries boundedly; permission errors never loop',async()=>{
 const f=fixture();let calls=0;f.api.bootstrap=async()=>{calls++;if(calls<3)throw Object.assign(Error('Unavailable'),{status:503});return 'starter'};await loadStarterContext(f);assert.equal(calls,3)
 const denied=fixture();let tries=0;denied.api.bootstrap=async()=>{tries++;throw Object.assign(Error('denied'),{status:403,code:'42501'})};await assert.rejects(loadStarterContext(denied),/access could not be verified/);assert.equal(tries,1)
 const exhausted=fixture();let attempts=0;exhausted.api.bootstrap=async()=>{attempts++;throw Object.assign(Error('temporary'),{status:503})};await assert.rejects(loadStarterContext(exhausted),/Retry setup/);assert.equal(attempts,3)
})
test('an explicit retry can recover; completed failure is never cached',async()=>{const f=fixture();const original=f.api.bootstrap;f.api.bootstrap=async()=>{throw Object.assign(Error('Database detail should not be shown'),{status:403})};await assert.rejects(loadStarterContext(f),e=>!e.message.includes('Database detail'));f.api.bootstrap=original;assert.equal((await loadStarterContext(f)).starterId,'starter')})
test('missing required membership/activation never presents a ready context',async()=>{for(const field of ['memberships','organizationMemberships','activation']){const f=fixture();f.api[field]=async()=>[];await assert.rejects(loadStarterContext(f),/incomplete/);assert.equal(f.counts.bootstrap,1)}})

test('unresponsive bootstrap times out boundedly and can be retried explicitly',async()=>{const f=fixture();let calls=0;const original=f.api.bootstrap;f.api.bootstrap=()=>{calls++;return new Promise(()=>{})};await assert.rejects(loadStarterContext({...f,timeoutMs:10}),/timed out/);assert.equal(calls,3);f.api.bootstrap=original;assert.equal((await loadStarterContext(f)).starterId,'starter')})
