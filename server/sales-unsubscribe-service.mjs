// Opt-out application boundary. This module never trusts an unsigned contact
// identifier and never acknowledges success before durable suppression commits.
import {verifyUnsubscribeToken} from './sales-unsubscribe-token.mjs';
export async function processSalesUnsubscribe({token,secret,now,commitSuppression}) {
 const verified=verifyUnsubscribeToken(token,secret,{now});
 if(!verified.ok) return {status:400,body:{ok:false,error:'invalid_or_expired_link'}};
 if(typeof commitSuppression!=='function') return {status:503,body:{ok:false,error:'suppression_storage_unavailable'}};
 try {
  // Adapter MUST be an atomic, durable DB operation. It must be idempotent
  // and mark contact suppressed before returning {committed:true}.
  const result=await commitSuppression({organizationId:verified.organizationId,contactId:verified.contactId});
  if(result?.committed!==true) return {status:503,body:{ok:false,error:'suppression_not_confirmed'}};
  return {status:200,body:{ok:true,message:'You have been unsubscribed.'}};
 } catch {
  return {status:503,body:{ok:false,error:'suppression_storage_unavailable'}};
 }
}
