// Public client request only. The server owns identity, price and entitlement decisions.
const pending=new Map()
function requestId(userId,planId){
 const key=`stockwise_checkout_request:${userId}:${planId}`,now=Date.now()
 let saved=pending.get(key)
 try{saved=JSON.parse(sessionStorage.getItem(key)) || saved}catch{/* blocked storage: in-memory fallback */}
 if(!saved||typeof saved.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.id)||!Number.isFinite(saved.createdAt)||saved.createdAt>now||now-saved.createdAt>=23*3600000){saved={id:crypto.randomUUID(),createdAt:now};pending.set(key,saved);try{sessionStorage.setItem(key,JSON.stringify(saved))}catch{/* no credentials stored */}}
 return saved.id
}
export async function beginCheckout({client,planId,fetch:transport=globalThis.fetch}){
 if(!['basic','pro'].includes(planId))throw new Error('Choose a valid plan.')
 const result=await client?.auth.getSession()
 const session=result?.data?.session
 if(result?.error||!session?.access_token||!session.user?.id)throw new Error('Sign in before choosing a plan.')
 const response=await transport('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({planId,requestId:requestId(session.user.id,planId)}),signal:AbortSignal.timeout(15000)})
 let data
 try{data=await response.json()}catch{throw new Error('Checkout could not be confirmed. Retry this request.')}
 if(!response.ok){
  const messages={BILLING_DISABLED:'Billing is not enabled. No payment was created.',AUTH_REQUIRED:'Sign in with a confirmed email before choosing a plan.',SUBSCRIPTION_EXISTS:'An existing subscription needs to be managed before starting another checkout.',CHECKOUT_CONFLICT:'This checkout request has changed. Contact support before starting another payment.'}
  throw new Error(messages[data?.code] || 'Checkout could not be confirmed. Retry this request.')
 }
 let url
 try{url=new URL(data.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password)throw Error()}catch{throw new Error('Checkout could not be confirmed. Retry this request.')}
 return url.href
}
