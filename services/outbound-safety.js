// Server-only. An allowlisted, approved exact template is required for automatic sending.
import { createHash } from 'node:crypto'
import { LIFECYCLE_COPY } from './growth-integrations.js'
import { restrictedMessageAllowed } from './email-send-policy.js'
export const OUTCOMES=['AUTO_SEND_ALLOWED','HUMAN_REVIEW_REQUIRED','BLOCKED']
export const TEMPLATE_REGISTRY=Object.freeze(Object.fromEntries(Object.entries({...LIFECYCLE_COPY,consultation_confirmation:['Nexops consultation request received','We received your consultation request. This acknowledges receipt only; an appointment and scope have not been confirmed.'],workspace_invitation:['Your Nexops workspace invitation','A Nexops workspace invitation is available for your review. Sign in and use the invitation link supplied by your workspace administrator. This email does not grant access or change your role.'],sender_test:['Nexops sender connection test','This is the Nexops sender connection test you requested. No customer or supplier action is required.']}).map(([id,[subject,body]])=>[id,Object.freeze({template_id:id,category:id,version:1,subject_template:subject,body_template:body+'\n\nOpen Nexops: {{site_url}}/growth\nCommunication preferences: {{site_url}}/growth?view=account\n',allowed_variables:['site_url'],automatic_send_allowed:!['pilot_followup','sender_test','consultation_confirmation','workspace_invitation'].includes(id),requires_consent:!['welcome','sender_test'].includes(id),requires_human_review:['pilot_followup','sender_test','consultation_confirmation','workspace_invitation'].includes(id),approved_date:null,status:'draft'})])))
const sha=value=>createHash('sha256').update(value).digest('hex')
export const templateHash=t=>sha(JSON.stringify([t.template_id,t.version,t.category,t.subject_template,t.body_template,t.allowed_variables,t.automatic_send_allowed,t.requires_consent,t.requires_human_review]))
export const contentHash=m=>sha([m.recipient_email,m.subject,m.body].join('\n'))
export const idempotencyKey=({workspaceId,userId,eventType,templateId,window})=>{
 if([workspaceId,userId,eventType,templateId,window].some(v=>typeof v!=='string' || !v.trim()))throw new Error('Complete verified idempotency context required')
 return sha(JSON.stringify([workspaceId,userId,eventType,templateId,window]))
}
export function renderApprovedShape(templateId,verifiedVariables){
 const t=TEMPLATE_REGISTRY[templateId];if(!t)throw new Error('Unknown template')
 if(Object.keys(verifiedVariables).some(key=>!t.allowed_variables.includes(key)))throw new Error('Unapproved template variable')
 const field=verifiedVariables.site_url
 if(!field?.verified)throw new Error('Verified site URL required')
 const u=new URL(field.value)
 if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/')throw new Error('Approved HTTPS origin required')
 return {subject:t.subject_template,body:t.body_template.replaceAll('{{site_url}}',u.origin)}
}
const REVIEW_RULES=[
 ['legal_liability',/\b(we (accept|admit|assume) (liability|fault|negligence)|indemnif\w*|settlement offer|pay (?:you )?damages|legal conclusion|warrant(?:y|ies)|guarantee\w*)\b/i],
 ['financial_commitment',/\b(refund\w*|credit (?:you|your|account)|discount\w*|additional payment|compensat\w*|expedit\w* freight|freight cost|price change|pricing change|PO value)\b/i],
 ['commercial_instruction',/\b(change|increase|decrease|cancel|commit|accept|approve|replace)\b.{0,90}\b(order|quantity|supplier|delivery|payment|contract|terms|shipment)\b/i],
 ['contract_commitment',/\b(binding agreement|amend(?:ing)? (?:the |your )?contract|on behalf of (?:the |your )?(?:customer|supplier))\b/i],
 ['unsupported_claim',/\b(guaranteed results|proven \d+%|\d+% (?:improvement|savings)|customer testimonial|customers achieved)\b/i],
 ['sensitive_personal_data',/\b(social security|passport number|medical diagnosis|bank account|credit card number)\b|\b\d{3}-\d{2}-\d{4}\b/i],
 ['unclear_or_ai_copy',/\b(as an ai|ignore (?:all|previous) instructions|delve into|thrilled to|revolutionary|game.changing)\b/i],
]
const BLOCK_RULES=[['threat_or_harassment',/\b(i will (?:kill|hurt) you|pay or (?:else|we expose)|blackmail|racial slur)\b/i],['illegal_or_abusive_intent',/\b(steal (?:their |the )?(?:password|credentials)|evade anti.spam|bypass (?:the )?(?:law|consent)|impersonate (?:a |the )?customer)\b/i]]
export function evaluateOutbound(message,context){
 const flags=[],result=(decision,...reasons)=>({decision,risk_flags:[...new Set(flags)],reasons})
 const recipient=context.recipient
 if(!recipient || !recipient.registered || !recipient.emailVerified || recipient.email!==message.recipient_email)return result('BLOCKED','Registered, confirmed canonical recipient required')
 if(recipient.deletionRequested || recipient.suppressed || recipient.invalidEmail || recipient.categoryOptOut || context.duplicate)return result('BLOCKED','Suppressed, invalid, opted-out/deletion or duplicate recipient')
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.recipient_email) || /[\r\n]/.test(message.subject) || message.subject.length>300 || message.body.length>20000)return result('BLOCKED','Invalid envelope or content bounds')
 if(message.category==='welcome' && (!recipient.trialEnd || !Number.isFinite(Date.parse(recipient.trialEnd)) || Date.parse(recipient.trialEnd)<Date.now()))flags.push('free_access_claim_not_currently_verified')
 const text=message.subject+'\n'+message.body
 let hardBlocked=false
 for(const [flag,pattern]of BLOCK_RULES)if(pattern.test(text)){flags.push(flag);hardBlocked=true}
 if(hardBlocked)return result('BLOCKED','Explicit abuse/illegal-content signal; cannot be overridden by a send approval')
 const t=TEMPLATE_REGISTRY[message.template_id]
 if(!t)return result('HUMAN_REVIEW_REQUIRED','Unknown category/template; no automatic classification')
 if(message.category!==t.category)return result('BLOCKED','Template/category mismatch')
 if(t.requires_consent && (!recipient.marketingOptIn || recipient.categoryOptOut))return result('BLOCKED','Category permission/marketing consent absent or withdrawn')
 if(t.requires_consent && !message.body.includes('/growth?view=account'))flags.push('preference_mechanism_missing')
 for(const [flag,pattern]of REVIEW_RULES)if(pattern.test(text))flags.push(flag)
 if(context.classifier?.decision==='BLOCKED')return result('BLOCKED','Optional classifier blocked the message')
 if(context.classifier && context.classifier.decision!=='AUTO_SEND_ALLOWED')flags.push('classifier_uncertainty')
 let expected
 try{expected=renderApprovedShape(message.template_id,context.verifiedVariables)}catch{flags.push('unverified_or_missing_variables')}
 if(!expected || expected.subject!==message.subject || expected.body!==message.body)flags.push('freeform_or_edited_content')
 const approval=context.templateApproval
 if(approval?.status==='retired')return result('BLOCKED','Template has been retired')
 if(!approval || approval.status!=='approved' || !approval.approved_date || approval.content_hash!==templateHash(t) || approval.version!==t.version || message.template_version!==t.version)flags.push('template_not_currently_approved')
 if(t.requires_human_review || !t.automatic_send_allowed)flags.push('template_requires_review')
 if(flags.length)return result('HUMAN_REVIEW_REQUIRED','Review content, source evidence and risk flags; keyword checks alone do not establish safety')
 return result('AUTO_SEND_ALLOWED','Exact approved template with verified bounded fields and current permission')
}
export function buildIdempotentMime(message,sender){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) || /[\r\n]/.test(sender+message.recipient_email+message.subject))throw new Error('Invalid email headers')
 const subject=Buffer.from(message.subject).toString('base64')
 return Buffer.from(`From: ${sender}\r\nTo: ${message.recipient_email}\r\nSubject: =?UTF-8?B?${subject}?=\r\nMessage-ID: <${sha(message.id)}@${sender.split('@')[1]}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(message.body).toString('base64')}\r\n`).toString('base64url')
}
export function createGmailSendAdapter({getAccessToken,sender,sendPolicy={mode:'draft_only'},fetch:transport=fetch}){
 async function token(){const value=await getAccessToken();if(!value)throw new Error('Gmail OAuth not connected');return value}
 return {
  async verifyConnection(){const r=await transport('https://gmail.googleapis.com/gmail/v1/users/me/profile',{redirect:'error',headers:{Authorization:`Bearer ${await token()}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Gmail profile verification failed');const profile=await r.json();if(profile.emailAddress?.toLowerCase()!==sender.toLowerCase())throw new Error('Connected Gmail account does not match configured sender');return {sender:sender.toLowerCase(),verified:true}},
  async send(message){
   // Called only by dispatchOutbound after atomic database reservation.
   if(!restrictedMessageAllowed(message,sendPolicy)||sender.toLowerCase()!==sendPolicy.sender)throw Error('Restricted mail policy denied provider send')
   const raw=buildIdempotentMime(message,sender)
   const r=await transport('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${await token()}`,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(20000)})
   if(!r.ok)throw new Error('Provider response not confirmed; reconciliation required')
   const result=await r.json();if(!result.id)throw new Error('Provider delivery identifier missing')
   return {providerId:result.id}
  },
 }
}
export async function dispatchOutbound(id,{store,provider,enabled=false,verifiedVariables,sendPolicy={mode:'draft_only'}}){
 if(sendPolicy.mode!=='test_recipient')return {decision:'BLOCKED',reasons:['EMAIL_SEND_MODE prohibits delivery'],risk_flags:['draft_only_or_invalid_mode']}
 if(!enabled)return {decision:'BLOCKED',reasons:['Live sending is disabled'],risk_flags:['sending_disabled']}
 const state=await store.load(id)
 if(!state)return {decision:'BLOCKED',reasons:['Message unavailable'],risk_flags:[]}
 const {message}=state
 if(!['pending_review','queued'].includes(message.status))return {decision:'BLOCKED',reasons:['Message is held, completed or already claimed'],risk_flags:['not_dispatchable']}
 let gate=evaluateOutbound(message,{...state,verifiedVariables})
 const t=TEMPLATE_REGISTRY[message.template_id],a=state.templateApproval
 let exact=false;try{const expected=renderApprovedShape(message.template_id,verifiedVariables);exact=expected.subject===message.subject&&expected.body===message.body}catch{}
 const approved=!!(t&&a?.status==='approved'&&a.approved_date&&a.content_hash===templateHash(t)&&a.version===t.version&&message.template_version===t.version)
 if(!restrictedMessageAllowed(message,sendPolicy)||!approved||!exact||state.recipient?.marketingOptIn!==true||(message.template_id==='consultation_confirmation'&&!state.consultationVerified)||(message.template_id==='workspace_invitation'&&!state.invitationVerified)||(message.template_id==='activation_reminder'&&!state.activationReminderEligible))gate={decision:'BLOCKED',risk_flags:['restricted_test_policy_denied'],reasons:['Test recipient, exact approved template, explicit opt-in and approved sender required']}

 if(!state.automaticDeliveryVerified&&message.template_id!=='sender_test')gate={decision:'BLOCKED',risk_flags:['sender_delivery_test_required'],reasons:['Reviewed sender self-test must be confirmed first']}
 if(gate.decision==='AUTO_SEND_ALLOWED' && !state.automaticDeliveryVerified)gate={decision:'HUMAN_REVIEW_REQUIRED',risk_flags:['sender_delivery_test_required'],reasons:['A reviewed self-addressed sender test must be confirmed before automatic delivery']} 
 const reviewed=state.reviewedHash===contentHash(message)
 if(gate.decision==='AUTO_SEND_ALLOWED'&&!reviewed)gate={decision:'HUMAN_REVIEW_REQUIRED',risk_flags:['test_message_review_required'],reasons:['Restricted tests require individual exact-content review']}
 await store.recordGate(id,gate,contentHash(message))
 if(gate.decision==='BLOCKED' || (gate.decision==='HUMAN_REVIEW_REQUIRED' && !reviewed))return gate
 // Provider identity is read-only tested; SQL also requires fresh, server-recorded verification.
 const identity=await provider.verifyConnection()
 await store.recordConnection(identity.sender)
 const claim=await store.claim(id,contentHash(message),gate.decision)
 if(!claim.claimed)return {decision:'BLOCKED',reasons:[claim.reason || 'Already claimed or rate limited'],risk_flags:['claim_denied']}
 let acceptedProviderId=null
 // No retry after this point. Gmail has no documented transactional idempotency guarantee.
 try{
  if(!restrictedMessageAllowed(message,sendPolicy))throw Error('Restricted policy changed')
  const sent=await provider.send(message)
  acceptedProviderId=sent.providerId
  await store.complete(id,claim.claimToken,'sent',sent.providerId)
  return {...gate,delivery:'sent',providerId:sent.providerId}
 }catch{
  // A timeout or even a lost success-log response can mean Gmail already accepted the message.
  try{await store.complete(id,claim.claimToken,'delivery_unknown',acceptedProviderId)}catch{}
  return {decision:'HUMAN_REVIEW_REQUIRED',delivery:'delivery_unknown',reasons:['Ambiguous delivery; reconcile provider state before any new attempt'],risk_flags:['no_automatic_retry']}
 }
}

export async function prepareLifecycleOutbound({store,siteUrl,limit=10}){
 if(!Number.isInteger(limit) || limit<1 || limit>10)throw new Error('Preparation limit must be 1–10')
 const candidates=await store.lifecycleCandidates(limit),ids=[]
 for(const candidate of candidates){
  const kind=candidate.kind,template=TEMPLATE_REGISTRY[kind];if(!template)continue
  const rendered=renderApprovedShape(kind,{site_url:{value:siteUrl,verified:true}})
  ids.push(await store.enqueue({workspace_id:candidate.workspace_id,recipient_user_id:candidate.user_id,category:kind,template_id:kind,template_version:template.version,...rendered,source_event:'lifecycle:'+kind,idempotency_key:idempotencyKey({workspaceId:candidate.workspace_id,userId:candidate.user_id,eventType:'lifecycle:'+kind,templateId:kind+':'+template.version,window:'once'})}))
 }
 return ids
}
