import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase.js'
import { detectLang } from './i18n.js'
import LoginPage from './components/LoginPage.jsx'
import PricingModal from './components/PricingModal.jsx'

const T = {
  font: 'Arial,Helvetica,sans-serif',
  bg: '#001426', panel: '#06223d', panel2: '#082947', line: '#173e64', text: '#f8fbff', muted: '#9ab2cc',
  blue: '#3b82f6', red: '#ff465d', orange: '#ff8a1c', green: '#22c985', navy: '#020b16', white: '#fff'
}

const sampleSkus = [
  { id:'sample-1', name:'イヤホン Pro Model A', superset:'オーディオ', subset:'Supplier A', supplier:'Supplier A', stock_qty:420, daily_usage:62, lead_time:18, safety_stock:186, moq:1000, unit_cost:120, sku:'EPH-PRO-A', icon:'🎧' },
  { id:'sample-2', name:'USB-C ハブ', superset:'PC周辺機器', subset:'Supplier B', supplier:'Supplier B', stock_qty:980, daily_usage:54, lead_time:20, safety_stock:150, moq:700, unit_cost:38, sku:'USB-HUB-B', icon:'▱' },
  { id:'sample-3', name:'ゲーミングマウス', superset:'入力機器', subset:'Supplier C', supplier:'Supplier C', stock_qty:1605, daily_usage:50, lead_time:16, safety_stock:180, moq:500, unit_cost:26, sku:'GMS-C', icon:'🖱' },
  { id:'sample-4', name:'メカニカルキーボード', superset:'入力機器', subset:'Supplier D', supplier:'Supplier D', stock_qty:7500, daily_usage:30, lead_time:25, safety_stock:150, moq:300, unit_cost:45, sku:'MKB-D', icon:'⌨' },
  { id:'sample-5', name:'USB-C ケーブル', superset:'ケーブル', subset:'Supplier E', supplier:'Supplier E', stock_qty:3600, daily_usage:30, lead_time:14, safety_stock:200, moq:900, unit_cost:8, sku:'USBC-E', icon:'🔌' },
]

const calcDays = s => Number(s.daily_usage) > 0 ? Number(s.stock_qty || 0) / Number(s.daily_usage) : 999
const calcRp = s => Number(s.lead_time || 0) * Number(s.daily_usage || 0)
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const moneyK = n => `$${Math.round(Number(n || 0) / 1000)}K`

function statusOf(s) {
  const d = calcDays(s)
  if (d < 7) return 'alert'
  if (d < 15) return 'attention'
  if (d > 60) return 'over'
  return 'good'
}
const statusMeta = {
  alert: { label:'アラート', color:T.red, desc:'7日以内で欠品リスクが高い' },
  attention: { label:'注意', color:T.orange, desc:'7〜14日以内で欠品リスクあり' },
  good: { label:'適正', color:T.green, desc:'15〜60日で適正在庫' },
  over: { label:'過剰', color:T.blue, desc:'60日超で在庫過多の可能性' },
}

function buildForecast(sku, incrementals) {
  let stock = Number(sku.stock_qty || 0)
  return [0, 1, 2, 3].map(i => {
    const inbound = (incrementals || []).filter(r => r.sku_name === sku.name && r.week === i).reduce((a, r) => a + Number(r.qty || 0), 0)
    if (i > 0) stock = Math.max(0, stock - Number(sku.daily_usage || 0) * 7 + inbound)
    const days = Number(sku.daily_usage) > 0 ? stock / Number(sku.daily_usage) : 999
    const st = days < 7 ? 'alert' : days < 15 ? 'attention' : days > 60 ? 'over' : 'good'
    return { week:i, stock:Math.round(stock), days, status:st }
  })
}

function Btn({ children, onClick, kind='ghost', small=false }) {
  const styles = {
    ghost: { background:'rgba(6,34,61,.75)', border:`1px solid ${T.line}`, color:'#cfe7ff' },
    blue: { background:'rgba(59,130,246,.17)', border:'1px solid #2c6dcc', color:'#8fc2ff' },
    orange: { background:'rgba(255,138,28,.12)', border:'1px solid #b65705', color:'#ffbd75' },
  }
  return <button onClick={onClick} style={{ ...styles[kind], borderRadius:8, padding:small?'7px 12px':'10px 16px', fontFamily:T.font, fontWeight:700, fontSize:small?12:14, cursor:'pointer' }}>{children}</button>
}

