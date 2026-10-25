import Stripe from 'stripe'
import {createClient} from '@supabase/supabase-js'
import {billingConfig,billingFailure,BillingError,UUID,CHECKOUT_VERSION,billingFetch} from '../services/billing-config.js'
export const config={api:{bodyParser:false}}
async function rawBody(req){
 const chunks=[];let length=0
 for await(const chunk of req){length+=Buffer.byteLength(chunk);if(length>1048576)throw new BillingError(413,'INVALID_EVENT','Webhook body too large.');chunks.push(Buffer.from(chunk))}
 return Buffer.concat(chunks)
}
const invalid=()=>new BillingError(409,'BILLING_REVIEW_REQUIRED','Subscription requires billing review; no entitlement was changed.')
export function createWebhookHandler({env=process.env,stripeFactory=key=>new Stripe(key,{maxNetworkRetries:0,timeout:10000}),adminFactory=(url,key)=>createClient(url,key,{global:{fetch:billingFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
  try{
   const settings=billingConfig(env,{webhook:true})
   const stripe=stripeFactory(env.STRIPE_SECRET_KEY)
   let event
   const body=await rawBody(req)
   try{event=stripe.webhooks.constructEvent(body,req.headers?.['stripe-signature'],env.STRIPE_WEBHOOK_SECRET)}catch{throw new BillingError(400,'INVALID_SIGNATURE','Invalid webhook signature.')}
   if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.payment_failed'].includes(event.type))return res.status(200).json({received:true})
   const object=event.data?.object
   const reference=event.type==='invoice.payment_failed'?(object?.parent?.subscription_details?.subscription || object?.subscription):object?.id
   const id=typeof reference==='string'?reference:reference?.id
   if(typeof id!=='string'||!/^sub_[a-zA-Z0-9]+$/.test(id))throw invalid()
   // Fetch current provider state instead of applying a delayed event's old payload.
   const subscription=await stripe.subscriptions.retrieve(id)
   const metadata=subscription.metadata
   const items=subscription.items?.data
   const plan=Object.keys(settings.prices).find(p=>settings.prices[p]===items?.[0]?.price?.id)
   if(subscription.id!==id||!metadata||metadata.checkout_version!==CHECKOUT_VERSION||!UUID.test(metadata.userId)||!UUID.test(metadata.request_id)||!plan||plan!==metadata.planId||items.length!==1||items[0].quantity!==1||!items[0].price.recurring)throw invalid()
   const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id
   if(typeof customer!=='string'||!/^cus_[a-zA-Z0-9]+$/.test(customer))throw invalid()
   const admin=adminFactory(settings.url,settings.key)
   const account=await admin.auth.admin.getUserById(metadata.userId)
   if(account.error||account.data?.user?.id!==metadata.userId||!account.data.user.email_confirmed_at)throw invalid()
   // A subscription/customer can never be reassigned through changed provider metadata.
   const bound=await admin.from('subscriptions').select('user_id,stripe_customer_id').eq('stripe_subscription_id',id).maybeSingle()
   if(bound.error)throw Error('Account lookup unavailable')
   if(bound.data&&(bound.data.user_id!==metadata.userId||bound.data.stripe_customer_id!==customer))throw invalid()
   const existing=await admin.from('subscriptions').select('stripe_subscription_id,stripe_customer_id,status').eq('user_id',metadata.userId).maybeSingle()
   if(existing.error)throw Error('Account lookup unavailable')
   if(existing.data?.stripe_subscription_id && existing.data.stripe_subscription_id!==id && !['canceled','incomplete_expired','free'].includes(existing.data.status))throw invalid()
   const status=subscription.status
   if(!['trialing','active','past_due','unpaid','incomplete','incomplete_expired','canceled','paused'].includes(status))throw invalid()
   // Newer Stripe versions provide period bounds on the subscription item.
   const period=subscription.current_period_end ?? items[0].current_period_end
   if(!Number.isSafeInteger(period)||period<=0)throw invalid()
   const result=await admin.from('subscriptions').upsert({user_id:metadata.userId,stripe_subscription_id:id,stripe_customer_id:customer,plan:status==='canceled'?'free':plan,status:status==='trialing'?'active':status,current_period_end:new Date(period*1000).toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id'})
   if(result.error)throw Error('Entitlement persistence unavailable')
   return res.status(200).json({received:true})
  }catch(error){return billingFailure(res,error)}
 }
}
export default createWebhookHandler()
