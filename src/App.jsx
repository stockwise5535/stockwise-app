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

const JP = 'ja'
const EN = 'en'

const sampleSkus = [
  { id:'sample-1', name:'イヤホン Pro Model A', name_en:'Earbuds Pro Model A', superset:'オーディオ', subset:'Supplier A', supplier:'Supplier A', stock_qty:420, daily_usage:62, lead_time:18, safety_stock:186, moq:1000, unit_cost:120, sku:'EPH-PRO-A', icon:'audio' },
  { id:'sample-2', name:'USB-C ハブ', name_en:'USB-C Hub', superset:'PC周辺機器', subset:'Supplier B', supplier:'Supplier B', stock_qty:980, daily_usage:54, lead_time:20, safety_stock:150, moq:700, unit_cost:38, sku:'USB-HUB-B', icon:'box' },
  { id:'sample-3', name:'ゲーミングマウス', name_en:'Gaming Mouse', superset:'入力機器', subset:'Supplier C', supplier:'Supplier C', stock_qty:1605, daily_usage:50, lead_time:16, safety_stock:180, moq:500, unit_cost:26, sku:'GMS-C', icon:'mouse' },
  { id:'sample-4', name:'メカニカルキーボード', name_en:'Mechanical Keyboard', superset:'入力機器', subset:'Supplier D', supplier:'Supplier D', stock_qty:7500, daily_usage:30, lead_time:25, safety_stock:150, moq:300, unit_cost:45, sku:'MKB-D', icon:'keyboard' },
  { id:'sample-5', name:'USB-C ケーブル', name_en:'USB-C Cable', superset:'ケーブル', subset:'Supplier E', supplier:'Supplier E', stock_qty:3600, daily_usage:30, lead_time:14, safety_stock:200, moq:900, unit_cost:8, sku:'USBC-E', icon:'cable' },
]

const calcDays = s => Number(s.daily_usage) > 0 ? Number(s.stock_qty || 0) / Number(s.daily_usage) : 999
const calcWeeks = s => calcDays(s) / 7
const calcRp = s => Number(s.lead_time || 0) * Number(s.daily_usage || 0)
const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const displayName = (s, lang) => lang === EN ? (s.name_en || s.name) : s.name
const currency = (n, lang) => lang === JP ? `¥${Math.round(Number(n || 0) * 150).toLocaleString('ja-JP')}` : `$${Math.round(Number(n || 0) / 1000)}K`
const weekLabel = (week, lang) => lang === JP ? `${week}週` : `W${week}`
const fmtWeeks = w => Math.max(0, Math.round(Number(w || 0))).toLocaleString('en-US')
const csvBlob = rows => new Blob(['\ufeff' + rows.join('\n')], { type:'text/csv;charset=utf-8' })
const csvLine = arr => arr.map(v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x }).join(',')
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false
  for (let i=0; i<text.length; i++) {
    const c = text[i], n = text[i+1]
    if (q && c === '"' && n === '"') { cur += '"'; i++; continue }
    if (c === '"') { q = !q; continue }
    if (!q && c === ',') { row.push(cur.trim()); cur = ''; continue }
    if (!q && (c === '\n' || c === '\r')) {
      if (c === '\r' && n === '\n') i++
      row.push(cur.trim()); cur = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
      continue
    }
    cur += c
  }
  row.push(cur.trim()); if (row.some(v => v !== '')) rows.push(row)
  return rows
}


function normalizedHeader(v) { return String(v || '').replace(/^\ufeff/, '').trim().toLowerCase() }
function isSkuCSV(headers) {
  const h = headers.map(normalizedHeader)
  return (h.includes('品目名') || h.includes('name')) && (h.includes('現在在庫数') || h.includes('stock_qty')) && !(h.includes('生産工場') || h.includes('factory'))
}
function isInboundCSV(headers) {
  const h = headers.map(normalizedHeader)
  const hasItem = h.includes('品目名') || h.includes('item')
  const hasSupplier = h.includes('仕入先') || h.includes('supplier')
  const hasWeek = h.some(x => /^w\d+$/.test(x) || /^\d+週$/.test(x))
  return hasItem && hasSupplier && hasWeek && !(h.includes('現在在庫数') || h.includes('stock_qty'))
}
function mergeByItemSupplier(base, updates) {
  const map = new Map()
  const keyOf = s => `${String(s.name || s.sku || '').trim()}__${String(s.supplier || s.subset || '').trim()}`
  ;[...base, ...updates].forEach((s, i) => {
    const key = keyOf(s)
    if (!key.startsWith('__')) {
      const existing = map.get(key) || {}
      map.set(key, { ...existing, ...s, id: existing.id || s.id || `local-item-${i}`, supplier: s.supplier || s.subset || existing.supplier || existing.subset || 'Supplier', subset: s.supplier || s.subset || existing.supplier || existing.subset || null })
    }
  })
  return [...map.values()]
}
function weekNumberFromHeader(h, fallback) {
  const x = normalizedHeader(h)
  const m = x.match(/^(?:w)?(\d+)(?:週)?$/)
  return m ? Number(m[1]) : fallback
}
function statusByWeeks(w) {
  if (w < 1) return 'alert'
  if (w < 2) return 'attention'
  if (w > 8) return 'over'
  return 'good'
}
function statusOf(s) { return statusByWeeks(calcWeeks(s)) }

