import { useState } from 'react'
import { t } from '../i18n.js'

export default function PricingModal({ user, lang = 'en', onClose }) {
  const [loading, setLoading] = useState(null)
  const [error,   setError]   = useState(null)
  const L = k => t(k, lang)
  const F = 'Arial,Helvetica,sans-serif'
  const navy = '#0d1b2a', border = '#dde3ea', muted = '#6b7d93'

  async function checkout(planId, priceKey) {
    setError(null); setLoading(planId)
    try {
      const priceId = import.meta.env[priceKey]
      if (!priceId) throw new Error(L('err_price_id') + priceKey)
      const res  = await fetch('/api/create-checkout-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId: user.id, userEmail: user.email, planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || L('err_checkout'))
      window.location.href = data.url
    } catch (e) { setError(e.message); setLoading(null) }
  }

  const BASIC_FEATURES = [
    { text: lang === 'ja' ? 'SKU 3件以上で有料 ($49/月)' : '3+ SKUs requires paid plan ($49/mo)', ok: true },
    { text: lang === 'ja' ? 'ダッシュボード・アラート' : 'Dashboard & Alerts', ok: true },
    { text: lang === 'ja' ? '在庫管理 (Superset/Subset)' : 'Inventory (Superset/Subset)', ok: true },
    { text: lang === 'ja' ? 'ヒートマップ (12週予測)' : 'Heatmap (12-week forecast)', ok: true },
    { text: lang === 'ja' ? 'Incremental CSV入荷登録' : 'Incremental CSV inbound', ok: true },
    { text: lang === 'ja' ? '過剰在庫日数カスタム設定' : 'Overstock threshold setting', ok: true },
    { text: lang === 'ja' ? 'CSVバルクインポート' : 'CSV bulk import', ok: true },
    { text: lang === 'ja' ? 'EN / 日本語 自動切替' : 'EN / JP auto language', ok: true },
  ]
  const PRO_FEATURES = [
    { text: lang === 'ja' ? 'Basic の全機能' : 'Everything in Basic', ok: true },
    { text: lang === 'ja' ? '3PL / 倉庫会社 連携' : '3PL / Warehouse integration', ok: true },
    { text: lang === 'ja' ? '自社輸送会社 連携' : 'Own logistics integration', ok: true },
    { text: lang === 'ja' ? 'API / EDI 自動取込' : 'API / EDI auto-import', ok: true },
    { text: lang === 'ja' ? 'Slack通知' : 'Slack notifications', ok: true },
    { text: lang === 'ja' ? '複数ユーザー (10名)' : 'Up to 10 users', ok: true },
    { text: lang === 'ja' ? '優先サポート' : 'Priority support', ok: true },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16, fontFamily:F }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:4, padding:'32px 28px', maxWidth:660, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, fontFamily:F, color:navy }}>{L('pricing_title')}</h2>
            <p style={{ fontSize:11, color:muted, marginTop:4 }}>{L('pricing_trial')}</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:muted }}>✕</button>
        </div>

        {error && <div style={{ background:'#fdf3f2', border:'1px solid #f5c6c3', borderRadius:3, padding:'9px 12px', fontSize:11, color:'#c0392b', marginBottom:16 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* Basic */}
          <div style={{ border:`2px solid ${navy}`, borderRadius:4, padding:22 }}>
            <div style={{ fontSize:11, fontWeight:700, color:muted, marginBottom:6 }}>STOCKWISE BASIC</div>
            <div style={{ fontSize:32, fontWeight:700, color:navy, marginBottom:2 }}>
              $49<span style={{ fontSize:13, color:muted, fontWeight:400 }}>{L('pricing_mo')}</span>
            </div>
            <div style={{ fontSize:11, color:'#394f66', marginBottom:4 }}>
              {lang === 'ja' ? 'SKU 3件以上から。2件まで無料。' : 'Free up to 2 SKUs. $49/mo for 3+.'}
            </div>
            <div style={{ fontSize:10, color:'#1a6e3c', background:'#f0faf4', border:'1px solid #b8e8cc', borderRadius:3, padding:'4px 8px', marginBottom:16, display:'inline-block' }}>
              {lang === 'ja' ? '14日間無料トライアル' : '14-day free trial'}
            </div>
            <ul style={{ listStyle:'none', marginBottom:20 }}>
              {BASIC_FEATURES.map(f => (
                <li key={f.text} style={{ fontSize:11, padding:'5px 0', borderBottom:`1px solid ${border}`, color:navy, display:'flex', gap:7 }}>
                  <span style={{ color:'#1a6e3c', flexShrink:0 }}>✓</span>{f.text}
                </li>
              ))}
            </ul>
            <button onClick={() => checkout('basic', 'VITE_STRIPE_PRICE_BASIC')} disabled={loading==='basic'}
              style={{ width:'100%', padding:11, borderRadius:3, border:'none', background:navy, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading==='basic'?0.6:1, fontFamily:F }}>
              {loading==='basic' ? L('pricing_processing') : L('pricing_start')}
            </button>
          </div>

          {/* Pro — 更新中 */}
          <div style={{ border:`1px solid ${border}`, borderRadius:4, padding:22, position:'relative', background:'#fafbfc' }}>
            <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'#94a3b8', color:'#fff', fontSize:9, fontWeight:700, padding:'2px 12px', borderRadius:10, whiteSpace:'nowrap' }}>
              {lang === 'ja' ? '準備中' : 'COMING SOON'}
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:muted, marginBottom:6 }}>STOCKWISE PRO</div>
            <div style={{ fontSize:32, fontWeight:700, color:muted, marginBottom:2 }}>
              {lang === 'ja' ? '更新中' : 'TBD'}<span style={{ fontSize:13, color:muted, fontWeight:400 }}>{L('pricing_mo')}</span>
            </div>
            <div style={{ fontSize:11, color:muted, marginBottom:16 }}>
              {lang === 'ja' ? '料金は現在更新中です。しばらくお待ちください。' : 'Pricing is currently being updated. Stay tuned.'}
            </div>
            <ul style={{ listStyle:'none', marginBottom:20 }}>
              {PRO_FEATURES.map(f => (
                <li key={f.text} style={{ fontSize:11, padding:'5px 0', borderBottom:`1px solid ${border}`, color:muted, display:'flex', gap:7 }}>
                  <span style={{ color:'#94a3b8', flexShrink:0 }}>✓</span>{f.text}
                </li>
              ))}
            </ul>
            <button disabled style={{ width:'100%', padding:11, borderRadius:3, border:'none', background:'#e2e8f0', color:'#94a3b8', fontSize:13, fontWeight:700, cursor:'not-allowed', fontFamily:F }}>
              {lang === 'ja' ? '料金更新中…' : 'Pricing updating…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
