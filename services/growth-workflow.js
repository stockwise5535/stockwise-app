// Fixture-only orchestration. No live provider import, browser endpoint or production authorization claim.
import {createHash,randomUUID} from 'node:crypto'
import {readFile,open,rename,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {withAutomationLock} from './outbound-automation.js'
import {researchAssessment} from './acquisition-preparation.js'
import {outboundRiskFlags} from './outbound-safety.js'
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
export const approvalHash=payload=>digest(canonical(payload))
const fail=code=>{throw Error(code)}
const protectedStates=['sending','scheduled','published','measured','simulated_sent','delivery_unknown']
const payloadKeys=new Set(['kind','contactId','recipient','sender','subject','body','requestedAt','template','evidenceVersion','network','channelId','text','images','url','campaign'])
const validPayload=payload=>payload&&typeof payload==='object'&&!Array.isArray(payload)&&['email','social'].includes(payload.kind)&&Object.keys(payload).every(k=>payloadKeys.has(k))&&JSON.stringify(payload).length<=25000&&(payload.kind==='email'?typeof payload.subject==='string'&&payload.subject.trim()&&payload.subject.length<=300&&!/[\r\n]/.test(payload.subject)&&typeof payload.body==='string'&&payload.body.trim()&&payload.body.length<=20000:typeof payload.text==='string'&&payload.text.trim())

const highRisk=/compensation|refund|damages|liability|bank account|payment instructions|contract changes|price changes|change (?:the )?(?:supplier|PO)|guarantee|\d+% (?:savings|improvement)|confidential|uncertain AI|返金|賠償|契約変更|口座|仕入先変更/i
export const COUNTRY_REVIEW=Object.freeze({
 US:'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',SG:'https://sso.agc.gov.sg/Act/SCA2007',AU:'https://www.acma.gov.au/avoid-sending-spam',NZ:'https://www.dia.govt.nz/Spam-How-to-Comply',HK:'https://www.ofca.gov.hk/en/consumer_focus/guide/others/uemo/',JP:'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/m_mail.html',KR:'https://spam.kisa.or.kr/',TW:'https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=I0050021',
})
export function emailEligibility(contact,sender,now=Date.now()){
 const checks={consent:contact?.consent===true,not_stopped:!contact?.stopped,not_bounced:!contact?.bounced,not_suppressed:!contact?.suppressed,country_review:Object.hasOwn(COUNTRY_REVIEW,contact?.country)&&contact?.legalReview?.approved===true&&contact.legalReview.country===contact.country&&Date.parse(contact.legalReview.expiresAt)>now&&!!contact.legalReview.evidence,sender_jurisdiction:Object.hasOwn(COUNTRY_REVIEW,sender?.country)&&contact?.legalReview?.senderCountry===sender.country,sender_identity:sender?.verified===true&&!!sender.legalName&&!!sender.address&&!!sender.email,unsubscribe:!!sender?.unsubscribeUrl&&/^https:\/\//.test(sender.unsubscribeUrl)}
 return {allowed:Object.values(checks).every(Boolean),checks}
}
async function save(file,state){const temp=file+'.'+randomUUID()+'.tmp',handle=await open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(state,null,2)+'\n');await handle.sync()}finally{await handle.close()}await rename(temp,file)}
export async function withGrowthFixture({directory,actor,work}){
 if(actor?.fixtureOnly!==true||actor?.growthAdmin!==true||!actor.workspaceId||!actor.userId)fail('FIXTURE_INTERNAL_ADMIN_REQUIRED')
 await mkdir(directory,{recursive:true,mode:0o700})
 return withAutomationLock(directory,async()=>{
  const file=join(directory,'growth-fixture-state.json');let state
  try{state=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')fail('STATE_UNREADABLE');state={version:1,environment:'fixture',workspaceId:actor.workspaceId,companies:{},contacts:{},items:{},attempts:[],audit:[]}}
  if(state.environment!=='fixture'||state.workspaceId!==actor.workspaceId||state.version!==1)fail('FIXTURE_SCOPE_MISMATCH')
  const log=(kind,id)=>state.audit.push({kind,id,actorId:actor.userId,at:new Date().toISOString()})
  const persist=()=>save(file,state)
  const item=id=>state.items[id] || fail('ITEM_NOT_FOUND')
  const api={
   state,
   async importCompany(candidate){
    const assessment=researchAssessment(candidate),url=new URL(candidate.official_site)
    const domain=url.hostname.toLowerCase().replace(/^www\./,''),id=digest([actor.workspaceId,domain])
    const evidenceHash=approvalHash(candidate.evidence),score=(assessment.own_scm_function_verified?60:0)+(assessment.scm_evidence==='verified_public_signal'?20:0)
    const prior=state.companies[id]
    if(prior?.evidenceHash===evidenceHash)return prior
    state.companies[id]={id,domain,name:candidate.company,segment:candidate.segment,assessment,score,status:prior&&!['qualified_candidate','research_required'].includes(prior.status)?prior.status:(score>=60?'qualified_candidate':'research_required'),evidence:candidate.evidence,evidenceHash}
    if(prior)for(const row of Object.values(state.items))if(state.contacts[row.payload.contactId]?.companyId===id&&['draft','review','approved'].includes(row.status)){row.status='blocked';row.approval=null;log('source_change_invalidated',row.id)}
    log(prior?'research_updated':'company_imported',id);await persist();return state.companies[id]
   },
   async addContact(companyId,input){
    if(!state.companies[companyId]||typeof input.email!=='string'||!/^[^\s@]+@[^\s@]+\.(?:invalid|test)$/.test(input.email)||/[\r\n]/.test(input.email))fail('SYNTHETIC_CONTACT_REQUIRED')
    const email=input.email.trim().toLowerCase(),id=digest([actor.workspaceId,email]);if(state.contacts[id]){if(state.contacts[id].companyId!==companyId)fail('CONTACT_COMPANY_CONFLICT');return state.contacts[id]}
    state.contacts[id]={id,companyId,email,role:input.role||'Operations',country:input.country,consent:input.consent===true,legalReview:input.legalReview||null,stopped:false,bounced:false,suppressed:false,history:[]};log('contact_added',id);await persist();return state.contacts[id]
   },
   async contactEvent(id,type){
    const c=state.contacts[id];if(!c||!['reply','stop','bounce','meeting','suppression'].includes(type))fail('CONTACT_EVENT_INVALID')
    if(c.history.some(e=>e.type===type))return
    c.history.push({type,at:new Date().toISOString()});if(type==='stop')c.stopped=true;if(type==='bounce')c.bounced=true;if(type==='suppression')c.suppressed=true
    state.companies[c.companyId].status=({reply:'replied',stop:'stopped',bounce:'bounced',meeting:'meeting',suppression:'stopped'})[type]
    for(const row of Object.values(state.items))if(row.payload.contactId===id&&['draft','review','approved'].includes(row.status)&&['stop','bounce','suppression'].includes(type)){row.status='blocked';row.approval=null}
    log('contact_'+type,id);await persist()
   },
   async emailDraft(contactId,sender){
    const c=state.contacts[contactId],company=state.companies[c?.companyId]
    if(!company||!company.assessment.own_scm_function_verified)fail('OWN_SCM_EVIDENCE_REQUIRED')
    if(/[\r\n]/.test(company.name)||company.name.length>160)fail('COMPANY_NAME_INVALID')
    return this.draft({kind:'email',contactId,recipient:c.email,sender,subject:'Explore an inventory and PO review workflow',body:`Hello ${company.name} operations team,\n\nYour public recruitment information describes inventory or procurement work. Stockwise offers a synthetic demo: TODAY, an exception and a recommended action. Customer data is not connected merely by registering. Would you like to explore the workflow?\n\n${sender.legalName}\n${sender.address}\nPreferences: ${sender.unsubscribeUrl}`,requestedAt:null,template:'scm_introduction_fixture_v1',evidenceVersion:company.evidenceHash})
   },
   async followupDraft(id){
    const row=item(id),c=state.contacts[row.payload.contactId]
    if(row.status!=='simulated_sent'||!c||c.history.some(e=>['reply','stop','bounce','suppression','meeting'].includes(e.type)))fail('FOLLOWUP_NOT_ELIGIBLE')
    return this.draft({...row.payload,subject:'Follow-up: inventory and PO review demo',body:'A brief follow-up about the synthetic Stockwise review workflow. No appointment or service scope has been confirmed.\n\n'+row.payload.body,template:'scm_followup_fixture_v1'})
   },
   async draft(payload){
    if(!validPayload(payload))fail('PAYLOAD_INVALID')
    const copy=structuredClone(payload),id=approvalHash([actor.workspaceId,copy]);if(state.items[id])return state.items[id];if(Object.keys(state.items).length>=500)fail('FIXTURE_QUEUE_LIMIT_REQUIRES_REVIEW')
    state.items[id]={id,payload:copy,hash:approvalHash(copy),status:'draft',approval:null,providerId:null,metrics:null};log('draft_created',id);await persist();return state.items[id]
   },
   async block(id){const row=item(id);if(protectedStates.includes(row.status))fail('HELD_ITEM_IMMUTABLE');row.status='blocked';row.approval=null;log('gate_blocked',id);await persist()},
   async submit(id){const row=item(id);if(row.status!=='draft')fail('TRANSITION_DENIED');row.status='review';log('review_requested',id);await persist()},
   async edit(id,payload){if(!validPayload(payload))fail('PAYLOAD_INVALID');const row=item(id);if(protectedStates.includes(row.status))fail('HELD_ITEM_IMMUTABLE');row.payload=structuredClone(payload);row.hash=approvalHash(row.payload);row.status='draft';row.approval=null;log('approval_invalidated',id);await persist()},
   async approve(id,expectedHash){const row=item(id);if(row.status!=='review'||expectedHash!==row.hash||approvalHash(row.payload)!==row.hash)fail('APPROVAL_HASH_MISMATCH');row.approval={hash:row.hash,reviewerId:actor.userId,at:new Date().toISOString()};row.status='approved';log('approved',id);await persist()},
   async dispatch(id,provider,{now=Date.now()}={}){
    const row=item(id),p=row.payload
    const deny=async code=>{log('dispatch_denied',id);await persist();fail(code)}
    if(row.status!=='approved'||!row.approval||row.approval.hash!==approvalHash(p)||row.hash!==approvalHash(p))await deny('HUMAN_APPROVAL_REQUIRED')
    if(provider?.fixtureOnly!==true)await deny('LIVE_PROVIDER_FORBIDDEN')
    if(highRisk.test(JSON.stringify(p))||outboundRiskFlags(JSON.stringify(p)).length)await deny('HIGH_RISK_BLOCKED')
    if(p.kind==='email'){
     const c=state.contacts[p.contactId],company=state.companies[c?.companyId];if(!company?.assessment.own_scm_function_verified||p.evidenceVersion!==company.evidenceHash)await deny('RESEARCH_EVIDENCE_CHANGED');if(!c||c.email!==p.recipient||!emailEligibility(c,p.sender,now).allowed)await deny('RECIPIENT_OR_LEGAL_GATE_BLOCKED')
     const recent=state.attempts.filter(a=>a.kind==='email'&&now-Date.parse(a.at)<86400000)
     if(recent.length>=50||recent.filter(a=>now-Date.parse(a.at)<3600000).length>=10||recent.some(a=>a.target===p.recipient))await deny('RATE_LIMIT_BLOCKED')
    }else if(!['x','threads','linkedin'].includes(p.network)||typeof p.channelId!=='string'||!/^[-_a-zA-Z0-9]{1,128}$/.test(p.channelId)||typeof p.text!=='string'||!p.text.trim()||[...p.text].length>({x:280,threads:500,linkedin:3000}[p.network])||!Array.isArray(p.images)||!p.url||!p.requestedAt||!Number.isFinite(Date.parse(p.requestedAt))||Date.parse(p.requestedAt)<=now)await deny('SOCIAL_TARGET_INVALID')
    const identity=approvalHash([p.kind,p.recipient||p.channelId,p.body||p.text,p.images||[],p.url||null])
    if(state.attempts.some(a=>a.identity===identity))await deny('DUPLICATE_OR_UNKNOWN_HELD')
    row.status='sending';state.attempts.push({itemId:id,identity,kind:p.kind,target:p.recipient||p.channelId,at:new Date(now).toISOString()});log('fixture_claim_reserved',id);await persist()
    try{const receipt=await provider.execute(structuredClone(p));if(!/^fixture[-_]/.test(receipt?.providerId||''))throw Error();row.providerId=receipt.providerId;row.status=p.kind==='email'?'simulated_sent':'scheduled';if(p.kind==='email'){const c=state.contacts[p.contactId];c.history.push({type:'simulated_email_sent',itemId:id,at:new Date(now).toISOString()});state.companies[c.companyId].status='contacted'}log('fixture_accepted',id)}catch{row.status='delivery_unknown';log('unknown_no_retry',id)}
    await persist();return row.status
   },
   async reconcile(id,receipt){const row=item(id);if(!['scheduled','delivery_unknown'].includes(row.status)||receipt?.fixtureOnly!==true||receipt.providerId!==row.providerId||receipt.channelId!==row.payload.channelId||receipt.contentHash!==row.hash||receipt.state!=='published')fail('RECONCILIATION_EVIDENCE_REQUIRED');row.status='published';log('fixture_published',id);await persist()},
   async measure(id,metrics){const row=item(id);if(row.status!=='published')fail('PUBLICATION_EVIDENCE_REQUIRED');row.metrics=Object.fromEntries(['impressions','engagement','link_clicks','website_visits','signups','demo_starts','qualified_leads'].map(key=>[key,Number.isSafeInteger(metrics?.[key])&&metrics[key]>=0?metrics[key]:null]));if(Object.values(row.metrics).some(v=>v!==null)){row.status='measured';log('fixture_measured',id)}else log('metrics_unavailable',id);await persist()},
  }
  const result=await work(api);await persist();return result
 })
}
