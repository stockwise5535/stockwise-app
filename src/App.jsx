import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth }    from './AuthContext.jsx'
import { supabase }   from './supabase.js'
import { detectLang, t } from './i18n.js'
import LoginPage      from './components/LoginPage.jsx'
import PricingModal   from './components/PricingModal.jsx'

// ── Plan limits ────────────────────────────────────────────
const FREE_SKU_LIMIT = 2

// ── Design tokens ──────────────────────────────────────────
const T = {
  font:'Arial,Helvetica,sans-serif', fontNum:"'Courier New',Courier,monospace",
  navy:'#0d1b2a', navyM:'#1b2e42', slate:'#394f66', muted:'#6b7d93', dim:'#a0b0c0',
  border:'#dde3ea', borderL:'#edf0f4', bg:'#f4f6f9', surface:'#fff',
  red:'#c0392b', redBg:'#fdf3f2', redBdr:'#f5c6c3',
  orange:'#c0620b', oBg:'#fdf6ee', oBdr:'#f5d9b8',
  green:'#1a6e3c', gBg:'#f0faf4', gBdr:'#b8e8cc',
  blue:'#1a4fa0', bluBg:'#f0f5ff', bluBdr:'#b8ccf5',
}
const SC = {
  critical: { t:T.red,    bg:T.redBg, bd:T.redBdr, dot:T.red    },
  warning:  { t:T.orange, bg:T.oBg,   bd:T.oBdr,   dot:T.orange },
  healthy:  { t:T.green,  bg:T.gBg,   bd:T.gBdr,   dot:T.green  },
  overstock:{ t:T.blue,   bg:T.bluBg, bd:T.bluBdr, dot:T.blue   },
  nodata:   { t:T.muted,  bg:'#f9fafb',bd:T.border, dot:T.dim   },
}

// ── Business logic ─────────────────────────────────────────
const calcDos = s => s.daily_usage > 0 ? s.stock_qty / s.daily_usage : Infinity
const calcRp  = s => (s.lead_time || 0) * (s.daily_usage || 0)
const calcSs  = s => s.safety_stock || (s.daily_usage || 0) * 3

function getStatus(s, overstockDays = 45) {
  const d = calcDos(s)
  if (d === Infinity) return 'nodata'
  if (d < 7)             return 'critical'
  if (d < 14)            return 'warning'
  if (d > overstockDays) return 'overstock'
  return 'healthy'
}

// 12-week pipeline using incremental (inbound) data
function buildPipeline(sku, incrementals) {
  let stock = sku.stock_qty
  return Array.from({ length: 12 }, (_, i) => {
    const w    = i + 1
    const date = new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10)
    const inc  = (incrementals || [])
      .filter(r => r.sku_name === sku.name && r.week === w)
      .reduce((s, r) => s + (r.qty || 0), 0)
    stock = Math.max(0, stock - (sku.daily_usage || 0) * 7 + inc)
    const wos = sku.daily_usage > 0 ? stock / (sku.daily_usage * 7) : 99
    return {
      week: w, date,
      proj_stock: Math.round(stock),
      inbound: inc,
      wos: Math.round(wos),
      status: wos < 1 ? 'critical' : wos < 2 ? 'warning' : wos < 6 ? 'healthy' : 'overstock',
    }
  })
}

const fmt = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d })

// ── CSV helpers ─────────────────────────────────────────────
function downloadSkuTemplate() {
  const hdr  = 'name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier'
  const rows = [
    'Earbuds Pro A,Earbuds,Supplier A,420,62,18,186,200,28.50,Supplier-A',
    'Gaming Mouse B,Input Devices,Supplier B,85,98,14,294,500,12.80,Supplier-B',
    'USB-C Hub,Hubs,,1840,45,21,135,300,19.20,Supplier-C',
  ]
  const blob = new Blob([[hdr, ...rows].join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = 'sku_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadIncrementalTemplate(skus) {
  const today = new Date()
  const weekHeaders = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getTime() + (i + 1) * 7 * 86400000)
    return `W${i + 1}_${d.toISOString().slice(0, 10)}`
  })
  const header = ['name', 'superset', 'subset', ...weekHeaders].join(',')
  const rows = skus.length
    ? skus.map(s => [s.name, s.superset || '', s.subset || '', ...Array(12).fill(0)].join(','))
    : [['Earbuds Pro A', 'Earbuds', 'Supplier A', ...Array(12).fill(0)].join(',')]
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = 'incremental_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Style helpers ───────────────────────────────────────────
const TH  = (a = 'left') => ({ padding:'8px 12px', textAlign:a, fontSize:10, fontWeight:700, fontFamily:T.font, color:T.muted, background:T.bg, borderBottom:`2px solid ${T.border}`, whiteSpace:'nowrap', letterSpacing:'0.05em', textTransform:'uppercase' })
const TD  = (a = 'left') => ({ padding:'9px 12px', textAlign:a, fontSize:12, fontFamily:T.font, borderBottom:`1px solid ${T.borderL}`, verticalAlign:'middle', color:T.navy })
const TDN = (a = 'right') => ({ ...TD(a), fontFamily:T.fontNum })
const LBL = { display:'block', fontSize:11, fontWeight:700, fontFamily:T.font, color:T.slate, marginBottom:4, letterSpacing:'0.02em' }
const INP = { width:'100%', padding:'8px 10px', borderRadius:3, border:`1px solid ${T.border}`, fontSize:12, marginBottom:12, outline:'none', fontFamily:T.font, color:T.navy }
const ERR = { background:T.redBg, border:`1px solid ${T.redBdr}`, borderLeft:`3px solid ${T.red}`, borderRadius:3, padding:'8px 12px', fontSize:12, color:T.red, marginBottom:12, fontFamily:T.font }

