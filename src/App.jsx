import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase.js'
import { detectLang } from './i18n.js'
import LoginPage from './components/LoginPage.jsx'

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
function headerIncludes(headers, words) {
  const joined = headers.map(normalizedHeader).join('|')
  return words.some(w => joined.includes(String(w).toLowerCase()))
}
function isSkuCSV(headers) {
  const h = headers.map(normalizedHeader)
  const hasSkuSignal = headerIncludes(headers, ['品目', 'name', '現在在庫', 'stock_qty', '1日使用', 'daily_usage', '実際消費', 'actual_consumption'])
  const hasInboundSignal = h.some(x => /^w\d+$/.test(x) || /^\d+週$/.test(x)) || headerIncludes(headers, ['輸入数量', '入荷', 'factory', '生産工場'])
  return hasSkuSignal && !hasInboundSignal
}
function isInboundCSV(headers) {
  const h = headers.map(normalizedHeader)
  const hasWeek = h.some(x => /^w\d+$/.test(x) || /^\d+週$/.test(x))
  const hasInboundSignal = hasWeek || headerIncludes(headers, ['輸入数量', '入荷', 'supplier_info', 'サプライヤー情報', 'factory', '生産工場'])
  const hasSkuStockSignal = headerIncludes(headers, ['現在在庫', 'stock_qty', '1日使用', 'daily_usage', 'actual_consumption', '実際消費'])
  return hasInboundSignal && !hasSkuStockSignal
}
function readCsvText(file, onLoad) {
  const reader = new FileReader()
  reader.onload = ev => {
    const buffer = ev.target.result
    let utf8 = ''
    let sjis = ''
    try { utf8 = new TextDecoder('utf-8').decode(buffer) } catch (_) {}
    try { sjis = new TextDecoder('shift-jis').decode(buffer) } catch (_) {}
    const score = txt => {
      const head = (txt || '').slice(0, 300)
      return (head.match(/品目|仕入先|現在在庫|実際消費|生産工場|サプライヤー|週|name|supplier|stock_qty|daily_usage|actual_consumption|factory|W\d/gi) || []).length - (head.match(/�/g) || []).length * 3
    }
    onLoad(score(sjis) > score(utf8) ? sjis : utf8)
  }
  reader.readAsArrayBuffer(file)
}
function isProbablyInboundByShape(headers) {
  const h = headers.map(normalizedHeader)
  return h.some(x => /^w\d+$/.test(x) || /^\d+週$/.test(x)) || headers.length >= 17
}
function mergeByItemSupplier(base, updates) {
  const map = new Map()
  const keyOf = s => `${String(s.name || s.sku || '').trim()}__${String(s.supplier || s.subset || '').trim()}`
  ;[...base, ...updates].forEach((s, i) => {
    const key = keyOf(s)
    if (!key.startsWith('__')) {
      const existing = map.get(key) || {}
      map.set(key, {
        ...existing,
        ...s,
        id: existing.id || s.id || `local-item-${i}`,
        supplier: s.supplier || s.subset || existing.supplier || existing.subset || 'Supplier',
        subset: s.supplier || s.subset || existing.supplier || existing.subset || null,
        actual_consumption: Number(s.actual_consumption ?? existing.actual_consumption ?? s.daily_usage ?? existing.daily_usage ?? 0),
      })
    }
  })
  return [...map.values()]
}
function consumptionPerDay(s) {
  const actual = Number(s.actual_consumption)
  return actual > 0 ? actual : Number(s.daily_usage || 0)
}
function pickDemoFocus(items) {
  const candidates = [...(items || [])]
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const riskA = Number(a.stock_qty || 0) < calcRp(a) ? 0 : 1
    const riskB = Number(b.stock_qty || 0) < calcRp(b) ? 0 : 1
    if (riskA !== riskB) return riskA - riskB
    return calcWeeks(a) - calcWeeks(b)
  })
  return candidates[0]
}
function weekNumberFromHeader(h, fallback) {
  const x = normalizedHeader(h)
  const m = x.match(/^(?:w)?(\d+)(?:週)?$/)
  return m ? Number(m[1]) : fallback
}

const textKey = v => String(v ?? '').trim().toLowerCase()
function productKeysOf(s) {
  return [s?.name, s?.name_en, s?.sku].map(textKey).filter(Boolean)
}
function sameProduct(a, b) {
  const ak = productKeysOf(a)
  const bk = productKeysOf(b)
  return ak.length > 0 && bk.length > 0 && ak.some(x => bk.includes(x))
}
function inboundMatchesSku(row, sku) {
  const key = textKey(row?.sku_name)
  return key && productKeysOf(sku).includes(key)
}
function supplierKey(v) { return textKey(v || 'Supplier') }
function sameSupplier(a, b) { return supplierKey(a) === supplierKey(b) }
function findMatchingItem(items, target) {
  if (!target) return null
  return (items || []).find(s => sameProduct(s, target) && sameSupplier(s.supplier || s.subset, target.supplier || target.subset))
    || (items || []).find(s => sameProduct(s, target))
    || null
}
function uniqueProductOptions(items) {
  const map = new Map()
  ;(items || []).forEach(s => {
    const key = textKey(s.name || s.sku)
    if (!key) return
    const current = map.get(key)
    if (!current || calcWeeks(s) < calcWeeks(current)) map.set(key, s)
  })
  return [...map.values()]
}

function limitRowsToMaxProducts(currentRows, incomingRows, maxProducts = 2) {
  const seen = new Set()
  ;(currentRows || []).forEach(r => {
    const k = textKey(r?.name || r?.sku)
    if (k) seen.add(k)
  })
  const accepted = []
  ;(incomingRows || []).forEach(r => {
    const k = textKey(r?.name || r?.sku)
    if (!k) return
    if (seen.has(k) || seen.size < maxProducts) {
      seen.add(k)
      accepted.push(r)
    }
  })
  return accepted
}
function includeInboundOnlySuppliers(items, inboundRows) {
  const out = [...(items || [])]
  ;(inboundRows || []).forEach((r, idx) => {
    if (!r?.sku_name || !r?.supplier) return
    const exact = out.find(s => inboundMatchesSku(r, s) && sameSupplier(s.supplier || s.subset, r.supplier))
    if (exact) {
      if (r.supplier_info && !exact.supplier_info) exact.supplier_info = r.supplier_info
      if (r.factory && !exact.factory) exact.factory = r.factory
      return
    }
    const template = out.find(s => inboundMatchesSku(r, s)) || null
    out.push({
      ...(template || {}),
      id: `inbound-${textKey(r.sku_name).replace(/[^a-z0-9]+/g,'-')}-${textKey(r.supplier).replace(/[^a-z0-9]+/g,'-')}-${idx}`,
      name: template?.name || r.sku_name,
      name_en: template?.name_en || r.sku_name,
      sku: template?.sku || r.sku_name,
      superset: template?.superset || '',
      subset: r.supplier,
      supplier: r.supplier,
      stock_qty: template && sameSupplier(template.supplier || template.subset, r.supplier) ? Number(template.stock_qty || 0) : 0,
      daily_usage: Number(template?.daily_usage || template?.actual_consumption || 0),
      actual_consumption: Number(template?.actual_consumption || template?.daily_usage || 0),
      lead_time: Number(template?.lead_time || 7),
      safety_stock: Number(template?.safety_stock || 0) || null,
      moq: Number(template?.moq || 0) || null,
      unit_cost: Number(template?.unit_cost || 0) || null,
      supplier_info: r.supplier_info || template?.supplier_info || '',
      factory: r.factory || template?.factory || '',
      icon: template?.icon || 'box',
    })
  })
  return mergeByItemSupplier([], out)
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
      .filter(r => inboundMatchesSku(r, sku) && (!r.supplier || !sku.supplier || sameSupplier(r.supplier, sku.supplier)) && Number(r.week) === week)
      .reduce((a, r) => a + Number(r.qty || 0), 0)
    const daily = consumptionPerDay(sku)
    stock = Math.max(0, stock - daily * 7 + inbound)
    const wos = daily > 0 ? stock / (daily * 7) : 99
    return { week, stock: Math.round(stock), inbound, wos, status: statusByWeeks(wos) }
  })
}

