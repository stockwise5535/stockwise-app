// Pure social-content checks, extracted unchanged from f797b10. No provider or email imports.
const REVIEW_RULES=[
 ['legal_liability',/\b(we (accept|admit|assume) (liability|fault|negligence)|indemnif\w*|settlement offer|pay (?:you )?damages|legal conclusion|warrant(?:y|ies)|guarantee\w*)\b/i],
 ['financial_commitment',/\b(refund\w*|credit (?:you|your|account)|discount\w*|additional payment|compensat\w*|expedit\w* freight|freight cost|price change|pricing change|PO value)\b/i],
 ['commercial_instruction',/\b(change|increase|decrease|cancel|commit|accept|approve|replace)\b.{0,90}\b(order|quantity|supplier|delivery|payment|contract|terms|shipment)\b/i],
 ['contract_commitment',/\b(binding agreement|amend(?:ing)? (?:the |your )?contract|on behalf of (?:the |your )?(?:customer|supplier))\b/i],
 ['unsupported_claim',/\b(guaranteed results|proven \d+%|\d+% (?:improvement|savings)|customer testimonial|customers achieved)\b/i],
 ['sensitive_personal_data',/\b(social security|passport number|medical diagnosis|bank account|credit card number)\b|\b\d{3}-\d{2}-\d{4}\b/i],
 ['unclear_or_ai_copy',/\b(as an ai|ignore (?:all|previous) instructions|delve into|thrilled to|revolutionary|game.changing)\b/i],
]
const BLOCK_RULES=[['threat_or_harassment',/\b(i will (?:kill|hurt) you|pay or (?:else|we expose)|blackmail|racial slur)\b/i],['illegal_or_abusive_intent',/\b(steal (?:their |the )?(?:password|credentials)|evade anti.spam|bypass (?:the )?(?:law|consent)|impersonate (?:a |the )?customer)\b/i]]
export function outboundRiskFlags(text){return [...REVIEW_RULES,...BLOCK_RULES].filter(([,pattern])=>pattern.test(text)).map(([flag])=>flag)}
