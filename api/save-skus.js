export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {})

    const userId = body.userId || body.user_id
    const rows = Array.isArray(body.rows) ? body.rows : []

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' })
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL' })
    }

    if (!serviceRoleKey) {
      return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })
    }

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }

    const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/skus`

    // Replace this user's item set. This prevents old Supplier A/B/C or old demo rows from surviving on other PCs.
    const del = await fetch(`${base}?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers,
    })

    if (!del.ok) {
      const text = await del.text()
      return res.status(del.status).json({ error: `Supabase delete failed: ${text}` })
    }

    const cleanRows = rows
      .filter(row => row && row.user_id === userId && row.name)
      .map(row => ({
        user_id: row.user_id,
        name: row.name,
        supplier: row.supplier || null,
        stock_qty: Number(row.stock_qty || 0),
        daily_usage: Number(row.daily_usage || 0),
        lead_time: Number(row.lead_time || 7),
        safety_stock: row.safety_stock == null || row.safety_stock === '' ? null : Number(row.safety_stock || 0),
        moq: row.moq == null || row.moq === '' ? null : Number(row.moq || 0),
        unit_cost: row.unit_cost == null || row.unit_cost === '' ? null : Number(row.unit_cost || 0),
      }))

    if (cleanRows.length) {
      const ins = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(cleanRows),
      })

      if (!ins.ok) {
        const text = await ins.text()
        return res.status(ins.status).json({ error: `Supabase insert failed: ${text}` })
      }
    }

    return res.status(200).json({ ok: true, count: cleanRows.length })
  } catch (error) {
    console.error('save-skus error:', error)
    return res.status(500).json({ error: error.message || 'Save SKUs failed' })
  }
}