// ── Micro components ────────────────────────────────────────
function StatusBadge({ status, lang }) {
  const m = SC[status] || SC.nodata
  const label = t(`status_${status}`, lang) || status
  return <span style={{ display:'inline-block', fontSize:10, fontWeight:700, fontFamily:T.font, padding:'2px 8px', borderRadius:2, letterSpacing:'0.04em', background:m.bg, color:m.t, border:`1px solid ${m.bd}` }}>{label}</span>
}
function Dot({ status }) {
  const m = SC[status] || SC.nodata
  return <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:m.dot, marginRight:8, flexShrink:0 }} />
}
function WOSBar({ wos }) {
  const p = Math.min(100, (wos / 8) * 100)
  const c = wos < 1 ? T.red : wos < 2 ? T.orange : wos < 4 ? '#a16207' : T.green
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:4, background:T.borderL, borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${p}%`, height:'100%', background:c, borderRadius:2 }} />
      </div>
      <span style={{ fontSize:10, color:c, fontFamily:T.fontNum, minWidth:20, textAlign:'right', fontWeight:700 }}>{wos}w</span>
    </div>
  )
}
function KPICard({ label, value, accent, icon, children }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderLeft:`3px solid ${accent}`, borderRadius:4, padding:'14px 16px', flex:1, minWidth:150, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:T.muted, fontFamily:T.font, letterSpacing:'0.06em', textTransform:'uppercase' }}>{label}</span>
        <span style={{ fontSize:16, opacity:.65 }}>{icon}</span>
      </div>
      <div style={{ fontSize:26, fontWeight:700, color:T.navy, fontFamily:T.fontNum, letterSpacing:'-0.02em' }}>{value}</div>
      {children}
    </div>
  )
}
function Panel({ title, badge, action, children }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:4, overflow:'hidden', marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontWeight:700, fontSize:12, fontFamily:T.font, color:T.navy, letterSpacing:'0.02em' }}>{title}</span>
          {badge > 0 && <span style={{ background:T.red, color:'#fff', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:2, fontFamily:T.font }}>{badge}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }} onClick={onClose}>
      <div style={{ background:T.surface, borderRadius:4, padding:'24px 22px', width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.18)', border:`1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, paddingBottom:12, borderBottom:`1px solid ${T.border}` }}>
          <span style={{ fontWeight:700, fontSize:14, fontFamily:T.font, color:T.navy }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:T.muted }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Fld({ label, type = 'text', value, onChange, placeholder, min, step, required }) {
  return (
    <div>
      <label style={LBL}>{label}{required && <span style={{ color:T.red }}> *</span>}</label>
      <input style={INP} type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step} />
    </div>
  )
}
function Btn({ children, onClick, variant = 'primary', disabled, small, style: extra }) {
  const pad = small ? '4px 10px' : '7px 14px', sz = small ? 10 : 11
  const v = {
    primary: { background:T.navy,    color:'#fff',   border:'none' },
    ghost:   { background:T.surface, color:T.navy,   border:`1px solid ${T.border}` },
    danger:  { background:T.redBg,   color:T.red,    border:`1px solid ${T.redBdr}` },
    blue:    { background:T.bluBg,   color:T.blue,   border:`1px solid ${T.bluBdr}` },
    green:   { background:T.gBg,     color:T.green,  border:`1px solid ${T.gBdr}` },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:pad, borderRadius:3, cursor:disabled ? 'not-allowed' : 'pointer', fontSize:sz, fontWeight:700, fontFamily:T.font, opacity:disabled ? .5 : 1, letterSpacing:'0.02em', ...v[variant], ...extra }}>
      {children}
    </button>
  )
}

// ── Settings Modal ─────────────────────────────────────────
function SettingsModal({ lang, overstockDays, setOverstockDays, onClose }) {
  const [val, setVal] = useState(String(overstockDays))
  const F = T.font
  function save() {
    const n = parseInt(val)
    if (n >= 15 && n <= 365) setOverstockDays(n)
    onClose()
  }
  return (
    <Modal title={lang === 'ja' ? '⚙ 設定' : '⚙ Settings'} onClose={onClose}>
      <div style={{ marginBottom:20 }}>
        <label style={LBL}>{lang === 'ja' ? '過剰在庫の閾値（日）' : 'Overstock threshold (days)'}</label>
        <div style={{ fontSize:11, color:T.muted, marginBottom:8, fontFamily:F }}>
          {lang === 'ja'
            ? 'この日数を超えた在庫を「過剰在庫」として表示します。デフォルト: 45日'
            : 'Stock exceeding this many days will be flagged as Overstock. Default: 45 days'}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <input style={{ ...INP, width:100, marginBottom:0 }} type="number" min="15" max="365" value={val} onChange={e => setVal(e.target.value)} />
          <span style={{ fontSize:12, color:T.muted, fontFamily:F }}>{lang === 'ja' ? '日 (15〜365)' : 'days (15–365)'}</span>
        </div>
        <div style={{ marginTop:8, background:T.bg, borderRadius:3, padding:'8px 12px', fontSize:11, color:T.muted, fontFamily:F }}>
          {lang === 'ja' ? `現在の設定: ${overstockDays}日` : `Current: ${overstockDays} days`}
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <Btn onClick={save} style={{ flex:1, padding:10 }}>{lang === 'ja' ? '保存' : 'Save'}</Btn>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1, padding:10 }}>{lang === 'ja' ? 'キャンセル' : 'Cancel'}</Btn>
      </div>
    </Modal>
  )
}

