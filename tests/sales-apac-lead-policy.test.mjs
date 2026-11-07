import test from 'node:test';
import assert from 'node:assert/strict';
import {assessApacLeadCandidate,APAC_LEAD_POLICY} from '../server/sales-apac-lead-policy.mjs';
const candidate={companyName:'Example Manufacturer',countryCode:'JP',segment:'manufacturing',officialWebsite:'https://example.jp',evidenceUrls:['https://example.jp/about']};
test('APAC candidate can enter research but never auto-approves email',()=>{
 const result=assessApacLeadCandidate(candidate);
 assert.equal(result.eligibleForResearch,true);
 assert.equal(result.approvedToEmail,false);
 assert.equal(APAC_LEAD_POLICY.defaultEmailSending,false);
});
test('APAC priority regions are JP SG AU',()=>{
 assert.deepEqual(APAC_LEAD_POLICY.priorityCountries,['JP','SG','AU']);
 for(const countryCode of ['US','GB','XX'])assert.equal(assessApacLeadCandidate({...candidate,countryCode}).eligibleForResearch,false);
});
test('rejects missing evidence, invalid domains and unknown segment',()=>{
 for(const change of [{evidenceUrls:[]},{officialWebsite:'http://example.jp'},{officialWebsite:'https://localhost'},{segment:'other'},{companyName:''}]){
  const result=assessApacLeadCandidate({...candidate,...change});
  assert.equal(result.eligibleForResearch,false);
  assert.equal(result.approvedToEmail,false);
 }
});
test('invalid AI output fails closed',()=>{
 for(const value of [null,undefined,[],42,'hello'])assert.equal(assessApacLeadCandidate(value).approvedToEmail,false);
});
