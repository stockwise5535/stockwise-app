// Explicit server entrypoint. No schedule/bulk loop. Default action never sends.
import {createClient} from '@supabase/supabase-js'
import {createOutboundStore} from '../services/outbound-store.js'
import {createGmailSendAdapter,dispatchOutbound,prepareLifecycleOutbound,renderApprovedShape,idempotencyKey} from '../services/outbound-safety.js'
const selfTest=process.argv[2]==='--prepare-self-test'
const prepare=process.argv[2]==='--prepare-lifecycle'
const verify=process.argv[2]==='--verify-connection'
const message=process.argv[2]==='--message'?process.argv[3]:null
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXOPS_DEV_PROJECT_REF']
if(!prepare && !selfTest)required.push('GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER_EMAIL')
if(selfTest)required.push('GMAIL_SENDER_EMAIL')
if(!verify)required.push('VITE_PUBLIC_SITE_URL')
const missing=required.filter(name=>!process.env[name]?.trim())
if(!verify && !prepare && !selfTest && (!message || !/^[a-f0-9-]{36}$/i.test(message))){console.log('Usage: node scripts/outbound-worker.mjs --prepare-self-test OR --prepare-lifecycle OR --verify-connection OR --message <uuid>. Sending requires explicit server enablement and database gates.');process.exitCode=2}
else if(missing.length){console.log(JSON.stringify({status:'blocked_missing_configuration',missing,emails_sent:0}));process.exitCode=2}
else if(!verify && !prepare && !selfTest && process.env.NEXOPS_GMAIL_SEND_ENABLED!=='true'){console.log(JSON.stringify({status:'blocked_sending_disabled',emails_sent:0}));process.exitCode=2}
else{
 try{
  const url=new URL(process.env.SUPABASE_URL)
  if(url.origin!==`https://${process.env.NEXOPS_DEV_PROJECT_REF}.supabase.co` || url.pathname!=='/' || url.search || url.hash || url.username || url.password)throw new Error('Development target mismatch')
  const client=createClient(url.origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const store=createOutboundStore(client)
  let cached,expires=0
  const getAccessToken=async()=>{
   if(cached && Date.now()<expires)return cached
   const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID,client_secret:process.env.GMAIL_CLIENT_SECRET,refresh_token:process.env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)})
   if(!r.ok)throw new Error('OAuth refresh failed')
   const data=await r.json();const scopes=String(data.scope || '').split(' ');if(!scopes.some(s=>['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(s)) || !scopes.some(s=>['https://www.googleapis.com/auth/gmail.metadata','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(s)))throw new Error('Required Gmail grants are not verified');if(!data.access_token)throw new Error('OAuth token unavailable')
   cached=data.access_token;expires=Date.now()+Math.max(0,(Number(data.expires_in)||0)-60)*1000;return cached
  }
  const provider=createGmailSendAdapter({getAccessToken,sender:process.env.GMAIL_SENDER_EMAIL})
  if(selfTest){await store.registerTemplates();const context=await store.senderTestContext();if(!context || context.sender_email!==process.env.GMAIL_SENDER_EMAIL.toLowerCase())throw new Error('Confirmed sender workspace unavailable');const rendered=renderApprovedShape('sender_test',{site_url:{value:process.env.VITE_PUBLIC_SITE_URL,verified:true}});const id=await store.enqueue({workspace_id:context.workspace_id,recipient_user_id:context.user_id,category:'sender_test',template_id:'sender_test',template_version:1,...rendered,source_event:'sender_connection_test',idempotency_key:idempotencyKey({workspaceId:context.workspace_id,userId:context.user_id,eventType:'sender_connection_test',templateId:'sender_test:1',window:'once'})});console.log(JSON.stringify({status:'self_test_prepared_only',message_id:id,emails_sent:0}))}
  else if(prepare){await store.registerTemplates();const ids=await prepareLifecycleOutbound({store,siteUrl:process.env.VITE_PUBLIC_SITE_URL});console.log(JSON.stringify({status:'lifecycle_messages_prepared_only',message_ids:ids,emails_sent:0}))}
  else if(verify){const identity=await provider.verifyConnection();await store.recordConnection(identity.sender);await store.registerTemplates();console.log(JSON.stringify({status:'oauth_profile_verified_template_registration_checked',emails_sent:0,sending_enabled_by_this_command:false}))}
  else{const result=await dispatchOutbound(message,{store,provider,enabled:true,verifiedVariables:{site_url:{value:process.env.VITE_PUBLIC_SITE_URL,verified:true}}});console.log(JSON.stringify({message_id:message,...result}));if(result.delivery!=='sent')process.exitCode=2}
 }catch{console.log(JSON.stringify({status:'blocked_worker_error',emails_sent:'not asserted if provider outcome was ambiguous; consult the protected delivery ledger'}));process.exitCode=2}
}
