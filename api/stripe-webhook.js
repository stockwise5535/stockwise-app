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
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let event
  try {
    const buf = await rawBody(req)
    event = stripe.webhooks.constructEvent(
      buf,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  const { type, data } = event

  try {
    // ✅ 決済成功（ここが一番重要）
    if (type === 'checkout.session.completed') {
      const session = data.object

      const userId = session.metadata?.userId
      const planId = session.metadata?.planId || 'pro'

      // subscriptions テーブル更新
      if (userId) {
        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            plan: planId,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }

      // ✅ profiles を Pro に変更（これが超重要）
      if (session.customer_email) {
        await supabase
          .from('profiles')
          .update({ plan: 'pro' })
          .eq('email', session.customer_email)
      }
    }

    // サブスク更新
    if (
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated'
    ) {
      const sub = data.object

      const userId = sub.metadata?.userId
      const planId = sub.metadata?.planId || 'pro'

      if (userId) {
        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer,
            plan: planId,
            status: sub.status === 'trialing' ? 'active' : sub.status,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }
    }

    // ❌ 解約 → freeに戻す
    if (type === 'customer.subscription.deleted') {
      const sub = data.object
      const userId = sub.metadata?.userId

      if (userId) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            plan: 'free',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
      }

      // profilesもfreeに戻す
      if (sub.customer) {
        const customer = await stripe.customers.retrieve(sub.customer)

        if (customer.email) {
          await supabase
            .from('profiles')
            .update({ plan: 'free' })
            .eq('email', customer.email)
        }
      }
    }

    // 支払い失敗
    if (type === 'invoice.payment_failed') {
      const invoice = data.object

      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        const userId = sub.metadata?.userId

        if (userId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
        }
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}