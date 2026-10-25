import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {bootstrapGmailOAuth,GMAIL_BOOTSTRAP_SCOPES} from '../scripts/gmail-oauth-bootstrap.mjs'
const config={clientId:'fixture-desktop.apps.googleusercontent.com',clientSecret:'fixture-client-secret'}
const refresh='fixture-refresh-token',access='fixture-access-token'
const response=(extra={})=>({ok:true,json:async()=>({scope:GMAIL_BOOTSTRAP_SCOPES.join(' '),access_token:access,refresh_token:refresh,...extra})})
function request(url,{method='GET',host}={}){return new Promise((resolve,reject)=>{const u=new URL(url);const r=http.request(u,{method,headers:host?{Host:host}:{}},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}))});r.setTimeout(2000,()=>r.destroy(Error('Fixture HTTP timeout')));r.on('error',reject);r.end()})}
const callback=(auth,parameters={})=>{const u=new URL(auth.searchParams.get('redirect_uri'));for(const [k,v]of Object.entries({state:auth.searchParams.get('state'),code:'fixture-code',...parameters}))u.searchParams.set(k,v);return u}
const authorize=fn=>async href=>{await fn(new URL(href))}

test('Desktop loopback flow requests only required scopes and uses state/PKCE/offline consent',async()=>{
 let auth,redirect,calls=0
 const result=await bootstrapGmailOAuth({...config,onAuthorizationURL:authorize(async a=>{
  auth=a;redirect=new URL(a.searchParams.get('redirect_uri'));assert.equal(a.origin,'https://accounts.google.com');assert.equal(a.pathname,'/o/oauth2/v2/auth');assert.equal(redirect.hostname,'127.0.0.1');assert.ok(Number(redirect.port)>0);assert.equal(redirect.pathname,'/');assert.equal(redirect.protocol,'http:')
  assert.deepEqual(a.searchParams.get('scope').split(' '),GMAIL_BOOTSTRAP_SCOPES);assert.equal(a.searchParams.get('access_type'),'offline');assert.equal(a.searchParams.get('prompt'),'consent select_account');assert.equal(a.searchParams.get('include_granted_scopes'),'false');assert.equal(a.searchParams.get('code_challenge_method'),'S256');assert.ok(a.searchParams.get('state').length>=43);assert.ok(!a.href.includes(config.clientSecret))
  const r=await request(callback(a));assert.equal(r.status,200);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.body.includes('fixture-code'))
 }),fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');const b=options.body;assert.equal(b.get('client_id'),config.clientId);assert.equal(b.get('client_secret'),config.clientSecret);assert.equal(b.get('code'),'fixture-code');assert.equal(b.get('redirect_uri'),redirect.href);assert.equal(b.get('grant_type'),'authorization_code');assert.equal(createHash('sha256').update(b.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));return response()
 }})
 assert.equal(result,refresh);assert.equal(calls,1);await assert.rejects(request(redirect))
})
test('wrong state/path/host/method and duplicate parameters cannot exchange a code',async()=>{
 let calls=0
 const result=await bootstrapGmailOAuth({...config,onAuthorizationURL:authorize(async a=>{
  assert.equal((await request(callback(a,{state:'wrong-state'}))).status,400)
  const dup=callback(a);dup.searchParams.append('state',a.searchParams.get('state'));assert.equal((await request(dup)).status,400)
  const codeDup=callback(a);codeDup.searchParams.append('code','second-code');assert.equal((await request(codeDup)).status,400)
  const badPath=callback(a);badPath.pathname='/unexpected';assert.equal((await request(badPath)).status,404)
  assert.equal((await request(callback(a),{method:'POST'})).status,400)
  assert.equal((await request(callback(a),{host:'attacker.invalid'})).status,400)
  assert.equal(calls,0);await request(callback(a))
 }),fetch:async()=>{calls++;return response()}})
 assert.equal(result,refresh);assert.equal(calls,1)
})
test('duplicate callbacks are consumed only once, even while exchange is pending',async()=>{
 let exchanges=0,release,started
 const wait=new Promise(r=>{started=r}),hold=new Promise(r=>{release=r})
 const result=await bootstrapGmailOAuth({...config,onAuthorizationURL:authorize(async a=>{
  await request(callback(a));await wait;assert.equal((await request(callback(a))).status,409);release()
 }),fetch:async()=>{exchanges++;started();await hold;return response()}})
 assert.equal(result,refresh);assert.equal(exchanges,1)
})
test('authorization denial closes listener without exchanging or echoing provider error',async()=>{
 let redirect,calls=0
 await assert.rejects(bootstrapGmailOAuth({...config,onAuthorizationURL:authorize(async a=>{redirect=a.searchParams.get('redirect_uri');const u=callback(a);u.searchParams.delete('code');u.searchParams.set('error','fixture-sensitive-provider-error');await request(u)}),fetch:async()=>{calls++;return response()}}),e=>/denied/.test(e.message)&&!e.message.includes('fixture-sensitive-provider-error'))
 assert.equal(calls,0);await assert.rejects(request(redirect))
})
test('timeout and cancellation close the loopback listener',async()=>{
 let redirect
 await assert.rejects(bootstrapGmailOAuth({...config,timeoutMs:30,onAuthorizationURL:authorize(async a=>{redirect=a.searchParams.get('redirect_uri')})}),/timed out/);await assert.rejects(request(redirect))
 const controller=new AbortController()
 await assert.rejects(bootstrapGmailOAuth({...config,signal:controller.signal,onAuthorizationURL:()=>controller.abort()}),/cancelled/)
})
for(const [label,transport]of Object.entries({missing_refresh:async()=>response({refresh_token:undefined}),missing_scope:async()=>response({scope:undefined}),broader_scope:async()=>response({scope:[...GMAIL_BOOTSTRAP_SCOPES,'https://mail.google.com/'].join(' ')}),invalid_refresh:async()=>response({refresh_token:'unsafe\nextra'}),rejected_exchange:async()=>({ok:false,json:async()=>({error:config.clientSecret})}),network_failure:async()=>{throw Error(access+' '+config.clientSecret)},malformed_json:async()=>({ok:true,json:async()=>{throw Error(access)}})}))test(`token failure ${label} never returns or exposes credentials`,async()=>{
 await assert.rejects(bootstrapGmailOAuth({...config,onAuthorizationURL:authorize(async a=>{await request(callback(a))}),fetch:transport}),e=>![refresh,access,config.clientSecret].some(secret=>e.message.includes(secret)))
})
test('CLI refuses redirected token output and does not expose supplied credentials',()=>{
 const r=spawnSync(process.execPath,['scripts/gmail-oauth-bootstrap.mjs'],{encoding:'utf8',env:{...process.env,GMAIL_CLIENT_ID:config.clientId,GMAIL_CLIENT_SECRET:config.clientSecret}})
 assert.equal(r.status,2);assert.equal(r.stdout,'');assert.match(r.stderr,/redirected or piped/);assert.ok(!r.stderr.includes(config.clientSecret));assert.ok(!r.stderr.includes(access));assert.ok(!r.stderr.includes(refresh))
})
