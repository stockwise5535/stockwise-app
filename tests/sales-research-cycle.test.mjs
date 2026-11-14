import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {discover,dueForRecheck,applyRecheck,importBatch,toImportCsv,validateEntry,verifyImportPlan,leadsHeaders,keyOf,LIMITS,researchUrl} from '../server/sales-research-cycle.mjs';
import {runCycle,acquireLock,emergencyStop,recheckOne,MAX_PAGE_BYTES,publicAddress,fetchResearchPage} from '../scripts/sales-research-cycle.mjs';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url),Engine=require('../apps-script/sales-crm/Engine.js');
const ledgerPath=new URL('../content/research/ledger.json',import.meta.url);
const doc=JSON.parse(fs.readFileSync(ledgerPath,'utf8')),ledger=doc.companies;
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rc-'));
const NOW=new Date('2026-11-14T03:00:00Z');
const entry=(n,o={})=>({company:'Company '+n,country:'JP',segment:'manufacturing',industry:'x',website:'https://c'+n+'.example',domain:'c'+n+'.example',source_url:'https://c'+n+'.example/about',verification_tier:'A',verification_note:'n',...o});
const page=(body,status=200)=>new Response(body,{status,headers:{'content-type':'text/html'}});

test('ledger: 20 distinct companies, valid, facts only (no emails, no outreach permission), tiers explicit',()=>{
 assert.equal(ledger.length,20);assert.equal(new Set(ledger.map(keyOf)).size,20);
 for(const e of ledger)assert.deepEqual(validateEntry(e),[],e.company);
 assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(JSON.stringify(ledger).replace(/https?:\/\/[^"\s]*/g,'')));
 assert.ok(ledger.every(e=>!('contact_email' in e)&&!('contact_basis' in e)&&!('approvedToEmail' in e)));
 assert.deepEqual([...new Set(ledger.map(e=>e.country))].sort(),['AU','JP','SG']);
 assert.ok(ledger.some(e=>e.segment==='manufacturing')&&ledger.some(e=>e.segment==='import_wholesale'));
});
test('only official-page tier A companies are importable; public listings and directories remain held',()=>{
 const batch=importBatch(ledger);
 assert.ok(batch.length>0&&batch.every(e=>e.verification_tier==='A'&&e.status==='verified'));
 assert.equal(batch.length,ledger.filter(e=>e.verification_tier==='A'&&e.status==='verified').length);
 assert.ok(ledger.filter(e=>e.verification_tier!=='A').every(e=>e.status==='needs_official_confirmation'));
 assert.equal(importBatch(ledger,{importedKeys:batch.map(keyOf)}).length,0);
});
test('validation rejects unsafe cells, non-https evidence, unknown countries, emails and missing tiers',()=>{
 assert.ok(validateEntry(entry(1,{company:'=IMPORTXML("x")'})).includes('COMPANY'));
 assert.ok(validateEntry(entry(1,{source_url:'http://a.example'})).includes('EVIDENCE_URL_HTTPS'));
 assert.ok(validateEntry(entry(1,{country:'US'})).includes('COUNTRY'));
 assert.ok(validateEntry(entry(1,{verification_tier:undefined})).includes('TIER'));
 assert.ok(validateEntry(entry(1,{industry:'+cmd'})).includes('UNSAFE_CELL'));
 assert.ok(validateEntry(entry(1,{verification_note:'contact: sales@acme.example'})).includes('EMAIL_NOT_ALLOWED_IN_LEDGER'));
});
test('TEST (19 columns) and production (17 columns): CRM planner accepts the real batches, preserves existing rows, and a rerun adds nothing',()=>{
 const batch=importBatch(ledger);
 for(const cols of [19,17]){
  const headers=leadsHeaders(cols),rows=[],writes=[];
  const preexisting={lead_id:'old',company:'Legacy Customer',country:'JP',status:'CONTACTED',contact_email:'existing@example.test',owner_notes:'keep me'};rows.push(preexisting);
  const deps={now:()=>NOW,store:{rows:()=>rows.map(r=>({...r})),headers:()=>headers,append:(t,o)=>{writes.push(o);rows.push({...o});}}};
  const plan=verifyImportPlan(batch,headers,rows);assert.equal(plan.willInsert,batch.length);assert.equal(plan.columns,cols);
  const first=Engine.importResearchCompanies(deps,batch);
  assert.equal(first.inserted,batch.length);assert.equal(first.matchedAfter,batch.length);assert.equal(first.approvedToEmail,false);
  const second=Engine.importResearchCompanies(deps,batch);assert.equal(second.inserted,0);assert.equal(second.skipped,batch.length);
  assert.equal(rows.length,batch.length+1);assert.deepEqual(rows[0],preexisting);
  for(const w of writes){assert.equal(Object.keys(w).length,cols);assert.equal(w.status,'RESEARCH');assert.equal(w.contact_email,'');assert.equal(w.contact_basis,'');}
 }
});
test('a company already in the CRM (any status) is skipped, never overwritten',()=>{
 const headers=leadsHeaders(17),rows=[{lead_id:'x',company:ledger[0].company,country:ledger[0].country,status:'CONTACTED'}];
 const p=verifyImportPlan([ledger[0],ledger[1]],headers,rows);assert.equal(p.willInsert,1);assert.equal(p.willSkip,1);
 assert.throws(()=>verifyImportPlan([ledger[0]],leadsHeaders(18),[]),/UNSUPPORTED_COMPANY_HEADER_MAPPING/);
});
test('CSV is in the exact shape of the TEST importer and escapes commas/quotes',()=>{
 const csv=toImportCsv([entry(1,{company:'A, "B" Ltd',status:'verified'})]);
 assert.equal(csv.split('\n')[0],'company,country,source_url,domain,website,segment,industry');assert.match(csv,/"A, ""B"" Ltd"/);
});
test('new discovery is separate from recheck: duplicates, invalid rows and the per-run cap are enforced',()=>{
 const inbox=[entry(1),{...ledger[0]},entry(2,{verification_note:'a@b.example'}),entry(3,{country:'US'})];
 const r=discover(ledger,inbox,{now:NOW});
 assert.deepEqual(r.added.map(e=>e.company),['Company 1']);assert.deepEqual(r.duplicates,[ledger[0].company]);assert.equal(r.rejected.length,2);
 const many=Array.from({length:30},(_,i)=>entry(100+i));
 const c=discover([],many,{now:NOW});assert.equal(c.added.length,LIMITS.maxNewPerRun);assert.ok(c.rejected.every(x=>x.reasons.includes('RUN_CAP_REACHED')));
 assert.equal(discover(ledger,inbox.slice(0,1),{now:NOW}).added[0].consecutive_recheck_failures,0);
});
test('recheck: due list is capped and oldest first; network errors never downgrade; repeated definitive failures flag',()=>{
 const l=Array.from({length:15},(_,i)=>({...entry(i),last_recheck_at:i<5?'2026-11-13T00:00:00Z':null,status:'verified'}));
 const due=dueForRecheck(l,{now:NOW});assert.equal(due.length,LIMITS.maxRecheckPerRun);assert.ok(due.every(e=>!e.last_recheck_at));
 let e={...entry(1),status:'verified',consecutive_recheck_failures:0};
 for(let i=0;i<5;i++)e=applyRecheck(e,{ok:false,kind:'NETWORK'},NOW);assert.equal(e.status,'verified');assert.equal(e.consecutive_recheck_failures,0);
 for(let i=0;i<LIMITS.failuresBeforeFlag-1;i++)e=applyRecheck(e,{ok:false,kind:'HTTP'},NOW);assert.equal(e.status,'verified');
 e=applyRecheck(e,{ok:false,kind:'HTTP'},NOW);assert.equal(e.status,'needs_official_confirmation');
 assert.equal(applyRecheck(e,{ok:true,kind:'OK'},NOW).consecutive_recheck_failures,0);
});
test('recheck uses one GET with a bounded response, extracts no emails, and judges by company name',async()=>{
 const calls=[];const f=async(u,i)=>{calls.push([u,i.method]);assert.equal(i.redirect,'error');assert.equal(i.credentials,'omit');return page('<h1>Acme Trading</h1> contact@acme.example');};
 assert.deepEqual(await recheckOne({company:'Acme Trading Pte Ltd',website:'https://acme.example'},f),{ok:true,kind:'OK'});
 assert.deepEqual(calls,[['https://acme.example','GET']]);
 assert.equal((await recheckOne({company:'Zeta Pte Ltd',website:'https://acme.example'},f)).kind,'NAME_MISSING');
 assert.equal((await recheckOne({company:'Acme Other Pte Ltd',website:'https://acme.example'},f)).kind,'NAME_MISSING');
 assert.equal((await recheckOne({company:'Acme',website:'https://a.example'},async()=>{throw new Error('x')})).kind,'NETWORK');
 assert.equal((await recheckOne({company:'Acme',website:'https://a.example'},async()=>page('',404))).kind,'HTTP');
});
function setup(){const d=tmp(),l=path.join(d,'ledger.json');const fixture=structuredClone(doc);fixture.companies.forEach(e=>{e.website=e.website.replace(/^http:/,'https:');});fs.writeFileSync(l,JSON.stringify(fixture));return {d,l,out:path.join(d,'out'),inbox:path.join(d,'inbox.json'),lockDir:d};}
test('full cycle: ingest, recheck, history, import CSVs; rerun is idempotent; emergency stop and lock work',async()=>{
 const s=setup();fs.writeFileSync(s.inbox,JSON.stringify({companies:[entry(1),entry(2),{...doc.companies[0]}]}));
 const fetchImpl=async()=>page('company 1 company 2 '+doc.companies.map(c=>c.company).join(' '));
 const run=()=>runCycle({ledgerPath:s.l,inboxPath:s.inbox,outDir:s.out,now:NOW,fetchImpl,lockDir:s.lockDir,date:'2026-11-14'});
 const a=await run();assert.equal(a.status,'completed');assert.equal(a.discovery.added.length,2);assert.equal(a.discovery.duplicates.length,1);
 assert.equal(JSON.parse(fs.readFileSync(s.l,'utf8')).companies.length,22);assert.ok(a.recheck.attempted<=LIMITS.maxRecheckPerRun);
 assert.match(a.report,/## 新規企業の発見/);assert.match(a.report,/## 既存候補の再確認\(新規発見とは別\)/);assert.match(a.report,/費用: \$0/);
 const b=await runCycle({ledgerPath:s.l,inboxPath:s.inbox,outDir:s.out,now:new Date(NOW.getTime()+864e5),fetchImpl,lockDir:s.lockDir,date:'2026-11-15'});
 assert.equal(b.discovery.added.length,0);assert.equal(JSON.parse(fs.readFileSync(s.l,'utf8')).companies.length,22);
 const hist=fs.readFileSync(path.join(s.out,'runs.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(hist.length,2);assert.ok(hist.every(h=>h.costUsd===0&&h.status==='completed'));
 const prodCsv=fs.readFileSync(path.join(s.out,'import-review-2026-11-15.csv'),'utf8');assert.ok(!/needs_official|third-party/.test(prodCsv));
 for(const t of ledger.filter(e=>e.verification_tier!=='A'))assert.ok(!prodCsv.includes(t.company),'tiers B/C must not reach the review batch');
 assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(a.report+prodCsv));
 // emergency stop
 const stopped=await runCycle({ledgerPath:s.l,outDir:s.out,now:NOW,fetchImpl:()=>{throw new Error('must not run')},lockDir:s.lockDir,env:{NEXOPS_RESEARCH_EMERGENCY_STOP:'true'}});
 assert.equal(stopped.status,'stopped');assert.equal(emergencyStop({}),null);fs.writeFileSync(path.join(s.out,'EMERGENCY_STOP'),'');
 assert.equal((await runCycle({ledgerPath:s.l,outDir:s.out,now:NOW,fetchImpl:()=>{throw new Error('must not run')},lockDir:s.lockDir,env:{}})).status,'stopped');
 fs.rmSync(path.join(s.out,'EMERGENCY_STOP'));
 // duplicate run prevention
 const rel=acquireLock('cycle',{dir:s.lockDir});assert.equal(typeof rel,'function');
 assert.equal((await runCycle({ledgerPath:s.l,outDir:s.out,now:NOW,fetchImpl,lockDir:s.lockDir})).status,'skipped_already_running');rel();
});
test('all-network-failure recheck is reported as a warning and leaves the ledger statuses untouched',async()=>{
 const s=setup();const before=JSON.stringify(doc.companies.map(c=>c.status));
 const r=await runCycle({ledgerPath:s.l,outDir:s.out,now:NOW,fetchImpl:async()=>{throw new Error('proxy');},lockDir:s.lockDir,date:'2026-11-14'});
 assert.equal(r.status,'completed_with_warnings');assert.match(r.report,/全件ネットワーク不通/);
 assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(s.l,'utf8')).companies.map(c=>c.status)),before);
});
test('safety: no Google/Gmail/Buffer/AI/paid-API code, no CRM writes, no repo-write permissions in the scheduler',()=>{
 const src=fs.readFileSync(new URL('../server/sales-research-cycle.mjs',import.meta.url),'utf8')+fs.readFileSync(new URL('../scripts/sales-research-cycle.mjs',import.meta.url),'utf8');
 assert.ok(!/openai|anthropic|api\.buffer|GmailApp|SpreadsheetApp|googleapis|sheets\.google|UrlFetchApp|createDraft|SUPABASE/i.test(src.replace(/\/\/.*$/gm,'')));
 const wf=fs.readFileSync(new URL('../.github/workflows/sales-research-cycle.yml',import.meta.url),'utf8');
 assert.match(wf,/STOCKWISE_RESEARCH_CYCLE_ENABLED == 'true'/);assert.match(wf,/permissions:\s*\n\s*contents: read/);assert.match(wf,/concurrency:/);assert.ok(!/schedule:|cron:/.test(wf),'no timer until the repository guard is extended by its owner');assert.ok(!/secrets\./.test(wf));assert.ok(!/upload-artifact/.test(wf));
});

test('verification gates cannot be bypassed by caller tiers, malformed records, CSV export or oversized caps',()=>{
 const c=entry(1,{verification_tier:'C',status:'verified'}),b=entry(2,{verification_tier:'B',status:'verified'});
 assert.equal(importBatch([c,b],{tiers:['A','B','C']}).length,0);
 for(const e of [c,b,entry(3,{status:'verified',contact_email:''}),entry(4,{status:'verified',approvedToEmail:true}),entry(5,{industry:'bad@company.example'})]){
  assert.equal(importBatch([e]).length,0);assert.throws(()=>toImportCsv([e]),/IMPORT_REVIEW_REQUIRED/);
 }
 assert.ok(validateEntry(entry(6,{source_url:'https://company.example/?contact=person@company.example'})).includes('EMAIL_NOT_ALLOWED_IN_LEDGER'));
 const many=Array.from({length:30},(_,i)=>entry(i,{status:'verified'}));
 assert.equal(discover([],many,{max:999}).added.length,20);
 assert.equal(dueForRecheck(many,{max:999}).length,10);
 assert.equal(importBatch(many,{max:999}).length,20);
 assert.throws(()=>toImportCsv(many),/IMPORT_REVIEW_REQUIRED/);
 assert.equal(discover([],[b]).added[0].status,'needs_official_confirmation');
});

test('recheck refuses unsafe URLs before transport and pins DNS to public addresses',async()=>{
 for(const url of ['http://public.example','https://127.0.0.1','https://[::1]','https://169.254.169.254/latest','https://user:pass@public.example','https://x.internal','https://public.example/?token=secret']){
  let calls=0;assert.equal(researchUrl(url),false);
  assert.equal((await recheckOne({company:'Acme',website:url},async()=>{calls++;})).kind,'INVALID_URL');assert.equal(calls,0);
 }
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','100.64.0.1','169.254.169.254','198.18.0.1','::1','::ffff:127.0.0.1','fd00::1','fe80::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
 let requested=0;
 await assert.rejects(fetchResearchPage('https://public.example',{lookupImpl:async()=>[{address:'10.0.0.1',family:4}],requestImpl:()=>{requested++;}}),/NON_PUBLIC/);
 assert.equal(requested,0);
 const res=await fetchResearchPage('https://public.example',{lookupImpl:async()=>[{address:'1.1.1.1',family:4}],requestImpl:(url,options,cb)=>{
  requested++;assert.equal(url.hostname,'public.example');assert.equal(options.headers.Authorization,undefined);
  options.lookup(url.hostname,{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'1.1.1.1');assert.equal(family,4);});
  const req=new EventEmitter();queueMicrotask(()=>{const incoming=new PassThrough();incoming.statusCode=302;incoming.headers={'location':'https://127.0.0.1/','content-type':'text/html'};cb(incoming);incoming.end('redirect');});return req;
 }});
 assert.equal(res.status,302);assert.equal(requested,1); // redirect is returned, never followed
});

test('response limits cancel oversized streams and temporary HTTP failures never downgrade a company',async()=>{
 let cancelled=false;
 const oversized=()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_PAGE_BYTES+1));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/html'}});
 assert.equal((await recheckOne(entry(1),async()=>oversized())).kind,'TOO_LARGE');assert.equal(cancelled,true);
 let e=entry(1,{status:'verified',consecutive_recheck_failures:0});
 for(const status of [301,401,403,429,500,503]){
  const result=await recheckOne(e,async()=>page('',status));assert.equal(result.kind,'UNAVAILABLE');e=applyRecheck(e,result,NOW);
 }
 assert.equal(e.status,'verified');assert.equal(e.consecutive_recheck_failures,0);
});

