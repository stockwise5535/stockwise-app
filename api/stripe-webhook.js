export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Minimal webhook receiver for early access testing.
  // Subscription entitlement updates can be added here later.
  return res.status(200).json({ received: true })
}
