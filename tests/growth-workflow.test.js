import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {withGrowthFixture,approvalHash,emailEligibility} from '../services/growth-workflow.js'
import {analyzeFunnel} from '../services/funnel-analysis.js'
import {attributionProperties,ATTRIBUTION_KEY,clearAttribution} from '../src/growth/attribution.js'
import {createBufferAdapter,bufferApprovalHash} from '../services/buffer-adapter.js'
const actor={fixtureOnly:true,growthAdmin:true,userId:'fixture-admin',workspaceId:'fixture-workspace'}
const now=Date.parse('2026-11-01T00:00:00Z'),sender={verified:true,country:'SG',email:'sender@example.invalid',legalName:'Fixture Sender',address:'Fixture address',unsubscribeUrl:'https://example.invalid/preferences'}
const company={company:'Fixture Company',segment:'ecommerce',official_site:'https://company.example.invalid',evidence:[{source_url:'https://company.example.invalid/careers',http_status:200,checked_at:'2026-10-31',excerpt:'Inventory and procurement duties',scm_signal_verified:true,function_evidence:true}]}
const contact={email:'buyer@example.invalid',country:'SG',consent:true,legalReview:{country:'SG',senderCountry:'SG',approved:true,evidence:'Fixture approval only',expiresAt:'2027-01-01T00:00:00Z'}}
const social={kind:'social',network:'linkedin',channelId:'fixture-linkedin',text:'Explore Stockwise’s synthetic demo.',images:[],url:'https://example.invalid/en',requestedAt:'2026-11-02T09:00:00Z'}
async function temp(work){const dir=await mkdtemp(join(tmpdir(),'growth-workflow-'));try{return await work(dir)}finally{await rm(dir,{recursive:true,force:true})}}
const withCrm=(directory,work)=>withGrowthFixture({directory,actor,work})
const fixtureProvider={fixtureOnly:true,execute:async()=>({providerId:'fixture-receipt'})}
async function email(crm){const c=await crm.importCompany(company),u=await crm.addContact(c.id,contact);return {contact:u,row:await crm.emailDraft(u.id,sender)}}
async function approve(crm,row){await crm.submit(row.id);await crm.approve(row.id,row.hash)}
test('CRM imports evidence, scores own SCM, deduplicates domain/contact, records status and opt-out',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const a=await crm.importCompany(company),b=await crm.importCompany({...company,official_site:'https://www.company.example.invalid'});assert.equal(a.id,b.id);assert.equal(a.score,80)
 const u=await crm.addContact(a.id,contact);assert.equal((await crm.addContact(a.id,{...contact,email:'BUYER@example.invalid'})).id,u.id)
 await assert.rejects(crm.addContact(a.id,{...contact,email:'real@example.com'}),/SYNTHETIC/)
 await crm.contactEvent(u.id,'meeting');assert.equal(a.status,'meeting');await crm.contactEvent(u.id,'stop');await crm.contactEvent(u.id,'stop');assert.equal(u.history.length,2);assert.equal(a.status,'stopped')
})))
test('fixture scope/admin cannot be used for a production store or another workspace',async()=>temp(async dir=>{
 await assert.rejects(withGrowthFixture({directory:dir,actor:{...actor,growthAdmin:false},work:()=>{}}),/ADMIN_REQUIRED/)
 await withCrm(dir,async()=>{});await assert.rejects(withGrowthFixture({directory:dir,actor:{...actor,workspaceId:'foreign'},work:()=>{}}),/SCOPE_MISMATCH/)
}))
test('approval binds all copy/channel/image/url/time fields and edits require fresh review',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const row=await crm.draft(social);await assert.rejects(crm.dispatch(row.id,fixtureProvider,{now}),/HUMAN_APPROVAL/);await approve(crm,row)
 for(const patch of [{text:'Changed text'},{channelId:'other'},{images:['https://example.invalid/new.png']},{url:'https://example.invalid/other'},{requestedAt:'2026-11-03T00:00:00Z'}])assert.notEqual(approvalHash(social),approvalHash({...social,...patch}))
 await crm.edit(row.id,{...social,text:'Updated demo copy'});assert.equal(row.approval,null);assert.equal(row.status,'draft');await assert.rejects(crm.dispatch(row.id,fixtureProvider,{now}),/HUMAN_APPROVAL/)
 await approve(crm,row);assert.equal(await crm.dispatch(row.id,fixtureProvider,{now}),'scheduled');await assert.rejects(crm.edit(row.id,social),/HELD/)
 await crm.reconcile(row.id,{fixtureOnly:true,providerId:'fixture-receipt',channelId:row.payload.channelId,contentHash:row.hash,state:'published'});await crm.measure(row.id,{impressions:0});assert.equal(row.status,'measured');assert.equal(row.metrics.impressions,0);assert.equal(row.metrics.link_clicks,null)
})))
test('unknown delivery is durable and never auto-retried on another run',async()=>temp(async dir=>{
 let id,calls=0
 await withCrm(dir,async crm=>{const row=await crm.draft(social);id=row.id;await approve(crm,row);assert.equal(await crm.dispatch(id,{fixtureOnly:true,execute:async()=>{calls++;throw Error('fixture-secret')}},{now}),'delivery_unknown')})
 await withCrm(dir,async crm=>{await assert.rejects(crm.dispatch(id,fixtureProvider,{now}),/HUMAN_APPROVAL/);assert.equal(crm.state.items[id].status,'delivery_unknown')});assert.equal(calls,1);assert.ok(!(await readFile(join(dir,'growth-fixture-state.json'),'utf8')).includes('fixture-secret'))
}))
test('same social content under a new date cannot be posted twice',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const row=await crm.draft(social);await approve(crm,row);await crm.dispatch(row.id,fixtureProvider,{now})
 const other=await crm.draft({...social,requestedAt:'2026-11-04T00:00:00Z'});await approve(crm,other);await assert.rejects(crm.dispatch(other.id,fixtureProvider,{now}),/DUPLICATE/)
})))
test('consent, suppression, stop, bounce, country, legal review expiry and sender identity gates fail closed',()=>{
 assert.equal(emailEligibility(contact,sender,now).allowed,true)
 for(const patch of [{consent:false},{suppressed:true},{stopped:true},{bounced:true},{country:'OTHER'},{country:'toString'},{legalReview:null},{legalReview:{...contact.legalReview,expiresAt:'2020-01-01'}}])assert.equal(emailEligibility({...contact,...patch},sender,now).allowed,false)
 assert.equal(emailEligibility(contact,{...sender,address:''},now).allowed,false)
})
test('approved email simulation, follow-up draft and reply/stop/bounce preserve eligibility',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const {row,contact:c}=await email(crm);await approve(crm,row);assert.equal(await crm.dispatch(row.id,fixtureProvider,{now}),'simulated_sent')
 const follow=await crm.followupDraft(row.id);assert.equal(follow.status,'draft');await approve(crm,follow);await assert.rejects(crm.dispatch(follow.id,fixtureProvider,{now}),/RATE_LIMIT/)
 await crm.contactEvent(c.id,'reply');await assert.rejects(crm.followupDraft(row.id),/ELIGIBLE/);await crm.contactEvent(c.id,'bounce');assert.equal(follow.status,'blocked');assert.equal(c.bounced,true)
})))
test('unapproved, high-risk and live-provider attempts never execute',async()=>temp(async dir=>withCrm(dir,async crm=>{
 let calls=0;const provider={fixtureOnly:true,execute:async()=>{calls++;return {providerId:'fixture-a'}}}
 for(const text of ['We will refund your charges.','We will pay damages.','We accept liability.','Approve a price change.','Increase the PO quantity.','Replace the supplier.','We cover expedite freight cost.','Customers achieved 90% savings.','Uncertain AI content','Confidential customer information']){const row=await crm.draft({...social,text});await approve(crm,row);await assert.rejects(crm.dispatch(row.id,provider,{now}),/HIGH_RISK/)}
 const row=await crm.draft(social);await approve(crm,row);await assert.rejects(crm.dispatch(row.id,{execute:()=>{calls++}},{now}),/LIVE_PROVIDER/);assert.equal(calls,0)
})))
test('source attribution is disabled by default, consent-only, enum-only, expiring and cleared on withdrawal',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}
 const options={storage,now,href:'https://app.example.invalid/en?utm_source=linkedin&utm_campaign=email@example.com'}
 assert.deepEqual(attributionProperties({...options,enabled:false,consent:true}),{});assert.equal(store.size,0)
 assert.deepEqual(attributionProperties({...options,enabled:true,consent:false}),{});assert.equal(store.size,0)
 assert.deepEqual(attributionProperties({...options,enabled:true,consent:true}),{referral_source:'linkedin'});assert.ok(!store.get(ATTRIBUTION_KEY).includes('@'))
 assert.deepEqual(attributionProperties({...options,enabled:true,consent:true,href:'https://app.example.invalid/growth'}),{referral_source:'linkedin'})
 assert.deepEqual(attributionProperties({...options,enabled:true,consent:false}),{});assert.equal(store.size,0)
 assert.deepEqual(attributionProperties({...options,enabled:true,consent:true,href:'https://app.example.invalid/?utm_source=private@example.com'}),{})
 attributionProperties({...options,enabled:true,consent:true});clearAttribution(storage);assert.equal(store.size,0)
})
test('production metrics cannot count development/test rows; missing visitor/source remains unavailable',()=>{
 const rows=[{environment:'production',userId:'customer',event:'demo_workspace_opened',source:'linkedin',postId:'p'},{environment:'production',userId:'test',event:'demo_workspace_opened'},{environment:'fixture',userId:'customer',event:'demo_workspace_opened'}]
 const population=[{userId:'customer',environment:'production',classification:'real_customer',verified:true},{userId:'test',environment:'production',classification:'test',verified:true}]
 const result=analyzeFunnel({environment:'production',rows,population,sourceApproved:true});assert.equal(result.metrics.demo_starts.value,1);assert.equal(result.metrics.website_visitors.value,null);assert.equal(result.by_post.p.demo_starts,1)
 assert.equal(analyzeFunnel({environment:'production'}).metrics.new_signups.value,null)
})
test('Buffer LinkedIn mapping, mandatory server approval and read-only status/metrics use verified shapes',async()=>{
 const env={VERCEL_ENV:'production',NEXOPS_SOCIAL_WRITES_ALLOWED:'true',NEXOPS_SOCIAL_EMERGENCY_STOP:'false',BUFFER_API_KEY:'fixture-secret',BUFFER_ORGANIZATION_ID:'org',BUFFER_LINKEDIN_CHANNEL_ID:'li'},calls=[]
 const transport=async(_url,o)=>{const query=JSON.parse(o.body).query;calls.push(query);return {ok:true,json:async()=>query.includes('channels(')?{data:{channels:[{id:'li',service:'linkedin',isQueuePaused:false}]}}:query.startsWith('mutation')?{data:{createPost:{post:{id:'post1'}}}}:{data:{post:{id:'post1',channelId:'li',status:'sent',metrics:[{type:'impressions',value:0,unit:'count'}]}}}}}
 const args={network:'linkedin',text:'Public fixture copy',requestedAt:'2030-01-01T00:00:00Z'}
 await assert.rejects(createBufferAdapter({env,fetch:transport}).createPost(args),/APPROVAL/);assert.equal(calls.filter(q=>q.startsWith('mutation')).length,0)
 const adapter=createBufferAdapter({env,fetch:transport,authorizePublication:async r=>({authorized:true,contentHash:r.contentHash})});assert.equal((await adapter.createPost(args)).service,'linkedin');const post=await adapter.post('post1');assert.equal(post.published,true);assert.equal(post.metrics[0].value,0);assert.equal(post.websiteVisits,null)
 assert.notEqual(bufferApprovalHash({...args,channelId:'li'}),bufferApprovalHash({...args,channelId:'li',images:['different']}))
})
test('integrated CLI covers fixture flow, idempotent rerun and refuses live flags',async()=>temp(async dir=>{
 const run=promisify(execFile),script=resolve('scripts/growth-cycle.mjs');for(let i=0;i<2;i++){const r=await run(process.execPath,[script,'--dry-run','--start-date','2099-11-02','--output',dir]);assert.equal(JSON.parse(r.stdout).external_writes,0)}
 const data=JSON.parse(await readFile(join(dir,'growth-cycle-latest.json'),'utf8'));assert.equal(data.outcome.companies,6);assert.equal(data.outcome.items.length,11);assert.equal(data.outcome.items.filter(i=>i.status==='measured').length,9);assert.equal(data.production.metrics.demo_starts.value,null);assert.equal(data.live.emails_sent,0)
 await assert.rejects(run(process.execPath,[script,'--live']))
}))
test('research source updates invalidate prior email approvals',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const {row}=await email(crm);await approve(crm,row)
 await crm.importCompany({...company,evidence:company.evidence.map(e=>({...e,checked_at:'2026-11-01',scm_signal_verified:false,function_evidence:false}))})
 assert.equal(row.status,'blocked');assert.equal(row.approval,null);await assert.rejects(crm.dispatch(row.id,fixtureProvider,{now}),/HUMAN_APPROVAL/)
})))
test('hourly sender quota and missing social time are refused before provider execution',async()=>temp(async dir=>withCrm(dir,async crm=>{
 const c=await crm.importCompany(company)
 for(let i=0;i<11;i++){
  const u=await crm.addContact(c.id,{...contact,email:`buyer${i}@example.invalid`}),row=await crm.emailDraft(u.id,sender);await approve(crm,row)
  if(i<10)await crm.dispatch(row.id,{fixtureOnly:true,execute:async()=>({providerId:'fixture-'+i})},{now});else await assert.rejects(crm.dispatch(row.id,fixtureProvider,{now}),/RATE_LIMIT/)
 }
 const bad=await crm.draft({...social,requestedAt:'not-a-date'});await approve(crm,bad);await assert.rejects(crm.dispatch(bad.id,fixtureProvider,{now}),/SOCIAL_TARGET/)
})))
test('public research is offline by default, allowlisted, bounded and does not turn 403 into evidence',async()=>{
 const {refreshResearch}=await import('../services/research-refresh.js')
 const candidates=[{...company,evidence:[{...company.evidence[0],source_url:'https://secretlab.co/fixture'}]}]
 let calls=0
 const offline=await refreshResearch(candidates,{fetch:()=>{calls++;throw Error()}});assert.equal(calls,0);assert.equal(offline.requests,0)
 const success=await refreshResearch(candidates,{readPublic:true,fetch:async()=>new Response('Inventory and procurement duties')});assert.equal(success.candidates[0].evidence[0].scm_signal_verified,true)
 const denied=await refreshResearch(candidates,{readPublic:true,fetch:async()=>new Response('',{status:403})});assert.equal(denied.candidates[0].evidence[0].scm_signal_verified,false)
 const unknown=await refreshResearch([{...company,evidence:[{...company.evidence[0],source_url:'https://127.0.0.1/private'}]}],{readPublic:true,fetch:()=>assert.fail('private network forbidden')});assert.equal(unknown.requests,0)
})

