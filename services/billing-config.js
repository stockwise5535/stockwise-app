// Server-only billing policy. Never import from browser code.
export class BillingError extends Error {
 constructor(status,code,message){super(message);this.status=status;this.code=code}
}
export const unavailable=()=>new BillingError(503,'BILLING_UNAVAILABLE','Billing is unavailable. No payment was created.')
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const CHECKOUT_VERSION='authenticated_v1'
export const billingFetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})
export function billingConfig(env,{webhook=false}={}){
 if(env.NEXOPS_BILLING_ENABLED!=='true')throw new BillingError(503,'BILLING_DISABLED','Billing is not enabled. No payment was created.')
 const prices={basic:env.STRIPE_PRICE_BASIC,pro:env.STRIPE_PRICE_PRO}
 const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL
 const key=webhook?env.SUPABASE_SERVICE_ROLE_KEY:(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
 if(!env.STRIPE_SECRET_KEY || !url || !key || Object.values(prices).some(p=>typeof p!=='string'||!/^price_[a-zA-Z0-9]+$/.test(p)) || prices.basic===prices.pro)throw unavailable()
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error()}catch{throw unavailable()}
 if(webhook){if(!env.STRIPE_WEBHOOK_SECRET)throw unavailable();return {prices,url,key}}
 let origin
 try{const u=new URL(env.BILLING_RETURN_ORIGIN);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin}catch{throw unavailable()}
 return {prices,url,key,origin}
}
export function billingFailure(res,error){
 const safe=error instanceof BillingError?error:new BillingError(503,'BILLING_UNAVAILABLE','Checkout could not be confirmed. Retry your request; do not start another payment.')
 return res.status(safe.status).json({code:safe.code,error:safe.message})
}
