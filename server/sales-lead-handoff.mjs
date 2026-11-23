// Human/source verification is separate from sending approval. Never produces
// email addresses, EmailQueue rows or status NEW/REVIEW_NEEDED.
export function verifiedResearchCandidates(candidates,reviews,{now=new Date()}={}){
 if(!Array.isArray(reviews)||reviews.length>2000)throw Error('OFFICIAL_REVIEWS_REQUIRED');
 const output=[];
 for(const candidate of candidates){
  const matches=reviews.filter(r=>r.companyName===candidate.companyName&&r.countryCode===candidate.countryCode&&r.officialWebsite===candidate.officialWebsite);
  if(matches.length!==1)continue;
  const r=matches[0],checked=Date.parse(r.checkedAt);
  if(!r.reviewedBy||!Number.isFinite(checked)||checked>now.getTime()||now.getTime()-checked>30*86400000||typeof r.businessRelevance!=='string'||r.businessRelevance.trim().length<20)continue;
  try{
   const official=new URL(candidate.officialWebsite),evidence=new URL(r.officialEvidenceUrl),contact=new URL(r.contactUrl);
   if([evidence,contact].some(u=>u.protocol!=='https:'||u.username||u.password||u.hostname!==official.hostname)||!['contact_form','business_enquiry_page'].includes(r.contactMethod))continue;
  }catch{continue;}
  // Availability of a public form is NOT consent to email or a legal opinion.
  output.push({...candidate,officialVerification:{verified:true,reviewedBy:r.reviewedBy,checkedAt:r.checkedAt,officialEvidenceUrl:r.officialEvidenceUrl,businessRelevance:r.businessRelevance,contactUrl:r.contactUrl,contactMethod:r.contactMethod,legalReviewStatus:'pending'},approvedToEmail:false});
 }
 return output;
}
