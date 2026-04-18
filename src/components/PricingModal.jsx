import { useState } from 'react'

const PLANS = [
  {
    id: 'basic', name: 'StockWise', price: '$49', period: '/月',
    desc: '小規模EC・小売向け',
    priceEnvKey: 'VITE_STRIPE_PRICE_BASIC',
    features: [
      { text: 'SKU 50品目まで',            ok: true },
      { text: 'ダッシュボード・ヒートマップ', ok: true },
      { text: 'LTパイプライン（12週予測）',  ok: true },
      { text: 'ASN Tracking（手動入力）',  ok: true },
      { text: '入出庫履歴',                 ok: true },
      { text: '3PL / 倉庫会社 連携',       ok: false },
      { text: '自社輸送会社 連携',          ok: false },
      { text: 'API / EDI 自動取込',        ok: false },
    ],
    color: '#0f172a',
  },
  {
    id: 'pro', name: 'StockWise Pro', price: '$149', period: '/月',
    desc: '3PL・自社輸送会社を使う企業向け',
    priceEnvKey: 'VITE_STRIPE_PRICE_PRO',
    badge: 'おすすめ',
    features: [
      { text: 'SKU 無制限',                ok: true },
      { text: 'StockWise 全機能',          ok: true },
      { text: '3PL / 倉庫会社 連携',       ok: true },
      { text: '自社輸送会社 連携',          ok: true },
      { text: 'API / EDI 自動取込',        ok: true },
      { text: 'Slack 通知',                ok: true },
      { text: '複数ユーザー（10名）',        ok: true },
      { text: '優先サポート',               ok: true },
    ],
    color: '#1d4ed8',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: '$499', period: '/月',
    desc: 'グローバルサプライチェーン向け',
    priceEnvKey: 'VITE_STRIPE_PRICE_ENTERPRISE',
    features: [
      { text: 'Pro 全機能',                ok: true },
      { text: 'ユーザー無制限',             ok: true },
      { text: '船舶追跡 API 連携',          ok: true },
      { text: 'カスタム ERP 連携',          ok: true },
      { text: '専任 CSM',                  ok: true },
      { text: 'SLA 99.9%',                ok: true },
    ],
    color: '#7c3aed',
  },
]

export default function PricingModal({ user, onClose }) {
  const [loading, setLoading] = useState(null)
  const [error,   setError]   = useState(null)

  async function checkout(plan) {
    setError(null); setLoading(plan.id)
    try {
      const priceId = import.meta.env[plan.priceEnvKey]
      if (!priceId) throw new Error(`Stripe Price ID未設定: ${plan.priceEnvKey}`)
      const res  = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId: user.id, userEmail: user.email, planId: plan.id }),
      })
const data = await res.json()
if (!res.ok) throw new Error(data.error || 'checkout api error')
if (!data.url) throw new Error('data.url が空です')
window.location.href = data.url
    } catch (e) { setError(e.message); setLoading(null) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16, fontFamily:"'IBM Plex Mono',monospace" }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:12, padding:'32px 28px', maxWidth:860, width:'100%', maxHeight:'90vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:800, fontFamily:"'Syne',sans-serif" }}>プランを選択</h2>
            <p style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>14日間無料トライアル · いつでもキャンセル可</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>✕</button>
        </div>

        <div style={{ background:'#f0f4f8', borderRadius:6, padding:'10px 14px', marginBottom:20, fontSize:11, color:'#374151' }}>
          <strong>StockWise</strong> = 在庫管理 + LT予測 + ASN手動入力　|　
          <strong>StockWise Pro</strong> = + <strong>3PL・自社輸送会社 連携</strong>
        </div>

        {error && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'9px 12px', fontSize:11, color:'#dc2626', marginBottom:16 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ border:`1px solid ${plan.badge ? plan.color : '#e2e8f0'}`, borderRadius:10, padding:22, position:'relative', boxShadow:plan.badge?`0 0 0 2px ${plan.color}33`:'none' }}>
              {plan.badge && (
                <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:plan.color, color:'#fff', fontSize:9, fontWeight:700, padding:'2px 12px', borderRadius:10, whiteSpace:'nowrap' }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:6 }}>{plan.name.toUpperCase()}</div>
              <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Syne',sans-serif", marginBottom:4 }}>
                {plan.price}<span style={{ fontSize:12, color:'#94a3b8', fontFamily:'inherit', fontWeight:400 }}>{plan.period}</span>
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:16 }}>{plan.desc}</div>
              <ul style={{ listStyle:'none', marginBottom:20 }}>
                {plan.features.map(f => (
                  <li key={f.text} style={{ fontSize:11, padding:'5px 0', borderBottom:'1px solid #f1f5f9', color:f.ok?'#374151':'#d1d5db', display:'flex', gap:7, alignItems:'center' }}>
                    <span style={{ color:f.ok?'#22c55e':'#d1d5db', flexShrink:0 }}>{f.ok ? '✓' : '✗'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button onClick={() => checkout(plan)} disabled={loading===plan.id}
                style={{ width:'100%', padding:11, borderRadius:7, border:'none', background:plan.color, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading===plan.id?0.6:1, fontFamily:'inherit' }}>
                {loading===plan.id ? '処理中…' : '無料で試す'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