function aggregateSkuForProduct(items, selectedSku, lang) {
  const rows = (items || []).filter(s => sameProduct(s, selectedSku))
  const source = rows.length ? rows : (selectedSku ? [selectedSku] : [])
  const totalStock = source.reduce((a, s) => a + Number(s.stock_qty || 0), 0)
  const daily = selectedSku ? consumptionPerDay(selectedSku) : source.reduce((a, s) => a + consumptionPerDay(s), 0)
  const lead = selectedSku ? Number(selectedSku.lead_time || 7) : Math.max(7, ...source.map(s => Number(s.lead_time || 7)))
  const safety = source.reduce((a, s) => a + Number(s.safety_stock || 0), 0)
  return {
    ...(selectedSku || source[0] || {}),
    id: `aggregate-${textKey(selectedSku?.name || source[0]?.name || 'item')}`,
    name: selectedSku?.name || source[0]?.name || (lang === JP ? '品目合計' : 'Item Total'),
    name_en: selectedSku?.name_en || source[0]?.name_en || selectedSku?.name || source[0]?.name,
    supplier: lang === JP ? '全仕入先合計' : 'All suppliers total',
    subset: lang === JP ? '全仕入先合計' : 'All suppliers total',
    stock_qty: totalStock,
    daily_usage: daily,
    actual_consumption: daily,
    lead_time: lead,
    safety_stock: safety,
    moq: selectedSku?.moq || source[0]?.moq || null,
    unit_cost: selectedSku?.unit_cost || source[0]?.unit_cost || null,
  }
}

function buildAggregateForecast(items, selectedSku, incrementals, weeks = 13, lang = JP) {
  const agg = aggregateSkuForProduct(items, selectedSku, lang)
  let stock = Number(agg.stock_qty || 0)
  const daily = consumptionPerDay(agg)
  return Array.from({ length: weeks }, (_, i) => {
    const week = i + 1
    const inbound = (incrementals || [])
      .filter(r => selectedSku ? inboundMatchesSku(r, selectedSku) : true)
      .filter(r => Number(r.week) === week)
      .reduce((a, r) => a + Number(r.qty || 0), 0)
    // 入荷予定CSVの内容がすぐ見えるよう、週の在庫は「前週在庫 + 当週入荷 - 当週所要」で計算
    stock = Math.max(0, stock + inbound - daily * 7)
    const wos = daily > 0 ? stock / (daily * 7) : 99
    return { week, stock: Math.round(stock), inbound, requirement: Math.round(daily * 7), wos, status: statusByWeeks(wos) }
  })
}

function makeOrderPlanRows(items, selectedSku, incrementals, lang) {
  const rows = getSupplierSkuRows(items, selectedSku, incrementals, lang).sort((a, b) => a.weeks - b.weeks)
  const target = aggregateSkuForProduct(items, selectedSku, lang)
  const weeklyNeed = consumptionPerDay(target) * 7
  const targetLevel = Math.max(Number(target.safety_stock || 0), weeklyNeed * (Math.max(1, Math.ceil(Number(target.lead_time || 7) / 7)) + 2))
  const currentTotal = rows.reduce((a, r) => a + Number(r.sku.stock_qty || 0), 0)
  const high = rows[0]
  const recommended = high?.status === 'over' ? 0 : Math.max(Number(target.moq || 0), Math.max(0, Math.round(targetLevel - currentTotal)))
  return rows.map((r, i) => ({
    product: selectedSku?.name || r.sku.name,
    supplier: r.supplier,
    factory: r.sku.factory || '',
    priority: i + 1,
    recommendedQty: i === 0 && r.status !== 'over' ? recommended : 0,
    note: r.status === 'over'
      ? (lang === JP ? '在庫過多につき追加注文停止' : 'Overstock: stop additional orders')
      : r.weeks < 1
        ? (lang === JP ? '適正在庫水準に基づき1週目に発注' : 'Order in week 1 based on the appropriate stock level')
        : r.weeks < 2
          ? (lang === JP ? '必要に応じて追加発注' : 'Additional order if needed')
          : (lang === JP ? '通常計画を継続' : 'Keep normal plan')
  }))
}

function downloadOrderPlanCsv(items, selectedSku, incrementals, lang) {
  const weekHeaders = Array.from({ length:13 }, (_, i) => weekLabel(i+1, lang))
  const headers = lang === JP
    ? ['品目名','仕入先','生産工場','優先順位','提案メモ',...weekHeaders]
    : ['item','supplier','factory','priority','proposal_note',...weekHeaders]
  const planRows = makeOrderPlanRows(items, selectedSku, incrementals, lang)
  const rows = planRows.map(r => [r.product, r.supplier, r.factory, r.priority, r.note, r.recommendedQty, ...Array(12).fill(0)])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
  a.download = 'stockwise_inbound_plan.csv'
  a.click()
}