const statusMeta = {
  alert: { ja:'アラート', en:'Alert', color:T.red, descJa:'1週未満で欠品リスクが高い', descEn:'Less than 1 week of stock' },
  attention: { ja:'注意', en:'Attention', color:T.orange, descJa:'1〜2週以内で欠品リスクあり', descEn:'1–2 weeks of stock' },
  good: { ja:'適正', en:'Healthy', color:T.green, descJa:'2〜8週で適正在庫', descEn:'2–8 weeks of stock' },
  over: { ja:'過剰', en:'Overstock', color:T.blue, descJa:'8週超で在庫過多の可能性', descEn:'More than 8 weeks of stock' },
}

function buildForecast(sku, incrementals, weeks = 13) {
  let stock = Number(sku.stock_qty || 0)
  return Array.from({ length: weeks }, (_, i) => {
    const week = i + 1
    const inbound = (incrementals || [])
      .filter(r => (r.sku_name === sku.name || r.sku_name === sku.name_en || r.sku_name === sku.sku) && (!r.supplier || !sku.supplier || r.supplier === sku.supplier) && Number(r.week) === week)
      .reduce((a, r) => a + Number(r.qty || 0), 0)
    stock = Math.max(0, stock - Number(sku.daily_usage || 0) * 7 + inbound)
    const wos = Number(sku.daily_usage) > 0 ? stock / (Number(sku.daily_usage) * 7) : 99
    return { week, stock: Math.round(stock), inbound, wos, status: statusByWeeks(wos) }
  })
}

function copy(lang, key) {
  const d = {
    dashboard: { ja:'ダッシュボード', en:'Dashboard' },
    heatmap: { ja:'在庫ヒートマップ（仕入先別）', en:'Inventory Heatmap by Supplier' },
    pricing: { ja:'料金', en:'Pricing' },
    alert: { ja:'アラート（要対応）', en:'Alerts' },
    alertSub: { ja:'対応が必要なアラート件数', en:'Items requiring action' },
    alertNote: { ja:'欠品リスク・納期遅延・在庫異常など', en:'Stockout risk, delays, inventory issues' },
    reorder: { ja:'発注必要案件数', en:'Items to Order' },
    reorderSub: { ja:'発注が必要な案件数（欠品リスクあり）', en:'Order candidates with stockout risk' },
    reorderNote: { ja:'不足が予測される品目の発注候補', en:'Items expected to run short' },
    check: { ja:'確認する', en:'Check' },
    inbound: { ja:'輸入数量予定', en:'Inbound Plan' },
    stockValue: { ja:'在庫金額', en:'Inventory Value' },
    activeItems: { ja:'有効品目', en:'active items' },
    reorderItems: { ja:'発注候補品目', en:'Order Candidate Items' },
    currentStock: { ja:'現在の在庫', en:'Current Stock' },
    recommendedOrder: { ja:'推奨発注量', en:'Recommended Order' },
    units: { ja:'個', en:'units' },
    futureForecast: { ja:'未来の在庫予測', en:'Future Stock Forecast' },
    forecastDesc: { ja:'入荷予定・リードタイムを加味した在庫の推移予測', en:'Forecast including inbound plan and lead time' },
    week: { ja:'週', en:'W' },
    projectedStock: { ja:'予測在庫数', en:'Projected Stock' },
    inboundQty: { ja:'入荷数量', en:'Inbound Qty' },
    status: { ja:'状態', en:'Status' },
    statusGuide: { ja:'状態の目安', en:'Status Guide' },
    sku: { ja:'品目', en:'Item' },
    supplier: { ja:'仕入先', en:'Supplier' },
    stockWeek: { ja:'在庫週数', en:'Weeks of Stock' },
    itemTemplateDownload: { ja:'ダウンロード', en:'Download' },
    itemUpload: { ja:'アップロード', en:'Upload' },
    csvTemplateDownload: { ja:'ダウンロード', en:'Download' },
    csvUpload: { ja:'アップロード', en:'Upload' },
    allItems: { ja:'すべての品目を表示', en:'View All Items' },
    heatmapHint: { ja:'発注候補品目をクリックすると、その品目の在庫ヒートマップ（仕入先別）へ移動します。', en:'Click an order candidate item to open its supplier heatmap.' },
    itemTemplateSection: { ja:'発注候補品目', en:'Order Candidate Items' },
    csvSection: { ja:'輸入数量予定', en:'Inbound Plan' },
    selectItem: { ja:'表示する品目', en:'Selected Item' },
    logout: { ja:'ログアウト', en:'Logout' },
  }
  return d[key]?.[lang] || d[key]?.en || key
}