function IconBox({ icon, active=false }) {
  return <div style={{ width:120, height:90, borderRadius:10, background:'linear-gradient(145deg,#e9eef4,#b8c5d2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:active?48:40, color:'#75879a', border:'1px solid rgba(255,255,255,.55)' }}>{icon}</div>
}

function MetricCard({ tone, icon, title, sub, value, note, button, onClick }) {
  const c = tone === 'red' ? T.red : tone === 'orange' ? T.orange : T.blue
  return <div style={{ flex:1, minWidth:300, border:`1px solid ${c}`, borderRadius:10, padding:'22px 26px', background:`linear-gradient(135deg, ${tone === 'red' ? 'rgba(255,35,58,.45)' : 'rgba(255,120,0,.44)'}, rgba(2,11,22,.75))`, boxShadow:`0 0 28px ${c}24` }}>
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:18 }}>
      <div style={{ display:'flex', gap:16 }}>
        <div style={{ fontSize:34, color:c }}>{icon}</div>
        <div><div style={{ fontWeight:900, fontSize:20 }}>{title}</div><div style={{ fontSize:14, fontWeight:700 }}>{sub}</div></div>
      </div>
      {button && <Btn small onClick={onClick}>{button} →</Btn>}
    </div>
    <div style={{ fontSize:58, fontWeight:900, lineHeight:1, marginTop:20 }}>{value}<span style={{ fontSize:22, marginLeft:12 }}>件</span></div>
    <div style={{ fontSize:15, fontWeight:700, marginTop:10 }}>{note}</div>
  </div>
}

function MiniMetric({ icon, title, value, note }) {
  return <div style={{ flex:1, minWidth:280, padding:'22px 32px', display:'flex', gap:24, alignItems:'center', borderRight:`1px solid ${T.line}` }}>
    <div style={{ fontSize:42, color:T.blue }}>{icon}</div>
    <div><div style={{ color:T.blue, fontSize:18, fontWeight:900 }}>{title}</div><div style={{ fontSize:34, fontWeight:900 }}>{value}</div><div style={{ color:'#c6d8e8', fontSize:15 }}>{note}</div></div>
  </div>
}

