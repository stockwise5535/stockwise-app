export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {})

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL' })
    }
    if (!serviceRoleKey) {
      return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })
    }

    const row = {
      user_id: body.user_id || null,
      user_email: body.user_email || null,
      company_name: body.company_name || null,
      contact_name: body.contact_name || null,
      email: body.email || null,
      item_count: body.item_count || null,
      preferred_language: body.preferred_language || body.lang || 'ja',
      current_process: body.current_process || null,
      pain_point: body.pain_point || null,
      lang: body.lang || 'ja',
      source: body.source || 'stockwise_beta',
    }

    if (!row.email) {
      return res.status(400).json({ error: 'Missing email' })
    }

    const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/early_access_requests`
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }

    const ins = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(row),
    })

    if (!ins.ok) {
      const text = await ins.text()
      return res.status(ins.status).json({ error: `Supabase insert failed: ${text}` })
    }

    const data = await ins.json().catch(() => [])
    return res.status(200).json({ ok: true, request: Array.isArray(data) ? data[0] : data })
  } catch (error) {
    console.error('save-early-access error:', error)
    return res.status(500).json({ error: error.message || 'Save Early Access request failed' })
  }
}
