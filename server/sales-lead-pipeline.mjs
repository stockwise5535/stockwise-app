// Pure, zero-AI-API lead ranking and follow-up eligibility.
// No network requests or provider writes are performed here.
const SEGMENTS = new Set(['manufacturing', 'import_wholesale', 'ecommerce', 'distribution']);
export function scoreLead(lead) {
  if (!lead || typeof lead !== 'object') return { eligible:false, score:0, reasons:['invalid_lead'] };
  const reasons=[];
  if (!SEGMENTS.has(lead.segment)) reasons.push('segment_not_targeted');
  if (lead.sourceTermsPermitUse !== true || !lead.sourceUrl) reasons.push('source_not_verified');
  if (lead.businessVerified !== true) reasons.push('business_not_verified');
  if (lead.contactBasisVerified !== true || lead.regionAllowed !== true) reasons.push('contact_not_cleared');
  if (lead.suppressed !== false) reasons.push('suppression_unknown');
  const eligible = reasons.length === 0;
  const score = eligible ? Math.min(100, 40 + (lead.inventoryPainVerified === true ? 30 : 0) +
    (lead.csvWorkflowVerified === true ? 15 : 0) + (lead.trialInterestVerified === true ? 15 : 0)) : 0;
  return { eligible, score, reasons };
}
export function evaluateFollowUp(entry, policy = {}) {
  const reasons=[];
  if (!entry || typeof entry !== 'object') return { allowed:false, reasons:['invalid_entry'] };
  if (policy.globalStop !== false || policy.followUpsEnabled !== true) reasons.push('disabled');
  if (entry.status !== 'delivered') reasons.push('not_confirmed_delivered');
  if (entry.replyReceived !== false) reasons.push('reply_or_unknown');
  if (entry.unsubscribed !== false || entry.bounced !== false || entry.complained !== false) reasons.push('suppression_or_unknown');
  if (entry.deliveryUncertain !== false) reasons.push('delivery_uncertain');
  if (entry.contactBasisStillValid !== true || entry.providerAuthorized !== true) reasons.push('authorization_missing');
  if (!Number.isSafeInteger(entry.followUpsSent) || entry.followUpsSent < 0 ||
      !Number.isSafeInteger(policy.maxFollowUps) || policy.maxFollowUps < 0 ||
      entry.followUpsSent >= policy.maxFollowUps) reasons.push('follow_up_limit');
  if (!Number.isFinite(entry.nextEligibleAt) || !Number.isFinite(policy.now) ||
      policy.now < entry.nextEligibleAt) reasons.push('cooldown_or_unknown');
  return { allowed:reasons.length===0, reasons };
}
