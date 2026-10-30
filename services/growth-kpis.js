// Server/local aggregate reader only. No email/provider adapter or database mutation.
export const unavailable=reason=>({status:'unavailable',value:null,reason})
const measured=(value,definition)=>({status:'measured',value,definition})
export function reportingWindow(from,to){
 const start=new Date(from),end=new Date(to)
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>=end)throw Error('INVALID_REPORT_WINDOW')
 return {from:start.toISOString(),to:end.toISOString()}
}
export async function collectGrowthKpis({env=process.env,from,to,fetch:transport=fetch,maxRows=20000,pageSize=1000}={}){
 const window=reportingWindow(from,to)
 const result={window,observed_at:new Date().toISOString(),scope:'configured development project; includes test/fixture accounts unless separately curated',website_visitors:unavailable('visitor_reader_not_configured'),traffic_source:unavailable('utm_capture_and_channel_reader_not_verified')}
 const fields=['total_users','new_signups','demo_starts','first_value','returning_users','qualified_leads','consultation_requests']
 let origin
 try{const url=new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL);if(url.protocol!=='https:'||url.hostname!==`${env.NEXOPS_DEV_PROJECT_REF}.supabase.co`||url.pathname!=='/'||url.port||url.username||url.password||url.search||url.hash||!env.SUPABASE_SERVICE_ROLE_KEY||!env.NEXOPS_DEV_PROJECT_REF)throw Error();origin=url.origin}catch{for(const field of fields)result[field]=unavailable('development_configuration_required');return result}
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,Prefer:'count=exact'}
 const query=(table,select,time,extra={})=>{const url=new URL(`/rest/v1/${table}`,origin);url.searchParams.set('select',select);if(time){url.searchParams.append(time,`gte.${window.from}`);url.searchParams.append(time,`lt.${window.to}`)}for(const [key,value]of Object.entries(extra))url.searchParams.set(key,value);return url}
 const read=async(url,options)=>{
  try{const r=await transport(url.href,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('read_failed');return r}catch{throw Error('read_failed')}
 }
 const count=async(table,time,extra,definition)=>{
  try{const r=await read(query(table,'*',time,extra),{method:'HEAD'});const total=r.headers.get('content-range')?.split('/')[1];if(!/^\d+$/.test(total||''))throw Error();const value=Number(total);if(!Number.isSafeInteger(value))throw Error();return measured(value,definition)}catch{return unavailable('count_read_unavailable')}
 }
 const unique=async(table,time,extra,definition)=>{
  if(!Number.isSafeInteger(maxRows)||maxRows<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000)return unavailable('invalid_read_limit')
  const users=new Set();let start=0,total=null
  try{
   while(true){
    const order=table==='nexops_activation'?'user_id.asc,workspace_id.asc':'id.asc'
    const url=query(table,'user_id',time,{...extra,order})
    const r=await read(url,{method:'GET',headers:{Range:`${start}-${start+Math.min(pageSize,maxRows-start)-1}`,'Range-Unit':'items'}})
    const range=r.headers.get('content-range'),match=/^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(range||'')
    if(!match)throw Error('pagination_unconfirmed')
    const size=Number(match[3]);if(size>maxRows)return unavailable('row_limit_exceeded')
    if(total!==null&&size!==total)return unavailable('dataset_changed_during_read')
    total=size
    const rows=await r.json();if(!Array.isArray(rows))throw Error('invalid_rows')
    if(!total&&rows.length===0)return measured(0,definition)
    if(Number(match[1])!==start||Number(match[2])-start+1!==rows.length||!rows.length)throw Error('pagination_unconfirmed')
    for(const row of rows){if(typeof row.user_id!=='string'||!row.user_id)throw Error('invalid_rows');users.add(row.user_id)}
    start+=rows.length
    if(start===total)return measured(users.size,definition)
    if(start>total||start>=maxRows)throw Error('pagination_unconfirmed')
   }
  }catch{return unavailable('unique_user_read_unavailable')}
 }
 const jobs={
  total_users:()=>count('nexops_profiles',null,{},'All profile records; not a production-only customer count'),
  new_signups:()=>count('nexops_profiles','created_at',{},'Profile records created in [from,to), including confirmed/unconfirmed test registrations'),
  demo_starts:()=>unique('nexops_activation','demo_opened_at',{},'Unique authenticated users whose first demo-open timestamp is in [from,to); not anonymous demo visits'),
  first_value:()=>unique('nexops_activation','first_value_at',{},'Unique users whose recommended-action first-value timestamp is in [from,to)'),
  returning_users:()=>unique('nexops_events','occurred_at',{event_name:'eq.user_returned'},'Unique user_returned users in [from,to); current implementation detects prior-day return'),
  qualified_leads:()=>count('nexops_lead_qualification','updated_at',{status:'in.(Qualified Lead,Consultation,Pilot Candidate)'},'Qualification rows last updated in [from,to) in existing qualified statuses; heuristic, not verified SCM ICP or unique companies'),
  consultation_requests:()=>count('nexops_consultation_leads','created_at',{},'Submitted consultation request rows in [from,to); not confirmed appointments'),
 }
 await Promise.all(Object.entries(jobs).map(async([name,job])=>{result[name]=await job()}))
 return result
}
