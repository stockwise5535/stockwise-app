import test from'node:test';import assert from'node:assert/strict';import{generateKeyPairSync,createVerify}from'node:crypto';
import{productionCrmId,RETIRED_UNVERIFIED_CRM_ID,assertProductionWriteAuthorization,CRM_BINDING}from'../server/sales-crm-binding.mjs';
import{sheetsAccessToken}from'../server/sales-sheets-auth.mjs';
import{discoverBusinessLeads,discoveryQuery,DISCOVERY_ENDPOINT}from'../server/sales-lead-discovery.mjs';
import{researchRouteGate}from'../server/sales-crm-registration.mjs';
import{verifiedResearchCandidates}from'../server/sales-lead-handoff.mjs';
import{checkDedicatedSheetsAuth}from'../server/sales-sheets-auth-check.mjs';
import{registrationClient}from'../server/sales-crm-registration-client.mjs';
import{registerResearch}from'../server/sales-crm-registration.mjs';
import{TEST_CRM_ID}from'../server/sales-test-crm-import.mjs';
import{createRequire}from'node:module';
const now=new Date('2026-11-21T20:00:00Z');
test('production prohibition stops before client reads or writes, even with a supplied client',async()=>{
 let calls=0;const client={read:async()=>{calls++;},batch:async()=>{calls++;}};
 await assert.rejects(()=>registerResearch({target:'production',client,result:{}}),/PRODUCTION_WRITES_NOT_AUTHORIZED/);assert.equal(calls,0);
});
test('dedicated preparation probe uses readonly scope and GETs against isolation only; transport rejects writes',async()=>{
 const{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const authJson=JSON.stringify({type:'service_account',project_id:CRM_BINDING.credentialsProjectId,client_email:'research@'+CRM_BINDING.credentialsProjectId+'.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 const Core=createRequire(import.meta.url)('../apps-script/sales-crm/Core.js');let reads=0;
 const fetchImpl=async(url,opts)=>{
  if(url==='https://oauth2.googleapis.com/token'){
   const payload=JSON.parse(Buffer.from(opts.body.get('assertion').split('.')[1],'base64url'));assert.equal(payload.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');
   return new Response('{"access_token":"unit-test-only"}',{headers:{'Content-Type':'application/json'}});
  }
  reads++;assert.equal(opts.method,'GET');assert.ok(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+TEST_CRM_ID));
  const body=url.includes('/values/Leads')?{values:[Core.TABLES.Leads.slice(0,19)]}:url.includes('/values/Settings')?{values:[['key','value'],['LIVE_SENDING',false],['FOLLOW_UP_ENABLED',false],['LEGAL_REVIEW_COMPLETED',false],['RESEARCH_IMPORT_ENABLED',true]]}:{spreadsheetId:TEST_CRM_ID,sheets:[{properties:{title:'Leads',sheetId:1,gridProperties:{rowCount:2001,columnCount:19}}},{properties:{title:'Settings',sheetId:2,gridProperties:{rowCount:60,columnCount:2}}}]};
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };
 const report=await checkDedicatedSheetsAuth({authJson,fetchImpl});assert.equal(reads,3);assert.equal(report.crmWrites,false);assert.equal(report.sheetsApiReachable,true);
 const client=await registrationClient({target:'isolation',authJson,requireDedicatedAuth:true,readOnly:true,fetchImpl});
 await assert.rejects(()=>client.batch([{appendCells:{sheetId:1}}]),/READ_ONLY_SHEETS_CLIENT/);assert.equal(reads,3);
});
test('dedicated route gate leaves an active sender and its settings untouched; emergency OFF blocks only intake',()=>{
 const route={spreadsheetId:'canonical',enabled:true,emailSending:false,snsSending:false,followUp:false};
 const state={settings:[['LIVE_SENDING',true],['LEGAL_REVIEW_COMPLETED',true]],metadata:{developerMetadata:[{metadataKey:'stockwiseResearchRoute',metadataValue:JSON.stringify(route)}]}};
 const original=structuredClone(state);researchRouteGate(state,'canonical');assert.deepEqual(state,original);
 state.metadata.developerMetadata[0].metadataValue=JSON.stringify({...route,enabled:false});assert.throws(()=>researchRouteGate(state,'canonical'),/IMPORT_STOPPED/);
});
test('official verification needs matching fresh evidence and contact page; published contact is never email consent',()=>{
 const c={companyName:'Company',countryCode:'SG',officialWebsite:'https://company.com/',approvedToEmail:false};
 const r={...c,reviewedBy:'site reviewer',checkedAt:now.toISOString(),businessRelevance:'Public supply chain services complement inventory visibility.',officialEvidenceUrl:'https://company.com/about',contactMethod:'business_enquiry_page',contactUrl:'https://company.com/contact'};
 assert.equal(verifiedResearchCandidates([c],[]).length,0);
 assert.equal(verifiedResearchCandidates([c],[{...r,contactUrl:'https://other.com/contact'}],{now}).length,0);
 assert.equal(verifiedResearchCandidates([c],[{...r,checkedAt:'2020-01-01'}],{now}).length,0);
 const out=verifiedResearchCandidates([c],[r],{now})[0];assert.equal(out.approvedToEmail,false);assert.equal(out.officialVerification.legalReviewStatus,'pending');assert.equal(out.contact_email,undefined);
});
test('unconfirmed canonical CRM or missing independent review cannot authorize a destination',()=>{
 assert.equal(CRM_BINDING.spreadsheetId,'12uDNmpfEANnzzTRoT6eyjmlNg1wj2B9f6BUPWH9X3pk');
 assert.equal(CRM_BINDING.confirmedByOwner,true);
 assert.throws(()=>productionCrmId({...CRM_BINDING,confirmedByOwner:false}),/NOT_CONFIRMED/);
 assert.throws(()=>productionCrmId(),/INDEPENDENT_REVIEW_REQUIRED/);
 assert.throws(()=>assertProductionWriteAuthorization(),/PRODUCTION_WRITES_NOT_AUTHORIZED/);
 const b={confirmedByOwner:true,confirmedAt:now.toISOString(),spreadsheetId:CRM_BINDING.spreadsheetId,newRoute:{emailSending:false,snsSending:false,followUp:false}};
 assert.throws(()=>productionCrmId(b),/INDEPENDENT_REVIEW/);
 assert.throws(()=>productionCrmId({...b,spreadsheetId:RETIRED_UNVERIFIED_CRM_ID}),/NOT_CONFIRMED/);
 assert.throws(()=>productionCrmId({...b,independentReviewStatus:'approved',independentReviewCommit:'a'.repeat(40),independentReviewDigest:'a'.repeat(64),independentReviewer:'reviewer',newRoute:{...b.newRoute,emailSending:true}}),/SENDING_FORBIDDEN/);
});
test('dedicated auth rejects existing user OAuth without touching it or making a request',async()=>{
 let calls=0;await assert.rejects(()=>sheetsAccessToken({authJson:JSON.stringify({client_id:'existing',client_secret:'existing',refresh_token:'existing'}),dedicated:true,fetchImpl:async()=>{calls++;}}),/DEDICATED_SHEETS_AUTH_REQUIRED/);assert.equal(calls,0);
});
test('service account token assertion is signed, Sheets-only, not delegated, and never retried',async()=>{
 const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const auth={type:'service_account',project_id:'isolated-research',client_email:'research@isolated-research.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};let calls=0;
 const fetchImpl=async(url,opts)=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');const jwt=opts.body.get('assertion').split('.');const payload=JSON.parse(Buffer.from(jwt[1],'base64url'));assert.equal(payload.scope,'https://www.googleapis.com/auth/spreadsheets');assert.equal(payload.sub,undefined);assert.equal(payload.exp-payload.iat,3600);assert.ok(createVerify('RSA-SHA256').update(jwt.slice(0,2).join('.')).verify(publicKey,jwt[2],'base64url'));return new Response('{}',{status:503});};
 await assert.rejects(()=>sheetsAccessToken({authJson:JSON.stringify(auth),dedicated:true,fetchImpl,now}));assert.equal(calls,1);
});
const source={url:DISCOVERY_ENDPOINT,format:'wikidata-discovery',kind:'regional',freeSourceVerified:true,termsReviewed:true,reviewedBy:'reviewer',reviewedAt:now.toISOString()};
const row=(n,country='SG')=>({item:{value:'http://www.wikidata.org/entity/Q'+n},label:{value:'Company '+n},countryCode:{value:country},website:{value:'https://company'+n+'.com'},description:{value:'manufacturing company'}});
test('dynamic discovery supplies 50 distinct research candidates and excludes CRM domains without contact data or approval',async()=>{
 let calls=0;const fetchImpl=async(url,opts)=>{calls++;assert.equal(url,DISCOVERY_ENDPOINT);assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,undefined);return new Response(JSON.stringify({results:{bindings:Array.from({length:100},(_,i)=>row(i+1))}}),{headers:{'Content-Type':'application/sparql-results+json'}});};
 const r=await discoverBusinessLeads({sources:[source],existingRows:[{website:'https://company1.com'}],fetchImpl,now});assert.equal(calls,1);assert.equal(r.candidates.length,50);assert.equal(r.candidates[0].companyName,'Company 2');assert.equal(r.qualifiedForSales,0);assert.ok(r.candidates.every(c=>!c.contact_email&&c.approvedToEmail===false&&c.officialVerificationRequired));
});
test('source failures do not retry, pretend completion or grant contact permission',async()=>{
 let calls=0;const r=await discoverBusinessLeads({sources:[source],fetchImpl:async()=>{calls++;return new Response('failure',{status:429});},now});assert.equal(calls,1);assert.equal(r.status,'needs_attention');assert.equal(r.candidates.length,0);assert.equal(r.approvedToEmail,false);
 assert.throws(()=>discoveryQuery('regional',{excludedEntities:['Q1) SERVICE <https://evil.invalid>']}));
});

test('dedicated preparation rejects a service account from any other project before authentication',async()=>{
 let calls=0;const authJson=JSON.stringify({type:'service_account',project_id:'other-project',client_email:'research@other-project.iam.gserviceaccount.com',private_key:'not-used'});
 await assert.rejects(()=>checkDedicatedSheetsAuth({authJson,fetchImpl:async()=>{calls++;}}),/DEDICATED_SHEETS_IDENTITY_MISMATCH/);assert.equal(calls,0);
});
