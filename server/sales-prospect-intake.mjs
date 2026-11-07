// Offline-only prospect intake. Provider integration must supply independently verified
// licensing, contact basis and region permission. No scraping or contact discovery here.
import { scoreLead } from './sales-lead-pipeline.mjs';

function normalized(value) { return String(value ?? '').trim().toLowerCase(); }
export function normalizeProspect(raw) {
  if (!raw || typeof raw !== 'object') return { accepted:false, reasons:['invalid_record'] };
  const domain = normalized(raw.domain).replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'');
  const email = normalized(raw.email);
  const reasons=[];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) reasons.push('invalid_domain');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push('invalid_email');
  if (!raw.sourceUrl || !/^https:\/\//.test(raw.sourceUrl)) reasons.push('missing_https_provenance');
  if (raw.sourceTermsPermitUse !== true) reasons.push('unlicensed_source');
  if (raw.businessVerified !== true) reasons.push('unverified_business');
  if (raw.contactBasisVerified !== true || raw.regionAllowed !== true) reasons.push('contact_basis_not_cleared');
  if (raw.suppressed !== false) reasons.push('suppression_unknown');
  if (typeof raw.contactBasis !== 'string' || !raw.contactBasis.trim() || typeof raw.jurisdiction !== 'string' || !raw.jurisdiction.trim()) reasons.push('missing_contact_basis_or_jurisdiction');
  const scored = scoreLead(raw);
  reasons.push(...scored.reasons);
  return { accepted:reasons.length===0, reasons:[...new Set(reasons)], score:scored.score,
    prospect: reasons.length===0 ? {domain,email,segment:raw.segment,sourceUrl:raw.sourceUrl,
      sourceObservedAt:raw.sourceObservedAt ?? null,contactBasis:raw.contactBasis ?? null,
      jurisdiction:raw.jurisdiction ?? null, score:scored.score} : null };
}
export function selectProspects(records, maxRecords = 20) {
  if (!Array.isArray(records) || !Number.isSafeInteger(maxRecords) || maxRecords < 0 || maxRecords > 1000)
    return { accepted:[], rejected:[{reasons:['invalid_input']}] };
  const seen = new Set();
  const accepted=[], rejected=[];
  for (const record of records) {
    const result = normalizeProspect(record);
    if (!result.accepted) { rejected.push({reasons:result.reasons}); continue; }
    const key = result.prospect.domain + ':' + result.prospect.email;
    if (seen.has(key)) { rejected.push({reasons:['duplicate_contact']}); continue; }
    seen.add(key);
    accepted.push(result.prospect);
  }
  accepted.sort((a,b)=>b.score-a.score || a.domain.localeCompare(b.domain));
  return {accepted:accepted.slice(0,maxRecords),rejected};
}
