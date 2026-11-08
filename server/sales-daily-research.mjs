// Free, explicitly reviewed JSON sources only. Reuses Phase 2's candidate parser.
// Never contacts an AI API, discovers emails, grants contact permission or sends mail.
import {parseApacAiCandidates} from './sales-apac-ai-intake.mjs';
const MAX_BYTES=32_000;
const FORBIDDEN=['api.openai.com','api.anthropic.com','localhost'];
export function reviewedResearchSource(source,now=new Date()) {
 if(!source || source.freeSourceVerified!==true || source.termsReviewed!==true || typeof source.reviewedBy!=='string' || !source.reviewedBy.trim())return false;
 const reviewed=Date.parse(source.reviewedAt);
 if(!Number.isFinite(reviewed)||reviewed>now.getTime()||now.getTime()-reviewed>180*86400000)return false;
 try{
  const u=new URL(source.url);
  // Config is reviewed repository data, never a URL supplied by an API/browser request.
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
   /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)&&!FORBIDDEN.includes(u.hostname)&&
   !/\.(local|internal|localhost|test|invalid|example)$/i.test(u.hostname);
 }catch{return false;}
}
async function limitedJson(response) {
 if(!/application\/(?:[a-z0-9.+-]*\+)?json/i.test(response.headers.get('content-type')||''))throw Error('SOURCE_NOT_JSON');
 const length=Number(response.headers.get('content-length'));if(length>MAX_BYTES)throw Error('SOURCE_TOO_LARGE');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('SOURCE_TOO_LARGE');chunks.push(value);}}
 finally {await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
export async function runDailyCandidateResearch({sources=[],fetchImpl=globalThis.fetch,now=new Date()}={}) {
 if(!Array.isArray(sources)||sources.length>5)throw Error('INVALID_SOURCE_CONFIGURATION');
 const result={day:now.toISOString().slice(0,10),status:sources.length?'completed':'not_configured',approvedToEmail:false,candidates:[],sources:[]};
 const seen=new Set();
 for(const source of sources){
  if(!reviewedResearchSource(source,now)){result.sources.push({status:'review_required'});continue;}
  try{
   const response=await fetchImpl(source.url,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('SOURCE_REQUEST_FAILED');
   const parsed=parseApacAiCandidates(await limitedJson(response),{maxCandidates:20});
   if(!parsed.ok)throw Error('SOURCE_SCHEMA_INVALID');
   let accepted=0;
   for(const candidate of parsed.candidates){
    const key=candidate.countryCode+':'+new URL(candidate.officialWebsite).hostname.toLowerCase().replace(/^www\./,'');
    if(seen.has(key))continue;seen.add(key);accepted++;
    result.candidates.push({...candidate,researchStatus:'unverified',approvedToEmail:false,observedAt:now.toISOString()});
   }
   result.sources.push({status:'read',accepted});
  }catch{result.sources.push({status:'read_failed'});}
 }
 if(result.sources.some(s=>s.status!=='read'))result.status='needs_attention';
 return result;
}
