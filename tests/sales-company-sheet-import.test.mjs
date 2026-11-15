import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Core=require('../apps-script/sales-crm/Core.js'),Engine=require('../apps-script/sales-crm/Engine.js');
const candidate=i=>({company:'Company '+i,country:'JP',source_url:'https://business'+i+'.com/about',domain:'business'+i+'.com',website:'https://business'+i+'.com',contact_email:'must-not-import@example.test',contact_basis:'EXPRESS_CONSENT'});
function world(columns=19){const rows=[],writes=[];const headers=Core.TABLES.Leads.slice(0,columns);const deps={now:()=>new Date('2026-11-09T00:00:00Z'),store:{rows:()=>rows.map(r=>({...r})),headers:()=>headers,append:(table,row)=>{writes.push({table,row});rows.push({...row});},flush(){}}};return{rows,writes,headers,deps};}
test('17 and 19 column mappings preserve their physical shape and read back twenty unique companies',()=>{
 for(const count of [17,19]){const w=world(count),batch=Array.from({length:20},(_,i)=>candidate(i));
 const first=Engine.importResearchCompanies(w.deps,batch);assert.equal(first.inserted,20);assert.equal(first.matchedAfter,20);
 const second=Engine.importResearchCompanies(w.deps,batch);assert.equal(second.inserted,0);assert.equal(second.skipped,20);assert.equal(w.rows.length,20);
 for(const row of w.rows){assert.equal(Object.keys(row).length,count);assert.equal(row.status,'RESEARCH');assert.equal(row.contact_email,'');assert.equal(row.contact_basis,'');}
 assert.deepEqual(w.headers,Core.TABLES.Leads.slice(0,count));}
});
test('duplicate batch rows and existing companies are skipped without overwriting existing values',()=>{
 const w=world(17);w.rows.push({...candidate(1),lead_id:'old',status:'CONTACTED',contact_email:'existing@example.test'});
 const result=Engine.importResearchCompanies(w.deps,[candidate(1),candidate(2),candidate(2)]);
 assert.equal(result.inserted,1);assert.equal(w.rows[0].lead_id,'old');assert.equal(w.rows[0].status,'CONTACTED');assert.equal(w.rows[0].contact_email,'existing@example.test');
});
test('unknown headers, oversized batches, unsafe cells and existing duplicates stop before writing',()=>{
 for(const modify of [w=>w.headers[1]='Unknown company field',w=>w.rows.push(candidate(1),candidate(1))]){
 const w=world();modify(w);assert.throws(()=>Engine.importResearchCompanies(w.deps,[candidate(1),candidate(2)]));assert.equal(w.writes.length,0);}
 for(const batch of [Array.from({length:21},(_,i)=>candidate(i)),[candidate(1),{...candidate(2),company:'=IMPORTXML("evil")'}]]){
 const w=world();assert.throws(()=>Engine.importResearchCompanies(w.deps,batch));assert.equal(w.writes.length,0);}
});
test('a failed Sheets read-back is reported and never claimed successful',()=>{
 const w=world();w.deps.store.append=()=>{};
 assert.throws(()=>Engine.importResearchCompanies(w.deps,[candidate(1)]),/READBACK/);
});
test('SG and AU research candidates append beside Japanese records and never grant outreach consent',()=>{
 const w=world(19);w.rows.push({...candidate(99),lead_id:'existing-jp',owner_notes:'Keep existing notes'});
 const before=JSON.stringify(w.rows[0]);const batch=Array.from({length:20},(_,i)=>({...candidate(i),country:i<12?'SG':'AU'}));
 assert.equal(Engine.importResearchCompanies(w.deps,batch).inserted,20);
 assert.equal(Engine.importResearchCompanies(w.deps,batch).inserted,0);
 assert.equal(w.rows.length,21);assert.equal(JSON.stringify(w.rows[0]),before);
 for(const r of w.rows.slice(1)){assert.equal(r.status,'RESEARCH');assert.equal(r.contact_email,'');assert.equal(r.contact_name,'');assert.equal(r.contact_basis,'');}
});
