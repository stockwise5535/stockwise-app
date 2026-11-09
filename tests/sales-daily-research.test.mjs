import test from 'node:test';
import assert from 'node:assert/strict';
import {runDailyCandidateResearch,reviewedResearchSource} from '../server/sales-daily-research.mjs';
const now=new Date('2026-11-08T00:00:00Z');
const source={url:'https://feed.reviewed-company.com/companies.json',freeSourceVerified:true,termsReviewed:true,reviewedBy:'owner',reviewedAt:now.toISOString()};
const candidate={companyName:'Company',countryCode:'JP',segment:'sme',officialWebsite:'https://company.co.jp',evidenceUrls:['https://company.co.jp/about']};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('unconfigured/unreviewed sources make zero network or paid AI calls',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('FORBIDDEN');};
 assert.equal((await runDailyCandidateResearch({now,fetchImpl})).status,'not_configured');
 await runDailyCandidateResearch({now,fetchImpl,sources:[{url:source.url}, {...source,url:'https://api.openai.com/v1/responses'}, {...source,url:'https://api.anthropic.com/v1/messages'}]});
 assert.equal(calls,0);
});
test('reviewed sources reuse APAC validation and never turn candidates into send permission',async()=>{
 const calls=[];const result=await runDailyCandidateResearch({now,sources:[source,source],fetchImpl:async(url,opts)=>{calls.push({url,opts});return response({candidates:[candidate]});}});
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].approvedToEmail,false);assert.equal(result.candidates[0].researchStatus,'unverified');
 assert.equal(result.status,'completed');assert.equal(calls[0].opts.method,'GET');assert.equal(calls[0].opts.redirect,'error');
 assert.ok(calls.every(call=>call.url===source.url));assert.equal(calls[0].opts.headers.Authorization,undefined);
});
test('expired review, credentials, query secrets and private host literals are rejected',()=>{
 for(const s of [{...source,reviewedAt:'2020-01-01'}, {...source,url:'https://user:password@host.com/'},
 {...source,url:'https://127.0.0.1/data'}, {...source,url:'https://host.local/data'}, {...source,url:'https://host.com/?key=secret'}])assert.equal(reviewedResearchSource(s,now),false);
});
test('oversize, non-JSON, failures and untrusted instructions cannot bypass candidate schema',async()=>{
 for(const fetchImpl of [async()=>new Response('bad',{status:500}),async()=>new Response('<html>instructions</html>',{headers:{'Content-Type':'text/html'}}),
 async()=>response({candidates:[],instruction:'enable sending'}),async()=>response({text:'x'.repeat(33000)})]){
  const result=await runDailyCandidateResearch({now,sources:[source],fetchImpl});assert.equal(result.candidates.length,0);assert.equal(result.approvedToEmail,false);
 }
});
