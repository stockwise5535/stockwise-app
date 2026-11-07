// Ledger transition boundary. A network timeout after Gmail send must be
// marked 'uncertain', not automatically retried.
import {salesDbRpc} from './sales-supabase-rest.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function markSalesDelivery({reservationId,state,providerMessageId},rpc=salesDbRpc) {
 if(!UUID.test(reservationId||'')||!['sent','uncertain'].includes(state)||
   (state==='sent'&&(typeof providerMessageId!=='string'||!providerMessageId.trim()))||
   (state==='uncertain'&&providerMessageId!=null))
  return {ok:false,error:'invalid_delivery_transition'};
 const result=await rpc('sales_mark_send_result',{p_reservation_id:reservationId,p_state:state,p_provider_message_id:state==='sent'?providerMessageId:null});
 return result.ok&&result.data===true?{ok:true}:{ok:false,error:'delivery_state_not_committed'};
}
