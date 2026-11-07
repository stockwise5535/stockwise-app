// Parse untrusted ChatGPT/Claude APAC lead suggestions for research only.
// This does not fetch sites, scrape contacts, or authorize outbound mail.
import {assessApacLeadCandidate} from './sales-apac-lead-policy.mjs';
const MAX_BYTES=32_000;
export function parseApacAiCandidates(raw,{maxCandidates=20}={}){
 if(!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>50)
  return {ok:false,error:'invalid_candidate_limit',candidates:[]};
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>MAX_BYTES)
  return {ok:false,error:'invalid_ai_response',candidates:[]};
 let parsed;
 try{parsed=JSON.parse(raw);}catch{return {ok:false,error:'invalid_ai_json',candidates:[]};}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
   !Array.isArray(parsed.candidates)||parsed.candidates.length>maxCandidates)
  return {ok:false,error:'invalid_ai_schema',candidates:[]};
 const seen=new Set(),candidates=[];
 for(const item of parsed.candidates){
  const check=assessApacLeadCandidate(item);
  if(!check.eligibleForResearch)continue;
  const domain=new URL(item.officialWebsite).hostname.toLowerCase().replace(/^www\./,'');
  const key=item.countryCode+':'+domain;
  if(seen.has(key))continue;
  seen.add(key);
  candidates.push({
   companyName:item.companyName.trim(),countryCode:item.countryCode,
   segment:item.segment,officialWebsite:item.officialWebsite,
   evidenceUrls:[...item.evidenceUrls],researchStatus:'unverified',
   approvedToEmail:false
  });
 }
 return {ok:true,candidates,rejectedCount:parsed.candidates.length-candidates.length,
  approvedToEmail:false};
}
export const APAC_AI_RESEARCH_PROMPT=[
 'Identify potential business customers in Japan (JP), Singapore (SG), and Australia (AU).',
 'Focus on SMEs, manufacturing, import/wholesale, ecommerce, and startups.',
 'Return only a JSON object with a candidates array; each candidate must include',
 'companyName, countryCode (JP/SG/AU), segment (manufacturing/import_wholesale/ecommerce/sme/startup),',
 'officialWebsite (HTTPS), and evidenceUrls (1-5 HTTPS sources).',
 'Use public business-level information only. Do not supply personal contact details.',
 'Never invent companies or evidence URLs. Omit anything you cannot substantiate.',
 'Results are unverified research leads, never permission to email.'
].join(' ');