function Btn({ children, onClick, kind='ghost', small=false }) {
  const styles = {
    ghost: { background:'rgba(6,34,61,.75)', border:`1px solid ${T.line}`, color:'#cfe7ff' },
    blue: { background:'rgba(59,130,246,.17)', border:'1px solid #2c6dcc', color:'#8fc2ff' },
    orange: { background:'rgba(255,138,28,.12)', border:'1px solid #b65705', color:'#ffbd75' },
  }
  return <button onClick={onClick} style={{ ...styles[kind], borderRadius:8, padding:small?'7px 12px':'10px 16px', fontFamily:T.font, fontWeight:700, fontSize:small?12:14, cursor:'pointer' }}>{children}</button>
}

function ProductIcon({ type='box', active=false }) {
  const common = { position:'relative', width: active ? 88 : 58, height: active ? 70 : 48, opacity:.88 }
  if (type === 'audio') return <div style={common}><span style={{ position:'absolute', left:'20%', top:'18%', width:'60%', height:'58%', border:`${active?6:4}px solid #9fb2c6`, borderBottom:'none', borderRadius:'50% 50% 0 0' }} /><span style={{ position:'absolute', left:'10%', bottom:'8%', width:'18%', height:'34%', background:'#9fb2c6', borderRadius:8 }} /><span style={{ position:'absolute', right:'10%', bottom:'8%', width:'18%', height:'34%', background:'#9fb2c6', borderRadius:8 }} /></div>
  if (type === 'mouse') return <div style={common}><span style={{ position:'absolute', left:'28%', top:'5%', width:'44%', height:'85%', border:`${active?5:3}px solid #9fb2c6`, borderRadius:'46%' }} /><span style={{ position:'absolute', left:'49%', top:'11%', width:2, height:'22%', background:'#9fb2c6' }} /></div>
  if (type === 'keyboard') return <div style={common}><span style={{ position:'absolute', inset:'18% 4%', border:`${active?5:3}px solid #9fb2c6`, borderRadius:8 }} /><span style={{ position:'absolute', left:'16%', top:'42%', width:'68%', height:active?5:3, background:'#9fb2c6', boxShadow:`0 ${active?12:8}px 0 #9fb2c6` }} /></div>
  if (type === 'cable') return <div style={common}><span style={{ position:'absolute', left:'10%', top:'30%', width:'80%', height:'38%', border:`${active?5:3}px solid #9fb2c6`, borderRadius:'50%' }} /><span style={{ position:'absolute', right:'6%', top:'44%', width:'18%', height:'16%', background:'#9fb2c6', borderRadius:4 }} /></div>
  return <div style={common}><span style={{ position:'absolute', left:'14%', top:'24%', width:'72%', height:'52%', border:`${active?5:3}px solid #9fb2c6`, transform:'skewY(-18deg)', borderRadius:4 }} /></div>
}

function IconBox({ icon, active=false }) {
  return <div style={{ width:120, height:90, borderRadius:10, background:'linear-gradient(145deg,#e9eef4,#b8c5d2)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(255,255,255,.55)' }}><ProductIcon type={icon} active={active} /></div>
}

function MetricCard({ tone, icon, title, sub, value, note, button, onClick, lang }) {
  const c = tone === 'red' ? T.red : tone === 'orange' ? T.orange : T.blue
  return <div style={{ flex:1, minWidth:300, border:`1px solid ${c}`, borderRadius:10, padding:'22px 26px', background:`linear-gradient(135deg, ${tone === 'red' ? 'rgba(255,35,58,.45)' : 'rgba(255,120,0,.44)'}, rgba(2,11,22,.75))`, boxShadow:`0 0 28px ${c}24` }}>
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:18 }}>
      <div style={{ display:'flex', gap:16 }}><div style={{ fontSize:34, color:c }}>{icon}</div><div><div style={{ fontWeight:900, fontSize:20 }}>{title}</div><div style={{ fontSize:14, fontWeight:700 }}>{sub}</div></div></div>
      {button && <Btn small onClick={onClick}>{button} →</Btn>}
    </div>
    <div style={{ fontSize:58, fontWeight:900, lineHeight:1, marginTop:20 }}>{value}<span style={{ fontSize:22, marginLeft:12 }}>{lang === JP ? '件' : ''}</span></div>
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
      {action && <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end' }}>{action}</div>}
    </div>
    {children}
  </section>
}

