import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { priceId, userId, userEmail, planId } = req.body
  if (!priceId || !userId) return res.status(400).json({ error: 'Missing priceId or userId' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { userId, planId: planId || 'basic' },
      },
      success_url: `${process.env.VITE_APP_URL}?payment=success`,
      cancel_url:  `${process.env.VITE_APP_URL}?payment=cancelled`,
      metadata: { userId, planId: planId || 'basic' },
      locale: 'auto',
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