test('new and legacy job entrypoints cannot use network even when provider credentials are present',async()=>temp(async dir=>{
 const preload=join(dir,'deny-network.mjs');await writeFile(preload,"globalThis.fetch=()=>{process.exitCode=29;throw Error('NETWORK_FORBIDDEN_IN_DRY_RUN')}")
 const run=promisify(execFile)
 for(const script of ['scripts/growth-cycle.mjs','scripts/send-codex-activity-report.mjs']){
  const args=script.includes('growth-cycle')?['--dry-run','--start-date','2099-11-02']:['--start-date','2099-11-02']
  const result=await run(process.execPath,['--import',preload,resolve(script),...args,'--output',join(dir,script.includes('growth-cycle')?'cycle':'report')],{env:{...process.env,BUFFER_API_KEY:'fixture-secret-not-live',GMAIL_REFRESH_TOKEN:'fixture-refresh-not-live',VITE_PUBLIC_SITE_URL:'https://public.example.invalid'}})
  assert.equal(JSON.parse(result.stdout).external_writes,0);assert.ok(!result.stdout.includes('fixture-secret-not-live'))
 }
}))

test('Buffer organization discovery needs only the API key and does not request owner email',async()=>{
 let query
 const adapter=createBufferAdapter({env:{BUFFER_API_KEY:'fixture-key'},fetch:async(_url,options)=>{query=JSON.parse(options.body).query;return {ok:true,json:async()=>({data:{account:{organizations:[{id:'org1',name:'Fixture org'}]}}})}}})
 assert.deepEqual(await adapter.organizations(),[{id:'org1',name:'Fixture org'}]);assert.ok(!query.includes('ownerEmail'))
})