function HeatCard({ sku, lang, active, onClick }) {
  const st = statusOf(sku), m = statusMeta[st], weeks = calcWeeks(sku)
  return <button onClick={onClick} style={{ textAlign:'center', minWidth:210, flex:'1 1 210px', background:'linear-gradient(180deg,rgba(9,47,82,.92),rgba(6,32,58,.95))', border:`2px solid ${active ? m.color : T.line}`, borderRadius:10, padding:18, color:T.text, fontFamily:T.font, cursor:'pointer', boxShadow: active ? `0 0 20px ${m.color}55` : 'none' }}>
    <div style={{ height:58, display:'flex', justifyContent:'center', alignItems:'center' }}><ProductIcon type={sku.icon || 'box'} /></div>
    <div style={{ fontWeight:800, fontSize:15, minHeight:38, display:'flex', alignItems:'center', justifyContent:'center' }}>{displayName(sku, lang)}</div>
    <div style={{ color:m.color, fontWeight:900, fontSize:32, marginTop:8 }}>{weeks > 13 ? '13+' : fmtWeeks(weeks)} {copy(lang, 'week')}</div>
    <div style={{ display:'inline-block', marginTop:8, color:m.color, border:`1px solid ${m.color}`, borderRadius:6, padding:'5px 12px', fontWeight:900 }}>{m[lang]}</div>
  </button>
}

