import { useState } from 'react'
import { t } from '../i18n.js'

const PLAN_FEATURES = {
  basic: [
    { key:'pf_sku_basic',    ok:true  },
    { key:'pf_dashboard',    ok:true  },
    { key:'pf_lt',           ok:true  },
    { key:'pf_csv',          ok:true  },
    { key:'pf_ssn_manual',   ok:true  },
    { key:'pf_3pl',          ok:false, proOnly:true },
    { key:'pf_logistics',    ok:false, proOnly:true },
    { key:'pf_api',          ok:false, proOnly:true },
    { key:'pf_movements',    ok:false, proOnly:true },
  ],
  pro: [
    { key:'pf_sku_pro',      ok:true },
    { key:'pf_all_basic',    ok:true },
    { key:'pf_ssn_pro',      ok:true },
    { key:'pf_movements',    ok:true },
    { key:'pf_3pl',          ok:true },
    { key:'pf_logistics',    ok:true },
    { key:'pf_api',          ok:true },
    { key:'pf_slack',        ok:true },
    { key:'pf_users',        ok:true },
    { key:'pf_support',      ok:true },
  ],
}

export default function PricingModal({ user, lang='en', onClose }) {
  const [loading, setLoading] = useState(null)
  const [error,   setError]   = useState(null)
  const L = key => t(key, lang)

  const PLANS = [
    { id:'basic', name:'StockWise',     price:'$49',  badge:null,       color:'#0f172a', priceKey:'VITE_STRIPE_PRICE_BASIC' },
    { id:'pro',   name:'StockWise Pro', price:'$149', badge:L('plan_rec'), color:'#1d4ed8', priceKey:'VITE_STRIPE_PRICE_PRO'   },
  ]

  async function checkout(plan) {
    setError(null); setLoading(plan.id)
    try {
      const priceId = import.meta.env[plan.priceKey]
      if (!priceId) throw new Error(L('err_price_id') + plan.priceKey)
      const res  = await fetch('/api/create-checkout-session', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ priceId, userId:user.id, userEmail:user.email, planId:plan.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || L('err_checkout'))
      window.location.href = data.url
    } catch(e) { setError(e.message); setLoading(null) }
  }

  const F = 'Arial,Helvetica,sans-serif'
  const navy = '#0d1b2a', border = '#dde3ea', muted = '#6b7d93'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16, fontFamily:F }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:4, padding:'32px 28px', maxWidth:640, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, fontFamily:F, color:navy }}>{L('pricing_title')}</h2>
            <p style={{ fontSize:11, color:muted, marginTop:4, fontFamily:F }}>{L('pricing_trial')}</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:muted }}>✕</button>
        </div>

        <div style={{ background:'#f0f5ff', border:'1px solid #b8ccf5', borderRadius:3, padding:'10px 14px', marginBottom:20, fontSize:11, color:'#1a4fa0', fontFamily:F }}>
          {L('pricing_compare')}
        </div>

        {error && <div style={{ background:'#fdf3f2', border:'1px solid #f5c6c3', borderRadius:3, padding:'9px 12px', fontSize:11, color:'#c0392b', marginBottom:16, fontFamily:F }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ border:`1px solid ${plan.badge ? plan.color : border}`, borderRadius:4, padding:22, position:'relative', boxShadow:plan.badge?`0 0 0 2px ${plan.color}22`:'none' }}>
              {plan.badge && (
                <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:plan.color, color:'#fff', fontSize:9, fontWeight:700, padding:'2px 12px', borderRadius:10, whiteSpace:'nowrap', fontFamily:F }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize:11, fontWeight:700, color:muted, marginBottom:6, fontFamily:F }}>{plan.name.toUpperCase()}</div>
              <div style={{ fontSize:28, fontWeight:700, fontFamily:F, color:navy, marginBottom:4 }}>
                {plan.price}<span style={{ fontSize:12, color:muted, fontWeight:400 }}>{L('pricing_mo')}</span>
              </div>
              <div style={{ fontSize:11, color:'#394f66', marginBottom:16, fontFamily:F }}>{L(`plan_${plan.id}_desc`)}</div>
              <ul style={{ listStyle:'none', marginBottom:20 }}>
                {PLAN_FEATURES[plan.id].map(f => (
                  <li key={f.key} style={{ fontSize:11, padding:'5px 0', borderBottom:`1px solid ${border}`, color:f.ok?navy:'#a0b0c0', display:'flex', alignItems:'center', gap:7, fontFamily:F }}>
                    <span style={{ color:f.ok?'#1a6e3c':f.proOnly?'#1a4fa0':'#a0b0c0', flexShrink:0 }}>{f.ok?'✓':f.proOnly?'★':'✗'}</span>
                    {L(f.key)}
                    {f.proOnly && <span style={{ fontSize:8, background:'#f0f5ff', color:'#1a4fa0', padding:'1px 5px', borderRadius:2, marginLeft:'auto', fontWeight:700, fontFamily:F }}>PRO</span>}
                  </li>
                ))}
              </ul>
              <button onClick={() => checkout(plan)} disabled={loading===plan.id}
                style={{ width:'100%', padding:11, borderRadius:3, border:'none', background:plan.color, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading===plan.id?0.6:1, fontFamily:F }}>
                {loading===plan.id ? L('pricing_processing') : L('pricing_start')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