function Panel({ title, children, action }) {
  return <section style={{ background:'linear-gradient(180deg,rgba(7,43,76,.96),rgba(3,27,50,.96))', border:`1px solid ${T.line}`, borderRadius:10, padding:18, marginTop:16, boxShadow:'0 20px 50px rgba(0,0,0,.22)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:12 }}>
      <h2 style={{ margin:0, fontSize:26, letterSpacing:'-.03em' }}>{title}</h2>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>{action}</div>
    </div>
    {children}
  </section>
}

function HeatCard({ sku, active, onClick }) {
  const st = statusOf(sku), m = statusMeta[st], days = calcDays(sku)
  return <button onClick={onClick} style={{ textAlign:'center', minWidth:210, flex:'1 1 210px', background:'linear-gradient(180deg,rgba(9,47,82,.92),rgba(6,32,58,.95))', border:`2px solid ${active ? m.color : T.line}`, borderRadius:10, padding:18, color:T.text, fontFamily:T.font, cursor:'pointer', boxShadow: active ? `0 0 20px ${m.color}55` : 'none' }}>
    <div style={{ fontSize:46, height:54, color:'#d9e6f2' }}>{sku.icon || '□'}</div>
    <div style={{ fontWeight:800, fontSize:15, minHeight:38, display:'flex', alignItems:'center', justifyContent:'center' }}>{sku.name}</div>
    <div style={{ color:m.color, fontWeight:900, fontSize:32, marginTop:8 }}>{days > 120 ? '120+' : days.toFixed(1)} 日</div>
    <div style={{ display:'inline-block', marginTop:8, color:m.color, border:`1px solid ${m.color}`, borderRadius:6, padding:'5px 12px', fontWeight:900 }}>{m.label}</div>
  </button>
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [lang, setLang] = useState(() => detectLang())
  const [tab, setTab] = useState('dashboard')
  const [skus, setSkus] = useState([])
  const [incrementals, setIncrementals] = useState([])
  const [selected, setSelected] = useState(null)
  const [showPricing, setShowPricing] = useState(false)
  const skuCsvRef = useRef(null)
  const incCsvRef = useRef(null)

  useEffect(() => { localStorage.setItem('stockwise_lang', lang); document.documentElement.lang = lang }, [lang])
  useEffect(() => { if (user) fetchSkus() }, [user])

  async function fetchSkus() {
    const { data } = await supabase.from('skus').select('*').order('supplier,name')
    const merged = (data && data.length ? data : sampleSkus).map((s, i) => ({ ...s, icon: s.icon || ['🎧','▱','🖱','⌨','🔌','📦'][i % 6], sku: s.sku || s.name }))
    setSkus(merged)
    setSelected(prev => prev || merged[0])
  }

  function downloadSkuTemplate() {
    const hdr = 'name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier'
    const rows = ['イヤホン Pro Model A,オーディオ,Supplier A,420,62,18,186,1000,120,Supplier A','USB-C ハブ,PC周辺機器,Supplier B,980,54,20,150,700,38,Supplier B']
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[hdr, ...rows].join('\n')], { type:'text/csv' })); a.download='stockwise_items_template.csv'; a.click()
  }
  function downloadCvgTemplate() {
    const dates = Array.from({length:12},(_,i)=>`W${i+1}`)
    const hdr = ['name','superset','supplier',...dates].join(',')
    const rows = skus.length ? skus.map(s => [s.name, s.superset || '', s.supplier || s.subset || '', ...Array(12).fill(0)].join(',')) : ['イヤホン Pro Model A,オーディオ,Supplier A,0,0,1000,0,0,0,0,0,0,0,0,0']
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[hdr, ...rows].join('\n')], { type:'text/csv' })); a.download='cvg_inbound_template.csv'; a.click()
  }
  function uploadSkuCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = String(ev.target.result).trim().split('\n').slice(1).map(l => {
        const [name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier] = l.split(',')
        return { user_id:user.id, name:name?.trim(), superset:superset?.trim() || null, subset:subset?.trim() || null, stock_qty:+stock_qty||0, daily_usage:+daily_usage||0, lead_time:+lead_time||7, safety_stock:+safety_stock||null, moq:+moq||null, unit_cost:+unit_cost||null, supplier:supplier?.trim() || null }
      }).filter(r => r.name)
      if (rows.length) await supabase.from('skus').upsert(rows, { onConflict:'user_id,name' })
      await fetchSkus(); e.target.value = ''
    }
    reader.readAsText(file)
  }
  function uploadCvgCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = String(ev.target.result).trim().split('\n')
      const parsed = []
      lines.slice(1).forEach(line => {
        const cols = line.split(','); const name = cols[0]?.trim(); if (!name) return
        cols.slice(3).forEach((v, i) => { const qty = +v || 0; if (qty > 0) parsed.push({ sku_name:name, week:i+1, qty }) })
      })
      setIncrementals(parsed); e.target.value = ''
      alert(`CVG/輸入数量予定を読み込みました: ${fmt(parsed.reduce((a,r)=>a+r.qty,0))} units`)
    }
    reader.readAsText(file)
  }

  const items = skus.length ? skus : sampleSkus
  const selectedSku = selected || items[0]
  const alertItems = items.filter(s => statusOf(s) === 'alert')
  const reorder = items.filter(s => Number(s.stock_qty || 0) < calcRp(s))
  const inboundTotal = incrementals.reduce((a,r)=>a+Number(r.qty||0),0) || 1400
  const stockValue = items.reduce((a,s)=>a+Number(s.stock_qty||0)*Number(s.unit_cost||0),0) || 284000
  const forecast = selectedSku ? buildForecast(selectedSku, incrementals) : []
  const suppliers = [...new Set(items.map(s => s.supplier || s.subset || '未設定'))]

  if (authLoading) return <div style={{ minHeight:'100vh', background:T.navy, color:T.text, display:'grid', placeItems:'center', fontFamily:T.font }}>Loading...</div>
  if (!user) return <LoginPage lang={lang} setLang={setLang} />

  return <div style={{ minHeight:'100vh', background:`radial-gradient(circle at 50% -10%, #093255 0%, ${T.bg} 45%, #000915 100%)`, color:T.text, fontFamily:T.font }}>
    <div style={{ maxWidth:1220, margin:'0 auto', padding:'18px 22px 34px' }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}><div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#385cff,#ff9d22)', display:'grid', placeItems:'center', fontWeight:900 }}>◆</div><div style={{ fontSize:26, fontWeight:900 }}>在庫Wise</div></div>
        <div style={{ display:'flex', gap:10 }}><Btn small onClick={()=>setLang(l=>l==='ja'?'en':'ja')}>EN / JP</Btn><Btn small onClick={signOut}>♙</Btn></div>
      </header>

      <nav style={{ display:'flex', gap:10, marginBottom:16 }}>
        <Btn kind={tab==='dashboard'?'blue':'ghost'} onClick={()=>setTab('dashboard')}>ダッシュボード</Btn>
        <Btn kind={tab==='heatmap'?'blue':'ghost'} onClick={()=>setTab('heatmap')}>在庫ヒートマップ（仕入先別）</Btn>
        <Btn onClick={()=>setShowPricing(true)}>料金</Btn>
      </nav>

      {tab === 'dashboard' && <>
        <div style={{ textAlign:'center', padding:'14px 0 20px' }}>
          <h1 style={{ margin:0, fontSize:44, lineHeight:1.18, fontWeight:900, letterSpacing:'-.05em' }}>平常時は <span style={{ color:T.blue }}>効率化。</span> 緊急時は <span style={{ color:T.red }}>会社を守る。</span></h1>
          <p style={{ margin:'12px 0 0', fontSize:18, fontWeight:800 }}>Stockwiseは、サプライヤートラブル発生時にも、迅速な意思決定を可能にします。</p>
        </div>

        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <MetricCard tone="red" icon="⚠" title="アラート（要対応）" sub="対応が必要なアラート件数" value={alertItems.length || 2} note="欠品リスク・納期遅延・在庫異常など" button="詳細を確認" onClick={()=>setTab('heatmap')} />
          <MetricCard tone="orange" icon="🛒" title="発注必要案件数" sub="発注が必要な案件数（欠品リスクあり）" value={reorder.length || 3} note="不足が予測されるSKUの発注候補" button="案件を確認" onClick={()=>setTab('heatmap')} />
        </div>

        <div style={{ marginTop:18, display:'flex', flexWrap:'wrap', background:'linear-gradient(90deg,rgba(7,43,76,.9),rgba(5,34,62,.95))', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <MiniMetric icon="🚚" title="輸送中（SSN）" value={`${fmt(inboundTotal)} Units`} note="ユニット・有効なSSN 3件" />
          <MiniMetric icon="◎" title="在庫金額" value={moneyK(stockValue)} note={`ⓘ ${items.length}つの有効SKU`} />
        </div>

        <Panel title="発注候補品目">
          {selectedSku && <div style={{ display:'grid', gridTemplateColumns:'140px 1.25fr .65fr .65fr .75fr 260px', gap:18, alignItems:'center' }}>
            <IconBox icon={selectedSku.icon || '□'} active />
            <div><h3 style={{ margin:'0 0 8px', fontSize:26 }}>{selectedSku.name}</h3><div style={{ color:T.muted, fontSize:15 }}>SKU: {selectedSku.sku || selectedSku.name}</div><div style={{ marginTop:10 }}><span style={{ background:T.red, color:'#fff', borderRadius:4, padding:'4px 8px', fontSize:12, fontWeight:900 }}>ALERT</span><span style={{ marginLeft:10, color:'#cfddeb' }}>在庫不足のリスクがあります</span></div></div>
            <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:22 }}><div style={{ color:T.muted, fontWeight:800 }}>現在の在庫</div><div style={{ fontSize:26, fontWeight:900, marginTop:10 }}>{fmt(selectedSku.stock_qty)} <span style={{ fontSize:15 }}>ユニット</span></div></div>
            <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:22 }}><div style={{ color:T.muted, fontWeight:800 }}>推奨発注量</div><div style={{ color:T.orange, fontSize:26, fontWeight:900, marginTop:10 }}>+{fmt(selectedSku.moq || Math.max(0, calcRp(selectedSku)-selectedSku.stock_qty))} <span style={{ fontSize:15 }}>ユニット</span></div></div>
            <div />
            <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:14 }}><b>状態の目安</b>{['attention','alert','good'].map(k=><div key={k} style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13 }}><span style={{ width:30, height:6, borderRadius:9, background:statusMeta[k].color }} />{k==='attention'?'発注間近以内：注意（要発注検討）':k==='alert'?'発注間以内：危険（緊急に発注）':'適正在庫：安定'}</div>)}</div>
          </div>}

          <h3 style={{ margin:'20px 0 8px', fontSize:20 }}>未来の在庫予測 <span style={{ color:T.muted, fontSize:15 }}>ⓘ</span></h3>
          <p style={{ margin:'0 0 10px', color:'#c9d8e8' }}>入荷予定・リードタイムを加味した在庫の推移予測</p>
          <table style={{ width:'100%', borderCollapse:'collapse', overflow:'hidden', borderRadius:8, border:`1px solid ${T.line}` }}><thead><tr>{['時点','予測在庫数','状態の目安','状態の説明'].map(h=><th key={h} style={{ textAlign:'left', padding:'12px 16px', background:'rgba(255,255,255,.04)', color:'#cfe0ef', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}</tr></thead><tbody>{forecast.map((r,i)=>{ const m=statusMeta[r.status]; return <tr key={i}><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}` }}>{i===0?'現在（4/22時点）':`${i}週間後`}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900, fontSize:24 }}>{fmt(r.stock)}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}` }}><span style={{ display:'inline-block', width:52, height:10, borderRadius:99, background:m.color, marginRight:14 }} /> <b style={{ color:m.color }}>{m.label === 'アラート' ? '残注間分' : m.label === '注意' ? '残注間分' : m.label === '適正' ? '適正在庫' : '安定'}</b><div style={{ color:'#d6e2ef', fontSize:13 }}>（{r.days < 7 ? 'あと7日で欠品の可能性' : r.days < 15 ? 'あと14日で欠品の可能性' : '安定'}）</div></td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}`, color:'#d6e2ef' }}>{i===0?'現在の在庫で約14日分をカバーできる見込みです。':r.status==='alert'?'在庫が非常に少なくなり、欠品リスクが高まります。':'入荷予定分を含め、適正在庫を維持できる見込みです。'}</td></tr>})}</tbody></table>
        </Panel>

        <Panel title="在庫ヒートマップ（仕入先別）" action={<><Btn small onClick={downloadCvgTemplate}>⇩ CVGテンプレダウンロード</Btn><Btn small onClick={()=>incCsvRef.current.click()}>⇧ CVGアップロード</Btn><Btn small kind="blue" onClick={()=>setTab('heatmap')}>すべての品目を表示 →</Btn><input ref={incCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadCvgCSV}/></>}>
          <p style={{ color:'#cbd9e8', marginTop:-6 }}>品目をクリックすると、その品目の「在庫ヒートマップ（仕入先別）」タブへ移動します。</p>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:10 }}>{items.slice(0,5).map(s=><HeatCard key={s.id} sku={s} active={s.id===selectedSku?.id} onClick={()=>{setSelected(s); setTab('heatmap')}} />)}</div>
          <div style={{ display:'flex', gap:18, flexWrap:'wrap', color:'#c9d8e8', fontSize:14 }}>{Object.entries(statusMeta).map(([k,m])=><span key={k}><b style={{ color:m.color }}>● {m.label}</b>：{m.desc}</span>)}</div>
        </Panel>
      </>}

      {tab === 'heatmap' && <Panel title="在庫ヒートマップ（仕入先別）" action={<><Btn small onClick={downloadSkuTemplate}>⇩ 発注候補品目テンプレダウンロード</Btn><Btn small onClick={()=>skuCsvRef.current.click()}>⇧ 発注候補品目アップロード</Btn><Btn small onClick={downloadCvgTemplate}>⇩ CVGテンプレダウンロード</Btn><Btn small onClick={()=>incCsvRef.current.click()}>⇧ CVGアップロード</Btn><input ref={skuCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadSkuCSV}/><input ref={incCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadCvgCSV}/></>}>
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:18 }}>
          <aside style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12, background:'rgba(0,0,0,.12)' }}><div style={{ fontWeight:900, marginBottom:10 }}>仕入先</div>{suppliers.map(sup=><button key={sup} style={{ width:'100%', textAlign:'left', padding:'12px 14px', marginBottom:8, borderRadius:8, border:`1px solid ${T.line}`, background:'rgba(255,255,255,.04)', color:T.text, fontFamily:T.font, fontWeight:800 }}>{sup}</button>)}</aside>
          <div>{suppliers.map(sup => <div key={sup} style={{ marginBottom:20 }}><h3 style={{ margin:'0 0 10px', fontSize:22 }}>{sup}</h3><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:12 }}>{items.filter(s => (s.supplier || s.subset || '未設定') === sup).map(s => <HeatCard key={s.id} sku={s} active={s.id===selectedSku?.id} onClick={()=>setSelected(s)} />)}</div></div>)}</div>
        </div>
      </Panel>}
    </div>
    {showPricing && <PricingModal lang={lang} user={user} onClose={()=>setShowPricing(false)} />}
  </div>
}
