// Bounded public reads only. Never discover email addresses, crawl recursively or bypass access blocks.
import {createHash} from 'node:crypto'
const hosts=new Set(['secretlab.co','prismplus.sg','www.lovebonito.com','corporate.zalora.com','www.omron.com','www.daikin.com','apply.workable.com'])
export async function refreshResearch(candidates,{readPublic=false,fetch:transport=fetch}={}){
 if(!Array.isArray(candidates)||candidates.length>25)throw Error('RESEARCH_BATCH_INVALID')
 const output=[];let requests=0
 for(const candidate of candidates){const evidence=[]
  for(const prior of candidate.evidence || []){
   if(requests>=20){evidence.push({...prior,scm_signal_verified:false,function_evidence:false,revalidation:'batch_limit'});continue}
   let url;try{url=new URL(prior.source_url);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!hosts.has(url.hostname))throw Error()}catch{evidence.push({...prior,scm_signal_verified:false,revalidation:'source_not_allowlisted'});continue}
   if(!readPublic){evidence.push({...prior,revalidation:'public_read_pending'});continue}
   requests++
   try{
    const response=await transport(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html,application/json'}})
    const checked_at=new Date().toISOString()
    if(response.status!==200){evidence.push({...prior,http_status:response.status,checked_at,scm_signal_verified:false,function_evidence:false,revalidation:'access_or_http_failure'});continue}
    const bytes=[];let length=0
    for await(const chunk of response.body){length+=chunk.length;if(length>2*1024*1024)throw Error();bytes.push(Buffer.from(chunk))}
    const raw=Buffer.concat(bytes).toString(),text=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ')
    const matched=typeof prior.excerpt==='string'&&text.toLowerCase().includes(prior.excerpt.toLowerCase())
    evidence.push({...prior,http_status:200,checked_at,...(prior.linked_official_source?{linked_official_source:raw.includes(prior.linked_official_source)?prior.linked_official_source:null}:{}),scm_signal_verified:prior.scm_signal_verified===true&&matched,function_evidence:prior.function_evidence===true&&matched,revalidation:matched?'existing_excerpt_reverified':'manual_evidence_review_required',source_hash:createHash('sha256').update(raw).digest('hex')})
   }catch{evidence.push({...prior,scm_signal_verified:false,function_evidence:false,revalidation:'read_unavailable'})}
  }
  output.push({...candidate,evidence})
 }
 return {mode:readPublic?'public_read_only':'offline_revalidation_queue',requests,candidates:output,external_writes:0}
}