function copy(lang, key) {
  const d = {
    dashboard: { ja:'ダッシュボード', en:'Dashboard' },
    heatmap: { ja:'在庫ヒートマップ（仕入先別）', en:'Inventory Heatmap by Supplier' },
    pricing: { ja:'料金', en:'Pricing' },
    reorderTab: { ja:'対応必要品目', en:'Items Needing Action' },
    alertBanner: { ja:'現在、対応が必要なアラートがあります。発注必要案件は右の確認ボタンから確認できます。', en:'There are alerts requiring attention. Use the order-needed check button to review items expected to run short.' },
    shortageListTitle: { ja:'対応必要品目', en:'Items Needing Action' },
    shortageListDesc: { ja:'発注が必要な品目と在庫過多の品目をまとめて確認できます。', en:'Review items that need ordering and items with overstock.' },
    alert: { ja:'アラート（要対応）', en:'Alerts' },
    alertSub: { ja:'対応が必要なアラート件数', en:'Items requiring action' },
    alertNote: { ja:'欠品リスク・納期遅延・在庫異常など', en:'Stockout risk, delays, inventory issues' },
    reorder: { ja:'発注必要案件数', en:'Items to Order' },
    overstock: { ja:'在庫過多', en:'Overstock' },
    overstockSub: { ja:'在庫過多の可能性がある品目', en:'Items with possible overstock' },
    overstockNote: { ja:'追加発注停止・在庫消化を検討', en:'Review order pause and stock reduction' },
    reorderSub: { ja:'発注が必要な案件数（欠品リスクあり）', en:'Order candidates with stockout risk' },
    reorderNote: { ja:'不足が予測される品目の発注候補', en:'Items expected to run short' },
    check: { ja:'確認する', en:'Check' },
    inbound: { ja:'輸入数量予定', en:'Inbound Plan' },
    stockValue: { ja:'在庫金額', en:'Inventory Value' },
    activeItems: { ja:'有効品目', en:'active items' },
    reorderItems: { ja:'対応必要品目', en:'Items Needing Action' },
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
    itemLabel: { ja:'品目', en:'Item' },
    orderPlanDownload: { ja:'発注計画を作成', en:'Create order plan' },
    supplier: { ja:'仕入先', en:'Supplier' },
    stockWeek: { ja:'在庫週数', en:'Weeks of Stock' },
    itemTemplateDownload: { ja:'ダウンロード', en:'Download' },
    itemUpload: { ja:'アップロード', en:'Upload' },
    csvTemplateDownload: { ja:'ダウンロード', en:'Download' },
    csvUpload: { ja:'アップロード', en:'Upload' },
    allItems: { ja:'すべての品目を表示', en:'View All Items' },
    heatmapHint: { ja:'品目をクリックすると、その品目の在庫ヒートマップ（仕入先別）へ移動します。', en:'Click an item to open its supplier heatmap.' },
    itemTemplateSection: { ja:'対応必要品目', en:'Items Needing Action' },
    csvSection: { ja:'輸入数量予定', en:'Inbound Plan' },
    selectItem: { ja:'表示する品目', en:'Selected Item' },
    logout: { ja:'ログアウト', en:'Logout' },
    aiPlan: { ja:'発注提案', en:'Order Plan' },
    csvSettings: { ja:'CSV設定', en:'CSV Settings' },
    csvSettingsDesc: { ja:'対応必要品目と輸入数量予定のCSVをここで管理できます。', en:'Manage action item and inbound plan CSV files here.' },
    aiSimulationTitle: { ja:'発注シミュレーション', en:'Order Simulation' },
    aiSimulationDesc: { ja:'CSVに登録された現在在庫・実際消費量・13週入荷予定をもとに、適切な在庫水準、優先仕入先、推奨発注量を表示します。', en:'Uses CSV-based current stock, actual consumption, and the 13-week inbound plan to show the appropriate stock level, priority supplier, and recommended order quantity.' },
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
  return <div style={{ flex:1, minWidth:300, border:`1px solid ${c}`, borderRadius:10, padding:'22px 26px', background:`linear-gradient(135deg, ${tone === 'red' ? 'rgba(255,35,58,.45)' : tone === 'blue' ? 'rgba(59,130,246,.34)' : 'rgba(255,120,0,.44)'}, rgba(2,11,22,.75))`, boxShadow:`0 0 28px ${c}24` }}>
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
    {icon ? <div style={{ fontSize:42, color:T.blue }}>{icon}</div> : null}
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


function getSupplierSkuRows(items, selectedSku, incrementals, lang) {
  if (!selectedSku) return []
  const sameItem = items.filter(s => sameProduct(s, selectedSku))
  const rows = sameItem.length ? sameItem : [selectedSku]
  return rows.map((sku, i) => {
    const supplier = sku.supplier || sku.subset || (lang === JP ? `仕入先${i + 1}` : `Supplier ${i + 1}`)
    const weeks = calcWeeks(sku)
    const alert = weeks < 1 ? (lang === JP ? '7日以内に欠品リスク' : 'Stockout risk within 7 days')
      : weeks < 2 ? (lang === JP ? '14日以内に欠品リスク' : 'Stockout risk within 14 days')
      : Number(sku.stock_qty || 0) === 0 ? (lang === JP ? '供給なし' : 'No supply') : '—'
    const action = weeks > 8 ? (lang === JP ? '在庫過多につき追加注文停止' : 'Overstock: stop additional orders')
      : weeks < 1 ? (lang === JP ? '緊急発注を検討' : 'Consider urgent order')
      : weeks < 2 ? (lang === JP ? '発注を検討' : 'Consider order')
      : Number(sku.stock_qty || 0) === 0 ? (lang === JP ? '新規発注先を検討' : 'Find supplier')
      : (lang === JP ? '通常発注計画でOK' : 'Normal plan OK')
    const inboundSum = incrementals.filter(r => inboundMatchesSku(r, sku) && (!r.supplier || sameSupplier(r.supplier, supplier))).reduce((a, r) => a + Number(r.qty || 0), 0)
    return { sku, supplier, weeks, status: statusByWeeks(weeks), alert, action, inboundSum }
  })
}

function DetailMetric({ title, value, suffix, tone }) {
  const color = tone === 'red' ? T.red : tone === 'orange' ? T.orange : tone === 'green' ? T.green : T.text
  return <div style={{ background:'rgba(10,43,76,.78)', border:`1px solid ${T.line}`, borderRadius:8, padding:'18px 22px', minWidth:170, flex:1 }}>
    <div style={{ color:'#c4d4e4', fontSize:14, fontWeight:800, marginBottom:10 }}>{title}</div>
    <div style={{ color, fontSize:30, fontWeight:900 }}>{value}<span style={{ fontSize:14, marginLeft:8, color:T.text }}>{suffix}</span></div>
  </div>
}

function ProductDetailHeader({ selectedSku, items, incrementals, lang, onBack }) {
  if (!selectedSku) return null
  const rows = getSupplierSkuRows(items, selectedSku, incrementals, lang)
  const totalStock = rows.reduce((a,r)=>a+Number(r.sku.stock_qty||0),0)
  const totalReq = rows.reduce((a,r)=>a+Number(r.sku.daily_usage||0),0)
  const avgWeeks = totalReq > 0 ? totalStock / (totalReq * 7) : calcWeeks(selectedSku)
  const risk = avgWeeks < 1 ? (lang === JP ? '高' : 'High') : avgWeeks < 2 ? (lang === JP ? '中' : 'Medium') : (lang === JP ? '低' : 'Low')
  const riskTone = avgWeeks < 1 ? 'red' : avgWeeks < 2 ? 'orange' : 'green'
  const recommended = selectedSku.moq || Math.max(0, calcRp(selectedSku) - Number(selectedSku.stock_qty || 0))
  return <div>
    <button onClick={onBack} style={{ background:'none', border:'none', color:'#d7e7f7', fontFamily:T.font, cursor:'pointer', margin:'0 0 16px', padding:0 }}>← {lang === JP ? '戻る' : 'Back'}</button>
    <div style={{ display:'flex', gap:22, alignItems:'center', flexWrap:'wrap' }}>
      <div style={{ width:112, height:88, borderRadius:10, background:'rgba(11,39,70,.9)', border:`1px solid ${T.line}`, display:'grid', placeItems:'center' }}><ProductIcon type={selectedSku.icon || 'box'} active /></div>
      <div><h2 style={{ margin:'0 0 8px', fontSize:28 }}>{displayName(selectedSku, lang)}</h2><div style={{ color:T.muted, fontSize:16 }}>{copy(lang, 'itemLabel')}: {selectedSku.name}</div></div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginTop:16 }}>
      <DetailMetric title={copy(lang, 'currentStock')} value={fmt(totalStock || selectedSku.stock_qty)} suffix={copy(lang, 'units')} />
      <DetailMetric title={copy(lang, 'recommendedOrder')} value={`+${fmt(recommended)}`} suffix={copy(lang, 'units')} tone="orange" />
      <DetailMetric title={lang === JP ? '平均在庫週数' : 'Average WOS'} value={fmtWeeks(avgWeeks)} suffix={copy(lang, 'week')} tone={riskTone} />
      <DetailMetric title={lang === JP ? '7日以内欠品リスク' : '7-day Risk'} value={risk} suffix="" tone={riskTone} />
    </div>
  </div>
}

function SupplierStatusDetail({ items, selectedSku, incrementals, lang }) {
  const rows = getSupplierSkuRows(items, selectedSku, incrementals, lang)
  return <div style={{ marginTop:18 }}>
    <h3 style={{ margin:'0 0 6px', fontSize:24 }}>{lang === JP ? '仕入先別 在庫状況' : 'Supplier Inventory Status'}</h3>
    <p style={{ margin:'0 0 12px', color:'#c3d3e4', fontSize:14 }}>{lang === JP ? '仕入先ごとの在庫日数・在庫数・アラートを確認できます。' : 'Check stock days, units, and alerts by supplier.'}</p>
    <div style={{ overflowX:'auto', border:`1px solid ${T.line}`, borderRadius:10 }}>
      <table style={{ width:'100%', minWidth:850, borderCollapse:'collapse' }}>
        <thead><tr>{[lang === JP ? '仕入先' : 'Supplier', lang === JP ? '在庫数（個）' : 'Stock Units', lang === JP ? '入荷予定' : 'Inbound', lang === JP ? '在庫週数' : 'Weeks of Stock', lang === JP ? '状態' : 'Status', lang === JP ? 'アラート' : 'Alert', lang === JP ? '推奨アクション' : 'Recommended Action'].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 14px', background:'rgba(255,255,255,.04)', color:'#d7e7f7', borderBottom:`1px solid ${T.line}`, fontSize:13 }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => { const m = statusMeta[r.status]; return <tr key={`${r.supplier}-${i}`}>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{r.supplier}</td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{fmt(r.sku.stock_qty)}</td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{fmt(r.inboundSum)} {copy(lang, 'units')}</td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900, fontSize:20 }}>{fmtWeeks(r.weeks)} {copy(lang, 'week')} <span style={{ display:'inline-block', width:52, height:8, borderRadius:99, background:`linear-gradient(90deg,${m.color} 60%,rgba(255,255,255,.12) 60%)`, marginLeft:10 }} /></td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900 }}>{m[lang]}</td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{r.alert}</td>
          <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}><span style={{ border:`1px solid ${m.color}`, color:m.color, background:`${m.color}18`, borderRadius:6, padding:'7px 10px', fontWeight:900, fontSize:12 }}>{r.action}</span></td>
        </tr>})}</tbody>
      </table>
    </div>
  </div>
}

