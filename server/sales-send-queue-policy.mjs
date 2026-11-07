// Pure queue decision. Never call Gmail without a separate durable, atomic
// reservation and a confirmed provider-authenticated sender.
import {evaluateOutreach} from './sales-outreach-policy.mjs';
import {canSendToContact} from './sales-suppression-state.mjs';
export function evaluateQueuedSend(job, ledger, policy) {
 const reasons=[];
 if(!job||typeof job!=='object'||!ledger||typeof ledger!=='object') return {ready:false,reasons:['missing_job_or_ledger']};
 if(!job.idempotencyKey||typeof job.idempotencyKey!=='string') reasons.push('missing_idempotency_key');
 if(ledger.reserved===true||ledger.sent===true||ledger.uncertain!==false) reasons.push('duplicate_or_uncertain_send');
 if(ledger.contactId!==job.contactId) reasons.push('contact_mismatch');
 if(!canSendToContact(ledger.contactState)) reasons.push('suppressed_reply_or_unknown');
 if(job.gmailOAuthVerified!==true) reasons.push('gmail_oauth_not_verified');
 if(job.unsubscribeEndpointVerified!==true) reasons.push('unsubscribe_endpoint_not_verified');
 if(job.senderMailboxVerified!==true) reasons.push('sender_mailbox_not_verified');
 const check=evaluateOutreach(job,policy);
 reasons.push(...check.reasons);
 return {ready:reasons.length===0,reasons};
}
