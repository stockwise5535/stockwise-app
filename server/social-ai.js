// Deliberately disabled, including legacy callers. No credential, SDK or transport.
// Fixed approved stock is the only source of public text in this release.
export function createSocialAI(){
  const disabled=async()=>{throw Error('AI_DISABLED_ZERO_COST');};
  return Object.freeze({generate:disabled,review:disabled});
}
