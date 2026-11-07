// Server-only Supabase REST adapter. Never use an anon key for this module.
const TABLES=new Set(['sales_oauth_transactions','sales_oauth_credentials']);
export function salesSupabaseConfig(env=process.env) {
 const base=env.SUPABASE_URL, key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(typeof base!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(base)||typeof key!=='string'||key.length<30) return null;
 // Vercel may store the official project URL with a trailing slash. Normalize
 // only that harmless slash; reject paths, ports, queries and other hosts.
 return {base:base.replace(/\/$/,''),key};
}
export async function salesDbRequest({table,method='GET',query='',body,prefer},env=process.env,fetchImpl=globalThis.fetch) {
 const config=salesSupabaseConfig(env);
 if(!config||!TABLES.has(table)||!['GET','POST','PATCH'].includes(method)) return {ok:false,error:'db_not_configured'};
 try {
  const response=await fetchImpl(config.base+'/rest/v1/'+table+query,{method,headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return {ok:false,error:'db_operation_failed'};
  const data=await response.json().catch(()=>null);
  return {ok:true,data};
 } catch {return {ok:false,error:'db_unavailable'};}
}
export async function salesDbRpc(name,body,env=process.env,fetchImpl=globalThis.fetch) {
 if(!['sales_consume_oauth_state','sales_commit_unsubscribe','sales_reserve_send','sales_record_outreach_event','sales_mark_send_result'].includes(name)) return {ok:false,error:'rpc_not_allowed'};
 const config=salesSupabaseConfig(env);
 if(!config) return {ok:false,error:'db_not_configured'};
 try {
  const response=await fetchImpl(config.base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return {ok:false,error:'rpc_failed'};
  return {ok:true,data:await response.json()};
 } catch {return {ok:false,error:'rpc_unavailable'};}
}
