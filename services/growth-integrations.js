// SERVER ONLY: never import OAuth credentials into a browser bundle.
import { qualifiedExport } from '../src/growth/service.js'
export const EMAIL_KINDS=['welcome','activation_reminder','csv_reminder','consultation_reminder','pilot_followup']
export const LIFECYCLE_COPY={
 welcome:['Welcome to Nexops','Your free 30-day access is ready. Open your demo workspace and review one supply risk. No credit card is required.'],
 activation_reminder:['See your first supply risk','Open TODAY, select an exception and review the recommended next action in your sample workspace.'],
 csv_reminder:['Ready to explore your own data?','Your demo is a starting point. Review the available import options and speak with Nexops before connecting customer data.'],
 consultation_reminder:['Would you like to discuss your operational workload?','If useful, submit a consultation request. A request is not a confirmed appointment.'],
 pilot_followup:['Discuss a focused operations pilot','A Nexops operator can review a possible pilot scope with your company.'],
}
export function lifecycleDraft(kind,user,siteUrl){
 if(!EMAIL_KINDS.includes(kind) || !user.registered || !user.emailVerified || user.deletionRequested)throw new Error('Eligible registered contact required')
 if(kind!=='welcome' && !user.marketingOptIn)throw new Error('Communication consent required')
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email))throw new Error('Valid registered recipient required')
 const base=new URL(siteUrl);if(base.protocol!=='https:' || base.username || base.password)throw new Error('Configured HTTPS public URL required')
 const [subject,body]=LIFECYCLE_COPY[kind]
 return {to:user.email,subject,text:`${body}\n\nOpen Nexops: ${new URL('/growth',base)}\nCommunication preferences: ${new URL('/growth?view=account',base)}\n`,kind}
}
export function gmailDraftPayload(draft){
 for(const value of [draft.to,draft.subject])if(/[\r\n]/.test(value))throw new Error('Invalid mail header')
 return {message:{raw:Buffer.from(`To: ${draft.to}\r\nSubject: ${draft.subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${draft.text}`).toString('base64url')}}
}
export function createGmailDraftAdapter({getAccessToken,fetch:transport=fetch}){
 return {async prepare(draft){
  const token=await getAccessToken() // server vault/OAuth provider callback only
  if(!token)throw new Error('Gmail OAuth is not connected')
  const response=await transport('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(gmailDraftPayload(draft))})
  if(!response.ok)throw new Error('Gmail draft creation failed')
  return response.json()
 }} // No send method. Scheduling/approval/delivery remains disabled.
}
export function crmPayloads(leads,qualifications){
 return qualifiedExport(leads,qualifications).map(l=>({externalId:l.external_id,properties:{company:l.company,email:l.email,firstname:l.contact_name,nexops_market:l.market,nexops_qualification:l.status}}))
}
