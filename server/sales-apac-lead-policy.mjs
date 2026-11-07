// APAC lead candidate validation. AI suggestions are untrusted until a human or
// independent source-verification process confirms the official evidence.
// This module NEVER discovers personal emails or authorizes sending.
const COUNTRIES=new Set(['JP','SG','AU']);
const SEGMENTS=new Set(['manufacturing','import_wholesale','ecommerce','sme','startup']);
function validOfficialUrl(value){
 if(typeof value!=='string'||value.length>2048)return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   u.hostname.includes('.')&&!u.hostname.endsWith('.local')&&
   !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
 }catch{return false;}
}
export function assessApacLeadCandidate(candidate){
 const reasons=[];
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))
  return {eligibleForResearch:false,approvedToEmail:false,reasons:['invalid_candidate']};
 if(typeof candidate.companyName!=='string'||candidate.companyName.trim().length<2||candidate.companyName.length>200)reasons.push('invalid_company_name');
 if(!COUNTRIES.has(candidate.countryCode))reasons.push('unsupported_apac_country');
 if(!SEGMENTS.has(candidate.segment))reasons.push('unsupported_segment');
 if(!validOfficialUrl(candidate.officialWebsite))reasons.push('invalid_official_website');
 if(!Array.isArray(candidate.evidenceUrls)||candidate.evidenceUrls.length<1||
    candidate.evidenceUrls.length>5||!candidate.evidenceUrls.every(validOfficialUrl))
  reasons.push('missing_verifiable_evidence');
 // Evidence URLs are references, not proof. An external verifier must check
 // their contents, source permission, freshness and entity match.
 return {eligibleForResearch:reasons.length===0,approvedToEmail:false,reasons};
}
export const APAC_LEAD_POLICY=Object.freeze({
 priorityCountries:['JP','SG','AU'],
 targetSegments:[...SEGMENTS],
 defaultEmailSending:false,
 requirementsBeforeSending:['independent_source_verification','jurisdiction_compliance_review','contact_provenance','suppression_and_reply_check','unsubscribe_verified','explicit_campaign_approval']
});
