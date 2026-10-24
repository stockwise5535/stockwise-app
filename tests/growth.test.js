import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingUrl, cleanProperties, conversion, csvExport, qualifiedExport, validateConsultation } from '../src/growth/service.js'
import { capture } from '../src/growth/analytics.js'
import { crmPayloads, gmailDraftPayload, lifecycleDraft } from '../services/growth-integrations.js'
import { content, siteBase } from '../src/growth/landingContent.js'

test('analytics excludes PII and sends nothing without explicit consent', async()=>{
 let called=false
 const transport=async()=>{called=true;return {ok:true}}
 assert.equal(await capture('homepage_view',{email:'private@example.test'},{consent:false,key:'test-public-key',fetch:transport}),false)
 assert.equal(called,false)
 assert.deepEqual(cleanProperties({locale:'en',email:'private',token:'private',screen:'today',data_mode:'synthetic',file:'private.csv'}),{locale:'en',screen:'today',data_mode:'synthetic'})
})
test('PostHog capture uses public key and safe properties only, and failures are nonblocking',async()=>{
 let body
 const ok=await capture('today_viewed',{locale:'en',email:'private@example.test'},{consent:true,key:'test-public-key',host:'https://analytics.example.test',distinctId:'test-id',fetch:async(url,init)=>{assert.equal(url,'https://analytics.example.test/capture/');assert.equal(init.credentials,'omit');body=JSON.parse(init.body);return {ok:true}}})
 assert.equal(ok,true);assert.equal(body.properties.email,undefined);assert.equal(body.event,'today_viewed')
 assert.equal(await capture('unapproved_event',{},{consent:true,key:'test'}),false)
 assert.equal(await capture('today_viewed',{},{consent:true,key:'test',host:'http://unsafe.example',distinctId:'test'}),false)
})
test('consultation validates required fields and optional counts without requiring profiling',()=>{
 const valid={company:'Test',contact_name:'Contact',email:'contact@example.test',main_problem:'PO delay',market:'SG',sku_count:'',supplier_count:''}
 assert.equal(validateConsultation(valid),valid)
 for(const bad of [{...valid,email:'bad'},{...valid,company:''},{...valid,sku_count:-1},{...valid,supplier_count:1.5}])assert.throws(()=>validateConsultation(bad))
})
test('only qualified leads reach CRM export and spreadsheet formulas are escaped',()=>{
 const leads=[{id:'a',company:'=1+1',email:'a@example.test',contact_name:'A',market:'SG'},{id:'b',company:'Other',email:'b@example.test'}]
 const q=[{lead_id:'a',status:'Qualified Lead'},{lead_id:'b',status:'Product User'}]
 assert.equal(qualifiedExport(leads,q).length,1);assert.equal(crmPayloads(leads,q).length,1)
 assert.ok(csvExport(qualifiedExport(leads,q)).includes("'=1+1"));assert.equal(csvExport([]),'')
})
test('unavailable denominators remain unavailable and booking/site URLs must be configured',()=>{
 assert.equal(conversion(10,0),null);assert.equal(conversion(10,null),null);assert.equal(conversion(2,10),20)
 assert.equal(bookingUrl('https://evil.example/booking'),null);assert.equal(bookingUrl(''),null)
 assert.equal(bookingUrl('https://calendar.google.com/calendar/appointments/schedules/test'),'https://calendar.google.com/calendar/appointments/schedules/test')
 assert.equal(siteBase('http://unsafe.example'),null);assert.equal(siteBase('https://public.example.test/'),'https://public.example.test')
 assert.ok(content.en.title && content.ja.title)
})
test('lifecycle drafts require verified registered contacts and opt-in for reminders',()=>{
 const user={email:'user@example.test',registered:true,emailVerified:true,marketingOptIn:false}
 assert.ok(lifecycleDraft('welcome',user,'https://public.example.test').text.includes('/growth'))
 assert.throws(()=>lifecycleDraft('activation_reminder',user,'https://public.example.test'),/consent/)
 assert.throws(()=>lifecycleDraft('welcome',{...user,emailVerified:false},'https://public.example.test'),/Eligible/)
 assert.throws(()=>lifecycleDraft('welcome',{...user,deletionRequested:true},'https://public.example.test'),/Eligible/)
 const draft=lifecycleDraft('activation_reminder',{...user,marketingOptIn:true},'https://public.example.test')
 assert.ok(gmailDraftPayload(draft).message.raw)
 assert.throws(()=>gmailDraftPayload({...draft,subject:'Hello\r\nBcc: bad@example.test'}),/header/)
})

test('consenting anonymous analytics identity links to the authenticated UUID without contact data',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),store=new Map([['nexops_analytics_id','anonymous-test-id']]),calls=[]
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>store.get(k) ?? null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}})
 try{
  await capture('demo_workspace_opened',{email:'must-not-send'},{consent:true,key:'public-test',host:'https://analytics.example.test',distinctId:'test-user-uuid',fetch:async(_,init)=>{calls.push(JSON.parse(init.body));return {ok:true}}})
  assert.equal(calls[0].event,'$identify');assert.equal(calls[0].properties.$anon_distinct_id,'anonymous-test-id')
  assert.equal(calls[1].properties.distinct_id,'test-user-uuid');assert.ok(calls.every(c=>!JSON.stringify(c).includes('must-not-send')))
 }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage}
})
