import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import{createHash}from'node:crypto';
const Core=createRequire(import.meta.url)('../apps-script/sales-crm/Core.js');
const proposal=JSON.parse(readFileSync(new URL('../apps-script/sales-crm/deployment/pilot-proposal.json',import.meta.url)));
test('the three resolved emails remain proposals, not authorization or an enabled recurring job',()=>{
 assert.equal(proposal.messages.length,3);assert.equal(proposal.sendAuthorized,false);assert.equal(proposal.recurringEnabled,false);assert.equal(proposal.maxDaily,100);
 assert.equal(new Set(proposal.messages.map(m=>m.email)).size,3);
 for(const m of proposal.messages){assert.equal(m.approvalStatus,'DRAFT');assert.equal(m.consentClaimed,false);assert.ok(['UK','NZ'].includes(m.country));assert.equal(m.approvedHash,null);assert.doesNotMatch(m.subject+m.body,/\bCEO\b|\bfree\b|at no cost|StockWise/);assert.match(m.body,/NexOps\. Inc/);assert.match(m.sourceUrl,/^https:/);assert.ok(!m.body.includes('[company]'));assert.ok(m.body.includes(m.company));assert.ok(m.body.includes(proposal.sender.email));}
});
test('existing legal/limit blockers are not treated as satisfied by a drafted proposal',()=>{
 for(const m of proposal.messages){
  const settings=Core.settingsFrom(Object.entries({LIVE_SENDING:true,LEGAL_REVIEW_COMPLETED:false,DAILY_SEND_LIMIT:50,RUN_SEND_LIMIT:10,SENDER_NAME:'NexOps',SENDER_COMPANY:'NexOps',SENDER_ADDRESS:proposal.sender.email,ALLOWED_COUNTRIES:'SG,NZ,UK'}).map(([key,value])=>({key,value})));
  const item={queue_id:m.queueId,lead_id:'fixture',subject:m.subject,body:m.body,to_email:m.email,step:1,send_key:'fixture#1',approval_status:'APPROVED',approved_by:'offline fixture',approved_hash:Core.contentHash(m.subject,m.body,m.email)};
  const lead={lead_id:'fixture',company:m.company,contact_email:m.email,country:'SG',source_url:m.sourceUrl,contact_basis:m.contactBasis,status:'RESEARCH'};
  const reasons=Core.preSendChecks({item,lead,settings,sup:Core.suppressionSet([]),queue:[item],localNow:{day:'2026-11-23',hour:10,dow:1},sentToday:0,sentThisRun:0,nowMs:Date.parse('2026-11-23T18:00:00Z')});
  assert.ok(reasons.includes('LEGAL_REVIEW_PENDING'));assert.ok(!reasons.includes('SEND_LIMIT_CONFIGURATION_INVALID'));assert.ok(reasons.includes('EDITED_AFTER_APPROVAL'));
 }
});
test('selective patch evidence matches reviewed development source and retains every unrelated remote file',()=>{
 const patch=JSON.parse(readFileSync(new URL('../apps-script/sales-crm/deployment/sending-patch.review.json',import.meta.url)));
 assert.equal(patch.applyAuthorized,false);assert.equal(patch.mailSendAuthorized,false);assert.equal(patch.recurringEnableAuthorized,false);assert.deepEqual(patch.replaceFiles,['Main','Engine','Core']);assert.equal(patch.retainEveryOtherRemoteFile,true);assert.equal(patch.retainCoreExceptDailyLimit,false);assert.equal(patch.patchVersion,2);assert.equal(patch.sourceReviewStatus,'UNREVIEWED_NEW_SOURCE');
 for(const name of ['Main','Engine'])assert.equal(createHash('sha256').update(readFileSync(new URL('../apps-script/sales-crm/'+name+'.js',import.meta.url))).digest('hex'),patch.preparedSourceHashes[name]);
});