function ForecastLineChart({ forecast, lang }) {
  const points = forecast.slice(0, 5)
  if (!points.length) return null
  const max = Math.max(1, ...points.map(p => Number(p.wos || 0)))
  const coords = points.map((p, i) => {
    const x = 50 + i * 180
    const y = 155 - (Number(p.wos || 0) / max) * 110
    return { ...p, x, y, color: statusMeta[p.status].color }
  })
  const d = coords.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  return <div style={{ marginTop:18, background:'rgba(7,43,76,.72)', border:`1px solid ${T.line}`, borderRadius:10, padding:18 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:10 }}>
      <div><h3 style={{ margin:'0 0 4px', fontSize:24 }}>{lang === JP ? '在庫週数の推移予測（全仕入先合計）' : 'Weeks-of-Stock Trend Forecast'}</h3><p style={{ margin:0, color:'#c7d8e8', fontSize:14 }}>{lang === JP ? '入荷予定・リードタイムを加味した在庫週数の推移' : 'Projected weeks of stock including inbound plan and lead time.'}</p></div>
      <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:10, minWidth:170, fontSize:12, color:'#d2e2f1' }}>
        <b>{lang === JP ? '状態の目安' : 'Status Guide'}</b>
        {['attention','alert','good','over'].map(k => <div key={k} style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}><span style={{ width:24, height:5, borderRadius:99, background:statusMeta[k].color }} />{statusMeta[k][lang]}</div>)}
      </div>
    </div>
    <svg viewBox="0 0 840 205" style={{ width:'100%', maxHeight:250, overflow:'visible' }}>
      <line x1="42" y1="160" x2="800" y2="160" stroke="#2b4b6b" strokeWidth="1" />
      <path d={d} fill="none" stroke="#55d6d2" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((p, i) => <g key={p.week}>
        <circle cx={p.x} cy={p.y} r="7" fill={p.color} stroke="#dbeafe" strokeWidth="2" />
        <text x={p.x} y={p.y - 16} textAnchor="middle" fill="#f8fbff" fontSize="14" fontWeight="800">{fmtWeeks(p.wos)}{copy(lang, 'week')}</text>
        <text x={p.x} y="185" textAnchor="middle" fill="#cbd9e8" fontSize="13">{i === 0 ? (lang === JP ? '現在' : 'Now') : `${i}${lang === JP ? '週後' : 'w later'}`}</text>
        <text x={p.x} y="202" textAnchor="middle" fill="#8198b2" fontSize="12">{weekLabel(p.week, lang)}</text>
      </g>)}
    </svg>
  </div>
}

function RecommendationCards({ rows, lang, onCreatePlan }) {
  const sorted = [...rows].sort((a,b)=>a.weeks-b.weeks)
  const high = sorted[0]
  const cards = high ? [{
    level: lang === JP ? '優先度：高' : 'Priority: High',
    row: high,
    color: high.status === 'over' ? T.blue : T.red,
    title: high.status === 'over'
      ? `${high.supplier}${lang === JP ? 'は在庫過多' : ': overstock'}`
      : `${high.supplier}${lang === JP ? 'の緊急発注を検討' : ': consider urgent order'}`,
    body: high.status === 'over'
      ? (lang === JP ? '在庫過多につき追加注文停止。既存在庫の消化を優先します。' : 'Overstock: stop additional orders and prioritize consuming existing inventory.')
      : (lang === JP ? '在庫日数が不足し、欠品リスクが高い状態です。発注計画CSVでは1週目に推奨発注量を反映します。' : 'Stock coverage is low and stockout risk is high. The order plan CSV will place the recommended quantity in week 1.'),
  }] : []
  return <div style={{ marginTop:18 }}>
    <h3 style={{ margin:'0 0 12px', fontSize:24 }}>{lang === JP ? '推奨アクション' : 'Recommended Action'}</h3>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:14 }}>
      {cards.map(c => <div key={c.level} style={{ border:`1px solid ${c.color}`, background:`${c.color}18`, borderRadius:10, padding:18 }}>
        <div style={{ color:c.color, fontWeight:900, marginBottom:8 }}>{c.level}</div>
        <div style={{ fontSize:17, fontWeight:900, marginBottom:8 }}>{c.title}</div>
        <p style={{ margin:'0 0 14px', color:'#d5e2ef', lineHeight:1.6, fontSize:14 }}>{c.body}</p>
        <button onClick={onCreatePlan} style={{ width:'100%', border:`1px solid ${c.color}`, background:`${c.color}20`, color:c.color, borderRadius:6, padding:'10px 12px', fontWeight:900, fontFamily:T.font }}>{copy(lang, 'orderPlanDownload')} →</button>
      </div>)}
    </div>
  </div>
}


function CsvSettingsModal({ lang, onClose, onDownloadSku, onUploadSku, onDownloadInbound, onUploadInbound }) {
  return <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:50, background:'rgba(0,0,0,.62)', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', padding:24 }}>
    <div onClick={e=>e.stopPropagation()} style={{ width:'min(440px, calc(100vw - 48px))', background:'linear-gradient(180deg,#082947,#041d36)', border:`1px solid ${T.line}`, borderRadius:14, padding:20, boxShadow:'0 24px 80px rgba(0,0,0,.42)', fontFamily:T.font, color:T.text }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div><h3 style={{ margin:'0 0 4px', fontSize:22 }}>{copy(lang, 'csvSettings')}</h3><p style={{ margin:0, color:T.muted, fontSize:13 }}>{copy(lang, 'csvSettingsDesc')}</p></div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,.08)', border:`1px solid ${T.line}`, color:T.text, borderRadius:8, width:34, height:34, cursor:'pointer' }}>×</button>
      </div>
      <TemplateSection title={copy(lang, 'itemTemplateSection')}>
        <Btn small onClick={onDownloadSku}>⇩ {copy(lang, 'itemTemplateDownload')}</Btn>
        <Btn small onClick={onUploadSku}>⇧ {copy(lang, 'itemUpload')}</Btn>
      </TemplateSection>
      <TemplateSection title={copy(lang, 'csvSection')}>
        <Btn small onClick={onDownloadInbound}>⇩ {copy(lang, 'csvTemplateDownload')}</Btn>
        <Btn small onClick={onUploadInbound}>⇧ {copy(lang, 'csvUpload')}</Btn>
      </TemplateSection>
    </div>
  </div>
}

