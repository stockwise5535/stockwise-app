// Authenticated ingestion boundary: callers must verify source provenance
// before invoking this function. This module never exposes a public webhook.
import {salesDbRpc} from './sales-supabase-rest.mjs';
const TYPES=new Set(['accepted','delivered','reply','unsubscribe','complaint','hard_bounce','uncertain']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function recordVerifiedSalesEvent({contactId,eventKey,eventType,occurredAt,sourceVerified},rpc=salesDbRpc) {
 if(sourceVerified!==true||!UUID.test(contactId||'')||
    typeof eventKey!=='string'||eventKey.length<8||eventKey.length>256||
    !TYPES.has(eventType)||typeof occurredAt!=='string'||!Number.isFinite(Date.parse(occurredAt)))
  return {ok:false,error:'unverified_or_invalid_event'};
 const result=await rpc('sales_record_outreach_event',{p_contact_id:contactId,p_event_key:eventKey,p_event_type:eventType,p_occurred_at:occurredAt});
 return result.ok&&result.data===true?{ok:true}:{ok:false,error:'event_not_committed'};
}
