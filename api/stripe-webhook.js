import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  const chunks = []
  for await (const c of req) {
    chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  }
  return Buffer.concat(chunks)
}

function mapPlanFromPriceId(priceId) {
  if (
    priceId === process.env.STRIPE_PRICE_PRO ||
    priceId === process.env.VITE_STRIPE_PRICE_PRO
  ) {
    return 'pro'
  }

  if (
    priceId === process.env.STRIPE_PRICE_BASIC ||
    priceId === process.env.VITE_STRIPE_PRICE_BASIC
  ) {
    return 'basic'
  }

  return 'basic'
}

async function resolveUserIdFromSubscription(subscription) {
  const metaUserId = subscription?.metadata?.userId
  if (metaUserId) return metaUserId

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id

  if (!customerId) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (error) throw error
  return data?.user_id || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  try {
    const sig = req.headers['stripe-signature']
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!sig || !webhookSecret) {
      return res.status(400).send('Missing signature or webhook secret')
    }

    const body = await rawBody(req)
    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret)

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const item = subscription.items?.data?.[0]
        const priceId = item?.price?.id || null
        const plan = mapPlanFromPriceId(priceId)

        const stripeCustomerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id

        const userId = await resolveUserIdFromSubscription(subscription)

        if (!userId) throw new Error('userId が解決できませんでした')

        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              plan,
              status: subscription.status || 'active',
              stripe_customer_id: stripeCustomerId || null,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )

        if (error) throw error
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = await resolveUserIdFromSubscription(subscription)

        if (!userId) throw new Error('userId が解決できませんでした')

        const { error } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              plan: 'basic',
              status: 'canceled',
              stripe_customer_id:
                typeof subscription.customer === 'string'
                  ? subscription.customer
                  : subscription.customer?.id || null,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )

        if (error) throw error
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id || null

        if (customerId) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId)

          if (error) throw error
        }
        break
      }

      default:
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('stripe-webhook error:', err)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
}