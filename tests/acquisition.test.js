import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {collectGrowthKpis} from '../services/growth-kpis.js'
import {prepareAcquisition,campaignUrl,researchAssessment,writeAcquisitionReport} from '../services/acquisition-preparation.js'
const env={VITE_SUPABASE_URL:'https://fixture.supabase.co',NEXOPS_DEV_PROJECT_REF:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret-never-log'}
const window={from:'2026-10-23T00:00:00Z',to:'2026-10-30T00:00:00Z'}
function fixture({fail,cap=1000,totalOverride,changed=false}={}){
 const calls=[]
 return {calls,fetch:async(input,options)=>{
  const u=new URL(input),table=u.pathname.split('/').at(-1);calls.push({u,options})
  assert.equal(u.origin,'https://fixture.supabase.co');assert.ok(['HEAD','GET'].includes(options.method));assert.equal(options.redirect,'error')
  if(fail?.(table,options))throw Error(env.SUPABASE_SERVICE_ROLE_KEY)
  if(options.method==='HEAD')return new Response(null,{headers:{'content-range':'*/3'}})
  const rows=[{user_id:'a'},{user_id:'a'},{user_id:'b'}],range=options.headers.Range.split('-').map(Number),start=range[0],page=rows.slice(start,Math.min(range[1]+1,start+cap)),total=totalOverride??(changed&&start>0?4:3)
  return new Response(JSON.stringify(page),{headers:{'content-range':`${start}-${start+page.length-1}/${total}`}})
 }}
}
test('KPI reader uses only bounded GET/HEAD on configured dev project and counts unique users across capped pages',async()=>{
 const f=fixture({cap:1}),r=await collectGrowthKpis({env,...window,fetch:f.fetch})
 assert.equal(r.demo_starts.value,2);assert.equal(r.first_value.value,2);assert.equal(r.returning_users.value,2);assert.equal(r.new_signups.value,3);assert.equal(r.qualified_leads.value,3)
 for(const {u,options}of f.calls){if(u.searchParams.has('created_at')||u.searchParams.has('occurred_at')||u.searchParams.has('demo_opened_at')||u.searchParams.has('first_value_at')||u.searchParams.has('updated_at')){const times=[...u.searchParams].filter(([,v])=>v.startsWith('gte.')||v.startsWith('lt.'));assert.equal(times.length,2);assert.ok(times.some(([,v])=>v==='lt.2026-10-30T00:00:00.000Z'))}assert.equal(options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY)}
 assert.equal(r.website_visitors.value,null);assert.equal(r.traffic_source.value,null);assert.ok(!JSON.stringify(r).includes('fixture-secret'))
})
test('missing or wrong project configuration produces unavailable, never zero or a credential-bearing request',async()=>{
 for(const config of [{},{...env,NEXOPS_DEV_PROJECT_REF:'other'},{...env,VITE_SUPABASE_URL:'http://fixture.supabase.co'},{...env,VITE_SUPABASE_URL:'https://fixture.supabase.co/other'}]){
  const r=await collectGrowthKpis({env:config,...window,fetch:()=>assert.fail('network forbidden')});assert.equal(r.new_signups.status,'unavailable');assert.equal(r.new_signups.value,null)
 }
})
test('independent metric failures do not hide successful counts or print raw errors',async()=>{
 const f=fixture({fail:table=>table==='nexops_activation'}),r=await collectGrowthKpis({env,...window,fetch:f.fetch});assert.equal(r.demo_starts.value,null);assert.equal(r.consultation_requests.value,3);assert.ok(!JSON.stringify(r).includes(env.SUPABASE_SERVICE_ROLE_KEY))
})
test('overflow and changing pagination are unavailable rather than partial unique-user counts',async()=>{
 for(const options of [{totalOverride:20001},{cap:1,changed:true}]){const r=await collectGrowthKpis({env,...window,fetch:fixture(options).fetch});assert.equal(r.demo_starts.value,null)}
})
test('a confirmed empty count is zero while missing content-range stays unavailable',async()=>{
 const zero=await collectGrowthKpis({env,...window,fetch:async(_u,o)=>new Response(o.method==='GET'?'[]':null,{headers:{'content-range':'*/0'}})});assert.equal(zero.new_signups.value,0);assert.equal(zero.demo_starts.value,0)
 const unknown=await collectGrowthKpis({env,...window,fetch:async()=>new Response('[]')});assert.equal(unknown.new_signups.value,null);assert.equal(unknown.demo_starts.value,null)
 await assert.rejects(collectGrowthKpis({env,from:window.to,to:window.from}),/INVALID_REPORT_WINDOW/)
})
test('campaign links use fixed non-personal UTM vocabulary and verified HTTPS origin only',()=>{
 const url=new URL(campaignUrl('https://public.example.test',{channel:'linkedin',segment:'ecommerce'}));assert.equal(url.pathname,'/en');assert.equal(url.searchParams.get('utm_source'),'linkedin');assert.equal(url.searchParams.get('utm_content'),'ecommerce')
 for(const origin of ['http://public.example.test','https://user:secret@public.example.test','https://public.example.test/path','https://public.example.test/?email=x'])assert.throws(()=>campaignUrl(origin,{channel:'x',segment:'startups'}))
 assert.throws(()=>campaignUrl('https://public.example.test',{channel:'email@example.test',segment:'startups'}))
})
test('three segment/channel-specific days prepare twelve hash-bound drafts without publication authorization',()=>{
 const a=prepareAcquisition({origin:'https://public.example.test',startDate:'2026-10-30'}),b=prepareAcquisition({origin:'https://public.example.test',startDate:'2026-10-31'})
 assert.equal(a.drafts.length,12);assert.equal(new Set(a.drafts.map(d=>d.text)).size,12)
 for(const d of a.drafts){assert.equal(d.status,'HUMAN_APPROVAL_REQUIRED');assert.equal(d.publication_authorized,false);assert.match(d.content_hash,/^[a-f0-9]{64}$/);assert.ok(d.day_offset>=0&&d.day_offset<=2);assert.equal(d.timezone,'Asia/Singapore');if(d.channel==='x')assert.ok([...d.composed_text].length<=280);if(d.channel==='threads')assert.ok([...d.composed_text].length<=500)}
 assert.notEqual(a.drafts[0].content_hash,b.drafts[0].content_hash)
 assert.equal(prepareAcquisition({origin:'https://bad.test/path',startDate:'2026-10-30'}).drafts[0].landing_url,null)
})
test('403/404 and unsupported/unofficial evidence never establish SCM qualification or permission to contact',()=>{
 const base={company:'Fixture',segment:'ecommerce',official_site:'https://official.example.test',evidence:[{http_status:200,source_url:'https://official.example.test/careers',checked_at:'2026-10-30',scm_signal_verified:true,excerpt:'Inventory procurement team'}]}
 assert.equal(researchAssessment(base).scm_evidence,'verified_public_signal');assert.equal(researchAssessment(base).contact_authorized,false)
 for(const patch of [{http_status:403},{http_status:404},{scm_signal_verified:false},{source_url:'https://unrelated.example.test'},{checked_at:'invalid'},{excerpt:''}])assert.equal(researchAssessment({...base,evidence:[{...base.evidence[0],...patch}]}).scm_evidence,'not_verified')
})
test('offline artifacts retain missing metrics and never invoke a provider; overlapping runs are held',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acquisition-'))
 try{
  const pack=prepareAcquisition({startDate:'2026-10-30'}),kpis=await collectGrowthKpis({env:{},...window})
  const r=await writeAcquisitionReport({directory:dir,pack,kpis});assert.equal(r.external_writes,0)
  const text=await readFile(join(dir,'acquisition-latest.md'),'utf8');assert.match(text,/website_visitors: 未取得/);assert.doesNotMatch(text,/fixture-secret/)
  const {withAutomationLock}=await import('../services/outbound-automation.js');await withAutomationLock(dir,async()=>{assert.equal((await writeAcquisitionReport({directory:dir,pack,kpis})).status,'overlap_blocked')})
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('CLI defaults to offline, rejects publish/send flags and returns sanitized output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acquisition-cli-')),run=promisify(execFile)
 try{
  const {stdout}=await run(process.execPath,[resolve('scripts/acquisition-report.mjs'),'--output',dir,'--start-date','2026-10-30'],{env:{...process.env,VITE_PUBLIC_SITE_URL:'https://public.example.test'}})
  assert.equal(JSON.parse(stdout).external_writes,0)
  const data=JSON.parse(await readFile(join(dir,'acquisition-latest.json'),'utf8'));assert.equal(data.kpis.new_signups.value,null)
  await assert.rejects(run(process.execPath,[resolve('scripts/acquisition-report.mjs'),'--publish']),error=>{assert.ok(!error.stderr.includes(env.SUPABASE_SERVICE_ROLE_KEY));assert.match(error.stderr,/blocked/);return true})
 }finally{await rm(dir,{recursive:true,force:true})}
})
