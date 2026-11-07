// Self-addressed Gmail API smoke test only. NEVER accepts an external recipient.
// Network ambiguity is recorded as uncertain, never retried automatically.
import {buildGmailDraft} from './sales-gmail-draft.mjs';
import {refreshSalesGmailAccessToken} from './sales-gmail-token-refresh.mjs';
import {reserveSalesSend} from './sales-send-reservation.mjs';
import {markSalesDelivery} from './sales-delivery-ledger.mjs';
const MAILBOX='nexops2026test@gmail.com';
export async function sendSalesGmailSelfTest({
 env=process.env,recipient,subject,body,unsubscribeUrl,unsubscribeMailto,
 contactId,idempotencyKey,fetchImpl=globalThis.fetch,
 refresh=refreshSalesGmailAccessToken,reserve=reserveSalesSend,mark=markSalesDelivery
}={}) {
 if(env.STOCKWISE_SALES_SELF_TEST_ENABLED!=='true'||env.STOCKWISE_SALES_SEND_ENABLED==='true'||
    typeof recipient!=='string'||recipient.toLowerCase()!==MAILBOX||
    typeof env.STOCKWISE_SALES_GMAIL_FROM!=='string'||env.STOCKWISE_SALES_GMAIL_FROM.toLowerCase()!==MAILBOX)
  return {ok:false,error:'self_test_not_authorized'};
 const draft=buildGmailDraft({from:MAILBOX,to:MAILBOX,subject,body,unsubscribeUrl,unsubscribeMailto});
 if(!draft.ok)return {ok:false,error:'invalid_self_test_draft',reasons:draft.reasons};
 const token=await refresh({env,fetchImpl});
 if(!token.ok)return {ok:false,error:'gmail_auth_unavailable'};
 const slot=await reserve({contactId,campaignId:'gmail-self-test',idempotencyKey,dailyLimit:1,preflightApproved:true});
 if(!slot.ok)return {ok:false,error:'self_test_reservation_denied'};
 let result;
 try {
  const response=await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
   method:'POST',headers:{Authorization:'Bearer '+token.accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({raw:draft.raw}),signal:AbortSignal.timeout(10000)
  });
  if(response.ok){
   const data=await response.json();
   if(typeof data.id==='string'&&data.id.trim()){
    const saved=await mark({reservationId:slot.reservationId,state:'sent',providerMessageId:data.id});
    return saved.ok?{ok:true,status:'sent',messageId:data.id}:{ok:false,error:'sent_but_ledger_unconfirmed',status:'uncertain'};
   }
  }
  // Even non-2xx provider responses are conservatively treated as uncertain.
  result='uncertain';
 }catch{result='uncertain';}
 const saved=await mark({reservationId:slot.reservationId,state:'uncertain'});
 return {ok:false,status:'uncertain',error:saved.ok?'gmail_send_unconfirmed':'gmail_send_and_ledger_unconfirmed'};
}
