// Server-only APAC company research through explicitly configured AI provider.
// AI output is untrusted; all candidates remain unverified and unsendable.
import {APAC_AI_RESEARCH_PROMPT,parseApacAiCandidates} from './sales-apac-ai-intake.mjs';
const PROVIDERS=Object.freeze({
 openai:{url:'https://api.openai.com/v1/responses',key:'OPENAI_API_KEY'},
 anthropic:{url:'https://api.anthropic.com/v1/messages',key:'ANTHROPIC_API_KEY'}
});
export async function researchApacCompanies({provider,env=process.env,fetchImpl=globalThis.fetch}={}){
 const spec=PROVIDERS[provider];
 if(!spec)return {ok:false,error:'unsupported_ai_provider',candidates:[]};
 const key=env[spec.key];
 if(typeof key!=='string'||key.length<16)return {ok:false,error:'ai_provider_not_configured',candidates:[]};
 const headers={'Content-Type':'application/json'};
 let body;
 if(provider==='openai'){
  headers.Authorization='Bearer '+key;
  body={model:'gpt-4.1-mini',instructions:APAC_AI_RESEARCH_PROMPT,
   input:'Find up to 10 APAC companies for further research. Respond with JSON only.',
   max_output_tokens:2200};
 }else{
  headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
  body={model:'claude-sonnet-4-5',max_tokens:2200,system:APAC_AI_RESEARCH_PROMPT,
   messages:[{role:'user',content:'Find up to 10 APAC companies for further research. Respond with JSON only.'}]};
 }
 try{
  const response=await fetchImpl(spec.url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return {ok:false,error:'ai_provider_request_failed',candidates:[]};
  const data=await response.json();
  let output;
  if(provider==='openai')output=data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  else output=data.content?.filter(x=>x.type==='text').map(x=>x.text).join('');
  const parsed=parseApacAiCandidates(output);
  if(!parsed.ok)return {ok:false,error:parsed.error,candidates:[]};
  return {...parsed,provider,approvedToEmail:false};
 }catch{return {ok:false,error:'ai_provider_unavailable',candidates:[]};}
}