function Forecast13Visual({ forecast, lang }) {
  if (!forecast?.length) return null
  const maxWos = Math.max(1, ...forecast.map(f=>Number(f.wos||0)))
  return <div style={{ marginTop:18, background:'rgba(7,43,76,.72)', border:`1px solid ${T.line}`, borderRadius:10, padding:18 }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:14, flexWrap:'wrap', alignItems:'flex-start', marginBottom:14 }}>
      <div><h3 style={{ margin:'0 0 4px', fontSize:24 }}>{lang === JP ? '13週 在庫週数の推移予測' : '13-week Weeks-of-Stock Forecast'}</h3><p style={{ margin:0, color:'#c7d8e8', fontSize:14 }}>{lang === JP ? '13週ヒートマップと同じCSV情報を使い、週ごとの在庫週数を視覚化します。' : 'Uses the same CSV data as the 13-week heatmap to visualize weekly coverage.'}</p></div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>{['alert','attention','good','over'].map(k=><span key={k} style={{ fontSize:12, color:'#d2e2f1' }}><b style={{ color:statusMeta[k].color }}>●</b> {statusMeta[k][lang]}</span>)}</div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(13,minmax(62px,1fr))', gap:8, overflowX:'auto', paddingBottom:6 }}>
      {forecast.map(f=>{ const m=statusMeta[f.status]; const h=Math.max(12, Math.min(92, (Number(f.wos||0)/maxWos)*92)); return <div key={f.week} style={{ minWidth:62, border:`1px solid ${m.color}`, borderRadius:8, padding:'8px 6px', background:`${m.color}18`, textAlign:'center' }}>
        <div style={{ fontSize:12, color:'#d5e5f3', fontWeight:900 }}>{weekLabel(f.week, lang)}</div>
        <div style={{ height:96, display:'flex', alignItems:'flex-end', justifyContent:'center', margin:'8px 0' }}><div style={{ width:18, height:h, borderRadius:99, background:`linear-gradient(180deg,${m.color},${m.color}88)` }} /></div>
        <div style={{ color:m.color, fontSize:18, fontWeight:900 }}>{fmtWeeks(f.wos)}{copy(lang, 'week')}</div>
        <div style={{ fontSize:10, color:'#cfddeb', marginTop:3 }}>{lang === JP ? '在庫' : 'Stock'} {fmt(f.stock)}</div>
      </div>})}
    </div>
  </div>
}


function ReorderSimulationPanel({ items, selectedSku, incrementals, lang }) {
  const target = selectedSku || pickDemoFocus(items)
  const rows = getSupplierSkuRows(items, target, incrementals, lang).sort((a, b) => {
    const score = r => {
      const cost = Number(r.sku.unit_cost || 0)
      const lead = Number(r.sku.lead_time || 999)
      const margin = Math.max(0, Math.round(cost * 0.35))
      return (r.weeks < 1 ? -1000 : 0) + lead + cost * 0.2
    }
    return score(a) - score(b)
  })
  const weeklyNeed = target ? consumptionPerDay(target) * 7 : 0
  const targetLevel = target ? Math.max(Number(target.safety_stock || 0), weeklyNeed * (Math.max(1, Math.ceil(Number(target.lead_time || 7) / 7)) + 2)) : 0
  const currentTotal = rows.reduce((a, r) => a + Number(r.sku.stock_qty || 0), 0)
  const recommended = target ? Math.max(Number(target.moq || 0), Math.max(0, Math.round(targetLevel - currentTotal))) : 0
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:10, overflow:'hidden', marginTop:12 }}>
    <div style={{ padding:'14px 16px', borderBottom:`1px solid ${T.line}`, background:'rgba(255,255,255,.04)' }}>
      <div style={{ fontSize:18, fontWeight:900 }}>{lang === JP ? '発注シミュレーション' : 'Order Simulation'}</div>
      <div style={{ color:T.muted, fontSize:13, marginTop:4 }}>{displayName(target, lang)}{lang === JP ? 'について、仕入先ごとの価格・リードタイムを比較します。' : ': compare supplier price and lead time.'}</div>
    </div>
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', minWidth:900, borderCollapse:'collapse' }}>
        <thead><tr>{[
          lang === JP ? '優先' : 'Priority',
          copy(lang, 'supplier'),
          lang === JP ? '在庫週数' : 'WOS',
          lang === JP ? '単価' : 'Unit Cost',
          lang === JP ? 'リードタイム' : 'Lead Time',
          lang === JP ? '推奨発注量' : 'Recommended Qty',
          lang === JP ? '判断' : 'Decision'
        ].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 14px', background:'rgba(255,255,255,.04)', color:'#d7e7f7', borderBottom:`1px solid ${T.line}`, fontSize:13 }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => {
          const m = statusMeta[r.status]
          const cost = Number(r.sku.unit_cost || 0)
          const lead = Number(r.sku.lead_time || target?.lead_time || 0)
          const qty = i === 0 && r.status !== 'over' ? recommended : 0
          const decision = r.status === 'over'
            ? (lang === JP ? '在庫過多のため追加注文停止' : 'Stop additional orders due to overstock')
            : i === 0
              ? (lang === JP ? '優先仕入先として発注検討' : 'Consider as priority supplier')
              : (lang === JP ? '代替仕入先として待機' : 'Keep as backup supplier')
          return <tr key={`${r.supplier}-${i}`}>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:i===0?T.red:T.muted, fontWeight:900 }}>{i+1}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{r.supplier}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:m.color, fontWeight:900 }}>{fmtWeeks(r.weeks)} {copy(lang, 'week')}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{lang === JP ? `¥${Math.round(cost*150).toLocaleString('ja-JP')}` : `$${cost.toLocaleString('en-US')}`}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{lead}{lang === JP ? '日' : 'd'}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:qty?T.orange:T.muted, fontWeight:900 }}>{qty ? `+${fmt(qty)} ${copy(lang, 'units')}` : '—'}</td>
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{decision}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </div>
}

function OrderSimulationPanel({ items, selectedSku, incrementals, lang }) {
  const rows = getSupplierSkuRows(items, selectedSku, incrementals, lang).sort((a,b)=>a.weeks-b.weeks)
  const top = rows[0]
  const totalInbound = incrementals.filter(r => !selectedSku || inboundMatchesSku(r, selectedSku)).reduce((a,r)=>a+Number(r.qty||0),0)
  const actualWeeklyConsumption = selectedSku ? Math.max(0, consumptionPerDay(selectedSku) * 7) : 0
  const leadTimeWeeks = selectedSku ? Math.max(1, Math.ceil(Number(selectedSku.lead_time||7) / 7)) : 1
  const safetyWeeks = 2
  const optimalStockLevel = selectedSku ? Math.round(Math.max(Number(selectedSku.safety_stock||0), actualWeeklyConsumption * (leadTimeWeeks + safetyWeeks))) : 0
  const recommendedQty = selectedSku ? Math.max(Number(selectedSku.moq||0), Math.max(0, optimalStockLevel - Number(selectedSku.stock_qty||0))) : 0
  return <div style={{ marginTop:18 }}>
    <h3 style={{ margin:'0 0 12px', fontSize:24 }}>{copy(lang, 'aiSimulationTitle')}</h3>
    <div style={{ border:`1px solid ${T.blue}`, background:'linear-gradient(135deg,rgba(59,130,246,.16),rgba(6,34,61,.78))', borderRadius:12, padding:18 }}>
      <p style={{ margin:'0 0 14px', color:'#d9e6f3', lineHeight:1.6 }}>{copy(lang, 'aiSimulationDesc')}</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10, marginBottom:0 }}>
        <DetailMetric title={lang === JP ? '適正在庫水準' : 'Appropriate Stock Level'} value={fmt(optimalStockLevel)} suffix={copy(lang, 'units')} tone="blue" />
        <DetailMetric title={lang === JP ? '優先仕入先' : 'Priority Supplier'} value={top?.supplier || '—'} suffix="" tone={top?.weeks < 1 ? 'red' : top?.weeks < 2 ? 'orange' : 'green'} />
        <DetailMetric title={lang === JP ? '推奨発注量' : 'Recommended Qty'} value={`+${fmt(recommendedQty)}`} suffix={copy(lang, 'units')} tone="orange" />
        <DetailMetric title={lang === JP ? '13週入荷予定合計' : '13-week Inbound Total'} value={fmt(totalInbound)} suffix={copy(lang, 'units')} />
      </div>
    </div>
  </div>
}

