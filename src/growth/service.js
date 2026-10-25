// This module never imports demo state or reads browser-local operational data.
export const MARKETS = ['SG','AU','NZ','HK','JP','KR','TW','OTHER_APAC']
export const QUALIFIED = ['Qualified Lead','Consultation','Pilot Candidate']
export const EVENTS = ['homepage_view','signup_started','signup_completed','login_completed','demo_workspace_opened','today_viewed','exception_opened','recommended_action_viewed','csv_upload_started','csv_upload_completed','consultation_clicked','consultation_submitted','consultation_booked','user_returned','activation_completed','supplier_monitoring_viewed','invite_sent','invite_accepted']
export function cleanProperties(properties = {}) {
  const allowed = ['locale','market','workspace_type','data_mode','screen','referral_source']
  return Object.fromEntries(Object.entries(properties).filter(([key,value]) => allowed.includes(key) && typeof value === 'string' && value.length <= 80))
}
export function conversion(numerator,denominator) { return numerator == null || denominator == null || denominator === 0 ? null : Math.round(1000*numerator/denominator)/10 }
export function validateConsultation(d) {
  for (const key of ['company','contact_name','email','main_problem']) if (!String(d[key] || '').trim()) throw new Error(`${key.replaceAll('_',' ')} is required`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length>254) throw new Error('Enter a valid email address')
  if (!MARKETS.includes(d.market)) throw new Error('Select an APAC market')
  for (const key of ['sku_count','supplier_count']) if (d[key] !== '' && d[key] != null && (!Number.isInteger(Number(d[key])) || Number(d[key])<0)) throw new Error('Counts must be nonnegative whole numbers')
  return d
}
export function qualifiedExport(leads,qualifications) {
  const allowed = new Set(qualifications.filter(q=>QUALIFIED.includes(q.status)).map(q=>q.lead_id))
  return leads.filter(l=>allowed.has(l.id)).map(l=>({external_id:l.id,company:l.company,email:l.email,contact_name:l.contact_name,market:l.market,status:qualifications.find(q=>q.lead_id===l.id).status}))
}
export function csvExport(records) {
  if (!records.length) return ''
  const keys=Object.keys(records[0])
  const cell=v=>'"'+String(v ?? '').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"'
  return [keys.map(cell).join(','),...records.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n')
}
export function bookingUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && ['calendar.google.com','calendar.app.google'].includes(u.hostname) && !u.username && !u.password ? u.href : null } catch { return null }
}
export function createGrowthService(client) {
  if (!client) throw new Error('Supabase is not configured')
  const result = async promise => { const {data,error,status}=await promise; if(error) throw Object.assign(new Error(error.message || 'Backend request failed'),{code:error.code,status:status || error.status || (error.code==='42501'?403:undefined),transient:error.code==='PGRST000'||error.code==='PGRST001'||error.code==='PGRST002'}); return data }
  const rpc=(name,args={})=>result(client.rpc(name,args))
  return {
    bootstrap:()=>rpc('nexops_bootstrap'),
    workspaces:()=>result(client.from('nexops_workspaces').select('*').order('created_at')),
    profile:()=>result(client.from('nexops_profiles').select('*').single()),
    organizations:()=>result(client.from('nexops_organizations').select('*')),
    organizationMemberships:()=>result(client.from('nexops_organization_memberships').select('*')),
    memberships:()=>result(client.from('nexops_workspace_memberships').select('*')),
    activation:id=>result(client.from('nexops_activation').select('*').eq('workspace_id',id)),
    leads:id=>result(client.from('nexops_consultation_leads').select('*').eq('workspace_id',id).order('created_at',{ascending:false})),
    qualifications:id=>result(client.from('nexops_lead_qualification').select('*').eq('workspace_id',id)),
    createWorkspace:(fields,id)=>rpc('nexops_create_workspace',{p_name:fields.name,p_market:fields.market,p_locale:fields.locale,p_request_id:id}),
    track:(name,id,props={},eventId=crypto.randomUUID())=>rpc('nexops_track_event',{p_event_name:name,p_workspace_id:id,p_properties:cleanProperties(props),p_event_id:eventId}),
    consult:(id,details,requestId)=>rpc('nexops_submit_consultation',{p_workspace_id:id,p_details:validateConsultation(details),p_request_id:requestId}),
    invite:(id,role='viewer')=>rpc('nexops_create_invite',{p_workspace_id:id,p_role:role}),
    acceptInvite:token=>rpc('nexops_accept_invite',{p_token:token}),
    preferences:(marketing,locale)=>rpc('nexops_set_preferences',{p_marketing_opt_in:marketing,p_locale:locale}),
    deletion:()=>rpc('nexops_request_deletion'),
    outbound:id=>result(client.from('nexops_outbound_messages').select('*').eq('workspace_id',id).order('created_at',{ascending:false})),
    outboundHistory:()=>result(client.from('nexops_outbound_history').select('*').order('created_at')),
    emailTemplates:()=>result(client.from('nexops_email_templates').select('*').order('template_id')),
    reviewOutbound:(id,action,subject,body,reason)=>rpc('nexops_review_outbound',{p_id:id,p_action:action,p_subject:subject,p_body:body,p_reason:reason}),
    confirmMailTest:id=>rpc('nexops_confirm_mail_test',{p_id:id}),
    enableMail:enabled=>rpc('nexops_enable_mail',{p_enabled:enabled}),
    approveEmailTemplate:t=>rpc('nexops_approve_email_template',{p_id:t.template_id,p_version:t.version,p_hash:t.content_hash}),
    metrics:()=>rpc('nexops_growth_metrics'),
  }
}
