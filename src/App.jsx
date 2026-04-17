import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth }  from './AuthContext.jsx'
import { supabase } from './supabase.js'
import LoginPage    from './components/LoginPage.jsx'
import PricingModal from './components/PricingModal.jsx'

// ── ロジック ────────────────────────────────────────────────
const calcDos = s => s.daily_usage > 0 ? s.stock_qty / s.daily_usage : Infinity
const calcRp  = s => (s.lead_time || 0) * (s.daily_usage || 0)
const calcSs  = s => s.safety_stock || (s.daily_usage || 0) * 3

function getStatus(s) {
  const d = calcDos(s)
  if (d === Infinity) return 'nodata'
  if (d < 7)  return 'critical'
  if (d < 14) return 'warning'
  if (d > 45) return 'overstock'
  return 'healthy'
}

function buildPipeline(sku, asns) {
  let stock = sku.stock_qty
  return Array.from({ length: 12 }, (_, i) => {
    const w        = i + 1
    const dateFrom = new Date(Date.now() + i * 7 * 86400000).toISOString().slice(0, 10)
    const dateTo   = new Date(Date.now() + w * 7 * 86400000).toISOString().slice(0, 10)
    const inbound  = asns.filter(a =>
      a.sku_id === sku.id && a.eta >= dateFrom && a.eta < dateTo && a.status !== 'cancelled'
    ).reduce((s, a) => s + (a.qty || 0), 0)
    stock = Math.max(0, stock - (sku.daily_usage || 0) * 7 + inbound)
    const wos = sku.daily_usage > 0 ? stock / (sku.daily_usage * 7) : 99
    return {
      week: w, date: dateTo,
      proj_stock: Math.round(stock), inbound,
      wos: +wos.toFixed(2),
      status: wos < 1 ? 'critical' : wos < 2 ? 'warning' : wos < 6 ? 'healthy' : 'overstock',
    }
  })
}

// ── カラー ──────────────────────────────────────────────────
const SC = {
  critical:  { text:'#ef4444', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  dot:'#ef4444' },
  warning:   { text:'#f97316', bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.22)', dot:'#f97316' },
  healthy:   { text:'#16a34a', bg:'rgba(22,163,74,0.08)',  border:'rgba(22,163,74,0.22)',  dot:'#16a34a' },
  overstock: { text:'#2563eb', bg:'rgba(37,99,235,0.08)',  border:'rgba(37,99,235,0.22)',  dot:'#2563eb' },
  nodata:    { text:'#94a3b8', bg:'rgba(148,163,184,0.06)',border:'rgba(148,163,184,0.2)', dot:'#94a3b8' },
}
const AC = {
  booked:     { text:'#6366f1', bg:'rgba(99,102,241,0.1)'  },
  in_transit: { text:'#d97706', bg:'rgba(217,119,6,0.1)'   },
  customs:    { text:'#ea580c', bg:'rgba(234,88,12,0.1)'   },
  arrived:    { text:'#16a34a', bg:'rgba(22,163,74,0.1)'   },
  cancelled:  { text:'#94a3b8', bg:'rgba(148,163,184,0.08)'},
}

const fmt  = (v, d=0) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits:d })
const fmtC = v => v == null ? '—' : `$${Number(v).toFixed(2)}`
const cap  = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

// ── スタイル定数 ────────────────────────────────────────────
const F = "'IBM Plex Mono',monospace"
const TH  = { padding:'7px 10px', textAlign:'left',  fontSize:9,  fontWeight:700, color:'#94a3b8', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', whiteSpace:'nowrap', letterSpacing:'0.08em' }
const THR = { ...TH, textAlign:'right' }
const TD  = { padding:'8px 10px', fontSize:12, borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' }
const TDR = { ...TD, textAlign:'right', fontFamily:F }

function Pill({ status, map }) {
  const m = map[status] || map.nodata || {}
  return <span style={{ display:'inline-block', fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:3, background:m.bg, color:m.text, border:`1px solid ${m.border||m.bg}`, whiteSpace:'nowrap' }}>{cap(status?.replace('_',' '))}</span>
}

function WOSBar({ wos }) {
  const p = Math.min(100, (wos / 8) * 100)
  const c = wos < 1 ? '#ef4444' : wos < 2 ? '#f97316' : wos < 4 ? '#eab308' : '#16a34a'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, height:5, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${p}%`, height:'100%', background:c, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:9, color:c, fontFamily:F, minWidth:26, textAlign:'right' }}>{wos.toFixed(1)}w</span>
    </div>
  )
}

function ConfBar({ value }) {
  const p = Math.round((value||0)*100)
  const c = p>=90?'#16a34a':p>=70?'#d97706':p>=50?'#ea580c':'#ef4444'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ width:50, height:4, background:'#e2e8f0', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${p}%`, height:'100%', background:c }} />
      </div>
      <span style={{ fontSize:9, color:c, fontFamily:F }}>{p}%</span>
    </div>
  )
}