// ── SKU Limit Banner ───────────────────────────────────────
function SkuLimitBanner({ lang, onUpgrade, current }) {
  return (
    <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderLeft:'4px solid #f59e0b', borderRadius:4, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', fontFamily:T.font }}>
      <div>
        <div style={{ fontWeight:700, fontSize:13, color:'#92400e', marginBottom:3 }}>
          🔒 {lang === 'ja' ? `無料プランのSKU上限 (${current}/${FREE_SKU_LIMIT}件) に達しました` : `Free plan SKU limit reached (${current}/${FREE_SKU_LIMIT})`}
        </div>
        <div style={{ fontSize:12, color:'#b45309' }}>
          {lang === 'ja' ? '3件目以降の追加は有料プラン ($49/月) が必要です' : 'Adding a 3rd SKU requires a paid plan ($49/mo)'}
        </div>
      </div>
      <button onClick={onUpgrade} style={{ padding:'8px 18px', borderRadius:3, border:'none', background:'#f59e0b', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:T.font, whiteSpace:'nowrap' }}>
        {lang === 'ja' ? 'アップグレード — $49/月' : 'Upgrade — $49/mo'}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [lang, setLang] = useState(() => detectLang())
  const L = key => t(key, lang)

  const [plan,         setPlan]         = useState('free')
  const [tab,          setTab]          = useState('dashboard')
  const [skus,         setSkus]         = useState([])
  const [incrementals, setIncrementals] = useState([])  // [{sku_name, superset, subset, week, qty}]
  const [selSku,       setSelSku]       = useState(null)
  const [overstockDays,setOverstockDays]= useState(45)
  const [showPricing,  setShowPricing]  = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [skuModal, setSkuModal] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState(null)

  const BSKU = { name:'', superset:'', subset:'', category:'', supplier:'', stock_qty:'', daily_usage:'', lead_time:'', safety_stock:'', moq:'', unit_cost:'' }
  const [sf, setSf] = useState(BSKU)

  const csvRef    = useRef(null)
  const incCsvRef = useRef(null)

  const isFree          = plan === 'free'
  const isPaid          = plan === 'basic' || plan === 'pro'
  const skuLimitReached = isFree && skus.length >= FREE_SKU_LIMIT

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    const [{ data: s }, { data: sub }] = await Promise.all([
      supabase.from('skus').select('*').order('superset,subset,name'),
      supabase.from('subscriptions').select('plan,status').eq('user_id', user.id).single(),
    ])
    setSkus(s || [])
    if (sub?.plan) setPlan(sub.plan)
  }

  // ── SKU CRUD ──────────────────────────────────────────────
  async function saveSku() {
    setErr(null); setSaving(true)
    try {
      if (skuModal === 'add' && isFree && skus.length >= FREE_SKU_LIMIT)
        throw new Error(lang === 'ja' ? `無料プランはSKU${FREE_SKU_LIMIT}件まで` : `Free plan limit: ${FREE_SKU_LIMIT} SKUs`)
      const p = {
        user_id: user.id, name: sf.name.trim(), superset: sf.superset.trim() || null,
        subset: sf.subset.trim() || null, category: sf.category || null, supplier: sf.supplier || null,
        stock_qty: +sf.stock_qty, daily_usage: +sf.daily_usage, lead_time: +sf.lead_time,
        safety_stock: sf.safety_stock ? +sf.safety_stock : null,
        moq: sf.moq ? +sf.moq : null, unit_cost: sf.unit_cost ? +sf.unit_cost : null,
      }
      if (!p.name) throw new Error(L('err_sku_name'))
      const { error: e } = skuModal === 'add'
        ? await supabase.from('skus').insert(p)
        : await supabase.from('skus').update(p).eq('id', skuModal.id)
      if (e) throw e
      await fetchAll(); setSkuModal(false)
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  async function deleteSku(id) {
    if (!confirm(L('confirm_delete_sku'))) return
    const sku = skus.find(s => s.id === id)
    await supabase.from('skus').delete().eq('id', id)
    if (sku) setIncrementals(prev => prev.filter(r => r.sku_name !== sku.name))
    await fetchAll()
  }

  // ── SKU bulk CSV ──────────────────────────────────────────
  function handleSkuCSV(e) {
    if (isFree) { setShowPricing(true); e.target.value = ''; return }
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = ev.target.result.trim().split('\n').slice(1).map(l => {
        const [name, superset, subset, stock_qty, daily_usage, lead_time, safety_stock, moq, unit_cost, supplier] = l.split(',')
        return { user_id: user.id, name: (name || '').trim(), superset: (superset || '').trim() || null, subset: (subset || '').trim() || null, stock_qty: +stock_qty || 0, daily_usage: +daily_usage || 0, lead_time: +lead_time || 7, safety_stock: safety_stock ? +safety_stock : null, moq: moq ? +moq : null, unit_cost: unit_cost ? +unit_cost : null, supplier: (supplier || '').trim() || null }
      }).filter(r => r.name)
      if (!rows.length) { alert(L('csv_no_rows')); return }
      const { error } = await supabase.from('skus').upsert(rows, { onConflict: 'user_id,name' })
      error ? alert(L('csv_error') + error.message) : (alert(`${rows.length}${L('csv_success')}`), fetchAll())
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // ── Incremental CSV upload ────────────────────────────────
  function handleIncrementalCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.trim().split('\n')
      if (!lines.length) { alert('Empty file'); return }
      const weekCols = lines[0].split(',').slice(3)  // W1_date, W2_date, ...
      const parsed = []
      let count = 0
      for (const line of lines.slice(1)) {
        const cols = line.split(',')
        const name = (cols[0] || '').trim()
        const superset = (cols[1] || '').trim()
        const subset   = (cols[2] || '').trim()
        if (!name) continue
        weekCols.forEach((_, i) => {
          const qty = parseFloat(cols[3 + i] || '0') || 0
          if (qty > 0) parsed.push({ sku_name: name, superset, subset, week: i + 1, qty })
        })
        count++
      }
      setIncrementals(prev => {
        const names = new Set(lines.slice(1).map(l => l.split(',')[0].trim()).filter(Boolean))
        return [...prev.filter(r => !names.has(r.sku_name)), ...parsed]
      })
      const totalInbound = parsed.reduce((a, r) => a + r.qty, 0)
      alert(lang === 'ja'
        ? `${count}件のSKU、合計${totalInbound.toLocaleString()}個の入荷データを読み込みました`
        : `Loaded ${count} SKUs, total ${totalInbound.toLocaleString()} units inbound`)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // ── Derived ───────────────────────────────────────────────
  const alertSkus   = skus.filter(s => getStatus(s, overstockDays) === 'critical')
  const expiredSkus = skus.filter(s => s.stock_qty <= 0 && s.daily_usage > 0)
  const reorderNow  = skus.filter(s => s.stock_qty < calcRp(s))
  const overstock   = skus.filter(s => getStatus(s, overstockDays) === 'overstock')
  const pipeline    = useMemo(() => selSku ? buildPipeline(selSku, incrementals) : [], [selSku, incrementals])
  const supersets   = [...new Set(skus.map(s => s.superset).filter(Boolean))]
  const noSuperset  = skus.filter(s => !s.superset)

  if (authLoading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:T.muted, fontFamily:T.font }}>{L('loading')}</div>
  if (!user) return <LoginPage lang={lang} setLang={setLang} />

  const TabBtn = ({ id, label, badge }) => (
    <button onClick={() => setTab(id)} style={{ padding:'11px 20px', border:'none', background:'transparent', cursor:'pointer', fontFamily:T.font, fontSize:12, fontWeight:tab === id ? 700 : 400, color:tab === id ? T.navy : T.muted, letterSpacing:'0.02em', borderBottom:tab === id ? `2px solid ${T.navy}` : '2px solid transparent', marginBottom:-2, transition:'all .12s', display:'flex', alignItems:'center', gap:6 }}>
      {label}
      {badge > 0 && <span style={{ background:T.red, color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:2 }}>{badge}</span>}
    </button>
  )

  const SkuRow = ({ s }) => {
    const st = getStatus(s, overstockDays), gap = s.stock_qty - calcRp(s), d = calcDos(s)
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto', alignItems:'center', borderBottom:`1px solid ${T.borderL}`, background:SC[st]?.bg + '44' }}>
        <div style={{ padding:'8px 16px', fontWeight:600, fontSize:12, color:T.navy, display:'flex', alignItems:'center' }}>
          <Dot status={st} />{s.name}
          {s.supplier && <span style={{ marginLeft:8, fontSize:10, color:T.muted }}>{s.supplier}</span>}
        </div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12 }}>{fmt(s.stock_qty)}</div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12, color:T.muted }}>{s.daily_usage}{lang === 'ja' ? '/日' : '/d'}</div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12, color:T.blue }}>{s.lead_time}d</div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12, fontWeight:700, color:SC[st]?.t }}>{d === Infinity ? '∞' : d.toFixed(1)}</div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12 }}>{fmt(calcRp(s))}</div>
        <div style={{ padding:'8px 10px', textAlign:'right', fontFamily:T.fontNum, fontSize:12, fontWeight:700, color:gap < 0 ? T.red : T.green }}>{gap >= 0 ? '+' : ''}{fmt(gap)}</div>
        <div style={{ padding:'8px 10px' }}><StatusBadge status={st} lang={lang} /></div>
        <div style={{ padding:'8px 10px', display:'flex', gap:4 }}>
          <Btn variant="blue" small onClick={() => { setSelSku(s); setTab('heatmap') }}>HM</Btn>
          <Btn variant="ghost" small onClick={() => { setSf({ name:s.name, superset:s.superset||'', subset:s.subset||'', category:s.category||'', supplier:s.supplier||'', stock_qty:s.stock_qty, daily_usage:s.daily_usage, lead_time:s.lead_time, safety_stock:s.safety_stock||'', moq:s.moq||'', unit_cost:s.unit_cost||'' }); setErr(null); setSkuModal(s) }}>{L('edit')}</Btn>
          <Btn variant="danger" small onClick={() => deleteSku(s.id)}>{L('delete')}</Btn>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:T.font, color:T.navy }}>

      {/* NAV */}
      <nav style={{ background:T.navy, height:52, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:28, height:28, background:'#2563eb', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff' }}>S</div>
          <span style={{ color:'#fff', fontWeight:700, fontSize:15, fontFamily:T.font, letterSpacing:'0.04em' }}>StockWise</span>
          {isPaid && <span style={{ background:'#2563eb', color:'#fff', fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:2, fontFamily:T.font }}>{plan.toUpperCase()}</span>}
          {isFree && <span style={{ background:'#334155', color:'#94a3b8', fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:2, fontFamily:T.font }}>FREE {skus.length}/{FREE_SKU_LIMIT} SKUs</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {!isPaid && (
            <Btn onClick={() => setShowPricing(true)} style={{ background:'#2563eb', color:'#fff', border:'none', padding:'5px 14px', fontSize:11 }}>
              {lang === 'ja' ? 'アップグレード — $49/月' : 'Upgrade — $49/mo'}
            </Btn>
          )}
          <button onClick={() => setLang(l => l === 'ja' ? 'en' : 'ja')} style={{ padding:'4px 10px', borderRadius:3, border:'1px solid #334155', background:'#1e293b', color:'#93c5fd', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:T.font }}>
            {L('lang_switch')} | {L('lang_label')}
          </button>
          <button onClick={() => setShowSettings(true)} title={lang === 'ja' ? '設定' : 'Settings'} style={{ padding:'4px 9px', borderRadius:3, border:'1px solid #334155', background:'#1e293b', color:'#94a3b8', fontSize:15, cursor:'pointer', lineHeight:1 }}>⚙</button>
          <span style={{ fontSize:11, color:'#93c5fd', fontFamily:T.font, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</span>
          <Btn onClick={signOut} style={{ background:T.navyM, color:T.dim, border:`1px solid ${T.navyM}`, padding:'5px 12px', fontSize:11 }}>{L('logout')}</Btn>
        </div>
      </nav>

      <div style={{ maxWidth:1280, margin:'0 auto', padding:'20px' }}>

        {/* TABS */}
        <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:`2px solid ${T.border}`, background:T.surface, borderRadius:'4px 4px 0 0', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
          <TabBtn id="dashboard" label={L('tab_dashboard')} badge={alertSkus.length} />
          <TabBtn id="inventory" label={L('tab_inventory')} />
          <TabBtn id="heatmap"   label={lang === 'ja' ? 'ヒートマップ' : 'Heatmap'} />
        </div>

        {/* ════ DASHBOARD ════ */}
        {tab === 'dashboard' && (<>

          {/* KPI row — no total stock */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>

            <KPICard label={lang === 'ja' ? 'アラート (7日以内) 商品件数' : 'Alert: SKUs < 7 Days'} value={alertSkus.length} accent={T.red} icon="⚠">
              {alertSkus.length > 0
                ? <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:3 }}>
                    {alertSkus.map(s => (
                      <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:T.redBg, border:`1px solid ${T.redBdr}`, borderRadius:3, padding:'3px 8px' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:T.red, fontFamily:T.font }}>{s.name}</span>
                        <span style={{ fontSize:10, color:T.red, fontFamily:T.fontNum }}>{calcDos(s).toFixed(1)}{lang === 'ja' ? '日' : 'd'}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ fontSize:10, color:T.dim, marginTop:6, fontFamily:T.font }}>{L('kpi_none')}</div>
              }
            </KPICard>

            <KPICard label={lang === 'ja' ? '期限切れ (在庫ゼロ)' : 'Expired (Zero Stock)'} value={expiredSkus.length} accent={T.orange} icon="✕">
              {expiredSkus.length > 0
                ? <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:3 }}>
                    {expiredSkus.map(s => (
                      <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:T.oBg, border:`1px solid ${T.oBdr}`, borderRadius:3, padding:'3px 8px' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:T.orange, fontFamily:T.font }}>{s.name}</span>
                        <span style={{ fontSize:10, color:T.orange, fontWeight:700, fontFamily:T.font }}>{lang === 'ja' ? '在庫ゼロ' : 'STOCKOUT'}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ fontSize:10, color:T.dim, marginTop:6, fontFamily:T.font }}>{L('kpi_none')}</div>
              }
            </KPICard>

            <KPICard label={lang === 'ja' ? `過剰在庫 (${overstockDays}日超)` : `Overstock (>${overstockDays}d)`} value={overstock.length} accent={T.blue} icon="▲">
              <div style={{ fontSize:10, color:T.dim, marginTop:4, fontFamily:T.font }}>
                {lang === 'ja' ? `閾値: ${overstockDays}日 (⚙で変更可)` : `Threshold: ${overstockDays}d (⚙ to change)`}
              </div>
            </KPICard>

            <KPICard label={lang === 'ja' ? '発注点割れ SKU' : 'Below Reorder Point'} value={reorderNow.length} accent={T.orange} icon="↺">
              <div style={{ fontSize:10, color:T.dim, marginTop:4, fontFamily:T.font }}>
                {lang === 'ja' ? '在庫数 < 発注点' : 'Stock < Reorder Point'}
              </div>
            </KPICard>
          </div>

          {/* Today's alert banner */}
          {alertSkus.length > 0 && (
            <div style={{ background:T.redBg, border:`1px solid ${T.redBdr}`, borderLeft:`4px solid ${T.red}`, borderRadius:4, padding:'12px 16px', marginBottom:14, fontFamily:T.font }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <span style={{ fontSize:18 }}>❗</span>
                <span style={{ fontWeight:700, fontSize:13, color:T.red }}>
                  {lang === 'ja' ? '本日のアラート — 即対応が必要なSKU' : "Today's Alerts — Immediate action required"}
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {alertSkus.map(s => (
                  <div key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#fff', border:`1px solid ${T.redBdr}`, borderRadius:3, padding:'5px 12px', cursor:'pointer' }}
                    onClick={() => { setSelSku(s); setTab('heatmap') }}>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:T.red, display:'inline-block', flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:T.red }}>{s.name}</span>
                    <span style={{ fontSize:10, color:T.muted }}>{lang === 'ja' ? `残${calcDos(s).toFixed(1)}日` : `${calcDos(s).toFixed(1)}d left`}</span>
                    <span style={{ fontSize:10, color:T.blue, fontWeight:600 }}>{lang === 'ja' ? '→ HM確認' : '→ View HM'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Actions */}
          <Panel title={lang === 'ja' ? '⚡ 本日のアクション' : "⚡ Today's Actions"} badge={reorderNow.length}>
            {reorderNow.length === 0
              ? <div style={{ padding:'28px', textAlign:'center', color:T.muted, fontSize:12, fontFamily:T.font }}>{L('kpi_all_ok')}</div>
              : reorderNow.map(s => {
                  const st = getStatus(s, overstockDays), d = calcDos(s), urgent = d < 7
                  return (
                    <div key={s.id} style={{ padding:'10px 16px', borderBottom:`1px solid ${T.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:urgent ? T.redBg : 'transparent' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Dot status={st} />
                        <div>
                          <span style={{ fontWeight:700, fontSize:12, fontFamily:T.font }}>{s.name}</span>
                          {s.superset && <span style={{ marginLeft:8, fontSize:10, color:T.muted, fontFamily:T.font }}>{s.superset} › {s.subset}</span>}
                          <span style={{ marginLeft:10, fontSize:10, color:T.muted, fontFamily:T.font }}>
                            {lang === 'ja' ? `在庫:${fmt(s.stock_qty)} · LT:${s.lead_time}日 · 日使用:${s.daily_usage}` : `Stock:${fmt(s.stock_qty)} · LT:${s.lead_time}d · Daily:${s.daily_usage}`}
                          </span>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <StatusBadge status={st} lang={lang} />
                        <span style={{ fontSize:10, fontWeight:700, fontFamily:T.fontNum, color:SC[st]?.t, minWidth:70, textAlign:'right' }}>
                          {d === Infinity ? L('no_usage_data') : lang === 'ja' ? `残${d.toFixed(1)}日` : `${d.toFixed(1)}d left`}
                        </span>
                        <Btn style={{ fontSize:11, padding:'4px 12px' }}>{lang === 'ja' ? '発注' : 'Order'}</Btn>
                      </div>
                    </div>
                  )
                })
            }
          </Panel>
        </>)}

        {/* ════ 在庫管理 ════ */}
        {tab === 'inventory' && (<>

          {skuLimitReached && <SkuLimitBanner lang={lang} onUpgrade={() => setShowPricing(true)} current={skus.length} />}

          {/* Action bar with concise explanation */}
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:4, padding:'14px 18px', marginBottom:14, fontFamily:T.font }}>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
              {/* Manual add */}
              <Btn onClick={() => { if (skuLimitReached) { setShowPricing(true); return } setSf(BSKU); setErr(null); setSkuModal('add') }}
                style={skuLimitReached ? { background:'#94a3b8', cursor:'not-allowed' } : {}}>
                {L('add_sku')}
              </Btn>
              <span style={{ fontSize:11, color:T.muted }}>
                {lang === 'ja' ? '1件ずつ手動登録' : 'Manual, one by one'}
              </span>

              <div style={{ width:1, height:20, background:T.border, margin:'0 8px' }} />

              {/* Bulk CSV */}
              <Btn variant="ghost" onClick={() => { if (isFree) { setShowPricing(true); return } csvRef.current.click() }}>
                {L('import_csv')}
              </Btn>
              <input ref={csvRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleSkuCSV} />
              <Btn variant="green" onClick={downloadSkuTemplate}>↓ {lang === 'ja' ? 'SKU CSVテンプレ' : 'SKU CSV Template'}</Btn>
              <span style={{ fontSize:11, color:T.muted }}>
                {lang === 'ja' ? '複数件を一括登録 (有料プラン)' : 'Bulk import multiple SKUs (paid plan)'}
              </span>
            </div>

            {/* Column guide — concise, no numbering */}
            <div style={{ paddingTop:10, borderTop:`1px solid ${T.borderL}` }}>
              <span style={{ fontSize:10, fontWeight:700, color:T.slate, marginRight:12, fontFamily:T.font }}>
                {lang === 'ja' ? '列の説明:' : 'Column guide:'}
              </span>
              {[
                { k: lang === 'ja' ? '在庫数'   : 'Stock',      v: lang === 'ja' ? '手持ち在庫'     : 'On-hand qty'        },
                { k: lang === 'ja' ? '日使用量' : 'Daily Use',  v: lang === 'ja' ? '1日平均使用数'   : 'Avg daily use'      },
                { k: 'LT',                                        v: lang === 'ja' ? 'リードタイム(日)' : 'Lead time (days)'   },
                { k: lang === 'ja' ? '残日数'   : 'Days Left',  v: lang === 'ja' ? '在庫÷日使用量'   : 'Stock ÷ Daily'      },
                { k: lang === 'ja' ? '発注点'   : 'Reorder Pt', v: lang === 'ja' ? 'LT×日使用量'     : 'LT × Daily'         },
                { k: 'Gap',                                        v: lang === 'ja' ? '在庫−発注点'     : 'Stock − Reorder Pt' },
              ].map(c => (
                <span key={c.k} style={{ fontSize:10, color:T.muted, marginRight:16, fontFamily:T.font }}>
                  <strong style={{ color:T.slate }}>{c.k}</strong>: {c.v}
                </span>
              ))}
            </div>
          </div>

          {/* Superset groups */}
          {supersets.map(ss => {
            const subsets  = [...new Set(skus.filter(s => s.superset === ss).map(s => s.subset).filter(Boolean))]
            const ssSkus   = skus.filter(s => s.superset === ss)
            const critical = ssSkus.filter(s => getStatus(s, overstockDays) === 'critical').length
            return (
              <Panel key={ss} title={`📦 ${ss}`} badge={critical}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto', background:T.bg, borderBottom:`1px solid ${T.border}` }}>
                  {[L('inv_col_name'), L('inv_col_stock'), L('inv_col_daily'), L('inv_col_lt'), L('inv_col_days'), L('inv_col_rp'), L('inv_col_gap'), L('inv_col_status'), ''].map((h, i) => (
                    <div key={i} style={{ padding:'6px 10px', fontSize:9, fontWeight:700, color:T.muted, fontFamily:T.font, letterSpacing:'0.05em', textTransform:'uppercase', textAlign:i > 0 && i < 7 ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {subsets.map(sub => (
                  <div key={sub}>
                    <div style={{ padding:'5px 16px', background:'#f5f3ff', borderBottom:`1px solid ${T.border}`, fontSize:10, fontWeight:700, color:'#3730a3', fontFamily:T.font }}>▸ {sub}</div>
                    {ssSkus.filter(s => s.subset === sub).map(s => <SkuRow key={s.id} s={s} />)}
                  </div>
                ))}
                {ssSkus.filter(s => !s.subset).map(s => <SkuRow key={s.id} s={s} />)}
              </Panel>
            )
          })}
          {noSuperset.length > 0 && (
            <Panel title={L('other')}>
              {noSuperset.map(s => <SkuRow key={s.id} s={s} />)}
            </Panel>
          )}
          {skus.length === 0 && <div style={{ padding:'48px', textAlign:'center', color:T.muted, fontSize:12, fontFamily:T.font }}>{L('no_skus')}</div>}
        </>)}

        {/* ════ ヒートマップ ════ */}
        {tab === 'heatmap' && (<>

          {/* Incremental upload panel */}
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:4, padding:'16px 20px', marginBottom:16, fontFamily:T.font }}>
            <div style={{ fontWeight:700, fontSize:12, color:T.navy, marginBottom:6 }}>
              📥 {lang === 'ja' ? 'Incremental (入荷) — 週次入荷数量を登録' : 'Incremental (Inbound) — Register weekly inbound quantities'}
            </div>
            <div style={{ fontSize:11, color:T.muted, marginBottom:12 }}>
              {lang === 'ja'
                ? 'テンプレをダウンロードして各SKUの週次入荷数量を入力し、アップロードするとヒートマップの予測在庫に反映されます。'
                : 'Download the template, fill in weekly inbound quantities per SKU, then upload to reflect in the heatmap forecast.'}
            </div>

            {/* CSV format preview */}
            <div style={{ background:T.gBg, border:`1px solid ${T.gBdr}`, borderRadius:3, padding:'8px 12px', marginBottom:12, fontSize:10, fontFamily:T.fontNum, color:T.slate, lineHeight:1.8, overflowX:'auto', whiteSpace:'nowrap' }}>
              name, superset, subset, W1_{new Date(Date.now()+7*86400000).toISOString().slice(0,10)}, W2_..., ..., W12_...
              <span style={{ display:'block', fontFamily:T.font, color:T.muted, fontSize:10, marginTop:3 }}>
                {lang === 'ja' ? '→ 入荷がない週は 0 を入力' : '→ Enter 0 for weeks with no inbound'}
              </span>
            </div>

            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <Btn variant="green" onClick={() => downloadIncrementalTemplate(skus)}>
                ↓ {lang === 'ja' ? 'Incrementalテンプレ' : 'Incremental Template'}
              </Btn>
              <Btn variant="blue" onClick={() => incCsvRef.current.click()}>
                ↑ {lang === 'ja' ? 'Incrementalアップロード' : 'Upload Incremental CSV'}
              </Btn>
              <input ref={incCsvRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleIncrementalCSV} />
              {incrementals.length > 0 && (
                <>
                  <span style={{ fontSize:11, color:T.green, fontFamily:T.font }}>
                    ✓ {lang === 'ja'
                      ? `${[...new Set(incrementals.map(r => r.sku_name))].length}件のSKUの入荷データ読込済`
                      : `Inbound data loaded for ${[...new Set(incrementals.map(r => r.sku_name))].length} SKU(s)`}
                  </span>
                  <Btn variant="danger" small onClick={() => { if (confirm(lang === 'ja' ? '入荷データをクリアしますか？' : 'Clear all inbound data?')) setIncrementals([]) }}>
                    {lang === 'ja' ? 'クリア' : 'Clear'}
                  </Btn>
                </>
              )}
            </div>
          </div>

          {/* SKU selector chips */}
          <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
            {skus.map(s => {
              const a = selSku?.id === s.id, st = getStatus(s, overstockDays)
              return (
                <button key={s.id} onClick={() => setSelSku(s)} style={{ padding:'5px 12px', borderRadius:3, border:`1px solid ${a ? SC[st]?.bd : T.border}`, background:a ? SC[st]?.bg : T.surface, color:a ? SC[st]?.t : T.slate, fontSize:10, fontWeight:a ? 700 : 400, fontFamily:T.font, cursor:'pointer', display:'flex', alignItems:'center', gap:5, outline:a ? `2px solid ${SC[st]?.t}` : 0, outlineOffset:1 }}>
                  <Dot status={st} />{s.superset ? `${s.superset} › ` : ''}{s.name}
                </button>
              )
            })}
            {skus.length === 0 && <div style={{ fontSize:12, color:T.muted, fontFamily:T.font }}>{L('add_sku_first')}</div>}
          </div>

          {!selSku && skus.length > 0 && <div style={{ padding:'48px', textAlign:'center', color:T.muted, fontSize:12, fontFamily:T.font }}>{L('lt_select_sku')}</div>}

          {selSku && (<>
            {/* Summary cards */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
              {[
                { k:'lt_cur_stock', v:fmt(selSku.stock_qty),                               a:T.blue   },
                { k:'lt_daily',     v:`${selSku.daily_usage}${lang === 'ja' ? '/日' : '/d'}`, a:'#3730a3' },
                { k:'lt_lt',        v:`${selSku.lead_time}${lang === 'ja' ? '日' : 'd'}`,    a:'#3730a3' },
                { k:'lt_rp',        v:fmt(calcRp(selSku)),                                 a:T.orange },
                { k:'lt_ss',        v:fmt(calcSs(selSku)),                                 a:T.green  },
                { k:'lt_days',      v:calcDos(selSku) === Infinity ? '∞' : calcDos(selSku).toFixed(1) + (lang === 'ja' ? '日' : 'd'), a:SC[getStatus(selSku, overstockDays)]?.t },
              ].map(c => (
                <div key={c.k} style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:`2px solid ${c.a}`, borderRadius:4, padding:'10px 14px', flex:1, minWidth:100, boxShadow:'0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:9, color:T.muted, fontFamily:T.font, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{L(c.k)}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:T.navy, fontFamily:T.fontNum }}>{c.v}</div>
                </div>
              ))}
            </div>

            {/* Heatmap 12-week table */}
            <Panel title={`▦ ${lang === 'ja' ? 'ヒートマップ — 12週予測' : 'Heatmap — 12-Week Forecast'} · ${selSku.name}`}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {[
                      L('col_week'), L('col_date'), L('col_proj_stock'),
                      lang === 'ja' ? 'Incremental (入荷)' : 'Incremental (Inbound)',
                      L('col_wos'), L('col_coverage'), L('col_status'),
                    ].map((h, i) => <th key={h} style={TH(i >= 2 && i <= 4 ? 'right' : 'left')}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {pipeline.map((w, i) => {
                      const m = SC[w.status]
                      return (
                        <tr key={w.week} style={{ background:w.status === 'critical' ? T.redBg : i % 2 === 0 ? 'transparent' : '#fafbfc' }}>
                          <td style={{ ...TD(), fontWeight:700, color:T.slate, fontFamily:T.fontNum }}>W{w.week}</td>
                          <td style={{ ...TD(), color:T.muted, fontSize:11, fontFamily:T.fontNum }}>{w.date}</td>
                          <td style={{ ...TDN(), fontWeight:700, color:m?.t }}>{fmt(w.proj_stock)}</td>
                          <td style={{ ...TDN(), color:T.green, fontWeight:w.inbound > 0 ? 700 : 400 }}>{w.inbound > 0 ? `+${fmt(w.inbound)}` : '—'}</td>
                          <td style={{ ...TDN(), fontWeight:700, color:m?.t }}>{w.wos}</td>
                          <td style={{ ...TD(), minWidth:140 }}><WOSBar wos={w.wos} /></td>
                          <td style={TD()}><StatusBadge status={w.status} lang={lang} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Loaded incremental detail */}
            {incrementals.filter(r => r.sku_name === selSku.name).length > 0 && (
              <Panel title={`📥 ${lang === 'ja' ? '登録済み入荷データ' : 'Loaded Inbound Data'} — ${selSku.name}`}>
                <div style={{ padding:'10px 16px', display:'flex', gap:8, flexWrap:'wrap' }}>
                  {incrementals.filter(r => r.sku_name === selSku.name).map(r => (
                    <div key={r.week} style={{ background:T.gBg, border:`1px solid ${T.gBdr}`, borderRadius:3, padding:'4px 10px', fontSize:11, fontFamily:T.fontNum, color:T.green }}>
                      W{r.week}: +{fmt(r.qty)}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>)}
        </>)}
      </div>

      {/* ════ MODALS ════ */}

      {skuModal && (
        <Modal title={skuModal === 'add' ? L('modal_add_sku') : `${L('modal_edit_sku')} — ${skuModal.name}`} onClose={() => setSkuModal(false)}>
          {err && <div style={ERR}>{err}</div>}
          {skuModal === 'add' && isFree && skus.length >= FREE_SKU_LIMIT && (
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:3, padding:'10px 12px', marginBottom:14, fontSize:11, color:'#92400e', fontFamily:T.font }}>
              ⚠ {lang === 'ja' ? `無料プランはSKU${FREE_SKU_LIMIT}件まで` : `Free plan limit: ${FREE_SKU_LIMIT} SKUs`}
            </div>
          )}
          <div style={{ background:T.bluBg, border:`1px solid ${T.bluBdr}`, borderRadius:3, padding:'10px 12px', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:11, color:T.blue, fontFamily:T.font, marginBottom:6 }}>{L('modal_ss_title')}</div>
            <div style={{ fontSize:10, color:T.slate, fontFamily:T.font, marginBottom:10 }}>{L('modal_ss_hint')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
              <Fld label={L('modal_superset')} value={sf.superset} onChange={e => setSf(f => ({ ...f, superset:e.target.value }))} placeholder={L('ph_superset')} />
              <Fld label={L('modal_subset')}   value={sf.subset}   onChange={e => setSf(f => ({ ...f, subset:e.target.value }))}   placeholder={L('ph_subset')} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <div style={{ gridColumn:'1/-1' }}><Fld label={L('modal_sku_name')} required value={sf.name} onChange={e => setSf(f => ({ ...f, name:e.target.value }))} placeholder={L('ph_sku_name')} /></div>
            <Fld label={L('modal_supplier')}  value={sf.supplier}    onChange={e => setSf(f => ({ ...f, supplier:e.target.value }))}    placeholder={L('ph_supplier')} />
            <Fld label={L('modal_category')}  value={sf.category}    onChange={e => setSf(f => ({ ...f, category:e.target.value }))}    placeholder={L('ph_category')} />
            <Fld label={L('modal_stock_qty')} required type="number" min="0" value={sf.stock_qty}   onChange={e => setSf(f => ({ ...f, stock_qty:e.target.value }))} />
            <Fld label={L('modal_daily')}     required type="number" min="0" value={sf.daily_usage} onChange={e => setSf(f => ({ ...f, daily_usage:e.target.value }))} placeholder={L('ph_daily')} />
            <Fld label={L('modal_lead_time')} required type="number" min="0" value={sf.lead_time}   onChange={e => setSf(f => ({ ...f, lead_time:e.target.value }))} placeholder={L('ph_lead_time')} />
            <Fld label={L('modal_safety')}    type="number" min="0" value={sf.safety_stock} onChange={e => setSf(f => ({ ...f, safety_stock:e.target.value }))} placeholder={`${L('auto_prefix')}${(+sf.daily_usage || 0) * 3}`} />
            <Fld label={L('modal_moq')}       type="number" min="0" value={sf.moq}          onChange={e => setSf(f => ({ ...f, moq:e.target.value }))}          placeholder={L('ph_moq')} />
            <div style={{ gridColumn:'1/-1' }}><Fld label={L('modal_unit_cost')} type="number" min="0" step="0.01" value={sf.unit_cost} onChange={e => setSf(f => ({ ...f, unit_cost:e.target.value }))} placeholder={L('ph_unit_cost')} /></div>
          </div>
          <div style={{ fontSize:10, color:T.muted, background:T.bg, borderRadius:3, padding:'8px 10px', marginBottom:12, fontFamily:T.font }}>
            {L('modal_rp_preview')} = {(+sf.lead_time || 0) * (+sf.daily_usage || 0)} {L('modal_unit')} | {L('modal_ss_preview')} = {sf.safety_stock || (+sf.daily_usage || 0) * 3} {L('modal_unit')}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={saveSku} disabled={saving || (skuLimitReached && skuModal === 'add')} style={{ flex:1, padding:10 }}>
              {saving ? L('modal_save') : skuModal === 'add' ? L('modal_add_btn') : L('modal_save_btn')}
            </Btn>
            <Btn variant="ghost" onClick={() => setSkuModal(false)} style={{ flex:1, padding:10 }}>{L('modal_cancel')}</Btn>
          </div>
        </Modal>
      )}

      {showSettings && <SettingsModal lang={lang} overstockDays={overstockDays} setOverstockDays={setOverstockDays} onClose={() => setShowSettings(false)} />}
      {showPricing  && <PricingModal  lang={lang} user={user} onClose={() => setShowPricing(false)} />}

    </div>
  )
}
