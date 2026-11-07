// Read-only planning stage: never sends messages or performs external requests.
import {selectProspects} from './sales-prospect-intake.mjs';
import {evaluateOutreach} from './sales-outreach-policy.mjs';
import {composeBusinessEmail} from './sales-email-template.mjs';
export function planEmailCampaign(records, settings={}) {
 const {accepted,rejected}=selectProspects(records, settings.maxProspects ?? 20);
 const planned=[], blocked=[...rejected.map(x=>({reasons:x.reasons}))];
 for(const lead of accepted) {
   const draft=composeBusinessEmail({
     segment:lead.segment,businessName:settings.businessNames?.[lead.domain],
     senderName:settings.senderName,postalAddress:settings.postalAddress,
     trialUrl:settings.trialUrl,unsubscribeUrl:settings.unsubscribeUrls?.[lead.email],
     templateApproved:settings.templateApproved,companyClaimsVerified:settings.companyClaimsVerified
   });
   const decision=evaluateOutreach({
     channel:'email',organizationId:settings.organizationId,campaignId:settings.campaignId,
     contactId:lead.email,sourceUrl:lead.sourceUrl,jurisdiction:lead.jurisdiction,
     contactBasis:lead.contactBasis,contactBasisVerified:true,regionAllowed:true,
     suppressed:settings.suppressionVerified?.[lead.email]===true ? false : true,
     duplicate:settings.dedupVerified?.[lead.email]===true ? false : true,
     deliveryUncertain:settings.deliveryClear?.[lead.email]===true ? false : true,
     replyReceived:settings.noReplyVerified?.[lead.email]===true ? false : true,
     templateApproved:settings.templateApproved,identityVerified:settings.identityVerified,
     unsubscribeReady:draft.ok,sourceTermsPermitUse:true,approvedProviderOperation:settings.emailOperationAuthorized
   },settings);
   if(draft.ok && decision.allowed) planned.push({recipient:lead.email,subject:draft.subject,body:draft.body});
   else blocked.push({contact:lead.email,reasons:[...(!draft.ok?draft.reasons:[]),...decision.reasons]});
 }
 return {planned,blocked}; // drafts only; requires separate durable send ledger and transport
}
