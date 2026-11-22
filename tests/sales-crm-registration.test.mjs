import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{planRegistration,verifyRegistration,registerResearch,LEGACY_HEADERS}from'../server/sales-crm-registration.mjs';import{TEST_CRM_ID}from'../server/sales-test-crm-import.mjs';
import{registrationClient}from'../server/sales-crm-registration-client.mjs';
const Core=createRequire(import.meta.url)('../apps-script/sales-crm/Core.js');
const now=new Date('2026-11-17T16:00:00Z');
const result={status:'completed',approvedToEmail:false,candidates:[{companyName:'Real Company',countryCode:'JP',segment:'manufacturing',officialWebsite:'https://company.jp',evidenceUrls:['https://company.jp/about'],researchStatus:'unverified',approvedToEmail:false}]};
function world(legacy=false){
 const state={metadata:{spreadsheetId:TEST_CRM_ID,sheets:[{properties:{title:'Leads',sheetId:7,gridProperties:{columnCount:26,rowCount:2001}}}],developerMetadata:[]},leads:[legacy?LEGACY_HEADERS:Core.TABLES.Leads.slice(0,19)],settings:[legacy?['Setting','Value']:['key','value'],['LIVE_SENDING',false],['FOLLOW_UP_ENABLED',false],['LEGAL_REVIEW_COMPLETED',false],['RESEARCH_IMPORT_ENABLED',true]]};
 let writes=0;
 const batch=async requests=>{
  writes++;const clone=structuredClone(state);
  for(const r of requests){
   if(r.createDeveloperMetadata){const m=r.createDeveloperMetadata.developerMetadata;if(clone.metadata.developerMetadata.some(v=>v.metadataId===m.metadataId))throw Error('DUPLICATE_METADATA_ID');clone.metadata.developerMetadata.push(m);}
   else if(r.updateDeveloperMetadata){const u=r.updateDeveloperMetadata;const m=clone.metadata.developerMetadata.find(v=>v.metadataId===u.dataFilters[0].developerMetadataLookup.metadataId);assert.ok(m);m.metadataValue=u.developerMetadata.metadataValue;}
   else if(r.appendCells){clone.leads.push(...r.appendCells.rows.map(row=>row.values.map(v=>v.userEnteredValue.stringValue??v.userEnteredValue.boolValue)));}
   else throw Error('FORBIDDEN_REQUEST');
  }
  Object.assign(state,clone);
 };
 const client={read:async()=>structuredClone(state),batch};return{state,client,batch,get writes(){return writes;},target:'isolation'};
}
test('both actual schemas append only unapproved rows and replay leaves every existing cell unchanged',async()=>{
 for(const legacy of[false,true]){const w=world(legacy),first=await registerResearch({target:w.target,result,client:w.client,now});assert.equal(first.inserted,1);
  const before=structuredClone(w.state);const second=await registerResearch({target:w.target,result,client:w.client,now});assert.equal(second.inserted,0);assert.equal(w.writes,2);assert.deepEqual(w.state,before);
  if(legacy){assert.equal(w.state.leads[1][6],'');assert.equal(w.state.leads[1][11],false);}else assert.equal(w.state.leads[1][5],'');
 }
});
test('competing plans cannot both reserve the same company or UTC day slot',async()=>{
 const w=world();const a=planRegistration(w.state,result,{target:w.target,now}),b=planRegistration(w.state,result,{target:w.target,now});
 await w.batch(a.reserve);await assert.rejects(()=>w.batch(b.reserve),/DUPLICATE/);assert.equal(w.state.leads.length,1);
 await w.batch(a.commit);assert.equal(verifyRegistration(a,w.state).inserted,1);
});
test('renamed companies and different countries sharing an existing domain never register twice',async()=>{
 const w=world();await registerResearch({target:w.target,result,client:w.client,now});
 const renamed=structuredClone(result);renamed.candidates[0].companyName='Renamed Company';renamed.candidates[0].countryCode='SG';
 const before=structuredClone(w.state);const replay=await registerResearch({target:w.target,result:renamed,client:w.client,now:new Date('2026-11-19T00:00:00Z')});assert.equal(replay.inserted,0);assert.equal(replay.skipped,1);assert.deepEqual(w.state,before);
});
test('daily cap persists across runs and permits the next UTC day without modifying previous rows',async()=>{
 const w=world();await registerResearch({target:w.target,result,client:w.client,now});
 const other=structuredClone(result);other.candidates[0].companyName='Other Company';other.candidates[0].officialWebsite='https://other-company.jp';
 const today=await registerResearch({target:w.target,result:other,client:w.client,now});assert.equal(today.inserted,0);assert.equal(today.deferred,1);
 const next=await registerResearch({target:w.target,result:other,client:w.client,now:new Date('2026-11-18T00:01:00Z')});assert.equal(next.inserted,1);assert.equal(w.state.leads.length,3);
});
test('uncertain append is attempted once; durable claim blocks all later automatic retries',async()=>{
 const w=world();let calls=0;w.client.batch=async r=>{if(++calls===1)return w.batch(r);throw Error('UNKNOWN');};
 await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}));assert.equal(calls,2);
 w.client.batch=w.batch;await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}),/PENDING_NO_RETRY/);assert.equal(w.state.leads.length,1);
});
test('acknowledgement lost after committed append never causes another append; deleted committed row stops',async()=>{
 const w=world();let calls=0;w.client.batch=async r=>{await w.batch(r);if(++calls===2)throw Error('UNKNOWN');};
 await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}));w.client.batch=w.batch;
 assert.equal((await registerResearch({target:w.target,result,client:w.client,now})).inserted,0);assert.equal(w.state.leads.length,2);
 w.state.leads.pop();await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}),/ROW_MISSING_NO_RETRY/);
});
test('emergency stop and changed sheet before or after claim prevent row writes',async()=>{
 for(const stopAt of[1,2,3]){const w=world();let reads=0;const read=w.client.read;w.client.read=async()=>{if(++reads===stopAt)w.state.settings[4][1]=false;return read();};
  await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}));assert.equal(w.state.leads.length,1);
 }
});
test('unknown targets, missing gates, renamed headers and foreign duplicate IDs fail closed',()=>{
 for(const alter of[w=>w.state.metadata.spreadsheetId='unapproved',w=>w.state.settings.splice(3,1),w=>w.state.leads[0][1]='renamed']){const w=world();alter(w);assert.throws(()=>planRegistration(w.state,result,{target:w.target,now}));assert.equal(w.writes,0);}
});
test('HTTP transport uses only fixed Google endpoints and never retries a write error',async()=>{
 let calls=0;const fetchImpl=async(url,opts)=>{calls++;if(url==='https://oauth2.googleapis.com/token')return new Response('{"access_token":"private"}',{headers:{'Content-Type':'application/json'}});assert.equal(url,'https://sheets.googleapis.com/v4/spreadsheets/'+TEST_CRM_ID+':batchUpdate');assert.equal(opts.redirect,'error');return new Response('{}',{status:503});};
 const c=await registrationClient({target:'isolation',authJson:'{"client_id":"test-id","client_secret":"test-secret","refresh_token":"test-refresh"}',fetchImpl});await assert.rejects(()=>c.batch([]),/WRITE_UNCONFIRMED/);assert.equal(calls,2);
});
test('missing Google authorization makes zero network calls',async()=>{
 let calls=0;await assert.rejects(()=>registrationClient({target:'production',authJson:'{}',fetchImpl:async()=>{calls++;}}),/INDEPENDENT_REVIEW_REQUIRED/);assert.equal(calls,0);
});
test('missing reservation acknowledgement/readback prevents the row append',async()=>{
 const w=world();let writes=0;w.client.batch=async()=>{writes++;};
 await assert.rejects(()=>registerResearch({target:w.target,result,client:w.client,now}),/RESERVATION_READBACK_FAILED/);
 assert.equal(writes,1);assert.equal(w.state.leads.length,1);
});
