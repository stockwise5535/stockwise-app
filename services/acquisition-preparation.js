// Internal artifacts only. No provider import, send/publish flag, scheduler or external write.
import {createHash} from 'node:crypto'
import {SOCIAL_TEMPLATES,withAutomationLock} from './outbound-automation.js'
import {mkdir,open,rename} from 'node:fs/promises'
import {join,resolve} from 'node:path'
export const ICP=Object.freeze({
 startups:{label:'Startups / lean operations',requiredEvidence:'Own procurement, inventory, supplier or planning duties; startup/lean-team status must be separately verified',painHypothesis:'A small team may need one prioritized view of inventory and PO follow-up',qualifyingQuestion:'Who owns purchasing, inventory and supplier follow-up today?',exclude:'Software-only startup with no own SCM function; company size alone is insufficient'},
 ecommerce:{label:'E-commerce companies',requiredEvidence:'Own physical-product inventory, purchasing, warehouse/logistics or supplier-management duties',painHypothesis:'A buyer may need to prioritize stock and delayed-PO follow-up',qualifyingQuestion:'Does an in-house team manage physical inventory and purchase orders?',exclude:'Digital-only sales or outsourced-only work without confirmed buyer-side SCM ownership'},
 manufacturing:{label:'Manufacturing companies',requiredEvidence:'Own procurement, production/material planning, inventory or supplier-management function',painHypothesis:'A procurement/planning team may need traceable supplier-risk actions and decisions',qualifyingQuestion:'Which team owns supplier promises and material/PO risk follow-up?',exclude:'No verified own SCM function; selling SCM services is not evidence of using them internally'},
})
const variants={
 startups:{x:'Lean SCM team? Try Stockwise’s synthetic demo: TODAY → exception → next action.',threads:'When a small team owns purchasing and inventory, deciding what to follow up first can be the hard part. Stockwise’s synthetic demo shows TODAY → exception → recommended action. Try the workflow before discussing your data setup.',linkedin:'For startup teams that already own inventory, purchasing or supplier operations: explore Stockwise’s clearly labeled synthetic demo. TODAY prioritizes sample exceptions; open one to review the recommended action. Nexops consultation requests can help discuss your workflow, without confirming an engagement.',search:'How lean startup operations teams can review inventory and PO exceptions'},
 ecommerce:{x:'Own inventory and POs? Review a sample risk in Stockwise’s synthetic demo.',threads:'E-commerce inventory work includes more than a stock count: buyers also follow up on purchase orders and suppliers. Explore those sample risks in Stockwise’s synthetic demo, then review the recommended action. Your customer workspace starts separately.',linkedin:'For e-commerce teams with in-house inventory, purchasing or supplier responsibilities: Stockwise offers a synthetic operations demo with TODAY, exceptions, action owners and customer decisions. Explore the workflow first. Customer inventory is not connected merely by registering; consultation submission is a request, not a confirmed booking.',search:'A demo workflow for e-commerce inventory and purchase-order follow-up'},
 manufacturing:{x:'Procurement team? Review sample PO/supplier risks in Stockwise’s synthetic demo.',threads:'Supplier promises and material risks need visible follow-up. Stockwise’s synthetic demo lets manufacturing procurement/planning teams inspect a sample exception, review the recommendation and keep actions and customer decisions traceable. No supplier or PO changes happen automatically.',linkedin:'For manufacturers with procurement, production-planning, inventory or supplier teams: explore Stockwise’s synthetic PO and supplier monitoring workflow. Review an exception and recommended action, then track the human decision. Nexops managed-service scope must be discussed separately; the demo is not connected to your operations.',search:'Reviewing supplier and PO exceptions in a manufacturing demo workspace'},
}
export function campaignUrl(origin,{channel,segment}){
 if(!Object.hasOwn(ICP,segment)||!['x','threads','linkedin','search'].includes(channel))throw Error('INVALID_CAMPAIGN')
 let url
 try{url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error()}catch{throw Error('APPROVED_PUBLIC_ORIGIN_REQUIRED')}
 url.pathname='/en';url.search=new URLSearchParams({utm_source:channel==='search'?'organic_search':channel,utm_medium:channel==='search'?'organic':'social',utm_campaign:'apac_scm_3day',utm_content:segment}).toString()
 return url.href
}
export function prepareAcquisition({origin,startDate}={}){
 if(typeof startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||new Date(startDate+'T00:00:00Z').toISOString().slice(0,10)!==startDate)throw Error('INVALID_PLAN_DATE')
 const drafts=[]
 Object.keys(ICP).forEach((segment,day)=>{
  for(const [channel,text]of Object.entries(variants[segment])){
   let landingUrl=null;try{if(origin)landingUrl=campaignUrl(origin,{channel,segment})}catch{/* KPI/report preparation remains independent of public-origin setup. */}
   const proposal={segment,channel,start_date:startDate,day_offset:day,local_time:{x:'09:00',threads:'12:30',linkedin:'16:00',search:'10:00'}[channel],timezone:'Asia/Singapore',text,landing_url:landingUrl,composed_text:text+(landingUrl?'\n'+landingUrl:''),search_outline:channel==='search'?['Who owns the SCM task?','Review clearly synthetic TODAY risks','Open an exception and recommended action','Human decision and action tracking','Separate customer workspace and consultation request']:null}
   // Reuse existing verified public-copy context, not its permission to publish.
   const contentHash=createHash('sha256').update(JSON.stringify(proposal)).digest('hex')
   drafts.push({...proposal,content_hash:contentHash,status:'HUMAN_APPROVAL_REQUIRED',publication_authorized:false,copy_source:'existing shipped demo; services/outbound-automation.js public education baseline',reference_copy:SOCIAL_TEMPLATES.product_education[channel] || null,cta:'Explore the synthetic demo or register for 30-day access; consultation is request-only'})
  }
 })
 return {version:1,start_date:startDate,mode:'internal_preparation_only',icp:ICP,drafts,approval:{required:true,scope:'Exact content hash, destination, channel, plan start date and proposed time must be reviewed before any external operation',publish_path_implemented:false},measurement_limitations:['UTM links are drafts; browser capture/consented channel conversion is not currently verified','Search links/outlines do not publish or guarantee indexing','Current landing/signup/demo components are reused without production changes']}
}
export function researchAssessment(candidate){
 if(!Object.hasOwn(ICP,candidate.segment)||typeof candidate.company!=='string')throw Error('INVALID_RESEARCH')
 const trusted=e=>{
  try{
   const source=new URL(e.source_url),official=new URL(candidate.official_site)
   if(source.protocol!=='https:'||source.username||source.password||official.protocol!=='https:')return false
   const direct=source.hostname===official.hostname||source.hostname.endsWith('.'+official.hostname)
   const linked=(candidate.evidence || []).some(proof=>proof.http_status===200&&new URL(proof.source_url).hostname===official.hostname&&proof.linked_official_source&&new URL(proof.linked_official_source).hostname===source.hostname&&source.pathname.split('/').includes(new URL(proof.linked_official_source).pathname.split('/').filter(Boolean)[0]))
   return direct||linked
  }catch{return false}
 }
 const evidence=(candidate.evidence || []).filter(e=>e.http_status===200&&e.scm_signal_verified===true&&typeof e.excerpt==='string'&&e.excerpt.trim()&&Number.isFinite(Date.parse(e.checked_at))&&trusted(e))
 const ownFunction=evidence.some(e=>e.function_evidence===true)
 return {company:candidate.company,segment:candidate.segment,own_scm_function_verified:ownFunction,scm_evidence:evidence.length?'verified_public_signal':'not_verified',fit:evidence.length?'candidate_only_needs_discovery':'unqualified_pending_evidence',need_status:'hypothesis_not_company_fact',contact_authorized:false}
}
export function acquisitionRecommendations(kpis){
 return [
  'Confirm production/legal/public-origin approval and exclude development fixtures before interpreting acquisition counts as customers.',
  kpis.website_visitors.status==='unavailable'||kpis.traffic_source.status==='unavailable'?'Review consented coarse source attribution and an authorized analytics read path; visitors/source stay unavailable until verified.':'Review a consistent acquisition cohort before comparing channel conversion rates.',
  'Review one segment-specific content hash, destination, channel and timing; approve a bounded distribution test separately, then measure the same cohort.'
 ]
}
async function atomic(path,value){const temp=path+'.tmp';const f=await open(temp,'wx',0o600);try{await f.writeFile(value);await f.sync()}finally{await f.close()}await rename(temp,path)}
export async function writeAcquisitionReport({directory,pack,kpis,candidates=[]}){
 const root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700})
 return withAutomationLock(root,async()=>{
  // Fixed names, lock, private temporary file and atomic rename; no payload/provider dispatch.
  const data={...pack,kpis,research:candidates.map(candidate=>({...candidate,assessment:researchAssessment(candidate)})),recommendations:acquisitionRecommendations(kpis),external_writes:0}
  const json=JSON.stringify(data,null,2)+'\n'
  try{await atomic(join(root,'acquisition-latest.json'),json)}catch{throw Error('REPORT_WRITE_FAILED_REQUIRES_INSPECTION')}
  const lines=['Stockwise / Nexops acquisition — internal only',`Window: ${kpis.window.from} <= timestamp < ${kpis.window.to}`,`Scope: ${kpis.scope}`,'',...Object.entries(kpis).filter(([,v])=>v?.status).map(([key,v])=>`${key}: ${v.status==='measured'?v.value:'未取得'}${v.reason?' ('+v.reason+')':''}`),'',`Prepared drafts: ${pack.drafts.length}; ALL require human approval`,`Research candidates: ${candidates.length}; no contacts authorized`,'UTM/channel conversion: not verified; no invented direct/zero attribution','No conversion rate inferred from unrelated period activity counts.','',...data.recommendations.map((r,i)=>`${i+1}. ${r}`),'Emails/posts/deployments/external writes: 0','']
  // Keep raw user/lead records out of every output; KPIs contain aggregates only.
  const draftReview=pack.drafts.flatMap(d=>{
   const date=new Date(Date.parse(pack.start_date+'T00:00:00Z')+d.day_offset*86400000).toISOString().slice(0,10)
   return [`### ${d.segment} / ${d.channel}`,`承認待ち・未予約: ${date} ${d.local_time} ${d.timezone}`,`Content hash: ${d.content_hash}`,d.composed_text,...(d.search_outline || []).map(line=>'- '+line),'']
  })
  const researchReview=data.research.flatMap(c=>[`### ${c.company} (${c.segment})`,`公式: ${c.official_site}`,`適合度: ${c.assessment.fit}; 自社SCM業務の具体的根拠: ${c.assessment.own_scm_function_verified?'あり（ニーズ/購買意向は未確認）':'未確認'}`,`課題仮説（事実ではない）: ${c.hypothesized_need}`,...c.evidence.map(e=>`- ${e.source_url} / HTTP ${e.http_status} / ${e.checked_at}: ${e.excerpt}`),`次の確認: ${c.next_verification}`,''])
  await atomic(join(root,'acquisition-latest.md'),[...lines,'## 投稿/記事案 — 全件承認待ち・公開権限なし',...draftReview,'## 公開情報の候補調査 — 接触権限なし',...researchReview].join('\n'))
  return {status:'prepared_review_required',drafts:pack.drafts.length,external_writes:0}
 })
}
