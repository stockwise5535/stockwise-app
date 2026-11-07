// Fail-closed preflight for a future autonomous sales pipeline.
// This module never discovers contacts, sends messages, or calls an AI API.
const CHANNELS = new Set(['email', 'linkedin', 'threads', 'x']);
const REQUIRED = ['organizationId', 'campaignId', 'contactId', 'sourceUrl', 'jurisdiction', 'contactBasis'];

export function evaluateOutreach(candidate, state = {}) {
  const reasons = [];
  if (!candidate || typeof candidate !== 'object') return { allowed: false, reasons: ['invalid_candidate'] };
  const channel = String(candidate.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) reasons.push('unsupported_channel');
  for (const key of REQUIRED) if (typeof candidate[key] !== 'string' || !candidate[key].trim()) reasons.push('missing_' + key);
  if (state.globalStop !== false) reasons.push('global_stop_or_unconfigured');
  if (state.productionEnabled !== true) reasons.push('production_disabled');
  if (state.channelEnabled?.[channel] !== true) reasons.push('channel_disabled');
  if (state.providerAuthorized?.[channel] !== true) reasons.push('provider_not_authorized');
  if (candidate.contactBasisVerified !== true) reasons.push('unverified_contact_basis');
  if (candidate.regionAllowed !== true) reasons.push('region_not_cleared');
  if (candidate.suppressed !== false) reasons.push('suppression_unknown_or_true');
  if (candidate.duplicate !== false) reasons.push('duplicate_unknown_or_true');
  if (candidate.deliveryUncertain !== false) reasons.push('delivery_uncertain');
  if (candidate.replyReceived !== false) reasons.push('reply_unknown_or_received');
  if (candidate.templateApproved !== true) reasons.push('template_not_approved');
  if (candidate.identityVerified !== true) reasons.push('sender_identity_not_verified');
  if (channel === 'email' && candidate.unsubscribeReady !== true) reasons.push('unsubscribe_not_ready');
  if (!Number.isSafeInteger(state.dailyLimit?.[channel]) || state.dailyLimit[channel] <= 0) reasons.push('invalid_daily_limit');
  if (!Number.isSafeInteger(state.sentToday?.[channel]) || state.sentToday[channel] < 0) reasons.push('unknown_daily_count');
  if (Number.isSafeInteger(state.dailyLimit?.[channel]) && Number.isSafeInteger(state.sentToday?.[channel]) &&
      state.sentToday[channel] >= state.dailyLimit[channel]) reasons.push('daily_limit_reached');
  if (candidate.sourceTermsPermitUse !== true) reasons.push('source_terms_unverified');
  if (candidate.approvedProviderOperation !== true) reasons.push('operation_not_permitted');
  return { allowed: reasons.length === 0, reasons };
}
