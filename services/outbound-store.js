// Requires a server-owned Supabase service-role client. Never import into browser routes.
import { TEMPLATE_REGISTRY, templateHash } from './outbound-safety.js'
export function createOutboundStore(client){
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message || 'Outbound database operation failed');return data}
 return {
  async registerTemplates(){for(const template of Object.values(TEMPLATE_REGISTRY))await rpc('nexops_register_email_template',{p_template:{...template,content_hash:templateHash(template)}})},
  senderTestContext:()=>rpc('nexops_sender_test_context',{}),
  lifecycleCandidates:limit=>rpc('nexops_lifecycle_outbound_candidates',{p_limit:limit}),
  enqueue:message=>rpc('nexops_enqueue_outbound',{p_message:message}),
  async load(id){
   const state=await rpc('nexops_load_outbound',{p_id:id});if(!state)return state
   const m=state.message
   if(m.template_id==='consultation_confirmation'&&m.related_consultation_id){const r=await client.from('nexops_consultation_leads').select('id').eq('id',m.related_consultation_id).eq('workspace_id',m.workspace_id).eq('submitted_by',m.recipient_user_id);state.consultationVerified=!r.error&&r.data?.length===1}
   if(m.template_id==='workspace_invitation'&&/^invitation:[a-f0-9-]{36}$/i.test(m.source_event)){const r=await client.from('nexops_invitations').select('expires_at,accepted_by').eq('id',m.source_event.slice(11)).eq('workspace_id',m.workspace_id).single();state.invitationVerified=!r.error&&Date.parse(r.data?.expires_at)>Date.now()&&(!r.data.accepted_by||r.data.accepted_by===m.recipient_user_id)}
   if(m.template_id==='activation_reminder'){const p=await client.from('nexops_profiles').select('trial_start_date').eq('user_id',m.recipient_user_id).single();const a=await client.from('nexops_activation').select('activated_at').eq('user_id',m.recipient_user_id).not('activated_at','is',null);state.activationReminderEligible=!p.error&&!a.error&&Date.parse(p.data?.trial_start_date)<=Date.now()-86400000&&a.data.length===0}
   return state
  },
  recordGate:(id,gate,hash)=>rpc('nexops_record_outbound_gate',{p_id:id,p_gate:gate,p_hash:hash}),
  recordConnection:sender=>rpc('nexops_record_mail_connection',{p_sender:sender}),
  claim:(id,hash,gate)=>rpc('nexops_claim_outbound',{p_id:id,p_hash:hash,p_gate:gate}),
  complete:(id,token,status,providerId)=>rpc('nexops_complete_outbound',{p_id:id,p_token:token,p_status:status,p_provider_id:providerId}),
 }
}
