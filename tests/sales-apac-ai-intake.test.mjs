import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApacAiCandidates,APAC_AI_RESEARCH_PROMPT} from '../server/sales-apac-ai-intake.mjs';
const sample={companyName:'Example JP',countryCode:'JP',segment:'manufacturing',officialWebsite:'https://example.jp',evidenceUrls:['https://example.jp/about']};
test('valid AI suggestions remain unverified and cannot authorize sending',()=>{
 const r=parseApacAiCandidates(JSON.stringify({candidates:[sample]}));
 assert.equal(r.ok,true);assert.equal(r.candidates.length,1);
 assert.equal(r.candidates[0].researchStatus,'unverified');
 assert.equal(r.candidates[0].approvedToEmail,false);
 assert.equal(r.approvedToEmail,false);
});
test('duplicate domains and invalid APAC suggestions are excluded',()=>{
 const r=parseApacAiCandidates(JSON.stringify({candidates:[sample,{...sample,companyName:'Duplicate',officialWebsite:'https://www.example.jp'}, {...sample,countryCode:'US'}]}));
 assert.equal(r.candidates.length,1);assert.equal(r.rejectedCount,2);
});
test('malformed, oversized, or excessive AI responses fail closed',()=>{
 for(const raw of ['not json','[]','{}',JSON.stringify({candidates:Array(21).fill(sample)}),'x'.repeat(33_000)]){
  const r=parseApacAiCandidates(raw);assert.equal(r.ok,false);assert.deepEqual(r.candidates,[]);
 }
});
test('prompt does not ask for personal email or claim verification',()=>{
 assert.match(APAC_AI_RESEARCH_PROMPT,/public business-level information/);
 assert.match(APAC_AI_RESEARCH_PROMPT,/Never invent/);
});
