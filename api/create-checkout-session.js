import Stripe from 'stripe'
import {createClient} from '@supabase/supabase-js'
import {createHash} from 'node:crypto'
import {billingConfig,billingFailure,BillingError,UUID,CHECKOUT_VERSION,billingFetch} from '../services/billing-config.js'

export function createCheckoutHandler({env=process.env,stripeFactory=key=>new Stripe(key,{maxNetworkRetries:0,timeout:10000}),authFactory=(url,key,authorization)=>createClient(url,key,{global:{fetch:billingFetch,headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
  try{
   const config=billingConfig(env)
   const authorization=req.headers?.authorization
   if(typeof authorization!=='string'||authorization.length>8192||!/^Bearer \S+$/i.test(authorization))throw new BillingError(401,'AUTH_REQUIRED','Sign in before choosing a plan.')
   // getUser validates the bearer token with Auth; getSession/local JWT decoding is not authentication.
   let result
   const auth=authFactory(config.url,config.key,authorization)
   try{result=await auth.auth.getUser(authorization.slice(7))}catch{throw new BillingError(503,'AUTH_UNAVAILABLE','Sign-in could not be verified. Please retry.')}
   const user=result?.data?.user
   if(result?.error||!user||!UUID.test(user.id)||user.role!=='authenticated'||!user.email||!user.email_confirmed_at)throw new BillingError(401,'AUTH_REQUIRED','Sign in with a confirmed email before choosing a plan.')
   let body=req.body
   if(typeof body==='string'){
    if(Buffer.byteLength(body)>1024)throw new BillingError(400,'INVALID_REQUEST','Choose a valid plan and retry.')
    try{body=JSON.parse(body)}catch{throw new BillingError(400,'INVALID_REQUEST','Choose a valid plan and retry.')}
   }
   // Per-user legacy billing, not workspace billing. No browser identity/account/price fields accepted.
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||!Object.keys(body).every(k=>['planId','requestId'].includes(k))||typeof body.planId!=='string'||!Object.hasOwn(config.prices,body.planId)||typeof body.requestId!=='string'||!UUID.test(body.requestId))throw new BillingError(400,'INVALID_REQUEST','Choose a valid plan and retry. Account and price overrides are not accepted.')
   const existing=await auth.from('subscriptions').select('status').eq('user_id',user.id).maybeSingle()
   if(existing.error)throw new BillingError(503,'BILLING_UNAVAILABLE','Your billing account could not be verified. Please retry.')
   if(existing.data&&!['free','canceled','incomplete_expired'].includes(existing.data.status))throw new BillingError(409,'SUBSCRIPTION_EXISTS','An existing subscription needs to be managed before starting another checkout.')
   const metadata={userId:user.id,planId:body.planId,checkout_version:CHECKOUT_VERSION,request_id:body.requestId}
   const idempotencyKey='legacy-checkout-v1-'+createHash('sha256').update(`${user.id}:${body.requestId}`).digest('hex')
   const stripe=stripeFactory(env.STRIPE_SECRET_KEY)
   let session
   try{
    session=await stripe.checkout.sessions.create({mode:'subscription',payment_method_types:['card'],customer_email:user.email,client_reference_id:user.id,line_items:[{price:config.prices[body.planId],quantity:1}],subscription_data:{trial_period_days:14,metadata},success_url:config.origin+'/?payment=success',cancel_url:config.origin+'/?payment=cancelled',metadata,locale:'auto'},{idempotencyKey})
   }catch(error){
    if(error?.type==='StripeIdempotencyError')throw new BillingError(409,'CHECKOUT_CONFLICT','This checkout request has changed. Close this window and choose your plan again.')
    throw error
   }
   const redirect=new URL(session.url)
   if(redirect.protocol!=='https:'||redirect.hostname!=='checkout.stripe.com'||redirect.username||redirect.password)throw Error('Invalid checkout URL')
   return res.status(200).json({url:redirect.href})
  }catch(error){return billingFailure(res,error)}
 }
}
export default createCheckoutHandler()
