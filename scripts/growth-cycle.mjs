#!/usr/bin/env node
// Offline fixture integration only; deliberately no live/send/publish/approve input.
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,resolve} from 'node:path'
import {prepareAcquisition} from '../services/acquisition-preparation.js'
import {withGrowthFixture} from '../services/growth-workflow.js'
import {analyzeFunnel} from '../services/funnel-analysis.js'
import {createBufferAdapter,bufferApprovalHash} from '../services/buffer-adapter.js'
import {approvalHash} from '../services/growth-workflow.js'
try{
 const args=process.argv.slice(2);let directory=resolve('logs/growth'),startDate=new Date(Date.now()+86400000).toISOString().slice(0,10)
 for(let i=0;i<args.length;i++){if(args[i]==='--output'&&args[i+1])directory=resolve(args[++i]);else if(args[i]==='--start-date'&&args[i+1])startDate=args[++i];else if(args[i]!=='--dry-run')throw Error('DRY_RUN_ONLY')}
 const root=fileURLToPath(new URL('../',import.meta.url)),candidates=JSON.parse(await readFile(join(root,'data/acquisition/research.json'),'utf8'))
 if(!Array.isArray(candidates)||candidates.length>25)throw Error('RESEARCH_BATCH_LIMIT')
 const pack=prepareAcquisition({origin:'https://stockwise.example.invalid',startDate})
 const actor={fixtureOnly:true,growthAdmin:true,workspaceId:'fixture-growth-workspace',userId:'fixture-internal-reviewer'}
 const sender={verified:true,country:'SG',email:'operator@example.invalid',legalName:'Fixture operator — not a real entity',address:'Fixture address — not for publication',unsubscribeUrl:'https://stockwise.example.invalid/preferences'}
 const now=Date.parse(startDate+'T00:00:00+08:00')-3600000
 const outcome=await withGrowthFixture({directory,actor,work:async crm=>{
  const companies=[];for(const c of candidates)companies.push(await crm.importCompany(c))
  const company=companies.find(c=>c.assessment.own_scm_function_verified);if(!company)throw Error('NO_VERIFIED_SCM_FIXTURE')
  const contact=await crm.addContact(company.id,{email:'scm@example.invalid',country:'SG',consent:true,role:'Procurement',legalReview:{approved:true,country:'SG',senderCountry:'SG',expiresAt:new Date(now+30*86400000).toISOString(),evidence:'Synthetic legal-review fixture only'}})
  const email=await crm.emailDraft(contact.id,sender)
  const fixture={fixtureOnly:true,execute:async()=>({providerId:'fixture-'+email.id.slice(0,16)})}
  if(email.status==='draft'){await crm.submit(email.id);await crm.approve(email.id,email.hash)}
  if(email.status==='approved')await crm.dispatch(email.id,fixture,{now})
  // Three networks reuse the existing nine social variants; search outlines remain preparation.
  for(const d of pack.drafts.filter(d=>d.channel!=='search')){
   const requestedAt=new Date(Date.parse(d.start_date+'T'+d.local_time+':00+08:00')+d.day_offset*86400000).toISOString()
   const row=await crm.draft({kind:'social',network:d.channel,channelId:'fixture-'+d.channel,text:d.composed_text,images:[],url:d.landing_url,requestedAt,campaign:'apac_scm_3day'})
   if(row.status==='draft'){await crm.submit(row.id);await crm.approve(row.id,row.hash)}
   const adapter=createBufferAdapter({env:{BUFFER_API_KEY:'fixture-key-not-live',BUFFER_ORGANIZATION_ID:'fixture-org',BUFFER_X_CHANNEL_ID:'fixture-x',BUFFER_THREADS_CHANNEL_ID:'fixture-threads',BUFFER_LINKEDIN_CHANNEL_ID:'fixture-linkedin'},
    authorizePublication:async request=>({authorized:row.status==='sending'&&row.approval?.hash===approvalHash(row.payload)&&request.contentHash===bufferApprovalHash({...row.payload,text:row.payload.text}),contentHash:request.contentHash}),
    fetch:async(_url,options)=>{const query=JSON.parse(options.body).query;return {ok:true,json:async()=>query.includes('channels(')?{data:{channels:['x','threads','linkedin'].map(network=>({id:'fixture-'+network,service:network==='x'?'twitter':network,isQueuePaused:false}))}}:query.startsWith('mutation')?{data:{createPost:{post:{id:'fixture-'+row.id.slice(0,16)}}}}:{data:{post:{id:'fixture-'+row.id.slice(0,16),channelId:row.payload.channelId,text:row.payload.text,status:'sent',metrics:[{type:'impressions',value:100,unit:'count'}]}}}}}
   })
   if(row.status==='approved'){try{await crm.dispatch(row.id,{fixtureOnly:true,execute:p=>adapter.createPost(p)},{now})}catch{await crm.block(row.id)}}
   if(row.status==='scheduled'){const receipt=await adapter.post(row.providerId);if(receipt.published&&receipt.text===row.payload.text)await crm.reconcile(row.id,{fixtureOnly:true,providerId:receipt.providerId,channelId:receipt.channelId,contentHash:row.hash,state:'published'})}
   if(row.status==='published'){const receipt=await adapter.post(row.providerId);await crm.measure(row.id,{impressions:receipt.metrics?.find(m=>m.type==='impressions')?.value})}
  }
  if(!contact.stopped&&!contact.history.some(e=>['reply','stop','bounce','meeting'].includes(e.type))){const followup=await crm.followupDraft(email.id);if(followup.status==='draft')await crm.submit(followup.id)}
  await crm.contactEvent(contact.id,'reply');await crm.contactEvent(contact.id,'stop')
  return {companies:Object.keys(crm.state.companies).length,contacts:Object.keys(crm.state.contacts).length,items:Object.values(crm.state.items).map(i=>({id:i.id,status:i.status,kind:i.payload.kind,network:i.payload.network||null,metrics:i.metrics,providerId:i.providerId})),auditEvents:crm.state.audit.length}
 }})
 if(outcome.status==='overlap_blocked'){console.log(JSON.stringify(outcome));process.exit(0)}
 const rows=['homepage_view','signup_completed','demo_workspace_opened','recommended_action_viewed','user_returned','qualified_lead','consultation_submitted'].map(event=>({environment:'fixture',userId:'fixture-person',event,source:'linkedin',postId:outcome.items.find(i=>i.network==='linkedin')?.id}))
 const funnel=analyzeFunnel({environment:'fixture',rows,population:[{userId:'fixture-person',classification:'test',environment:'fixture',verified:true}],sourceApproved:true})
 const production=analyzeFunnel({environment:'production'})
 const report={mode:'dry_run_fixture_only',generatedAt:new Date().toISOString(),outcome,funnel,production,live:{emails_sent:0,social_posts:0,external_writes:0},jobs:{research:'existing public evidence imported; freshness requires separate read approval',crm:'local fixture',email:'simulated only',social:'simulated only',kpis:'fixture only; production unavailable'}}
 await mkdir(directory,{recursive:true,mode:0o700});await writeFile(join(directory,'growth-cycle-latest.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 await writeFile(join(directory,'growth-cycle-latest.md'),`# Growth cycle — DRY RUN ONLY\n\nCompanies: ${outcome.companies}\nContacts: ${outcome.contacts} (synthetic)\nItems: ${outcome.items.length}\nProduction KPI: 未取得\nLive emails/posts/external writes: 0\n\n${outcome.items.map(i=>`${i.kind} ${i.network||''}: ${i.status}`).join('\n')}\n`,{mode:0o600})
 console.log(JSON.stringify({status:'dry_run_complete',companies:outcome.companies,items:outcome.items.length,live_emails:0,live_posts:0,external_writes:0}))
}catch{console.error(JSON.stringify({status:'blocked',reason:'DRY_RUN_CONFIGURATION_OR_STATE_ERROR',external_writes:0}));process.exitCode=1}