function AiPlanTab({ items, selectedSku, incrementals, lang, onBack }) {
  const rows = getSupplierSkuRows(items, selectedSku, incrementals, lang).sort((a,b)=>a.weeks-b.weeks)
  const forecast = selectedSku ? buildForecast(selectedSku, incrementals, 13) : []
  const criticalWeeks = forecast.filter(f=>f.wos < 2).map(f=>weekLabel(f.week, lang)).join(' / ') || (lang === JP ? 'なし' : 'None')
  const actualWeeklyConsumption = selectedSku ? Math.max(0, consumptionPerDay(selectedSku) * 7) : 0
  const leadTimeWeeks = selectedSku ? Math.max(1, Math.ceil(Number(selectedSku.lead_time||7) / 7)) : 1
  const safetyWeeks = 2
  const optimalStockLevel = selectedSku ? Math.round(Math.max(Number(selectedSku.safety_stock||0), actualWeeklyConsumption * (leadTimeWeeks + safetyWeeks))) : 0
  const qty = selectedSku ? Math.max(Number(selectedSku.moq||0), Math.max(0, optimalStockLevel - Number(selectedSku.stock_qty||0))) : 0
  return <Panel title={copy(lang, 'aiPlan')} action={<Btn small onClick={onBack}>← {lang === JP ? 'ヒートマップへ戻る' : 'Back to Heatmap'}</Btn>}>
    <p style={{ color:'#d8e6f4', marginTop:-4, lineHeight:1.7 }}>{lang === JP ? 'StockwiseのAI機能を通して、CSV・在庫・入荷予定・実際の消費量から発注計画を整理します。' : 'Through Stockwise AI, this tab organizes an order plan from CSV, stock, inbound plan, and actual consumption data.'}</p>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:14, marginTop:14 }}>
      <div style={{ border:`1px solid ${T.red}`, background:'rgba(255,70,93,.12)', borderRadius:12, padding:18 }}><b style={{ color:T.red }}>{lang === JP ? 'リスク週' : 'Risk Weeks'}</b><div style={{ fontSize:24, fontWeight:900, marginTop:10 }}>{criticalWeeks}</div></div>
      <div style={{ border:`1px solid ${T.orange}`, background:'rgba(255,138,28,.12)', borderRadius:12, padding:18 }}><b style={{ color:T.orange }}>{lang === JP ? '推奨発注量' : 'Recommended Order'}</b><div style={{ fontSize:24, fontWeight:900, marginTop:10 }}>+{fmt(qty)} {copy(lang, 'units')}</div></div>
      <div style={{ border:`1px solid ${T.green}`, background:'rgba(34,201,133,.12)', borderRadius:12, padding:18 }}><b style={{ color:T.green }}>{lang === JP ? '優先仕入先' : 'Supplier Priority'}</b><div style={{ fontSize:18, fontWeight:900, marginTop:10 }}>{rows.slice(0,3).map(r=>r.supplier).join(' → ') || '—'}</div></div>
    </div>
    <div style={{ marginTop:18, border:`1px solid ${T.line}`, borderRadius:10, overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{[lang === JP ? '優先順位' : 'Priority', copy(lang,'supplier'), copy(lang,'stockWeek'), lang === JP ? '提案' : 'Proposal'].map(h=><th key={h} style={{ textAlign:'left', padding:'12px 14px', background:'rgba(255,255,255,.04)', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=>{ const color = i===0 ? T.red : i===1 ? T.orange : T.green; return <tr key={r.supplier}><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color, fontWeight:900 }}>{i+1}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{r.supplier}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:statusMeta[r.status].color, fontWeight:900 }}>{fmtWeeks(r.weeks)}{copy(lang,'week')}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{r.action}</td></tr>})}</tbody></table>
    </div>
  </Panel>
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [lang, setLang] = useState(() => detectLang())
  const [tab, setTab] = useState('dashboard')
  const [reorderView, setReorderView] = useState('status')
  const [skus, setSkus] = useState([])
  const [incrementals, setIncrementals] = useState([])
  const [uploadedItems, setUploadedItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showCsvSettings, setShowCsvSettings] = useState(false)
  const skuCsvRef = useRef(null)
  const incCsvRef = useRef(null)
  const actionItemsRef = useRef(null)

  useEffect(() => { localStorage.setItem('stockwise_lang', lang); document.documentElement.lang = lang }, [lang])
  useEffect(() => { if (user) fetchSkus() }, [user])

  function scrollToActionItems() {
    setTab('dashboard')
    setTimeout(() => actionItemsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 50)
  }

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
    const merged = includeInboundOnlySuppliers(mergeByItemSupplier(base, normalizedLocal), localInbound)
    setUploadedItems(localItems)
    setSkus(merged)
    setIncrementals(localInbound)
    setSelected(prev => findMatchingItem(merged, prev) || pickDemoFocus(merged))
  }

  function downloadSkuTemplate() {
    const headers = lang === JP
      ? ['品目名','仕入先','現在在庫数','1日使用数','実際消費量','リードタイム日数','安全在庫','単価','生産工場']
      : ['item','supplier','stock_qty','daily_usage','actual_consumption','lead_time_days','safety_stock','unit_cost','factory']
    const source = skus.length ? skus : sampleSkus
    const rows = source.map(s => [s.name, s.supplier || s.subset || '', s.stock_qty || 0, s.daily_usage || 0, s.actual_consumption || s.daily_usage || 0, s.lead_time || 7, s.safety_stock || '', s.unit_cost || '', s.factory || ''])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_order_candidate_items.csv'
    a.click()
  }
  function downloadCsvTemplate() {
    const source = skus.length ? skus : sampleSkus
    const weekHeaders = Array.from({ length:13 }, (_, i) => weekLabel(i+1, lang))
    const headers = lang === JP ? ['品目名','仕入先','生産工場',...weekHeaders] : ['item','supplier','factory',...weekHeaders]
    const rows = source.map(s => {
      const itemName = s.name
      const supplier = s.supplier || s.subset || ''
      const vals = Array.from({ length:13 }, (_, i) =>
        incrementals.filter(r => inboundMatchesSku(r, s) && sameSupplier(r.supplier || supplier, supplier) && Number(r.week) === i+1).reduce((a,r)=>a+Number(r.qty||0),0)
      )
      const factory = s.factory || ''
      return [itemName, supplier, factory, ...vals]
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_inbound_plan.csv'
    a.click()
  }
  function uploadSkuCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    readCsvText(file, async text => {
      const table = parseCSV(String(text))
      const headers = table[0] || []
      if (isInboundCSV(headers) || isProbablyInboundByShape(headers)) {
        alert(lang === JP ? 'これは輸入数量予定CSVの形式です。輸入数量予定のアップロード欄からアップロードしてください。' : 'This looks like an Inbound Plan CSV. Please upload it from the Inbound Plan upload button.')
        e.target.value = ''
        return
      }
      // 発注候補品目CSVは、このアップロード欄から選んだ時点で発注候補品目として扱います。
      // Excel / Numbersで保存したCSVは文字コードやヘッダーが変わる場合があるため、ヘッダー完全一致では止めません。
      const h = headers.map(normalizedHeader)
      const idx = name => h.findIndex(x => x === name)
      const get = (cols, names, fallbackIndex) => {
        for (const n of names) { const i = idx(n); if (i >= 0) return cols[i] }
        return cols[fallbackIndex]
      }
      const rows = table.slice(1).map((cols, idxRow) => {
        const name = get(cols, ['品目名','name'], 0)?.trim()
        const supplier = get(cols, ['仕入先','supplier'], 1)?.trim()
        return {
          id:`local-item-${Date.now()}-${idxRow}`, user_id:user.id, name, name_en:name,
          superset:name, subset:supplier || null, supplier:supplier || null,
          stock_qty:+get(cols, ['現在在庫数','stock_qty'], 2)||0,
          daily_usage:+get(cols, ['1日使用数','daily_usage'], 3)||0,
          actual_consumption:+get(cols, ['実際消費量','actual_consumption'], 4)||(+get(cols, ['1日使用数','daily_usage'], 3)||0),
          lead_time:+get(cols, ['リードタイム日数','lead_time_days','lead_time'], 5)||7,
          safety_stock:+get(cols, ['安全在庫','safety_stock'], 6)||null, moq:null, unit_cost:+get(cols, ['単価','unit_cost'], 7)||null,
          sku:name,
          supplier_info:'',
          factory:get(cols, ['生産工場','factory'], 8)?.trim() || '',
        }
      }).filter(r => r.name)
      const currentLocal = JSON.parse(localStorage.getItem(`stockwise_items_${user.id}`) || '[]')
      const acceptedRows = limitRowsToMaxProducts(currentLocal, rows, 2)
      const saved = mergeByItemSupplier(currentLocal, acceptedRows)
      localStorage.setItem(`stockwise_items_${user.id}`, JSON.stringify(saved))
      setUploadedItems(saved)
      const nextItems = includeInboundOnlySuppliers(mergeByItemSupplier([], saved), incrementals)
      setSkus(nextItems)
      const preferred = acceptedRows[0] || selectedSku
      setSelected(findMatchingItem(nextItems, preferred) || findMatchingItem(nextItems, selectedSku) || pickDemoFocus(nextItems))
      try { if (acceptedRows.length) await supabase.from('skus').upsert(acceptedRows.map(({id,sku,name_en,icon,actual_consumption,supplier_info,factory,...r})=>r), { onConflict:'user_id,name' }) } catch (_) {}
      alert((lang === JP ? '発注候補品目を更新しました：' : 'Order candidate items updated: ') + acceptedRows.length)
      e.target.value = ''
    })
  }

  function uploadCsv(e) {
    const file = e.target.files?.[0]; if (!file) return
    readCsvText(file, text => {
      const table = parseCSV(String(text))
      const headers = table[0] || []
      if (isSkuCSV(headers) && !isProbablyInboundByShape(headers)) {
        alert(lang === JP ? 'これは発注候補品目CSVの形式です。発注候補品目のアップロード欄からアップロードしてください。' : 'This looks like an Order Candidate Items CSV. Please upload it from the Order Candidate Items upload button.')
        e.target.value = ''
        return
      }
      // 輸入数量予定CSVは、週列があれば日本語/英語どちらのヘッダーでも受け付けます。
      const h = headers.map(normalizedHeader)
      let itemIdx = h.findIndex(x => x === '品目名' || x === 'item')
      let supplierIdx = h.findIndex(x => x === '仕入先' || x === 'supplier')
      let infoIdx = -1
      let factoryIdx = h.findIndex(x => x === '生産工場' || x === 'factory')
      if (itemIdx < 0) itemIdx = 0
      if (supplierIdx < 0) supplierIdx = 1
      if (factoryIdx < 0 && headers.length >= 4) factoryIdx = 2
      let weekIndexes = h.map((x, i) => ({ i, week: weekNumberFromHeader(x, null) })).filter(x => x.week >= 1 && x.week <= 13)
      if (!weekIndexes.length && headers.length >= 4) weekIndexes = Array.from({ length: Math.min(13, headers.length - 3) }, (_, i) => ({ i: i + 3, week: i + 1 }))
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
      const applyInboundMeta = s => {
        const hit = parsed.find(r => inboundMatchesSku(r, s) && sameSupplier(r.supplier, s.supplier || s.subset || ''))
        return hit ? { ...s, supplier_info: hit.supplier_info, factory: hit.factory } : s
      }
      const nextItems = includeInboundOnlySuppliers((skus.length ? skus : []).map(applyInboundMeta), parsed)
      setSkus(nextItems)
      const currentLocal = JSON.parse(localStorage.getItem(`stockwise_items_${user.id}`) || '[]')
      localStorage.setItem(`stockwise_items_${user.id}`, JSON.stringify(currentLocal.map(applyInboundMeta)))
      const preferredInbound = parsed.find(r => Number(r.qty || 0) > 0) || parsed[0]
      const preferredItem = preferredInbound ? { name: preferredInbound.sku_name, supplier: preferredInbound.supplier } : null
      setSelected(prev => findMatchingItem(nextItems, preferredItem) || findMatchingItem(nextItems, prev ? applyInboundMeta(prev) : null) || pickDemoFocus(nextItems))
      e.target.value = ''
      alert(copy(lang, 'csvUpload') + ': ' + fmt(parsed.reduce((a,r)=>a+r.qty,0)) + (lang === JP ? '個' : ' units'))
    })
  }

  const items = skus.length ? skus : sampleSkus
  const productOptions = useMemo(() => uniqueProductOptions(items), [items])
  const selectedSku = findMatchingItem(items, selected) || selected || productOptions[0] || items[0]
  const alertItems = items.filter(s => statusOf(s) === 'alert')
  const reorder = items.filter(s => Number(s.stock_qty || 0) < calcRp(s))
  const overItems = items.filter(s => statusOf(s) === 'over')
  const actionItems = [...new Map([...reorder, ...overItems].map(s => [s.id, s])).values()]
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
        <div style={{ display:'flex', alignItems:'center', gap:14 }}><img src="/stockwise-icon.png" alt="Stockwise" style={{ width:40, height:40, borderRadius:0, objectFit:'cover', boxShadow:'0 8px 24px rgba(0,0,0,.25)' }} /><div style={{ fontSize:26, fontWeight:900 }}>Stockwise</div></div>
        <div style={{ display:'flex', gap:10 }}><Btn small onClick={()=>setLang(l=>l===JP?EN:JP)}>EN / JP</Btn><Btn small onClick={signOut}>{copy(lang, 'logout')}</Btn></div>
      </header>

      <nav style={{ display:'flex', gap:10, marginBottom:16 }}>
        <Btn kind={tab==='dashboard'?'blue':'ghost'} onClick={()=>setTab('dashboard')}>{copy(lang, 'dashboard')}</Btn>
        <Btn kind={tab==='heatmap'?'blue':'ghost'} onClick={()=>setTab('heatmap')}>{copy(lang, 'heatmap')}</Btn>
      </nav>

      {tab === 'dashboard' && <>
        {actionItems.length > 0 && <div style={{ display:'flex', alignItems:'center', gap:12, border:`1px solid ${T.red}`, background:'linear-gradient(90deg,rgba(255,70,93,.20),rgba(7,43,76,.90))', color:'#ffd7dd', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
          <span style={{ fontSize:22 }}>⚠</span>
          <div style={{ flex:1 }}><b>{copy(lang, 'alert')}</b><div style={{ color:'#f4c6ce', fontSize:13, marginTop:3 }}>{copy(lang, 'alertBanner')}</div></div>
        </div>}
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <MetricCard lang={lang} tone="red" icon="🛒" title={copy(lang, 'reorder')} sub={copy(lang, 'reorderSub')} value={reorder.length} note={copy(lang, 'reorderNote')} button={copy(lang, 'check')} onClick={scrollToActionItems} />
          <MetricCard lang={lang} tone="blue" icon="📦" title={copy(lang, 'overstock')} sub={copy(lang, 'overstockSub')} value={overItems.length} note={copy(lang, 'overstockNote')} button={copy(lang, 'check')} onClick={scrollToActionItems} />
        </div>

        <div style={{ marginTop:18, display:'flex', flexWrap:'wrap', background:'linear-gradient(90deg,rgba(7,43,76,.9),rgba(5,34,62,.95))', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <MiniMetric icon="" title={copy(lang, 'inbound')} value={`${fmt(inboundTotal)}${lang === JP ? '個' : ' units'}`} note={lang === JP ? '登録済みの輸入数量予定' : 'Registered inbound plan'} />
          <MiniMetric icon="" title={copy(lang, 'stockValue')} value={currency(stockValue, lang)} note={`${productOptions.length} ${copy(lang, 'activeItems')}`} />
        </div>

        <Panel title={copy(lang, 'heatmap')}>
          <p style={{ color:'#cbd9e8', marginTop:-6 }}>{copy(lang, 'heatmapHint')}</p>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:10 }}>{productOptions.slice(0,5).map(s=><HeatCard key={s.id} lang={lang} sku={s} active={sameProduct(s, selectedSku)} onClick={()=>{setSelected(s); setTab('heatmap')}} />)}</div>
          <div style={{ display:'flex', gap:18, flexWrap:'wrap', color:'#c9d8e8', fontSize:14 }}>{Object.entries(statusMeta).map(([k,m])=><span key={k}><b style={{ color:m.color }}>● {m[lang]}</b>：{lang === JP ? m.descJa : m.descEn}</span>)}</div>
        </Panel>

        <div ref={actionItemsRef} style={{ scrollMarginTop:20 }}><Panel title={copy(lang, 'reorderItems')}>
          <div style={{ display:'grid', gap:12 }}>
            {(actionItems.length ? actionItems : productOptions).map(s => { const st=statusOf(s); const m=statusMeta[st]; const recommended = st === 'over' ? 0 : (s.moq || Math.max(0, calcRp(s)-Number(s.stock_qty||0))); return <div key={s.id} onClick={()=>{setSelected(s); setTab('heatmap')}} style={{ display:'grid', gridTemplateColumns:'110px 1.4fr .65fr .75fr 260px', gap:16, alignItems:'center', cursor:'pointer', border:`1px solid ${m.color}`, background:`${m.color}12`, borderRadius:10, padding:12 }}>
              <IconBox icon={s.icon || 'box'} active />
              <div><h3 style={{ margin:'0 0 8px', fontSize:22 }}>{displayName(s, lang)}</h3><div style={{ color:T.muted, fontSize:14 }}>{copy(lang, 'itemLabel')}: {s.name}</div><div style={{ marginTop:9 }}><span style={{ background:m.color, color:'#fff', borderRadius:4, padding:'4px 8px', fontSize:12, fontWeight:900 }}>{m[lang].toUpperCase()}</span><span style={{ marginLeft:10, color:'#cfddeb' }}>{st === 'over' ? (lang === JP ? '在庫過多の可能性があります' : 'Possible overstock detected') : (lang === JP ? '在庫不足のリスクがあります' : 'Stockout risk detected')}</span></div></div>
              <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:18 }}><div style={{ color:T.muted, fontWeight:800 }}>{copy(lang, 'currentStock')}</div><div style={{ fontSize:24, fontWeight:900, marginTop:10 }}>{fmt(s.stock_qty)} <span style={{ fontSize:14 }}>{copy(lang, 'units')}</span></div></div>
              <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:18 }}><div style={{ color:T.muted, fontWeight:800 }}>{st === 'over' ? (lang === JP ? '対応' : 'Action') : copy(lang, 'recommendedOrder')}</div><div style={{ color:st === 'over' ? T.blue : T.orange, fontSize:22, fontWeight:900, marginTop:10 }}>{st === 'over' ? (lang === JP ? '追加停止' : 'Stop') : `+${fmt(recommended)} ${copy(lang, 'units')}`}</div></div>
              <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:14 }}><b>{copy(lang, 'statusGuide')}</b>{['attention','alert','good','over'].map(k=><div key={k} style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13 }}><span style={{ width:30, height:6, borderRadius:9, background:statusMeta[k].color }} />{statusMeta[k][lang]}：{lang === JP ? statusMeta[k].descJa : statusMeta[k].descEn}</div>)}</div>
            </div>})}
          </div>
        </Panel></div>

      </>}



      {tab === 'heatmap' && <Panel title={copy(lang, 'heatmap')} action={<button onClick={()=>setShowCsvSettings(true)} title={copy(lang, 'csvSettings')} style={{ width:40, height:40, borderRadius:10, border:`1px solid ${T.line}`, background:'rgba(255,255,255,.06)', color:T.text, fontSize:20, cursor:'pointer' }}>⚙</button>}>
        <input ref={skuCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadSkuCSV}/>
        <input ref={incCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadCsv}/>

        <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12, background:'rgba(0,0,0,.12)', marginBottom:14 }}>
          <div style={{ fontWeight:900, marginBottom:10 }}>{copy(lang, 'selectItem')}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{productOptions.map(s => <Btn key={s.id} small kind={sameProduct(s, selectedSku) ? 'blue' : 'ghost'} onClick={()=>setSelected(s)}>{displayName(s, lang)}</Btn>)}</div>
        </div>

        {selectedSku && <>
          <ProductDetailHeader selectedSku={selectedSku} items={items} incrementals={incrementals} lang={lang} onBack={()=>setTab('dashboard')} />
          <RecommendationCards rows={getSupplierSkuRows(items, selectedSku, incrementals, lang)} lang={lang} onCreatePlan={()=>downloadOrderPlanCsv(items, selectedSku, incrementals, lang)} />
          <SupplierStatusDetail items={items} selectedSku={selectedSku} incrementals={incrementals} lang={lang} />
          <div style={{ marginTop:18, display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <h3 style={{ margin:0, fontSize:24 }}>{lang === JP ? '13週 在庫ヒートマップ（品目合計）' : '13-week Inventory Heatmap by Superset'}</h3>
            <div style={{ color:T.muted, fontSize:13 }}>{lang === JP ? 'Subsetサプライヤーの在庫・入荷予定を合算した品目合計のヒートマップです。' : 'Aggregates subset supplier stock and inbound plan into a superset-level heatmap.'}</div>
          </div>
          <div style={{ marginTop:12, overflowX:'auto', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <table style={{ width:'100%', minWidth:1100, borderCollapse:'collapse' }}>
            <thead><tr><th style={{ position:'sticky', left:0, background:'#082947', zIndex:2, textAlign:'left', padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{copy(lang, 'supplier')}</th>{Array.from({length:13},(_,i)=><th key={i} style={{ textAlign:'center', padding:'12px 10px', borderBottom:`1px solid ${T.line}`, background:'rgba(255,255,255,.04)' }}>{weekLabel(i+1, lang)}</th>)}</tr></thead>
            <tbody>{(() => {
              const sku = aggregateSkuForProduct(items, selectedSku, lang)
              const rowForecast = buildAggregateForecast(items, selectedSku, incrementals, 13, lang)
              return <tr key="aggregate"><td style={{ position:'sticky', left:0, background:'#06223d', fontWeight:900, padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{sku.supplier}<div style={{ color:T.muted, fontSize:12, marginTop:3 }}>{displayName(selectedSku, lang)}</div><div style={{ color:'#cbd9e8', fontSize:12, marginTop:4 }}>{lang === JP ? '現在在庫合計' : 'Current total'}: {fmt(sku.stock_qty)} / {lang === JP ? '週所要' : 'Weekly req.'}: {fmt(consumptionPerDay(sku) * 7)}</div></td>{rowForecast.map(f => { const m=statusMeta[f.status]; return <td key={f.week} style={{ padding:'8px', borderBottom:`1px solid ${T.line}`, textAlign:'center' }}><div style={{ border:`1px solid ${m.color}`, background:`${m.color}20`, color:m.color, borderRadius:8, padding:'8px 6px', fontWeight:900 }}>{fmtWeeks(f.wos)}{copy(lang, 'week')}<div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:3 }}>{lang === JP ? '在庫' : 'Stock'} {fmt(f.stock)}</div><div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:2 }}>{lang === JP ? '入荷' : 'Inbound'} +{fmt(f.inbound)}</div><div style={{ color:'#d9e6f2', fontSize:11, fontWeight:700, marginTop:2 }}>{lang === JP ? '所要' : 'Req.'} {fmt(f.requirement)}</div></div></td>})}</tr>
            })()}</tbody>
          </table>
          </div>
          <div style={{ marginTop:18 }}>
            <ReorderSimulationPanel items={items} selectedSku={selectedSku} incrementals={incrementals} lang={lang} />
          </div>
        </>}
      </Panel>}

    </div>
    {showCsvSettings && <CsvSettingsModal lang={lang} onClose={()=>setShowCsvSettings(false)} onDownloadSku={downloadSkuTemplate} onUploadSku={()=>skuCsvRef.current?.click()} onDownloadInbound={downloadCsvTemplate} onUploadInbound={()=>incCsvRef.current?.click()} />}
  </div>
}
