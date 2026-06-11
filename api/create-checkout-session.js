export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {})

    const secretKey = process.env.STRIPE_SECRET_KEY
    const priceId = body.priceId || process.env.STRIPE_PRICE_BASIC
    const appUrl = process.env.VITE_APP_URL || `https://${req.headers.host}`

    if (!secretKey) {
      return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' })
    }

    if (!priceId) {
      return res.status(500).json({ error: 'Missing STRIPE_PRICE_BASIC' })
    }

    const params = new URLSearchParams()
    params.append('mode', 'subscription')
    params.append('line_items[0][price]', priceId)
    params.append('line_items[0][quantity]', '1')
    params.append('success_url', `${appUrl}/?checkout=success`)
    params.append('cancel_url', `${appUrl}/?checkout=cancelled`)

    if (body.email) params.append('customer_email', body.email)

    params.append('metadata[userId]', body.userId || body.user_id || '')
    params.append('metadata[reason]', body.reason || 'upgrade')
    params.append('metadata[plan]', body.plan || 'basic')

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const data = await stripeRes.json()

    if (!stripeRes.ok) {
      return res.status(stripeRes.status).json({
        error: data?.error?.message || 'Stripe Checkout session failed',
      })
    }

    return res.status(200).json({ url: data.url })
  } catch (error) {
    console.error('create-checkout-session error:', error)
    return res.status(500).json({ error: error.message || 'Checkout session failed' })
  }
}
