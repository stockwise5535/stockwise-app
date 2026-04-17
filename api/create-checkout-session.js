import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ALLOWED_PRICE_IDS = new Set([
  process.env.VITE_STRIPE_PRICE_BASIC,
  process.env.VITE_STRIPE_PRICE_PRO,
  process.env.VITE_STRIPE_PRICE_ENTERPRISE,
].filter(Boolean));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, userId, userEmail, planId } = req.body || {};

    if (!priceId) {
      return res.status(400).json({ error: 'priceId が送られていません' });
    }

    if (!ALLOWED_PRICE_IDS.has(priceId)) {
      return res.status(400).json({ error: '許可されていない priceId です' });
    }

    const origin =
      req.headers.origin || 'https://stockwise-app-1qz9.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      customer_email: userEmail || undefined,

      client_reference_id: userId
        ? String(userId)
        : undefined,

      // checkout session用 metadata
      metadata: {
        userId: userId ? String(userId) : '',
        planId: planId || '',
      },

      // ★ これが重要（subscriptionイベント用）
      subscription_data: {
        metadata: {
          userId: userId ? String(userId) : '',
          planId: planId || '',
        },
      },

      success_url:
        `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${origin}/pricing?canceled=true`,
    });

    return res.status(200).json({
      url: session.url,
    });

  } catch (error) {
    console.error('Stripe checkout session error:', error);

    return res.status(500).json({
      error:
        error.message ||
        'Checkout Session作成に失敗しました',
    });
  }
}