function KPI({ label, value, accent, sub }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderTop:`3px solid ${accent}`, borderRadius:8, padding:'14px 18px', flex:1, minWidth:130 }}>
      <div style={{ fontSize:10, color:'#94a3b8', letterSpacing:'0.08em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, color:'#0f172a', fontFamily:F }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'#cbd5e1', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function Card({ title, badge, action, children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:700, fontSize:12, color:'#0f172a' }}>{title}</span>
          {badge > 0 && <span style={{ background:'#ef4444', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>{badge}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16, fontFamily:F }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:10, padding:'26px 24px', width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <span style={{ fontWeight:700, fontSize:14 }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#94a3b8' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const LBL = { display:'block', fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, letterSpacing:'0.04em' }
const INP = { width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, marginBottom:12, outline:'none', fontFamily:F }
const ERR = { background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#dc2626', marginBottom:12 }

function F2({ label, type='text', value, onChange, placeholder, min, step }) {
  return <div><label style={LBL}>{label}</label><input style={INP} type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step} /></div>
}

function Btn({ children, onClick, variant='primary', disabled, style:extra }) {
  const base = { padding:'7px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F, transition:'opacity .15s', ...extra }
  const v = {
    primary: { background:'#0f172a', color:'#fff' },
    ghost:   { background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0' },
    danger:  { background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5' },
    blue:    { background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe' },
  }
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant], opacity:disabled?0.6:1 }}>{children}</button>
}

// ── メインアプリ ────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const payment = params.get('payment')

  if (payment === 'success') {
    alert('支払い成功！')
  }

  if (payment === 'cancelled') {
    alert('キャンセルされました')
  }
}, [])
  const [tab,     setTab]        = useState('dashboard')
  const [skus,    setSkus]       = useState([])
  const [asns,    setAsns]       = useState([])
  const [moves,   setMoves]      = useState([])
  const [selSku,  setSelSku]     = useState(null)
  const [asnFilter, setAsnFilter]= useState('ALL')
  const [showPricing, setShowPricing] = useState(false)

  const [skuModal,  setSkuModal]  = useState(false)
  const [asnModal,  setAsnModal]  = useState(false)
  const [moveModal, setMoveModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState(null)

  const BSKU  = { name:'', category:'', supplier:'', stock_qty:'', daily_usage:'', lead_time:'', safety_stock:'', moq:'', unit_cost:'' }
  const BASN  = { sku_id:'', qty:'', eta:'', status:'booked', supplier:'', vessel:'', bl_number:'', origin_port:'', dest_port:'', confidence:'0.7' }
  const BMOVE = { sku_id:'', qty:'', date:new Date().toISOString().slice(0,10), type:'sale', ref:'' }

  const [sf, setSf] = useState(BSKU)
  const [af, setAf] = useState(BASN)
  const [mf, setMf] = useState(BMOVE)

  const csvRef = useRef(null)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    const [{ data: s }, { data: a }, { data: m }] = await Promise.all([
      supabase.from('skus').select('*').order('name'),
      supabase.from('asns').select('*, skus(name)').order('eta'),
      supabase.from('movements').select('*, skus(name)').order('date', { ascending:false }).limit(100),
    ])
    setSkus(s || []); setAsns(a || []); setMoves(m || [])
  }

  // SKU
  async function saveSku() {
    setErr(null); setSaving(true)
    try {
      const p = { user_id:user.id, name:sf.name.trim(), category:sf.category||null, supplier:sf.supplier||null, stock_qty:+sf.stock_qty, daily_usage:+sf.daily_usage, lead_time:+sf.lead_time, safety_stock:sf.safety_stock?+sf.safety_stock:null, moq:sf.moq?+sf.moq:null, unit_cost:sf.unit_cost?+sf.unit_cost:null }
      if (!p.name) throw new Error('SKU名は必須です')
      const { error:e } = skuModal === 'add' ? await supabase.from('skus').insert(p) : await supabase.from('skus').update(p).eq('id', skuModal.id)
      if (e) throw e
      await fetchAll(); setSkuModal(false)
    } catch(e) { setErr(e.message) } finally { setSaving(false) }
  }

  async function deleteSku(id) {
    if (!confirm('このSKUと関連ASNを削除しますか？')) return
    await supabase.from('asns').delete().eq('sku_id', id)
    await supabase.from('skus').delete().eq('id', id)
    await fetchAll()
  }

  function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = ev.target.result.trim().split('\n').slice(1).map(l => {
        const [name, stock_qty, daily_usage, lead_time, safety_stock, moq, unit_cost, supplier] = l.split(',')
        return { user_id:user.id, name:(name||'').trim(), stock_qty:+stock_qty||0, daily_usage:+daily_usage||0, lead_time:+lead_time||7, safety_stock:safety_stock?+safety_stock:null, moq:moq?+moq:null, unit_cost:unit_cost?+unit_cost:null, supplier:(supplier||'').trim()||null }
      }).filter(r => r.name)
      if (!rows.length) { alert('有効な行がありません。形式: name,stock_qty,daily_usage,lead_time'); return }
      const { error } = await supabase.from('skus').upsert(rows, { onConflict:'user_id,name' })
      error ? alert('エラー: ' + error.message) : (alert(`${rows.length}件インポート完了`), fetchAll())
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // ASN
  async function saveAsn() {
    setErr(null); setSaving(true)
    try {
      const p = { user_id:user.id, sku_id:af.sku_id, qty:+af.qty, eta:af.eta, status:af.status, supplier:af.supplier||null, vessel:af.vessel||null, bl_number:af.bl_number||null, origin_port:af.origin_port||null, dest_port:af.dest_port||null, confidence:+af.confidence }
      if (!p.sku_id || !p.qty || !p.eta) throw new Error('SKU・数量・ETAは必須です')
      const { error:e } = asnModal === 'add' ? await supabase.from('asns').insert(p) : await supabase.from('asns').update(p).eq('id', asnModal.id)
      if (e) throw e
      await fetchAll(); setAsnModal(false)
    } catch(e) { setErr(e.message) } finally { setSaving(false) }
  }

  // Movement
  async function saveMove() {
    setErr(null); setSaving(true)
    try {
      const qty = +mf.qty
      if (!mf.sku_id || !qty) throw new Error('SKUと数量を入力してください')
      const { error:e1 } = await supabase.from('movements').insert({ user_id:user.id, sku_id:mf.sku_id, qty, date:mf.date, type:mf.type, ref:mf.ref||null })
      if (e1) throw e1
      const sku = skus.find(s => s.id === mf.sku_id)
      if (sku) await supabase.from('skus').update({ stock_qty: Math.max(0, sku.stock_qty + qty) }).eq('id', sku.id)
      await fetchAll(); setMoveModal(false)
    } catch(e) { setErr(e.message) } finally { setSaving(false) }
  }

  // Derived
  const critical   = skus.filter(s => getStatus(s) === 'critical')
  const reorderNow = skus.filter(s => s.stock_qty < calcRp(s))
  const overstock  = skus.filter(s => getStatus(s) === 'overstock')
  const totalStock = skus.reduce((a, s) => a + s.stock_qty, 0)
  const totalValue = skus.reduce((a, s) => a + s.stock_qty * (s.unit_cost || 0), 0)
  const inTransit  = asns.filter(a => a.status === 'in_transit' || a.status === 'customs').reduce((a, n) => a + (n.qty||0), 0)
  const pipeline   = useMemo(() => selSku ? buildPipeline(selSku, asns) : [], [selSku, asns])
  const asnList    = asnFilter === 'ALL' ? asns : asns.filter(a => a.status === asnFilter)

  if (authLoading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#94a3b8', fontFamily:F }}>Loading…</div>
  if (!user) return <LoginPage />

  const TabBtn = ({ id, label, badge }) => (
    <button onClick={() => setTab(id)} style={{ padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:tab===id?700:500, color:tab===id?'#0f172a':'#64748b', fontFamily:F, borderBottom:tab===id?'2px solid #0f172a':'2px solid transparent', marginBottom:-2, transition:'all .12s' }}>
      {label}{badge>0&&<span style={{ background:'#ef4444', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:10, marginLeft:4 }}>{badge}</span>}
    </button>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f0f4f8', fontFamily:F, color:'#1e293b' }}>

      {/* NAV */}
      <nav style={{ background:'#0f172a', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:'#38bdf8' }}>📦 StockWise</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {totalValue > 0 && <span style={{ fontSize:10, color:'#475569', fontFamily:F }}>${(totalValue/1000).toFixed(0)}K在庫</span>}
          <Btn onClick={() => setShowPricing(true)} style={{ background:'#1e293b', color:'#38bdf8', border:'1px solid #334155', fontSize:10, padding:'5px 10px' }}>Pro へアップグレード</Btn>
          <span style={{ fontSize:10, color:'#475569', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</span>
          <Btn onClick={signOut} style={{ background:'#1e293b', color:'#94a3b8', border:'1px solid #334155', fontSize:10, padding:'5px 10px' }}>ログアウト</Btn>
        </div>
      </nav>

      <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px 16px' }}>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginBottom:22, borderBottom:'2px solid #e2e8f0' }}>
          <TabBtn id="dashboard"   label="ダッシュボード" badge={critical.length} />
          <TabBtn id="inventory"   label="在庫管理" />
          <TabBtn id="lt_pipeline" label="LTパイプライン" />
          <TabBtn id="asn"         label="ASN追跡" badge={asns.filter(a=>a.status==='customs').length} />
          <TabBtn id="movements"   label="入出庫履歴" />
        </div>

        {/* ════ DASHBOARD ════ */}
        {tab === 'dashboard' && (<>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
            <KPI label="総在庫数量"        value={fmt(totalStock)}       accent="#64748b" />
            <KPI label="危機的SKU (7日未満)" value={critical.length}     accent="#ef4444" sub={critical.map(s=>s.name).join(' · ')||'なし'} />
            <KPI label="今すぐ発注必要"     value={reorderNow.length}    accent="#f97316" />
            <KPI label="輸送中 (ASN)"       value={fmt(inTransit)}       accent="#d97706" sub="units in transit" />
            <KPI label="過剰在庫 (45日超)"  value={overstock.length}     accent="#2563eb" />
          </div>

          {critical.length > 0 && (
            <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:10, fontSize:12 }}>
              <span style={{ fontSize:18 }}>⚠️</span>
              <span style={{ fontWeight:700, color:'#dc2626' }}>危機的: </span>
              <span style={{ color:'#b91c1c' }}>{critical.map(s=>s.name).join(' · ')}</span>
            </div>
          )}

          <Card title="⚡ 本日のアクション" badge={reorderNow.length}>
            {reorderNow.length === 0
              ? <div style={{ padding:'28px 16px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>✓ 全SKUが発注点以上です</div>
              : reorderNow.map(s => {
                  const d = calcDos(s); const urgent = d < 7
                  const asnIn = asns.find(a => a.sku_id===s.id && ['in_transit','customs','booked'].includes(a.status))
                  return (
                    <div key={s.id} style={{ padding:'10px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', background:urgent?'#fff5f5':'transparent' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span>{urgent?'🔴':'🟡'}</span>
                        <div>
                          <span style={{ fontWeight:700, fontSize:12 }}>{s.name}</span>
                          <span style={{ marginLeft:10, fontSize:10, color:'#94a3b8' }}>在庫:{fmt(s.stock_qty)} · 発注点:{fmt(calcRp(s))} · LT:{s.lead_time}日</span>
                          {asnIn && <span style={{ marginLeft:10, fontSize:10, color:'#d97706' }}>🚢 +{fmt(asnIn.qty)} ETA {asnIn.eta}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:3, background:urgent?'#fef2f2':'#fffbeb', color:urgent?'#dc2626':'#b45309', border:`1px solid ${urgent?'#fca5a5':'#fcd34d'}`, whiteSpace:'nowrap' }}>
                        {d===Infinity?'使用量データなし':urgent?`今すぐ発注 — 残${d.toFixed(1)}日`:`要注意 — 残${d.toFixed(1)}日`}
                      </span>
                    </div>
                  )
                })
            }
          </Card>

          <Card title="▦ 在庫ヒートマップ">
            {skus.length === 0 ? <div style={{ padding:'28px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>在庫タブからSKUを追加してください</div> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['SKU名','カテゴリ','在庫数','日使用量','LT(日)','残日数','発注点','安全在庫','ステータス'].map((h,i) => <th key={h} style={i>1?THR:TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...skus].sort((a,b)=>calcDos(a)-calcDos(b)).map(s => {
                      const st=getStatus(s); const d=calcDos(s); const m=SC[st]
                      return (
                        <tr key={s.id} style={{ background:m.bg+'44', cursor:'pointer' }} onClick={() => { setSelSku(s); setTab('lt_pipeline') }}>
                          <td style={{ ...TD, fontWeight:700 }}>
                            <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:m.dot, marginRight:8 }} />
                            {s.name}
                          </td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{s.category||'—'}</td>
                          <td style={TDR}>{fmt(s.stock_qty)}</td>
                          <td style={TDR}>{s.daily_usage}/日</td>
                          <td style={{ ...TDR, color:'#6366f1' }}>{s.lead_time}日</td>
                          <td style={{ ...TDR, fontWeight:700, color:m.text }}>{d===Infinity?'∞':d.toFixed(1)}</td>
                          <td style={TDR}>{fmt(calcRp(s))}</td>
                          <td style={TDR}>{fmt(calcSs(s))}</td>
                          <td style={TD}><Pill status={st} map={SC} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>)}

        {/* ════ INVENTORY ════ */}
        {tab === 'inventory' && (<>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <Btn onClick={() => { setSf(BSKU); setErr(null); setSkuModal('add') }}>+ SKU追加</Btn>
            <Btn variant="ghost" onClick={() => csvRef.current.click()}>↑ CSVインポート</Btn>
            <input ref={csvRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleCSV} />
            <span style={{ fontSize:10, color:'#94a3b8' }}>CSV形式: name, stock_qty, daily_usage, lead_time[, safety_stock, moq, unit_cost, supplier]</span>
          </div>
          <Card title={`全SKU (${skus.length}件)`}>
            {skus.length === 0 ? <div style={{ padding:'28px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>まだSKUがありません</div> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['SKU名','カテゴリ','仕入先','在庫数','日使用量','LT(日)','安全在庫','MOQ','単価','発注点','Gap','ステータス',''].map((h,i) =>
                      <th key={h} style={i>=3&&i<=10?THR:TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {skus.map(s => {
                      const st=getStatus(s); const gap=s.stock_qty-calcRp(s)
                      return (
                        <tr key={s.id}>
                          <td style={{ ...TD, fontWeight:700 }}>
                            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:SC[st]?.dot, marginRight:7 }} />
                            {s.name}
                          </td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{s.category||'—'}</td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{s.supplier||'—'}</td>
                          <td style={TDR}>{fmt(s.stock_qty)}</td>
                          <td style={TDR}>{s.daily_usage}/日</td>
                          <td style={{ ...TDR, color:'#6366f1' }}>{s.lead_time}日</td>
                          <td style={TDR}>{fmt(calcSs(s))}</td>
                          <td style={TDR}>{fmt(s.moq)}</td>
                          <td style={TDR}>{fmtC(s.unit_cost)}</td>
                          <td style={TDR}>{fmt(calcRp(s))}</td>
                          <td style={{ ...TDR, fontWeight:700, color:gap<0?'#ef4444':'#16a34a' }}>{gap>=0?'+':''}{fmt(gap)}</td>
                          <td style={TD}><Pill status={st} map={SC} /></td>
                          <td style={TD}>
                            <Btn variant="ghost" style={{ fontSize:10, marginRight:4 }} onClick={() => { setSf({ name:s.name, category:s.category||'', supplier:s.supplier||'', stock_qty:s.stock_qty, daily_usage:s.daily_usage, lead_time:s.lead_time, safety_stock:s.safety_stock||'', moq:s.moq||'', unit_cost:s.unit_cost||'' }); setErr(null); setSkuModal(s) }}>編集</Btn>
                            <Btn variant="danger" style={{ fontSize:10 }} onClick={() => deleteSku(s.id)}>削除</Btn>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>)}

        {/* ════ LT PIPELINE ════ */}
        {tab === 'lt_pipeline' && (<>
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
            {skus.map(s => {
              const a=selSku?.id===s.id; const st=getStatus(s); const m=SC[st]
              return (
                <button key={s.id} onClick={() => setSelSku(s)} style={{ padding:'5px 12px', borderRadius:16, border:'1px solid', borderColor:a?m.text:'#e2e8f0', background:a?m.bg:'#fff', color:a?m.text:'#64748b', fontSize:10, cursor:'pointer', fontFamily:F, fontWeight:a?700:400, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:m.dot, display:'inline-block' }} />
                  {s.name}
                </button>
              )
            })}
          </div>

          {!selSku && <div style={{ padding:'48px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>← 上からSKUを選択してください</div>}

          {selSku && (<>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
              {[
                { label:'現在庫',   value:fmt(selSku.stock_qty),                          accent:'#2563eb' },
                { label:'日使用量', value:`${selSku.daily_usage}/日`,                     accent:'#0ea5e9' },
                { label:'LT',      value:`${selSku.lead_time}日`,                         accent:'#6366f1' },
                { label:'発注点',   value:fmt(calcRp(selSku)),                            accent:'#f97316' },
                { label:'安全在庫', value:fmt(calcSs(selSku)),                            accent:'#16a34a' },
                { label:'残日数',   value:calcDos(selSku)===Infinity?'∞':calcDos(selSku).toFixed(1)+'日', accent:SC[getStatus(selSku)]?.text },
              ].map(c => (
                <div key={c.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderTop:`2px solid ${c.accent}`, borderRadius:8, padding:'12px 14px', flex:1, minWidth:110 }}>
                  <div style={{ fontSize:9, color:'#94a3b8', marginBottom:5, letterSpacing:'0.08em' }}>{c.label}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#0f172a', fontFamily:F }}>{c.value}</div>
                </div>
              ))}
            </div>

            <Card title={`⏱ 12週LTパイプライン — ${selSku.name}`}
              action={<Btn variant="blue" onClick={() => { setAf({ ...BASN, sku_id:selSku.id }); setErr(null); setAsnModal('add') }}>+ ASN追加</Btn>}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['週','日付','予測在庫','ASN入荷','WOS','カバレッジ','ステータス'].map((h,i) =>
                      <th key={h} style={i>=2&&i<=4?THR:TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {pipeline.map(w => {
                      const m = SC[w.status]
                      return (
                        <tr key={w.week} style={{ background:w.status==='critical'?'rgba(239,68,68,0.03)':'transparent' }}>
                          <td style={{ ...TD, fontWeight:700, color:'#64748b', fontFamily:F }}>W{w.week}</td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10, fontFamily:F }}>{w.date}</td>
                          <td style={{ ...TDR, fontWeight:700, color:m.text }}>{fmt(w.proj_stock)}</td>
                          <td style={{ ...TDR, color:'#16a34a', fontWeight:w.inbound>0?700:400 }}>{w.inbound>0?`+${fmt(w.inbound)}`:'—'}</td>
                          <td style={{ ...TDR, fontWeight:700, color:m.text }}>{w.wos.toFixed(2)}</td>
                          <td style={{ ...TD, minWidth:140 }}><WOSBar wos={w.wos} /></td>
                          <td style={TD}><Pill status={w.status} map={SC} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {asns.filter(a => a.sku_id===selSku.id).length > 0 && (
              <Card title={`🚢 入荷予定 (ASN) — ${selSku.name}`}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>
                      {['数量','ETA','ステータス','仕入先','船名','B/L番号','出発港','到着港','信頼度',''].map((h,i) =>
                        <th key={h} style={i===0?THR:TH}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {asns.filter(a => a.sku_id===selSku.id).map(a => (
                        <tr key={a.id}>
                          <td style={{ ...TDR, fontWeight:700, color:'#16a34a' }}>+{fmt(a.qty)}</td>
                          <td style={{ ...TD, fontFamily:F, fontSize:11 }}>{a.eta}</td>
                          <td style={TD}><Pill status={a.status} map={AC} /></td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.supplier||'—'}</td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.vessel||'—'}</td>
                          <td style={{ ...TD, fontFamily:F, color:'#94a3b8', fontSize:10 }}>{a.bl_number||'—'}</td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.origin_port||'—'}</td>
                          <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.dest_port||'—'}</td>
                          <td style={TD}><ConfBar value={a.confidence} /></td>
                          <td style={TD}>
                            <Btn variant="ghost" style={{ fontSize:10, marginRight:4 }} onClick={() => { setAf({ sku_id:a.sku_id, qty:a.qty, eta:a.eta, status:a.status, supplier:a.supplier||'', vessel:a.vessel||'', bl_number:a.bl_number||'', origin_port:a.origin_port||'', dest_port:a.dest_port||'', confidence:a.confidence||0.7 }); setErr(null); setAsnModal(a) }}>編集</Btn>
                            <Btn variant="danger" style={{ fontSize:10 }} onClick={async () => { if (confirm('削除しますか？')) { await supabase.from('asns').delete().eq('id',a.id); fetchAll() } }}>削除</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>)}
        </>)}

        {/* ════ ASN ════ */}
        {tab === 'asn' && (<>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <Btn onClick={() => { setAf({ ...BASN, sku_id:skus[0]?.id||'' }); setErr(null); setAsnModal('add') }} disabled={skus.length===0}>+ ASN追加</Btn>
            {['ALL','booked','in_transit','customs','arrived','cancelled'].map(f => {
              const cnt = f==='ALL'?asns.length:asns.filter(a=>a.status===f).length
              const a   = asnFilter===f
              return <button key={f} onClick={() => setAsnFilter(f)} style={{ padding:'5px 12px', borderRadius:14, border:'1px solid', borderColor:a?'#0f172a':'#e2e8f0', background:a?'#0f172a':'#fff', color:a?'#fff':'#64748b', fontSize:10, cursor:'pointer', fontFamily:F, fontWeight:a?700:400 }}>{f==='ALL'?'全て':f.replace('_',' ')} ({cnt})</button>
            })}
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            {Object.entries(AC).map(([k,v]) => {
              const list = asns.filter(a=>a.status===k)
              return (
                <div key={k} style={{ background:'#fff', border:'1px solid #e2e8f0', borderTop:`2px solid ${v.text}`, borderRadius:8, padding:'12px 14px', flex:1, minWidth:110 }}>
                  <div style={{ fontSize:9, color:'#94a3b8', marginBottom:4, letterSpacing:'0.08em' }}>{k.replace('_',' ').toUpperCase()}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:v.text, fontFamily:F }}>{list.length}</div>
                  <div style={{ fontSize:9, color:'#94a3b8', marginTop:2 }}>{fmt(list.reduce((a,n)=>a+(n.qty||0),0))} units</div>
                </div>
              )
            })}
          </div>

          <Card title={`🚢 ASN一覧 (${asnList.length}件)`}>
            {asnList.length === 0 ? <div style={{ padding:'28px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>ASNがありません</div> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['SKU名','仕入先','数量','ETA','ステータス','船名','B/L番号','出発港','到着港','信頼度',''].map((h,i) =>
                      <th key={h} style={i===2?THR:TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {asnList.map(a => (
                      <tr key={a.id}>
                        <td style={{ ...TD, fontWeight:700, fontSize:11 }}>{a.skus?.name||a.sku_id}</td>
                        <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.supplier||'—'}</td>
                        <td style={{ ...TDR, fontWeight:700, color:'#16a34a' }}>+{fmt(a.qty)}</td>
                        <td style={{ ...TD, fontFamily:F, fontSize:11 }}>{a.eta}</td>
                        <td style={TD}><Pill status={a.status} map={AC} /></td>
                        <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.vessel||'—'}</td>
                        <td style={{ ...TD, fontFamily:F, color:'#94a3b8', fontSize:10 }}>{a.bl_number||'—'}</td>
                        <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.origin_port||'—'}</td>
                        <td style={{ ...TD, color:'#94a3b8', fontSize:10 }}>{a.dest_port||'—'}</td>
                        <td style={TD}><ConfBar value={a.confidence} /></td>
                        <td style={TD}>
                          <Btn variant="ghost" style={{ fontSize:10, marginRight:4 }} onClick={() => { setAf({ sku_id:a.sku_id, qty:a.qty, eta:a.eta, status:a.status, supplier:a.supplier||'', vessel:a.vessel||'', bl_number:a.bl_number||'', origin_port:a.origin_port||'', dest_port:a.dest_port||'', confidence:a.confidence||0.7 }); setErr(null); setAsnModal(a) }}>編集</Btn>
                          <Btn variant="danger" style={{ fontSize:10 }} onClick={async () => { if (confirm('削除しますか？')) { await supabase.from('asns').delete().eq('id',a.id); fetchAll() } }}>削除</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>)}

        {/* ════ MOVEMENTS ════ */}
        {tab === 'movements' && (<>
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            <Btn onClick={() => { setMf({ ...BMOVE, sku_id:skus[0]?.id||'' }); setErr(null); setMoveModal(true) }} disabled={skus.length===0}>+ 入出庫記録</Btn>
          </div>
          <Card title={`↕ 入出庫履歴 (${moves.length}件)`}>
            {moves.length === 0 ? <div style={{ padding:'28px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>履歴がありません</div> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    {['日付','SKU名','数量','種別','参照番号'].map((h,i) => <th key={h} style={i===2?THR:TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {moves.map(m => (
                      <tr key={m.id}>
                        <td style={{ ...TD, fontFamily:F, fontSize:10, color:'#94a3b8' }}>{m.date}</td>
                        <td style={{ ...TD, fontWeight:700 }}>{m.skus?.name||m.sku_id}</td>
                        <td style={{ ...TDR, fontWeight:700, color:m.qty>=0?'#16a34a':'#ef4444' }}>{m.qty>=0?'+':''}{fmt(m.qty)}</td>
                        <td style={TD}><span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:3, background:m.type==='inbound'?'rgba(22,163,74,0.1)':'rgba(239,68,68,0.08)', color:m.type==='inbound'?'#16a34a':'#ef4444' }}>{(m.type||'sale').toUpperCase()}</span></td>
                        <td style={{ ...TD, fontFamily:F, fontSize:10, color:'#94a3b8' }}>{m.ref||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>)}
      </div>

      {/* ════ MODALS ════ */}

      {skuModal && (
        <Modal title={skuModal==='add'?'SKU追加':`編集 — ${skuModal.name}`} onClose={() => setSkuModal(false)}>
          {err && <div style={ERR}>{err}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <div style={{ gridColumn:'1/-1' }}><F2 label="SKU名 *" value={sf.name} onChange={e => setSf(f=>({...f,name:e.target.value}))} placeholder="例: Wireless Earbuds Pro" /></div>
            <F2 label="カテゴリ" value={sf.category} onChange={e => setSf(f=>({...f,category:e.target.value}))} placeholder="例: Audio" />
            <F2 label="仕入先" value={sf.supplier} onChange={e => setSf(f=>({...f,supplier:e.target.value}))} placeholder="例: FoxconnSZ" />
            <F2 label="在庫数量 *" type="number" min="0" value={sf.stock_qty} onChange={e => setSf(f=>({...f,stock_qty:e.target.value}))} placeholder="0" />
            <F2 label="1日使用量 *" type="number" min="0" value={sf.daily_usage} onChange={e => setSf(f=>({...f,daily_usage:e.target.value}))} placeholder="個/日" />
            <F2 label="リードタイム(日) *" type="number" min="0" value={sf.lead_time} onChange={e => setSf(f=>({...f,lead_time:e.target.value}))} placeholder="例: 14" />
            <F2 label="安全在庫 (自動計算可)" type="number" min="0" value={sf.safety_stock} onChange={e => setSf(f=>({...f,safety_stock:e.target.value}))} placeholder={`自動: ${(+sf.daily_usage||0)*3}`} />
            <F2 label="MOQ" type="number" min="0" value={sf.moq} onChange={e => setSf(f=>({...f,moq:e.target.value}))} placeholder="最小発注量" />
            <div style={{ gridColumn:'1/-1' }}><F2 label="単価 ($)" type="number" min="0" step="0.01" value={sf.unit_cost} onChange={e => setSf(f=>({...f,unit_cost:e.target.value}))} placeholder="例: 28.50" /></div>
          </div>
          <div style={{ fontSize:10, color:'#94a3b8', background:'#f8fafc', borderRadius:6, padding:'8px 10px', marginBottom:10 }}>
            発注点 = {(+sf.lead_time||0)*(+sf.daily_usage||0)}個　|　安全在庫 = {sf.safety_stock||(+sf.daily_usage||0)*3}個
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={saveSku} disabled={saving} style={{ flex:1, padding:10 }}>{saving?'保存中…':skuModal==='add'?'追加':'保存'}</Btn>
            <Btn variant="ghost" onClick={() => setSkuModal(false)} style={{ flex:1, padding:10 }}>キャンセル</Btn>
          </div>
        </Modal>
      )}

      {asnModal && (
        <Modal title={asnModal==='add'?'ASN追加':'ASN編集'} onClose={() => setAsnModal(false)}>
          {err && <div style={ERR}>{err}</div>}
          <label style={LBL}>SKU *</label>
          <select style={INP} value={af.sku_id} onChange={e => setAf(f=>({...f,sku_id:e.target.value}))}>
            <option value="">選択してください…</option>
            {skus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <F2 label="数量 *" type="number" min="1" value={af.qty} onChange={e => setAf(f=>({...f,qty:e.target.value}))} placeholder="個" />
            <F2 label="ETA *" type="date" value={af.eta} onChange={e => setAf(f=>({...f,eta:e.target.value}))} />
          </div>
          <label style={LBL}>ステータス</label>
          <select style={INP} value={af.status} onChange={e => setAf(f=>({...f,status:e.target.value}))}>
            {['booked','in_transit','customs','arrived','cancelled'].map(s => <option key={s} value={s}>{s.replace('_',' ').toUpperCase()}</option>)}
          </select>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 12px' }}>
            <F2 label="仕入先" value={af.supplier} onChange={e => setAf(f=>({...f,supplier:e.target.value}))} placeholder="例: FoxconnSZ" />
            <F2 label="船名" value={af.vessel} onChange={e => setAf(f=>({...f,vessel:e.target.value}))} placeholder="例: EVER GRACE" />
            <F2 label="B/L番号" value={af.bl_number} onChange={e => setAf(f=>({...f,bl_number:e.target.value}))} placeholder="例: FCSZ240612" />
            <F2 label="信頼度 (0〜1)" type="number" min="0" max="1" step="0.05" value={af.confidence} onChange={e => setAf(f=>({...f,confidence:e.target.value}))} placeholder="0.7" />
            <F2 label="出発港" value={af.origin_port} onChange={e => setAf(f=>({...f,origin_port:e.target.value}))} placeholder="例: Shenzhen" />
            <F2 label="到着港" value={af.dest_port} onChange={e => setAf(f=>({...f,dest_port:e.target.value}))} placeholder="例: Los Angeles" />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={saveAsn} disabled={saving} style={{ flex:1, padding:10 }}>{saving?'保存中…':asnModal==='add'?'追加':'保存'}</Btn>
            <Btn variant="ghost" onClick={() => setAsnModal(false)} style={{ flex:1, padding:10 }}>キャンセル</Btn>
          </div>
        </Modal>
      )}

      {moveModal && (
        <Modal title="入出庫記録" onClose={() => setMoveModal(false)}>
          {err && <div style={ERR}>{err}</div>}
          <F2 label="日付" type="date" value={mf.date} onChange={e => setMf(f=>({...f,date:e.target.value}))} />
          <label style={LBL}>SKU *</label>
          <select style={INP} value={mf.sku_id} onChange={e => setMf(f=>({...f,sku_id:e.target.value}))}>
            <option value="">選択してください…</option>
            {skus.map(s => <option key={s.id} value={s.id}>{s.name} (在庫: {s.stock_qty})</option>)}
          </select>
          <F2 label="数量 (入庫=正, 出庫=負)" type="number" value={mf.qty} onChange={e => setMf(f=>({...f,qty:e.target.value}))} placeholder="+100 または -20" />
          <label style={LBL}>種別</label>
          <select style={INP} value={mf.type} onChange={e => setMf(f=>({...f,type:e.target.value}))}>
            {['sale','inbound','adjustment','return','write-off'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
          <F2 label="参照番号 (任意)" value={mf.ref} onChange={e => setMf(f=>({...f,ref:e.target.value}))} placeholder="ORD-1234" />
          <div style={{ display:'flex', gap:8 }}>
            <Btn onClick={saveMove} disabled={saving} style={{ flex:1, padding:10 }}>{saving?'保存中…':'保存'}</Btn>
            <Btn variant="ghost" onClick={() => setMoveModal(false)} style={{ flex:1, padding:10 }}>キャンセル</Btn>
          </div>
        </Modal>
      )}

      {showPricing && <PricingModal user={user} onClose={() => setShowPricing(false)} />}
    </div>
  )
}
