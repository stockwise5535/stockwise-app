// Durable reservation only. Never sends email and never treats unknown DB
// responses as approval. The caller must separately pass all outreach checks.
import {salesDbRpc} from './sales-supabase-rest.mjs';
export async function reserveSalesSend({contactId,campaignId,idempotencyKey,dailyLimit,preflightApproved},rpc=salesDbRpc){
 if(preflightApproved!==true||typeof contactId!=='string'||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)||
   typeof campaignId!=='string'||!campaignId.trim()||
   typeof idempotencyKey!=='string'||idempotencyKey.length<16||
   !Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>25)
  return {ok:false,error:'send_reservation_not_authorized'};
 const result=await rpc('sales_reserve_send',{p_contact_id:contactId,p_campaign_id:campaignId,p_idempotency_key:idempotencyKey,p_daily_limit:dailyLimit});
 if(!result.ok||typeof result.data!=='string'||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.data))
  return {ok:false,error:'send_reservation_denied'};
 return {ok:true,reservationId:result.data};
}
