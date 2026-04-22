import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export const config = { api: { bodyParser: false } }

async function rawBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Missing STRIPE_WEBHOOK_SECRET' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  const { type, data } = event

  try {
    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const sub = data.object
      const userId = sub.metadata?.userId

      if (userId) {
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          plan: sub.metadata?.planId || 'basic',
          status: sub.status === 'trialing' ? 'active' : sub.status,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      }
    }

    if (type === 'customer.subscription.deleted') {
      const userId = data.object.metadata?.userId
      if (userId) {
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', plan: 'free', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
      }
    }

    if (type === 'invoice.payment_failed') {
      const subscriptionId = data.object.subscription
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const userId = sub.metadata?.userId
        if (userId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('user_id', userId)
        }
      }
    }

    return res.json({ received: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