test('lock ownership survives an old active owner and cannot delete a successor lock',()=>{
 const dir=tmp(),file=path.join(dir,'stockwise-research-cycle.lock');const release=acquireLock('cycle',{dir});
 assert.equal(acquireLock('cycle',{dir,now:Date.now()+3*3600e3}),null);
 fs.writeFileSync(file,JSON.stringify({pid:process.pid,token:'successor'}));release();assert.equal(fs.existsSync(file),true);
});

test('invalid on-disk ledger or missing requested inbox fails before network and preserves the ledger',async()=>{
 const s=setup();const bad=structuredClone(doc);bad.companies[0].approvedToEmail=true;fs.writeFileSync(s.l,JSON.stringify(bad));const before=fs.readFileSync(s.l,'utf8');let calls=0;
 await assert.rejects(runCycle({ledgerPath:s.l,outDir:s.out,lockDir:s.lockDir,fetchImpl:async()=>{calls++;}}),/INVALID_RESEARCH_LEDGER/);
 assert.equal(calls,0);assert.equal(fs.readFileSync(s.l,'utf8'),before);
 const s2=setup();await assert.rejects(runCycle({ledgerPath:s2.l,inboxPath:s2.inbox,outDir:s2.out,lockDir:s2.lockDir}),/RESEARCH_INBOX_MISSING/);
});

test('malformed private input is recorded with a fixed error code without input excerpts',async()=>{
 const s=setup();fs.writeFileSync(s.inbox,'{"companies": [private-contact@example.test');
 await assert.rejects(runCycle({ledgerPath:s.l,inboxPath:s.inbox,outDir:s.out,lockDir:s.lockDir,doRecheck:false}),SyntaxError);
 const history=fs.readFileSync(path.join(s.out,'runs.jsonl'),'utf8');assert.ok(!history.includes('private-contact'));
 assert.equal(JSON.parse(history.trim()).code,'RESEARCH_JSON_INVALID');
});
