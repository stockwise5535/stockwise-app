// Deterministic marketing email drafting. No API calls, network, or send side effects.
const SUBJECTS = {
 manufacturing: 'Inventory planning for manufacturing teams',
 import_wholesale: 'A simpler way to review inventory and replenishment',
 ecommerce: 'Inventory visibility for growing ecommerce operations',
 distribution: 'Inventory and replenishment review for distributors'
};
const COPY = {
 manufacturing: 'Stockwise helps teams review inventory coverage and replenishment decisions using their inventory data.',
 import_wholesale: 'Stockwise supports inventory coverage and reorder reviews using uploaded inventory data.',
 ecommerce: 'Stockwise provides inventory visibility and planning workflows for teams managing product stock.',
 distribution: 'Stockwise helps teams review inventory coverage and replenishment needs.'
};
function clean(value, max) {
 const s=String(value??'').trim();
 if (!s || s.length>max || /[\r\n<>]/.test(s)) return null;
 return s;
}
export function composeBusinessEmail(input) {
 if (!input || typeof input!=='object') return {ok:false,reasons:['invalid_input']};
 const reasons=[];
 const segment=clean(input.segment,40);
 const business=clean(input.businessName,120);
 const sender=clean(input.senderName,120);
 const address=clean(input.postalAddress,240);
 const url=clean(input.trialUrl,500);
 const optOut=clean(input.unsubscribeUrl,500);
 if (!business) reasons.push('missing_business_name');
 if (!sender || !address) reasons.push('missing_sender_identity');
 if (!COPY[segment]) reasons.push('unsupported_segment');
 for(const [key,val] of [['trial_url',url],['unsubscribe_url',optOut]]) {
   if (!val || !/^https:\/\/[^\s]+$/i.test(val)) reasons.push('invalid_'+key);
 }
 if (input.templateApproved!==true) reasons.push('template_not_approved');
 if (input.companyClaimsVerified!==true) reasons.push('claims_not_verified');
 if (reasons.length) return {ok:false,reasons};
 return {ok:true,subject:SUBJECTS[segment],body:`Hello,

I'm reaching out from ${sender} about Stockwise.

${COPY[segment]}

If inventory planning is a current priority for ${business}, you can learn more about the free trial here:
${url}

If this isn't relevant, no action is needed.

${sender}
${address}

Unsubscribe: ${optOut}`};
}
