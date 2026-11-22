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
test('regional targets include the six requested countries without approving email',()=>{
 assert.deepEqual(APAC_LEAD_POLICY.priorityCountries,['JP','SG','AU','NZ','KR','TH','VN','MY']);
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
test('global partners and consultants enter research, never the approved sender',()=>{
 for(const countryCode of ['SG','NZ','KR','TH','VN','MY'])assert.equal(assessApacLeadCandidate({...candidate,countryCode}).eligibleForResearch,true);
 for(const segment of ['inventory_consulting','supply_chain_services','ai_partner']){
  const r=assessApacLeadCandidate({...candidate,countryCode:'US',segment});assert.equal(r.eligibleForResearch,true);assert.equal(r.approvedToEmail,false);
  assert.equal(assessApacLeadCandidate({...candidate,countryCode:'ZZ',segment}).eligibleForResearch,false);
 }
});
