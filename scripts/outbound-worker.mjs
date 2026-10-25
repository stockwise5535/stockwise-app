// Explicit server entrypoint: no schedule, bulk loop or unrestricted delivery mode.
import {createClient} from '@supabase/supabase-js'
import {emailSendPolicy,TEST_TEMPLATE_IDS} from '../services/email-send-policy.js'
import {gmailTokenProvider} from '../services/gmail-oauth.js'
import {createOutboundStore} from '../services/outbound-store.js'
import {createGmailSendAdapter,dispatchOutbound,prepareLifecycleOutbound,renderApprovedShape,idempotencyKey} from '../services/outbound-safety.js'
const command=process.argv[2],message=command==='--message'?process.argv[3]:null
const prepareTest=command==='--prepare-template-test'
const selfTest=command==='--prepare-self-test',prepare=command==='--prepare-lifecycle'
const oauthOnly=command==='--verify-oauth',verify=oauthOnly||command==='--verify-connection'
let sendPolicy
try{sendPolicy=emailSendPolicy()}catch{console.log(JSON.stringify({status:'blocked_invalid_email_send_policy',emails_sent:0}));process.exit(2)}
if(message&&sendPolicy.mode==='draft_only'){console.log(JSON.stringify({status:'blocked_draft_only',email_send_mode:'draft_only',emails_sent:0}));process.exit(2)}
const backendUrl=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
const required=[process.env.SUPABASE_URL?'SUPABASE_URL':'VITE_SUPABASE_URL','NEXOPS_DEV_PROJECT_REF']
if(!oauthOnly)required.push('SUPABASE_SERVICE_ROLE_KEY')
if(!prepare&&!selfTest&&!prepareTest)required.push('GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER_EMAIL','NEXOPS_GMAIL_APPROVED_SENDER')
if(selfTest)required.push('GMAIL_SENDER_EMAIL')
if(prepareTest)required.push('GMAIL_SENDER_EMAIL','NEXOPS_GMAIL_APPROVED_SENDER','NEXOPS_GMAIL_TEST_RECIPIENT')
if(!verify)required.push('VITE_PUBLIC_SITE_URL')
const missing=required.filter(name=>!process.env[name]?.trim())
if(!verify&&!prepare&&!selfTest&&!prepareTest&&(!message||!/^[a-f0-9-]{36}$/i.test(message))){console.log('Usage: --verify-oauth OR --verify-connection OR --prepare-self-test OR --prepare-lifecycle OR --prepare-template-test <template> <workspace UUID> <user UUID> [source UUID] OR --message <uuid>. Default: draft_only.');process.exitCode=2}
else if(missing.length){console.log(JSON.stringify({status:'blocked_missing_configuration',missing,email_send_mode:sendPolicy.mode,emails_sent:0}));process.exitCode=2}
else if(message&&process.env.NEXOPS_GMAIL_SEND_ENABLED!=='true'){console.log(JSON.stringify({status:'blocked_sending_disabled',emails_sent:0}));process.exitCode=2}
else{
 try{
  const url=new URL(backendUrl)
  if(url.origin!==`https://${process.env.NEXOPS_DEV_PROJECT_REF}.supabase.co`||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('Development target mismatch')
  if(!prepare&&!selfTest&&!prepareTest&&process.env.GMAIL_SENDER_EMAIL.trim().toLowerCase()!==process.env.NEXOPS_GMAIL_APPROVED_SENDER.trim().toLowerCase())throw Error('Approved sender mismatch')
  const getAccessToken=gmailTokenProvider({clientId:process.env.GMAIL_CLIENT_ID,clientSecret:process.env.GMAIL_CLIENT_SECRET,refreshToken:process.env.GMAIL_REFRESH_TOKEN})
  const provider=createGmailSendAdapter({getAccessToken,sender:process.env.GMAIL_SENDER_EMAIL,sendPolicy})
  if(oauthOnly){await provider.verifyConnection();console.log(JSON.stringify({status:'oauth_refresh_scopes_and_approved_sender_verified',email_send_mode:sendPolicy.mode,emails_sent:0,database_writes:0}))}
  else{
   const client=createClient(url.origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
   const store=createOutboundStore(client)
   if(prepareTest){
    const [kind,workspace,user,source]=process.argv.slice(3),uuid=/^[a-f0-9-]{36}$/i
    if(!TEST_TEMPLATE_IDS.includes(kind)||!uuid.test(workspace||'')||!uuid.test(user||''))throw Error('Valid test template/workspace/user required')
    const restriction=emailSendPolicy({...process.env,EMAIL_SEND_MODE:'test_recipient'}) // Validate addresses; never changes runtime mode or sends.
    const account=await client.auth.admin.getUserById(user),membership=await client.from('nexops_workspace_memberships').select('user_id').eq('workspace_id',workspace).eq('user_id',user).single()
    if(account.error||!account.data.user?.email_confirmed_at||account.data.user.email?.toLowerCase()!==restriction.testRecipient||membership.error)throw Error('Configured confirmed test recipient/workspace required')
    let sourceEvent='template_test:'+kind,related
    if(kind==='consultation_confirmation'){
     if(!uuid.test(source||''))throw Error('Consultation source required')
     const r=await client.from('nexops_consultation_leads').select('id').eq('id',source).eq('workspace_id',workspace).eq('submitted_by',user).single();if(r.error)throw Error('Verified consultation required');related=source;sourceEvent='consultation_confirmation:'+source
    }
    if(kind==='workspace_invitation'){
     if(!uuid.test(source||''))throw Error('Invitation source required')
     const r=await client.from('nexops_invitations').select('expires_at,accepted_by').eq('id',source).eq('workspace_id',workspace).single();if(r.error||Date.parse(r.data.expires_at)<=Date.now()||(r.data.accepted_by&&r.data.accepted_by!==user))throw Error('Valid recipient invitation required');sourceEvent='invitation:'+source
    }
    await store.registerTemplates();const rendered=renderApprovedShape(kind,{site_url:{value:process.env.VITE_PUBLIC_SITE_URL,verified:true}})
    const id=await store.enqueue({workspace_id:workspace,recipient_user_id:user,category:kind,template_id:kind,template_version:1,...rendered,source_event:sourceEvent,...(related?{related_consultation_id:related}:{}),idempotency_key:idempotencyKey({workspaceId:workspace,userId:user,eventType:sourceEvent,templateId:kind+':1',window:'once'})})
    console.log(JSON.stringify({status:'template_test_prepared_only',message_id:id,email_send_mode:sendPolicy.mode,emails_sent:0}))
   }
   else if(selfTest){await store.registerTemplates();const context=await store.senderTestContext();if(!context||context.sender_email!==process.env.GMAIL_SENDER_EMAIL.toLowerCase())throw Error('Confirmed sender workspace unavailable');const rendered=renderApprovedShape('sender_test',{site_url:{value:process.env.VITE_PUBLIC_SITE_URL,verified:true}});const id=await store.enqueue({workspace_id:context.workspace_id,recipient_user_id:context.user_id,category:'sender_test',template_id:'sender_test',template_version:1,...rendered,source_event:'sender_connection_test',idempotency_key:idempotencyKey({workspaceId:context.workspace_id,userId:context.user_id,eventType:'sender_connection_test',templateId:'sender_test:1',window:'once'})});console.log(JSON.stringify({status:'self_test_prepared_only',message_id:id,emails_sent:0}))}
   else if(prepare){await store.registerTemplates();const ids=await prepareLifecycleOutbound({store,siteUrl:process.env.VITE_PUBLIC_SITE_URL});console.log(JSON.stringify({status:'lifecycle_messages_prepared_only',message_ids:ids,emails_sent:0}))}
   else if(verify){const identity=await provider.verifyConnection();await store.recordConnection(identity.sender);await store.registerTemplates();console.log(JSON.stringify({status:'oauth_profile_verified_template_registration_checked',email_send_mode:sendPolicy.mode,emails_sent:0,sending_enabled_by_this_command:false}))}
   else{const result=await dispatchOutbound(message,{store,provider,enabled:true,sendPolicy,verifiedVariables:{site_url:{value:process.env.VITE_PUBLIC_SITE_URL,verified:true}}});console.log(JSON.stringify({message_id:message,...result}));if(result.delivery!=='sent')process.exitCode=2}
  }
 }catch{console.log(JSON.stringify({status:'blocked_worker_error',emails_sent:message?'not asserted if provider outcome was ambiguous; consult protected ledger':0,details_withheld:true}));process.exitCode=2}
}
