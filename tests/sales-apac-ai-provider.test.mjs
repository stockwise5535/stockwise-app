import test from 'node:test';
import assert from 'node:assert/strict';
import {researchApacCompanies} from '../server/sales-apac-ai-provider.mjs';
const company={companyName:'Example AU',countryCode:'AU',segment:'ecommerce',officialWebsite:'https://example.com.au',evidenceUrls:['https://example.com.au/about']};
test('AI research requires explicit provider credentials',async()=>{
 let called=false;
 const r=await researchApacCompanies({provider:'openai',env:{},fetchImpl:async()=>{called=true;}});
 assert.equal(r.ok,false);assert.equal(r.error,'ai_provider_not_configured');assert.equal(called,false);
});
test('unknown provider cannot initiate network request',async()=>{
 const r=await researchApacCompanies({provider:'unknown',env:{OPENAI_API_KEY:'x'.repeat(32)}});
 assert.equal(r.error,'unsupported_ai_provider');
});
for(const provider of ['openai','anthropic']){
 test(provider+' parses candidates but never approves sending',async()=>{
  const payload=JSON.stringify({candidates:[company]});
  let calledUrl='';
  const r=await researchApacCompanies({
   provider,env:{OPENAI_API_KEY:'x'.repeat(32),ANTHROPIC_API_KEY:'y'.repeat(32)},
   fetchImpl:async(url,opts)=>{
    calledUrl=url;
    assert.equal(opts.method,'POST');
    assert.ok(!opts.body.includes('nexops2026test@gmail.com'));
    return {ok:true,json:async()=>provider==='openai'?
     {output:[{content:[{type:'output_text',text:payload}]}]}:
     {content:[{type:'text',text:payload}]};
   }
  });
  assert.match(calledUrl,/^https:\/\//);
  assert.equal(r.ok,true);assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].approvedToEmail,false);
 });
}
test('provider errors fail closed',async()=>{
 const r=await researchApacCompanies({provider:'openai',env:{OPENAI_API_KEY:'x'.repeat(32)},fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(r.ok,false);assert.deepEqual(r.candidates,[]);
});
