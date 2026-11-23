import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{TEST_CRM_ID,planTestResearchImport,verifyTestResearchImport,importTestResearch}from'../server/sales-test-crm-import.mjs';
import{runDailyCandidateResearch}from'../server/sales-daily-research.mjs';
const Core=createRequire(import.meta.url)('../apps-script/sales-crm/Core.js');
const settings=[['key','value'],['LIVE_SENDING',false],['FOLLOW_UP_ENABLED',false],['LEGAL_REVIEW_COMPLETED',false]];
const candidate={companyName:'Verified Company',countryCode:'JP',segment:'manufacturing',officialWebsite:'https://company.co.jp',evidenceUrls:['https://www.wikidata.org/wiki/Q123'],approvedToEmail:false,researchStatus:'unverified',contact_email:'ignore@example.com'};
const result={status:'completed',approvedToEmail:false,candidates:[candidate]};
const input=()=>({spreadsheetId:TEST_CRM_ID,settings:structuredClone(settings),leads:[Core.TABLES.Leads.slice(0,19)],result:structuredClone(result)});
test('existing CRM engine maps research to one non-contactable TEST row and replay inserts zero',()=>{
 const d=input(),p=planTestResearchImport(d);assert.equal(p.summary.inserted,1);d.leads.push(...p.values);
 assert.equal(p.values[0][5],'');assert.equal(p.values[0][10],'');assert.equal(p.values[0][11],'RESEARCH');
 assert.equal(verifyTestResearchImport({...d,plan:p}).matchedAfter,1);assert.equal(planTestResearchImport(d).summary.inserted,0);
});
test('production targets, missing/duplicate/on safety gates and incomplete research fail before append',()=>{
 for(const mutate of [d=>d.spreadsheetId='production',d=>d.spreadsheetId='12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk',d=>d.settings.pop(),d=>d.settings.push(['LIVE_SENDING',false]),d=>d.settings[1][1]=true,d=>d.result.status='needs_attention',d=>d.result.candidates[0].approvedToEmail=true]){
  const d=input();mutate(d);assert.throws(()=>planTestResearchImport(d));
 }
});
test('duplicate or contactable readback never passes',()=>{
 const d=input(),p=planTestResearchImport(d);d.leads.push(...p.values);d.leads.push(...p.values);assert.throws(()=>verifyTestResearchImport({...d,plan:p}),/DUPLICATE/);
 d.leads.pop();d.leads[1][5]='address@example.com';assert.throws(()=>verifyTestResearchImport({...d,plan:p}),/UNAPPROVED/);
});
test('live adapter verifies before writing, reads back and never retries an uncertain append',async()=>{
 let rows=[Core.TABLES.Leads.slice(0,19)],calls=0;
 const sheets={read:async tab=>structuredClone(tab==='Settings'?settings:rows),append:async(tab,values)=>{assert.equal(tab,'Leads');calls++;rows.push(...values);}};
 const first=await importTestResearch({spreadsheetId:TEST_CRM_ID,result,sheets});assert.equal(first.inserted,1);
 assert.equal((await importTestResearch({spreadsheetId:TEST_CRM_ID,result,sheets})).inserted,0);assert.equal(calls,1);
 rows=[Core.TABLES.Leads.slice(0,19)];calls=0;sheets.append=async()=>{calls++;throw Error('timeout after possible acceptance');};
 await assert.rejects(()=>importTestResearch({spreadsheetId:TEST_CRM_ID,result,sheets}));assert.equal(calls,1);
});
test('gate or data change during preflight prevents writes',async()=>{
 let n=0,writes=0;
 const sheets={read:async tab=>tab==='Leads'?[Core.TABLES.Leads.slice(0,19)]:(++n===1?settings:[['LIVE_SENDING',true]]),append:async()=>{writes++;}};
 await assert.rejects(()=>importTestResearch({spreadsheetId:TEST_CRM_ID,result,sheets}),/CHANGED/);assert.equal(writes,0);
});
test('Wikidata adapter keeps review checks and country/site evidence, ignores contacts',async()=>{
 const source={url:'https://www.wikidata.org/wiki/Special:EntityData/Q123.json',format:'wikidata-entity',segment:'manufacturing',reviewedAt:'2026-11-17T00:00:00Z',reviewedBy:'terms review',freeSourceVerified:true,termsReviewed:true};
 const data={entities:{Q123:{id:'Q123',labels:{en:{value:'Verified Company'}},claims:{P17:[{mainsnak:{datavalue:{value:{id:'Q17'}}}}],P856:[{mainsnak:{datavalue:{value:'https://company.co.jp'}}}],P968:[{mainsnak:{datavalue:{value:'mailto:never@example.com'}}}]}}}};
 const fetchImpl=async()=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 const r=await runDailyCandidateResearch({sources:[source],now:new Date('2026-11-17T01:00:00Z'),fetchImpl});assert.equal(r.status,'completed');assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].approvedToEmail,false);assert.ok(!JSON.stringify(r).includes('never@example.com'));
 const invalid=await runDailyCandidateResearch({sources:[{...source,url:'https://other.com/Q123.json'}],now:new Date('2026-11-17T01:00:00Z'),fetchImpl});assert.equal(invalid.status,'needs_attention');
 data.entities.Q123.claims.P17=[];assert.equal((await runDailyCandidateResearch({sources:[source],now:new Date('2026-11-17T01:00:00Z'),fetchImpl})).candidates.length,0);
});
