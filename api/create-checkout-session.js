import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY

    // ローカル開発では env が読めなくても 3000 を使う
    const appUrl =
      process.env.VITE_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'

    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY が未設定です' })
    }

    const stripe = new Stripe(stripeSecretKey)

    const { priceId, userId, userEmail, planId } = req.body || {}

    if (!priceId) return res.status(400).json({ error: 'priceId がありません' })
    if (!userId) return res.status(400).json({ error: 'userId がありません' })
    if (!userEmail) return res.status(400).json({ error: 'userEmail がありません' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancel`,
      metadata: {
        userId,
        planId: planId || 'basic',
      },
      allow_promotion_codes: true,
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    console.error('create-checkout-session error:', error)
    return res.status(500).json({
      error: error?.message || 'create-checkout-session で不明なエラーが発生しました',
    })
  }
}