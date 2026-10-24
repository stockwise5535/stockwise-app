// Read-only hosted preflight: never signs up, signs in, invokes an RPC or writes data.
const required=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY']
const missing=required.filter(name=>!process.env[name]?.trim())
const report={scope:'hosted read-only preflight',missing,network_requests:0,checks:{},migrations_applied:[],hosted_policy_verification:'not performed; requires database catalog access'}
function finish(code){console.log(JSON.stringify(report,null,2));process.exitCode=code}
if(missing.length){report.status='blocked_missing_environment';finish(2)}else{
 try{
  const url=new URL(process.env.VITE_SUPABASE_URL)
  if(url.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname!=='/' || url.search || url.hash || url.username || url.password)throw new Error('Expected a hosted HTTPS project origin without a path, credentials or query. Custom domains require a separately reviewed target check.')
  const ref=url.hostname.split('.')[0],expected=process.env.NEXOPS_DEV_PROJECT_REF
  if(expected && expected!==ref)throw new Error('Configured URL does not match NEXOPS_DEV_PROJECT_REF')
  report.target_project_ref=ref
  report.development_project_identity=expected?'matches explicit expected reference':'unconfirmed; provide NEXOPS_DEV_PROJECT_REF before any hosted write'
  const key=process.env.VITE_SUPABASE_ANON_KEY.trim()
  let role
  try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role}catch{}
  if(key.startsWith('sb_secret_') || role==='service_role')throw new Error('Public client key required; do not use an admin/service-role key for this preflight')
  const headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})}
  const get=async path=>{report.network_requests++;const r=await fetch(new URL(path,url),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});let body;try{body=await r.json()}catch{}return {status:r.status,ok:r.ok,body}}
  const auth=await get('/auth/v1/settings')
  report.checks.auth_settings={status:auth.status,passed:auth.ok}
  if(!auth.ok)throw new Error('Auth settings request failed; inspect the project key/network configuration without printing credentials')
  if(typeof auth.body?.mailer_autoconfirm==='boolean')report.checks.email_confirmation_required=!auth.body.mailer_autoconfirm
  const tables=['nexops_profiles','nexops_workspaces','nexops_consultation_leads']
  let passed=true
  for(const table of tables){
   const result=await get(`/rest/v1/${table}?select=${table==='nexops_profiles'?'user_id':'id'}&limit=1`)
   const denied=[401,403].includes(result.status) && result.body?.code==='42501'
   report.checks[table]={status:result.status,result:denied?'anonymous SELECT denied as expected':result.status===404?'missing or not exposed; inspect catalog before deciding migrations':result.ok?'unexpected anonymous SELECT permission; inspect grants/policies':'unverified request failure'}
   if(!denied)passed=false
  }
  report.status=passed?'read_only_checks_passed_catalog_and_authenticated_tests_still_required':'read_only_checks_require_investigation'
  finish(passed?0:3)
 }catch(error){report.status='blocked_or_failed';report.error=error.message.startsWith('Expected ') || error.message.startsWith('Configured ') || error.message.startsWith('Public ') || error.message.startsWith('Auth settings ')?error.message:'Hosted request failed; check network/DNS/TLS and project configuration. Credential values are not logged.';finish(2)}
}
