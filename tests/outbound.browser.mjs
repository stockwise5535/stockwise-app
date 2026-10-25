// UI-only component smoke with fixture methods. No Auth or email provider requests.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{chromium}=require(process.env.NEXOPS_PLAYWRIGHT_PATH || 'playwright-core')
const browser=await chromium.launch({executablePath:process.env.NEXOPS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']})
const base=process.env.NEXOPS_TEST_URL || 'http://127.0.0.1:5173'
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url())})
 await page.goto(base+'/en')
 await page.getByRole('heading',{level:1}).waitFor()
 await page.evaluate(async()=>{
 document.getElementById('root').hidden=true
 const target=document.createElement('main');target.className='growth';target.id='fixture-root';document.body.append(target)
 const React=(await import('/node_modules/.vite/deps/react.js')).default
 const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
 const Review=(await import('/src/growth/OutboundReview.jsx')).default
 const message={id:'fixture-1',workspace_id:'fixture-workspace',recipient_email:'fixture@example.test',category:'welcome',template_id:'welcome',template_version:1,content_hash:'fixture-hash',subject:'Local queued message',body:'Local fixture body only.',status:'pending_review',gate_outcome:'HUMAN_REVIEW_REQUIRED',risk_flags:['freeform_or_edited_content'],review_reasons:['Review required'],source_event:'local-ui-test',related_action_id:'fixture-action',created_at:'2026-10-24T00:00:00Z',proposed_send_at:'2026-10-25T00:00:00Z'};
 const events=[];window.reviewCalls=[];
 const api={outbound:async()=>[{...message}],outboundHistory:async()=>[...events],emailTemplates:async()=>[],reviewOutbound:async(id,action,subject,body,reason)=>{window.reviewCalls.push({action,subject,body,reason});message.status=({'Reject':'rejected','Cancel':'cancelled','Save as Draft':'draft'})[action] || 'queued';if(action==='Edit and Send'||action==='Save as Draft'){message.subject=subject;message.body=body;message.content_hash='edited-'+window.reviewCalls.length}events.push({id:'event-'+events.length,message_id:id,kind:action,created_at:'2026-10-24',actor_id:'fixture-reviewer',details:{reason}})}};
 const root=createRoot(document.getElementById('fixture-root'));window.reviewFixture={root,React,Review,api};root.render(React.createElement(Review,{api,workspaceId:'fixture-workspace',canReview:true}));
 })
 await page.getByRole('heading',{name:'Outbound Communication Review Queue'}).waitFor()
 const row=page.locator('#outbound-fixture-1')
 assert.ok((await row.textContent()).includes('fixture@example.test'))
 assert.ok((await row.textContent()).includes('fixture-action'))
 assert.ok(await row.getByRole('button',{name:'Approve and Send',exact:true}).isDisabled())
 for(const action of ['Approve and Send','Reject','Cancel','Save as Draft','Edit and Send']){
  await row.getByLabel('Review reason').fill('Reviewed '+action)
  if(action==='Save as Draft' || action==='Edit and Send'){
   await row.getByLabel('Generated body').fill('Updated fixture body '+action)
   assert.ok(await row.getByRole('button',{name:'Approve and Send',exact:true}).isDisabled())
  }
  await row.getByRole('button',{name:action,exact:true}).click()
  await page.waitForFunction(count=>window.reviewCalls.length===count && document.querySelector('#outbound-fixture-1 summary')?.textContent.includes('('+count+')'),(['Approve and Send','Reject','Cancel','Save as Draft','Edit and Send'].indexOf(action)+1))
 }
 assert.equal((await page.evaluate(()=>window.reviewCalls)).length,5)
 await row.getByText(/Review and delivery history/).click();assert.equal(await row.locator('details li').count(),5)
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/nexops-outbound-review.png',fullPage:true})
 await page.evaluate(()=>{const {root,React,Review,api}=window.reviewFixture;root.render(React.createElement(Review,{api,workspaceId:'fixture-workspace',canReview:false,isGrowthAdmin:true}))})
 await page.getByText('Message decisions require an assigned reviewer for this workspace.',{exact:true}).waitFor()
 assert.equal(await row.getByRole('button',{name:'Approve and Send',exact:true}).count(),0)
 assert.ok(await row.getByLabel('Generated body').isDisabled());assert.ok(await row.getByLabel('Review reason').isDisabled())
 assert.equal((await page.evaluate(()=>window.reviewCalls)).length,5)
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('Outbound review UI passed: required review reason, five actions, edited-content handling, history, source/recipient fields and mobile; no external requests or emails.')
}finally{await browser.close()}
