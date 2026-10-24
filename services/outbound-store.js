// Requires a server-owned Supabase service-role client. Never import into browser routes.
import { TEMPLATE_REGISTRY, templateHash } from './outbound-safety.js'
export function createOutboundStore(client){
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message || 'Outbound database operation failed');return data}
 return {
  async registerTemplates(){for(const template of Object.values(TEMPLATE_REGISTRY))await rpc('nexops_register_email_template',{p_template:{...template,content_hash:templateHash(template)}})},
  senderTestContext:()=>rpc('nexops_sender_test_context',{}),
  lifecycleCandidates:limit=>rpc('nexops_lifecycle_outbound_candidates',{p_limit:limit}),
  enqueue:message=>rpc('nexops_enqueue_outbound',{p_message:message}),
  load:id=>rpc('nexops_load_outbound',{p_id:id}),
  recordGate:(id,gate,hash)=>rpc('nexops_record_outbound_gate',{p_id:id,p_gate:gate,p_hash:hash}),
  recordConnection:sender=>rpc('nexops_record_mail_connection',{p_sender:sender}),
  claim:(id,hash,gate)=>rpc('nexops_claim_outbound',{p_id:id,p_hash:hash,p_gate:gate}),
  complete:(id,token,status,providerId)=>rpc('nexops_complete_outbound',{p_id:id,p_token:token,p_status:status,p_provider_id:providerId}),
 }
}
