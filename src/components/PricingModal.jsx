import { useState } from 'react'

const JP = 'ja'
const F = 'Arial,Helvetica,sans-serif'

const copy = (lang, ja, en) => lang === JP ? ja : en

export default function PricingModal({ user, lang='en', onClose }) {
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

  const plans = [
    {
      id: 'basic',
      name: 'Stockwise',
      price: '$49.99',
      sub: copy(lang, '2件目の品目から適用', 'Applies from the 2nd Superset'),
      priceKey: 'VITE_STRIPE_PRICE_BASIC',
      features: [
        copy(lang, '仕入先別の13週在庫ヒートマップ', '13-week supplier inventory heatmap'),
        copy(lang, 'CSV連携による発注候補品目・輸入数量予定の更新', 'CSV-based order candidate and inbound plan updates'),
        copy(lang, '実際消費量に基づく発注シミュレーション', 'Order simulation based on actual consumption'),
      ],
    },
    {
      id: 'pro',
      name: 'Stockwise Pro',
      price: '$149',
      sub: copy(lang, '運用連携を拡張', 'Expanded operations integrations'),
      priceKey: 'VITE_STRIPE_PRICE_PRO',
      features: [
        '3PL',
        copy(lang, '自社輸送', 'Own transportation'),
        'API',
        copy(lang, 'Slack通知', 'Slack notifications'),
        copy(lang, '優先サポート', 'Priority support'),
      ],
    },
  ]

  async function checkout(plan) {
    setError(null)
    setLoading(plan.id)
    try {
      const priceId = import.meta.env[plan.priceKey]
      if (!priceId) throw new Error(copy(lang, `${plan.priceKey} が未設定です。`, `${plan.priceKey} is missing.`))
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          planId: plan.id,
          userId: user?.id,
          userEmail: user?.email,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || copy(lang, '決済ページを作成できませんでした。', 'Could not create checkout session.'))
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setLoading(null)
    }
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.62)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:F }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'min(760px, 100%)', maxHeight:'90vh', overflowY:'auto', background:'linear-gradient(180deg,#082947,#041d36)', border:'1px solid #173e64', borderRadius:16, padding:24, color:'#f8fbff', boxShadow:'0 24px 80px rgba(0,0,0,.45)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:18 }}>
          <div>
            <h2 style={{ margin:'0 0 6px', fontSize:26, fontWeight:900 }}>Stockwise</h2>
            <p style={{ margin:0, color:'#9ab2cc', lineHeight:1.6 }}>{copy(lang, '2件目の品目から有料プランが適用されます。', 'Paid plan applies from the 2nd Superset.')}</p>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.08)', border:'1px solid #173e64', color:'#f8fbff', borderRadius:8, width:36, height:36, cursor:'pointer', fontSize:20 }}>×</button>
        </div>

        {error && <div style={{ border:'1px solid #ff465d', background:'rgba(255,70,93,.12)', color:'#ff9aaa', borderRadius:10, padding:12, marginBottom:16, fontWeight:700 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16 }}>
          {plans.map(plan => (
            <div key={plan.id} style={{ border:'1px solid #173e64', background:'rgba(6,34,61,.72)', borderRadius:14, padding:20 }}>
              <div style={{ fontSize:13, color:'#9ab2cc', fontWeight:900, letterSpacing:'.08em', textTransform:'uppercase' }}>{plan.name}</div>
              <div style={{ marginTop:8, fontSize:34, fontWeight:900 }}>{plan.price}<span style={{ fontSize:14, color:'#9ab2cc', marginLeft:4 }}>/mo</span></div>
              <div style={{ marginTop:6, color:'#cbd9e8', fontSize:14 }}>{plan.sub}</div>
              <ul style={{ listStyle:'none', padding:0, margin:'18px 0', display:'grid', gap:10 }}>
                {plan.features.map(f => <li key={f} style={{ display:'flex', gap:8, color:'#e6f1fb', lineHeight:1.45 }}><span style={{ color:'#22c985', fontWeight:900 }}>✓</span><span>{f}</span></li>)}
              </ul>
              <button onClick={()=>checkout(plan)} disabled={loading===plan.id} style={{ width:'100%', border:'1px solid #3b82f6', background:'rgba(59,130,246,.18)', color:'#8fc2ff', borderRadius:10, padding:'12px 14px', fontWeight:900, fontFamily:F, cursor:'pointer', opacity:loading===plan.id ? .6 : 1 }}>
                {loading===plan.id ? copy(lang, '処理中...', 'Processing...') : copy(lang, 'このプランを選択', 'Choose this plan')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