function TemplateSection({ title, children }) {
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:14, background:'rgba(0,0,0,.12)', marginBottom:12 }}>
    <div style={{ fontWeight:900, fontSize:16, marginBottom:10 }}>{title}</div>
    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>{children}</div>
  </div>
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [lang, setLang] = useState(() => detectLang())
  const [tab, setTab] = useState('dashboard')
  const [skus, setSkus] = useState([])
  const [incrementals, setIncrementals] = useState([])
  const [uploadedItems, setUploadedItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showPricing, setShowPricing] = useState(false)
  const skuCsvRef = useRef(null)
  const incCsvRef = useRef(null)

  useEffect(() => { localStorage.setItem('stockwise_lang', lang); document.documentElement.lang = lang }, [lang])
  useEffect(() => { if (user) fetchSkus() }, [user])

  async function fetchSkus() {
    const { data } = await supabase.from('skus').select('*').order('supplier,name')
    const localItems = JSON.parse(localStorage.getItem(`stockwise_items_${user.id}`) || '[]')
    const localInbound = JSON.parse(localStorage.getItem(`stockwise_inbound_${user.id}`) || '[]')
    const base = (data && data.length ? data : sampleSkus).map((s, i) => ({
      ...s,
      id: s.id || `base-${i}-${s.name}-${s.supplier || s.subset || ''}`,
      icon: s.icon || ['audio','box','mouse','keyboard','cable','box'][i % 6],
      sku: s.sku || s.name,
      supplier: s.supplier || s.subset || 'Supplier',
      name_en: s.name_en || s.name,
    }))
    const normalizedLocal = localItems.map((s, i) => ({
      ...s,
      id: s.id || `local-item-${i}-${s.name}-${s.supplier || s.subset || ''}`,
      icon: s.icon || ['audio','box','mouse','keyboard','cable','box'][i % 6],
      sku: s.sku || s.name,
      supplier: s.supplier || s.subset || 'Supplier',
      name_en: s.name_en || s.name,
    }))
    const merged = mergeByItemSupplier(base, normalizedLocal)
    setUploadedItems(localItems)
    setSkus(merged)
    setIncrementals(localInbound)
    setSelected(prev => prev || merged[0])
  }

  function downloadSkuTemplate() {
    const headers = lang === JP
      ? ['品目名','英語名','カテゴリー','仕入先','現在在庫数','1日使用数','リードタイム日数','安全在庫','推奨発注量','単価','SKU']
      : ['name','name_en','category','supplier','stock_qty','daily_usage','lead_time','safety_stock','moq','unit_cost','sku']
    const source = skus.length ? skus : sampleSkus
    const rows = source.map(s => [s.name, s.name_en || '', s.superset || '', s.supplier || s.subset || '', s.stock_qty || 0, s.daily_usage || 0, s.lead_time || 7, s.safety_stock || '', s.moq || '', s.unit_cost || '', s.sku || s.name])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_order_candidate_items.csv'
    a.click()
  }
  function downloadCsvTemplate() {
    const source = skus.length ? skus : sampleSkus
    const weekHeaders = Array.from({ length:13 }, (_, i) => weekLabel(i+1, lang))
    const headers = lang === JP ? ['品目名','仕入先','サプライヤー情報','生産工場',...weekHeaders] : ['item','supplier','supplier_info','factory',...weekHeaders]
    const rows = source.map(s => {
      const itemName = s.name
      const supplier = s.supplier || s.subset || ''
      const vals = Array.from({ length:13 }, (_, i) =>
        incrementals.filter(r => (r.sku_name === itemName || r.sku_name === s.name_en || r.sku_name === s.sku) && (r.supplier || supplier) === supplier && Number(r.week) === i+1).reduce((a,r)=>a+Number(r.qty||0),0)
      )
      const info = s.supplier_info || ''
      const factory = s.factory || ''
      return [itemName, supplier, info, factory, ...vals]
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_inbound_plan.csv'
    a.click()
  }
  function uploadSkuCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const table = parseCSV(String(ev.target.result))
      const headers = table[0] || []
      if (!isSkuCSV(headers)) {
        alert(lang === JP ? '発注候補品目のCSVのみアップロードできます。発注候補品目の「ダウンロード」から取得したCSVを使用してください。' : 'Only the Order Candidate Items CSV can be uploaded here. Please use the CSV downloaded from this section.')
        e.target.value = ''
        return
      }
      const h = headers.map(normalizedHeader)
      const idx = name => h.findIndex(x => x === name)
      const get = (cols, names, fallbackIndex) => {
        for (const n of names) { const i = idx(n); if (i >= 0) return cols[i] }
        return cols[fallbackIndex]
      }
      const rows = table.slice(1).map((cols, idxRow) => {
        const name = get(cols, ['品目名','name'], 0)?.trim()
        const supplier = get(cols, ['仕入先','supplier'], 3)?.trim()
        return {
          id:`local-item-${Date.now()}-${idxRow}`, user_id:user.id, name, name_en:get(cols, ['英語名','name_en'], 1)?.trim() || name,
          superset:get(cols, ['カテゴリー','category'], 2)?.trim() || null, subset:supplier || null, supplier:supplier || null,
          stock_qty:+get(cols, ['現在在庫数','stock_qty'], 4)||0, daily_usage:+get(cols, ['1日使用数','daily_usage'], 5)||0, lead_time:+get(cols, ['リードタイム日数','lead_time'], 6)||7,
          safety_stock:+get(cols, ['安全在庫','safety_stock'], 7)||null, moq:+get(cols, ['推奨発注量','moq'], 8)||null, unit_cost:+get(cols, ['単価','unit_cost'], 9)||null,
          sku:get(cols, ['sku'], 10)?.trim() || name,
        }
      }).filter(r => r.name)
      const currentLocal = JSON.parse(localStorage.getItem(`stockwise_items_${user.id}`) || '[]')
      const saved = mergeByItemSupplier(currentLocal, rows)
      localStorage.setItem(`stockwise_items_${user.id}`, JSON.stringify(saved))
      setUploadedItems(saved)
      setSkus(prev => mergeByItemSupplier(prev, rows))
      if (selectedSku && rows.some(r => r.name === selectedSku.name && (r.supplier || r.subset || '') === (selectedSku.supplier || selectedSku.subset || ''))) {
        setSelected(prev => ({ ...prev, ...rows.find(r => r.name === prev.name && (r.supplier || r.subset || '') === (prev.supplier || prev.subset || '')) }))
      } else if (!selectedSku) {
        setSelected(rows[0] || skus[0])
      }
      try { if (rows.length) await supabase.from('skus').upsert(rows.map(({id,sku,name_en,icon,...r})=>r), { onConflict:'user_id,name' }) } catch (_) {}
      alert((lang === JP ? '発注候補品目を更新しました：' : 'Order candidate items updated: ') + rows.length)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  function uploadCsv(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const table = parseCSV(String(ev.target.result))
      const headers = table[0] || []
      if (!isInboundCSV(headers)) {
        alert(lang === JP ? '輸入数量予定のCSVのみアップロードできます。輸入数量予定の「ダウンロード」から取得したCSVを使用してください。' : 'Only the Inbound Plan CSV can be uploaded here. Please use the CSV downloaded from this section.')
        e.target.value = ''
        return
      }
      const h = headers.map(normalizedHeader)
      const itemIdx = h.findIndex(x => x === '品目名' || x === 'item')
      const supplierIdx = h.findIndex(x => x === '仕入先' || x === 'supplier')
      const infoIdx = h.findIndex(x => x === 'サプライヤー情報' || x === 'supplier_info')
      const factoryIdx = h.findIndex(x => x === '生産工場' || x === 'factory')
      const weekIndexes = h.map((x, i) => ({ i, week: weekNumberFromHeader(x, null) })).filter(x => x.week >= 1 && x.week <= 13)
      const parsed = []
      table.slice(1).forEach(cols => {
        const name = cols[itemIdx]?.trim(); const supplier = cols[supplierIdx]?.trim(); if (!name || !supplier) return
        const supplier_info = infoIdx >= 0 ? cols[infoIdx]?.trim() : ''
        const factory = factoryIdx >= 0 ? cols[factoryIdx]?.trim() : ''
        weekIndexes.forEach(({ i, week }) => {
          const qty = +cols[i] || 0
          parsed.push({ sku_name:name, supplier, supplier_info, factory, week, qty })
        })
      })
      localStorage.setItem(`stockwise_inbound_${user.id}`, JSON.stringify(parsed))
      setIncrementals(parsed)
      setSkus(prev => prev.map(s => {
        const hit = parsed.find(r => r.sku_name === s.name && r.supplier === (s.supplier || s.subset || ''))
        return hit ? { ...s, supplier_info: hit.supplier_info, factory: hit.factory } : s
      }))
      e.target.value = ''
      alert(copy(lang, 'csvUpload') + ': ' + fmt(parsed.reduce((a,r)=>a+r.qty,0)) + (lang === JP ? '個' : ' units'))
    }
    reader.readAsText(file)
  }

  const items = skus.length ? skus : sampleSkus
  const selectedSku = selected || items[0]
  const alertItems = items.filter(s => statusOf(s) === 'alert')
  const reorder = items.filter(s => Number(s.stock_qty || 0) < calcRp(s))
  const inboundTotal = incrementals.reduce((a,r)=>a+Number(r.qty||0),0) || 1400
  const stockValue = items.reduce((a,s)=>a+Number(s.stock_qty||0)*Number(s.unit_cost||0),0) || 284000
  const forecast = selectedSku ? buildForecast(selectedSku, incrementals, 13) : []
  const suppliers = [...new Set(items.map(s => s.supplier || s.subset || '未設定'))]
  const supplierRows = suppliers.map(sup => ({ supplier:sup, items: items.filter(s => (s.supplier || s.subset || '未設定') === sup) }))

  if (authLoading) return <div style={{ minHeight:'100vh', background:T.navy, color:T.text, display:'grid', placeItems:'center', fontFamily:T.font }}>Loading...</div>
  if (!user) return <LoginPage lang={lang} setLang={setLang} />

  return <div style={{ minHeight:'100vh', background:`radial-gradient(circle at 50% -10%, #093255 0%, ${T.bg} 45%, #000915 100%)`, color:T.text, fontFamily:T.font }}>
    <div style={{ maxWidth:1220, margin:'0 auto', padding:'18px 22px 34px' }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}><div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#385cff,#ff9d22)', display:'grid', placeItems:'center', fontWeight:900 }}>◆</div><div style={{ fontSize:26, fontWeight:900 }}>Stockwise</div></div>
        <div style={{ display:'flex', gap:10 }}><Btn small onClick={()=>setLang(l=>l===JP?EN:JP)}>EN / JP</Btn><Btn small onClick={signOut}>{copy(lang, 'logout')}</Btn></div>
      </header>

      <nav style={{ display:'flex', gap:10, marginBottom:16 }}>
        <Btn kind={tab==='dashboard'?'blue':'ghost'} onClick={()=>setTab('dashboard')}>{copy(lang, 'dashboard')}</Btn>
        <Btn kind={tab==='heatmap'?'blue':'ghost'} onClick={()=>setTab('heatmap')}>{copy(lang, 'heatmap')}</Btn>
        <Btn onClick={()=>setShowPricing(true)}>{copy(lang, 'pricing')}</Btn>
      </nav>

      {tab === 'dashboard' && <>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <MetricCard lang={lang} tone="red" icon="⚠" title={copy(lang, 'alert')} sub={copy(lang, 'alertSub')} value={alertItems.length || 2} note={copy(lang, 'alertNote')} button={copy(lang, 'check')} onClick={()=>setTab('heatmap')} />
          <MetricCard lang={lang} tone="orange" icon="🛒" title={copy(lang, 'reorder')} sub={copy(lang, 'reorderSub')} value={reorder.length || 3} note={copy(lang, 'reorderNote')} button={copy(lang, 'check')} onClick={()=>setTab('heatmap')} />
        </div>

        <div style={{ marginTop:18, display:'flex', flexWrap:'wrap', background:'linear-gradient(90deg,rgba(7,43,76,.9),rgba(5,34,62,.95))', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <MiniMetric icon="⇣" title={copy(lang, 'inbound')} value={`${fmt(inboundTotal)}${lang === JP ? '個' : ' units'}`} note={lang === JP ? '登録済みの輸入数量予定' : 'Registered inbound plan'} />
          <MiniMetric icon="◎" title={copy(lang, 'stockValue')} value={currency(stockValue, lang)} note={`ⓘ ${items.length} ${copy(lang, 'activeItems')}`} />
        </div>

        <Panel title={copy(lang, 'reorderItems')}>
          {selectedSku && <div onClick={()=>setTab('heatmap')} style={{ display:'grid', gridTemplateColumns:'140px 1.25fr .65fr .65fr 260px', gap:18, alignItems:'center', cursor:'pointer' }}>
            <IconBox icon={selectedSku.icon || 'box'} active />
            <div><h3 style={{ margin:'0 0 8px', fontSize:26 }}>{displayName(selectedSku, lang)}</h3><div style={{ color:T.muted, fontSize:15 }}>SKU: {selectedSku.sku || selectedSku.name}</div><div style={{ marginTop:10 }}><span style={{ background:T.red, color:'#fff', borderRadius:4, padding:'4px 8px', fontSize:12, fontWeight:900 }}>ALERT</span><span style={{ marginLeft:10, color:'#cfddeb' }}>{lang === JP ? '在庫不足のリスクがあります' : 'Stockout risk detected'}</span></div></div>
            <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:22 }}><div style={{ color:T.muted, fontWeight:800 }}>{copy(lang, 'currentStock')}</div><div style={{ fontSize:26, fontWeight:900, marginTop:10 }}>{fmt(selectedSku.stock_qty)} <span style={{ fontSize:15 }}>{copy(lang, 'units')}</span></div></div>
            <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:22 }}><div style={{ color:T.muted, fontWeight:800 }}>{copy(lang, 'recommendedOrder')}</div><div style={{ color:T.orange, fontSize:26, fontWeight:900, marginTop:10 }}>+{fmt(selectedSku.moq || Math.max(0, calcRp(selectedSku)-selectedSku.stock_qty))} <span style={{ fontSize:15 }}>{copy(lang, 'units')}</span></div></div>
            <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:14 }}><b>{copy(lang, 'statusGuide')}</b>{['attention','alert','good'].map(k=><div key={k} style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13 }}><span style={{ width:30, height:6, borderRadius:9, background:statusMeta[k].color }} />{statusMeta[k][lang]}：{lang === JP ? statusMeta[k].descJa : statusMeta[k].descEn}</div>)}</div>
          </div>}

          <h3 style={{ margin:'20px 0 8px', fontSize:20 }}>{copy(lang, 'futureForecast')} <span style={{ color:T.muted, fontSize:15 }}>ⓘ</span></h3>
          <p style={{ margin:'0 0 10px', color:'#c9d8e8' }}>{copy(lang, 'forecastDesc')}</p>
          <table style={{ width:'100%', borderCollapse:'collapse', overflow:'hidden', borderRadius:8, border:`1px solid ${T.line}` }}><thead><tr>{[copy(lang, 'week'),copy(lang, 'projectedStock'),copy(lang, 'inboundQty'),copy(lang, 'stockWeek'),copy(lang, 'status')].map(h=><th key={h} style={{ textAlign:'left', padding:'12px 16px', background:'rgba(255,255,255,.04)', color:'#cfe0ef', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}</tr></thead><tbody>{forecast.slice(0,4).map((r)=>{ const m=statusMeta[r.status]; return <tr key={r.week}><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}` }}>{weekLabel(r.week, lang)}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900, fontSize:24 }}>{fmt(r.stock)}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}` }}>{fmt(r.inbound)}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900 }}>{fmtWeeks(r.wos)} {copy(lang, 'week')}</td><td style={{ padding:'13px 16px', borderBottom:`1px solid ${T.line}` }}><span style={{ display:'inline-block', width:52, height:10, borderRadius:99, background:m.color, marginRight:14 }} /> <b style={{ color:m.color }}>{m[lang]}</b></td></tr>})}</tbody></table>
        </Panel>

        <Panel title={copy(lang, 'heatmap')}>
          <p style={{ color:'#cbd9e8', marginTop:-6 }}>{copy(lang, 'heatmapHint')}</p>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:10 }}>{items.slice(0,5).map(s=><HeatCard key={s.id} lang={lang} sku={s} active={s.id===selectedSku?.id} onClick={()=>{setSelected(s); setTab('heatmap')}} />)}</div>
          <div style={{ display:'flex', gap:18, flexWrap:'wrap', color:'#c9d8e8', fontSize:14 }}>{Object.entries(statusMeta).map(([k,m])=><span key={k}><b style={{ color:m.color }}>● {m[lang]}</b>：{lang === JP ? m.descJa : m.descEn}</span>)}</div>
        </Panel>
      </>}

      {tab === 'heatmap' && <Panel title={copy(lang, 'heatmap')}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:14, marginBottom:16 }}>
          <TemplateSection title={copy(lang, 'itemTemplateSection')}><Btn small onClick={downloadSkuTemplate}>⇩ {copy(lang, 'itemTemplateDownload')}</Btn><Btn small onClick={()=>skuCsvRef.current.click()}>⇧ {copy(lang, 'itemUpload')}</Btn><input ref={skuCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadSkuCSV}/></TemplateSection>
          <TemplateSection title={copy(lang, 'csvSection')}><Btn small onClick={downloadCsvTemplate}>⇩ {copy(lang, 'csvTemplateDownload')}</Btn><Btn small onClick={()=>incCsvRef.current.click()}>⇧ {copy(lang, 'csvUpload')}</Btn><input ref={incCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadCsv}/></TemplateSection>
        </div>

        <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12, background:'rgba(0,0,0,.12)', marginBottom:14 }}>
          <div style={{ fontWeight:900, marginBottom:10 }}>{copy(lang, 'selectItem')}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{items.map(s => <Btn key={s.id} small kind={s.id === selectedSku?.id ? 'blue' : 'ghost'} onClick={()=>setSelected(s)}>{displayName(s, lang)}</Btn>)}</div>
        </div>

        {selectedSku && <div style={{ overflowX:'auto', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <table style={{ width:'100%', minWidth:1100, borderCollapse:'collapse' }}>
            <thead><tr><th style={{ position:'sticky', left:0, background:'#082947', zIndex:2, textAlign:'left', padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{copy(lang, 'supplier')}</th>{Array.from({length:13},(_,i)=><th key={i} style={{ textAlign:'center', padding:'12px 10px', borderBottom:`1px solid ${T.line}`, background:'rgba(255,255,255,.04)' }}>{weekLabel(i+1, lang)}</th>)}</tr></thead>
            <tbody>{supplierRows.map(row => {
              const sku = row.items.find(s => s.name === selectedSku.name) || selectedSku
              const rowForecast = buildForecast(sku, incrementals, 13)
              return <tr key={row.supplier}><td style={{ position:'sticky', left:0, background:'#06223d', fontWeight:900, padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{row.supplier}<div style={{ color:T.muted, fontSize:12, marginTop:3 }}>{displayName(sku, lang)}</div><div style={{ color:'#cbd9e8', fontSize:12, marginTop:4 }}>{lang === JP ? '現在在庫' : 'Current'}: {fmt(sku.stock_qty)} / {lang === JP ? '週所要' : 'Weekly req.'}: {fmt(Number(sku.daily_usage || 0) * 7)}</div>{(sku.factory || incrementals.find(r => r.sku_name === sku.name && r.supplier === row.supplier)?.factory) && <div style={{ color:T.muted, fontSize:11, marginTop:3 }}>{lang === JP ? '生産工場' : 'Factory'}: {sku.factory || incrementals.find(r => r.sku_name === sku.name && r.supplier === row.supplier)?.factory}</div>}</td>{rowForecast.map(f => { const m=statusMeta[f.status]; return <td key={f.week} style={{ padding:'8px', borderBottom:`1px solid ${T.line}`, textAlign:'center' }}><div style={{ border:`1px solid ${m.color}`, background:`${m.color}20`, color:m.color, borderRadius:8, padding:'8px 6px', fontWeight:900 }}>{fmtWeeks(f.wos)}{copy(lang, 'week')}<div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:3 }}>{lang === JP ? '在庫' : 'Stock'} {fmt(f.stock)}</div><div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:2 }}>{lang === JP ? '入荷' : 'Inbound'} +{fmt(f.inbound)}</div><div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:2 }}>{lang === JP ? '所要' : 'Req.'} {fmt(Number(sku.daily_usage || 0) * 7)}</div></div></td>})}</tr>
            })}</tbody>
          </table>
        </div>}
      </Panel>}
    </div>
    {showPricing && <PricingModal lang={lang} user={user} onClose={()=>setShowPricing(false)} />}
  </div>
}
