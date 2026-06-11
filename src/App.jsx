import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase.js'
import { detectLang } from './i18n.js'
import LoginPage from './components/LoginPage.jsx'

// NexOps style status email fix syntax corrected
// Stockwise v3 final replacement bundle
// StockWise v3 mobile mockup style refinement
// PC heatmap AiMockFeatures and intelligence removal fix
// PC/mobile data sync and no intelligence support final fix
// dashboard mobile PC data label final requested cleanup
// syntax fix missing comma after alertBanner
// cross-device item sync via Supabase final fix
// statusMeta restore fix
const T = {
  font: 'Arial,Helvetica,sans-serif',
  bg: '#001426', panel: '#06223d', panel2: '#082947', line: '#173e64', text: '#f8fbff', muted: '#9ab2cc',
  blue: '#7c5cff', red: '#ff465d', orange: '#ff465d', green: '#22c985', navy: '#020b16', white: '#fff'
}

const JP = 'ja'
const EN = 'en'

const statusMeta = {
  alert: { color: T.red, ja: '不足', en: 'Shortage', descJa: '1〜2週間未満で欠品リスク', descEn: 'Shortage risk within 1–2 weeks' },
  attention: { color: T.red, ja: '不足', en: 'Shortage', descJa: '1〜2週間未満で欠品リスク', descEn: 'Shortage risk within 1–2 weeks' },
  good: {
    color: T.green,
    ja: '適正',
    en: 'Healthy',
    descJa: '2〜8週間の在庫',
    descEn: '2–8 weeks of stock',
  },
  over: {
    color: T.blue,
    ja: '過剰',
    en: 'Overstock',
    descJa: '8週間以上の在庫',
    descEn: 'More than 8 weeks of stock',
  },
}


function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < breakpoint : false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}


const sampleSkus = [
  { id:'sample-1', name:'イヤホン Pro Model A', name_en:'Earbuds Pro Model A', superset:'オーディオ', subset:'Supplier A', supplier:'Supplier A', stock_qty:420, daily_usage:62, lead_time:18, safety_stock:186, moq:1000, unit_cost:120, sku:'EPH-PRO-A', icon:'audio' },
  { id:'sample-2', name:'USB-C ハブ', name_en:'USB-C Hub', superset:'PC周辺機器', subset:'Supplier B', supplier:'Supplier B', stock_qty:980, daily_usage:54, lead_time:20, safety_stock:150, moq:700, unit_cost:38, sku:'USB-HUB-B', icon:'box' },
  { id:'sample-3', name:'ゲーミングマウス', name_en:'Gaming Mouse', superset:'入力機器', subset:'Supplier C', supplier:'Supplier C', stock_qty:1605, daily_usage:50, lead_time:16, safety_stock:180, moq:500, unit_cost:26, sku:'GMS-C', icon:'mouse' },
  { id:'sample-4', name:'メカニカルキーボード', name_en:'Mechanical Keyboard', superset:'入力機器', subset:'Supplier D', supplier:'Supplier D', stock_qty:7500, daily_usage:30, lead_time:25, safety_stock:150, moq:300, unit_cost:45, sku:'MKB-D', icon:'keyboard' },
  { id:'sample-5', name:'USB-C ケーブル', name_en:'USB-C Cable', superset:'ケーブル', subset:'Supplier E', supplier:'Supplier E', stock_qty:3600, daily_usage:30, lead_time:14, safety_stock:200, moq:900, unit_cost:8, sku:'USBC-E', icon:'cable' },
]

// Aswan Heatsink WOS = supplier total stock / weekly consumption.
// WOS safe fix: actual_consumption is weekly. If daily_usage is 100+ it is treated as weekly too.
function consumptionPerWeek(s) {
  const actualWeekly = Number(s?.actual_consumption)
  if (actualWeekly > 0) return actualWeekly
  const usage = Number(s?.daily_usage || 0)
  if (usage <= 0) return 0
  return usage >= 100 ? usage : usage * 7
}
const calcWeeks = s => {
  const weekly = consumptionPerWeek(s)
  return weekly > 0 ? Number(s?.stock_qty || 0) / weekly : 999
}
const calcDays = s => calcWeeks(s) * 7
const calcRp = s => Math.ceil(Number(s?.lead_time || 0) / 7) * consumptionPerWeek(s)
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
  return consumptionPerWeek(s) / 7
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

// Aggregate supplier stock for same product in heatmap.
function aggregateProductOptions(items, lang = JP) {
  const groups = new Map()
  ;(items || []).forEach(s => {
    const key = textKey(s?.name || s?.sku || s?.name_en)
    if (!key) return
    const arr = groups.get(key) || []
    arr.push(s)
    groups.set(key, arr)
  })
  return [...groups.values()].map((rows, idx) => {
    const base = rows[0] || {}
    const totalStock = rows.reduce((a, s) => a + Number(s.stock_qty || 0), 0)
    // Same product supplier rows usually share the same product-level demand; do not double count it.
    const productWeekly = Math.max(...rows.map(s => consumptionPerWeek(s)), 0)
    return {
      ...base,
      id: `aggregate-product-${idx}-${textKey(base.name || base.sku).replace(/[^a-z0-9]+/g,'-')}`,
      supplier: lang === JP ? '全仕入先合計' : lang === JP ? '全仕入先合計' : 'All suppliers total',
      subset: lang === JP ? '全仕入先合計' : 'All suppliers total',
      stock_qty: totalStock,
      daily_usage: productWeekly / 7,
      actual_consumption: productWeekly,
      lead_time: Math.max(...rows.map(s => Number(s.lead_time || 0)), Number(base.lead_time || 7), 7),
      safety_stock: Math.max(...rows.map(s => Number(s.safety_stock || 0)), Number(base.safety_stock || 0), 0),
      moq: Math.max(...rows.map(s => Number(s.moq || 0)), Number(base.moq || 0), 0),
      supplier_rows: rows,
    }
  })
}


function uniqueProductCount(items) {
  const seen = new Set()
  ;(items || []).forEach(s => {
    const key = textKey(s?.name || s?.sku || s?.name_en)
    if (key) seen.add(key)
  })
  return seen.size
}

function uniqueActionProducts(items, lang) {
  // Use the same representative row as the supplier heatmap cards.
  // This keeps the dashboard/action list status aligned with the supplier-level heatmap.
  // Example: if one supplier for an item is at 1 week while the total item stock looks healthy,
  // the item still needs attention because that supplier row is red in the heatmap.
  return uniqueProductOptions(items)
    .filter(s => statusOf(s) === 'alert' || statusOf(s) === 'attention' || statusOf(s) === 'over' || Number(s.stock_qty || 0) < calcRp(s))
}

function limitRowsToMaxProducts(currentRows, incomingRows, maxProducts = 1) {
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
  const weeks = Number(w || 0)
  if (weeks < 2) return 'alert'
  if (weeks >= 8) return 'over'
  return 'good'
}
function statusOf(s) {
  const weeks = calcWeeks(s)
  if (weeks < 2) return 'alert'
  if (weeks >= 8) return 'over'
  return 'good'
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

// Forecast 14 fix: aggregate actual_consumption remains weekly demand, not daily demand.
function aggregateSkuForProduct(items, selectedSku, lang) {
  const rows = selectedSku?.supplier_rows || (items || []).filter(s => sameProduct(s, selectedSku))
  const source = rows.length ? rows : (selectedSku ? [selectedSku] : [])
  const totalStock = selectedSku?.supplier_rows
    ? Number(selectedSku.stock_qty || 0)
    : source.reduce((a, s) => a + Number(s.stock_qty || 0), 0)

  // Use product-level weekly demand once. Do not convert weekly demand into actual_consumption=daily.
  const weekly = selectedSku?.supplier_rows
    ? consumptionPerWeek(selectedSku)
    : (selectedSku
        ? Math.max(consumptionPerWeek(selectedSku), ...source.map(s => consumptionPerWeek(s)))
        : source.reduce((a, s) => a + consumptionPerWeek(s), 0)
      )
  const daily = weekly / 7

  const lead = selectedSku ? Number(selectedSku.lead_time || 7) : Math.max(7, ...source.map(s => Number(s.lead_time || 7)))
  const safety = selectedSku?.supplier_rows ? Number(selectedSku.safety_stock || 0) : source.reduce((a, s) => a + Number(s.safety_stock || 0), 0)
  return {
    ...(selectedSku || source[0] || {}),
    id: `aggregate-${textKey(selectedSku?.name || source[0]?.name || 'item')}`,
    name: selectedSku?.name || source[0]?.name || (lang === JP ? '品目合計' : 'Item Total'),
    name_en: selectedSku?.name_en || source[0]?.name_en || selectedSku?.name || source[0]?.name,
    supplier: lang === JP ? '全仕入先合計' : 'All suppliers total',
    subset: lang === JP ? '全仕入先合計' : 'All suppliers total',
    stock_qty: totalStock,
    daily_usage: daily,
    actual_consumption: weekly,
    lead_time: lead,
    safety_stock: safety,
    moq: selectedSku?.moq || source[0]?.moq || null,
    unit_cost: selectedSku?.unit_cost || source[0]?.unit_cost || null,
    supplier_rows: selectedSku?.supplier_rows || source,
  }
}

function buildAggregateForecast(items, selectedSku, incrementals, weeks = 13, lang = JP) {
  const agg = aggregateSkuForProduct(items, selectedSku, lang)
  let stock = Number(agg.stock_qty || 0)
  const weeklyForecast = consumptionPerWeek(agg)
  const daily = weeklyForecast / 7
  return Array.from({ length: weeks }, (_, i) => {
    const week = i + 1
    const inbound = (incrementals || [])
      .filter(r => selectedSku ? inboundMatchesSku(r, selectedSku) : true)
      .filter(r => Number(r.week) === week)
      .reduce((a, r) => a + Number(r.qty || 0), 0)
    // 入荷予定CSVの内容がすぐ見えるよう、週の在庫は「前週在庫 + 当週入荷 - 当週所要」で計算
    stock = Math.max(0, stock + inbound - weeklyForecast)
    const wos = weeklyForecast > 0 ? stock / weeklyForecast : 99
    return { week, stock: Math.round(stock), inbound, requirement: Math.round(weeklyForecast), wos, status: statusByWeeks(wos) }
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


function displayCustomerName(r, lang) {
  return r?.customer || (lang === JP ? '主要顧客' : 'Key Customer')
}
function safeArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value).filter(v => v && typeof v === 'object')
  return []
}
function getActualWeeklyForSku(sku, actualRows) {
  const matches = safeArray(actualRows).filter(r => sameProduct({ name:r.item, name_en:r.item, sku:r.item }, sku))
  if (matches.length) return matches.reduce((a, r) => a + Number(r.actual_qty || r.shipped_qty || 0), 0)
  return consumptionPerDay(sku) * 7
}
function getForecastRowsForUi(items, forecastRows, lang) {
  const rows = safeArray(forecastRows)
  if (rows.length) return rows
  return uniqueProductOptions(items).map((s, i) => ({
    item: s.name,
    customer: lang === JP ? `顧客${i + 1}` : `Customer ${i + 1}`,
    week: 1,
    forecast_qty: Math.round(consumptionPerDay(s) * 7 * 1.05),
    requested_eta: '',
    confidence: i === 0 ? 'High' : 'Medium',
    note: ''
  }))
}
function buildForecastVariance(items, forecastRows, actualRows, lang) {
  const forecasts = getForecastRowsForUi(items, forecastRows, lang)
  return forecasts.map((f, i) => {
    const sku = uniqueProductOptions(items).find(s => sameProduct({ name:f.item, name_en:f.item, sku:f.item }, s)) || uniqueProductOptions(items)[i % Math.max(1, uniqueProductOptions(items).length)] || null
    const actual = sku ? getActualWeeklyForSku(sku, actualRows) : 0
    const forecast = Number(f.forecast_qty || 0)
    const diff = actual - forecast
    const diffRate = forecast > 0 ? diff / forecast : 0
    const action = diffRate > 0.2
      ? (lang === JP ? '消費がForecastを上回っています。次回Forecastの上方修正と追加発注を確認。' : 'Actual consumption is above forecast. Review upward forecast revision and additional order.')
      : diffRate < -0.2
        ? (lang === JP ? '消費がForecastを下回っています。在庫過多防止のため発注抑制を検討。' : 'Actual consumption is below forecast. Consider reducing order to avoid overstock.')
        : (lang === JP ? 'Forecastと実績は概ね一致。通常計画を継続。' : 'Forecast and actual are aligned. Continue the normal plan.')
    return { ...f, sku, actual, forecast, diff, diffRate, action }
  })
}
function buildAiActionList(items, incrementals, forecastRows, actualRows, lang) {
  const actionRows = []
  ;(items || []).forEach(s => {
    const weeks = calcWeeks(s)
    if (weeks < 1) actionRows.push({ priority: 'High', item: displayName(s, lang), type: lang === JP ? '欠品リスク' : 'Stockout risk', action: lang === JP ? '優先仕入先へ1週目発注確認。顧客への納期影響も確認。' : 'Confirm week-1 order with priority supplier and check customer delivery impact.' })
    else if (weeks > 8) actionRows.push({ priority: 'High', item: displayName(s, lang), type: lang === JP ? '在庫過多' : 'Overstock', action: lang === JP ? '追加注文停止。顧客Forecastと消費計画を再確認。' : 'Stop additional orders and recheck customer forecast and consumption plan.' })
  })
  buildForecastVariance(items, forecastRows, actualRows, lang).forEach(r => {
    if (Math.abs(r.diffRate) >= 0.25) actionRows.push({ priority: 'High', item: r.item, type: lang === JP ? 'Forecast差異' : 'Forecast variance', action: r.action })
  })
  if (!actionRows.length) actionRows.push({ priority: 'Normal', item: lang === JP ? '全品目' : 'All items', type: lang === JP ? '安定' : 'Stable', action: lang === JP ? '大きな不足・過多・Forecast差異はありません。通常計画を継続。' : 'No major shortage, overstock, or forecast variance. Continue the normal plan.' })
  return actionRows.slice(0, 8)
}
function buildCustomerEmailDraft(item, lang) {
  if (lang === JP) return `件名：在庫・納期状況のご確認\n\nいつもお世話になっております。\n${item || '対象品目'}について、現在の在庫状況と入荷予定を確認したところ、今後の需要に対して一部調整が必要な可能性があります。\n最新のForecastおよび希望納期をご確認いただけますでしょうか。\n確認後、出荷可能数量と推奨スケジュールを改めて共有いたします。\n\nよろしくお願いいたします。`
  return `Subject: Inventory and delivery status check\n\nHello,\nWe reviewed the current inventory and inbound plan for ${item || 'the target item'}, and there may be a need to adjust the plan based on upcoming demand.\nCould you please confirm your latest forecast and requested delivery timing?\nAfter confirmation, we will share the available quantity and recommended schedule.\n\nBest regards,`
}
function buildSupplierEmailDraft(item, lang) {
  if (lang === JP) return `件名：入荷予定・リードタイム確認のお願い\n\nお世話になっております。\n${item || '対象品目'}について、今後13週の在庫計画を確認しています。\n現在の生産状況、出荷可能数量、最新リードタイムを共有いただけますでしょうか。\n特に1〜3週目の出荷可否を優先して確認したいです。\n\nよろしくお願いいたします。`
  return `Subject: Request to confirm inbound schedule and lead time\n\nHello,\nWe are reviewing the 13-week inventory plan for ${item || 'the target item'}.\nCould you share the current production status, available shipment quantity, and latest lead time?\nWe would especially like to confirm shipment availability for weeks 1–3.\n\nBest regards,`
}

function copy(lang, key) {
  const d = {
    dashboard: { ja:'ダッシュボード', en:'Dashboard' },
    heatmap: { ja:'在庫ヒートマップ（仕入先別）', en:'Inventory Heatmap by Supplier' },
    reorderTab: { ja:'対応必要品目', en:'Items Needing Action' },
    alertBanner: { ja:'現在、対応が必要な不足リスクがあります。発注必要案件は確認ボタンから確認できます。', en:'There are shortage risks requiring attention. Use the check button to review items expected to run short.' },
    shortageListTitle: { ja:'対応必要品目', en:'Items Needing Action' },
    shortageListDesc: { ja:'発注が必要な品目と在庫過多の品目をまとめて確認できます。', en:'Review items that need ordering and items with overstock.' },
    alert: { ja:'不足（要対応）', en:'Shortage' },
    alertSub: { ja:'不足リスク件数', en:'Shortage risk items' },
    alertNote: { ja:'欠品リスクのある品目', en:'Items with shortage risk' },
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
    
    forecastAnalysis: { ja:'需要・消費バランスチェック', en:'Demand & Consumption Check' },
    
    
    meetingPrep: { ja:'会議準備・ToDo', en:'Meeting Prep & ToDo' },
    forecastCsv: { ja:'Forecast CSV', en:'Forecast CSV' },
    actualCsv: { ja:'実績消費CSV', en:'Actual Consumption CSV' },
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
  const c = tone === 'red' ? T.red : tone === 'orange' ? T.red : T.blue
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


function buildDemandSupplyGap(items, selectedSku, incrementals, weeks = 13, lang = JP) {
  if (!selectedSku) return []
  const agg = aggregateSkuForProduct(items, selectedSku, lang)
  const weeklyForecast = Math.max(0, Math.round(consumptionPerWeek(agg)))
  const daily = weeklyForecast / 7
  let carry = Number(agg.stock_qty || 0)
  return Array.from({ length: weeks }, (_, i) => {
    const week = i + 1
    const inbound = (incrementals || [])
      .filter(r => selectedSku?.supplier_rows ? selectedSku.supplier_rows.some(s => inboundMatchesSku(r, s)) : inboundMatchesSku(r, selectedSku))
      .filter(r => Number(r.week) === week)
      .reduce((a, r) => a + Number(r.qty || 0), 0)
    const forecast = weeklyForecast
    const supply = Math.round(carry + inbound) // W1 supply includes current stock + W1 inbound // Supply includes current stock in week 1
    const delta = supply - forecast
    const endingStock = Math.max(0, delta)
    carry = endingStock
    const wos = weeklyForecast > 0 ? endingStock / weeklyForecast : 99
    const status = delta < 0 ? 'alert' : delta < forecast * 0.15 ? 'attention' : wos > 8 ? 'over' : 'good'
    return { week, forecast, inbound: Math.round(inbound), supply, delta, endingStock: Math.round(endingStock), wos, status }
  })
}

function deltaTone(delta, forecast) {
  const f = Number(forecast || 0)
  const d = Number(delta || 0)
  if (d < 0) return 'alert'
  if (f > 0 && d < f * 2) return 'alert'
  if (f > 0 && d >= f * 8) return 'over'
  return 'good'
}

function TinyTrend({ points }) {
  const values = (points || []).map(p => Number(p.delta || 0))
  if (!values.length) return null
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const zeroY = 21 - ((0 - min) / span) * 16 + 5
  const d = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 62 + 3
    const y = 21 - ((v - min) / span) * 16 + 5
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = values[values.length - 1]
  return <svg width="70" height="34" viewBox="0 0 70 34" style={{ display:'block', maxWidth:'70px', overflow:'hidden' }}>
    <line x1="3" y1={zeroY} x2="65" y2={zeroY} stroke="rgba(248,251,255,.18)" strokeWidth="1" strokeDasharray="3 4" />
    <path d={d} fill="none" stroke="#f8fbff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {values.map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 62 + 3
      const y = 21 - ((v - min) / span) * 16 + 5
      return <circle key={i} cx={x} cy={y} r={i === values.length - 1 ? 2.6 : 1.6} fill="#f8fbff" opacity={i === values.length - 1 ? 1 : .5} />
    })}
    <circle cx="65" cy={21 - ((last - min) / span) * 16 + 5} r="4.2" fill="none" stroke="#f8fbff" strokeWidth="1.2" opacity=".55" />
  </svg>
}

function MetricPill({ color, children }) {
  return <span style={{ display:'inline-flex', alignItems:'center', gap:6, border:`1px solid ${color}`, color, background:`${color}18`, borderRadius:8, padding:'7px 10px', fontWeight:900, fontSize:13 }}>{children}</span>
}

function DemandSupplySummaryCards({ products, items, incrementals, selectedSku, onSelect, lang }) {
  const cards = (products || []).slice(0, 6).map(s => {
    const series = buildDemandSupplyGap(items, s, incrementals, 13, lang)
    const totalForecast = series.reduce((a, r) => a + r.forecast, 0)
    const totalSupply = series.reduce((a, r) => a + r.supply, 0)
    const latestDelta = series[0]?.delta || 0
    const status = deltaTone(latestDelta, series[0]?.forecast || 0)
    return { sku:s, series, totalForecast, totalSupply, latestDelta, status }
  })
  return <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:12, marginBottom:14 }}>
    {cards.map(c => { const m = statusMeta[c.status]; return <button key={c.sku.id} onClick={()=>onSelect(c.sku)} style={{ textAlign:'left', color:T.text, fontFamily:T.font, cursor:'pointer', border:`2px solid ${sameProduct(c.sku, selectedSku) ? m.color : T.line}`, borderRadius:12, padding:14, background:'linear-gradient(180deg,rgba(9,47,82,.94),rgba(6,32,58,.96))', boxShadow:sameProduct(c.sku, selectedSku) ? `0 0 22px ${m.color}38` : 'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:52, height:52, borderRadius:10, background:'rgba(255,255,255,.08)', display:'grid', placeItems:'center' }}><ProductIcon type={c.sku.icon || 'box'} /></div>
        <div style={{ minWidth:0 }}><div style={{ fontWeight:900, fontSize:17, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName(c.sku, lang)}</div><div style={{ marginTop:6 }}><MetricPill color={m.color}>{m[lang]}</MetricPill></div></div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14, borderTop:`1px solid ${T.line}`, paddingTop:12 }}>
        <div><div style={{ color:T.muted, fontSize:13, fontWeight:800 }}>{lang === JP ? '13週需要' : '13w Forecast'}</div><div style={{ fontSize:20, fontWeight:900 }}>{fmt(c.totalForecast)}</div></div>
        <div><div style={{ color:T.muted, fontSize:13, fontWeight:800 }}>{lang === JP ? '直近差分' : 'Current Gap'}</div><div style={{ color:c.latestDelta < 0 ? T.red : T.green, fontSize:20, fontWeight:900 }}>{c.latestDelta >= 0 ? '+' : ''}{fmt(c.latestDelta)}</div></div>
      </div>
      <div style={{ display:'flex', gap:10, marginTop:10, color:'#b7cce0', fontSize:12 }}><span>■ {lang === JP ? '需要予測' : 'Forecast'}</span><span>■ {lang === JP ? '供給' : 'Supply'}</span><span>■ {lang === JP ? '差分' : 'Gap'}</span></div>
    </button> })}
  </div>
}

function ForecastSupplyGapTable({ products, items, incrementals, selectedSku, onSelect, lang, viewMode='weekly' }) {
  const isMonthly = viewMode === 'monthly'
  const periods = isMonthly
    ? [
        { label: lang === JP ? '1月目' : 'M1', weeks:[1,2,3,4] },
        { label: lang === JP ? '2月目' : 'M2', weeks:[5,6,7,8] },
        { label: lang === JP ? '3月目' : 'M3', weeks:[9,10,11,12,13] },
      ]
    : Array.from({ length: 13 }, (_, i) => ({ label: weekLabel(i + 1, lang), weeks:[i + 1] }))

  const shown = (products || []).slice(0, 8)
  const tableMinWidth = isMonthly ? 760 : 1160
  const headerCell = {
    textAlign:'center',
    padding:'10px 6px',
    borderBottom:`1px solid ${T.line}`,
    background:'rgba(255,255,255,.04)',
    whiteSpace:'nowrap',
    fontSize:13,
    color:'#d8e8f8',
    fontWeight:900,
  }
  const metricCell = {
    padding:'8px 10px',
    borderBottom:`1px solid ${T.line}`,
    color:'#f8fbff',
    fontWeight:900,
    whiteSpace:'nowrap',
    fontSize:14,
  }

  const periodValue = (series, period, key) => {
    const rows = period.weeks.map(w => series.find(x => Number(x.week) === Number(w))).filter(Boolean)
    if (!rows.length) return 0
    if (key === 'delta') return rows.reduce((a, r) => a + Number(r.delta || 0), 0)
    if (key === 'forecast') return rows.reduce((a, r) => a + Number(r.forecast || 0), 0)
    if (key === 'supply') return rows.reduce((a, r) => a + Number(r.supply || 0), 0)
    return 0
  }

  return <div style={{ overflowX:'auto', border:`1px solid ${T.line}`, borderRadius:12, background:'rgba(0,0,0,.10)' }}>
    <table style={{ width:'100%', minWidth:tableMinWidth, borderCollapse:'collapse', tableLayout:'fixed' }}>
      <thead><tr>
        <th style={{ position:'sticky', left:0, zIndex:3, textAlign:'left', width:210, padding:'11px 12px', borderBottom:`1px solid ${T.line}`, background:'#082947', color:'#f8fbff', fontSize:13 }}>{lang === JP ? '対象品目' : 'Item'}</th>
        <th style={{ ...headerCell, width:84 }}>{lang === JP ? '推移' : 'Trend'}</th>
        <th style={{ ...headerCell, textAlign:'left', width:130 }}>{lang === JP ? '指標' : 'Metric'}</th>
        {periods.map(p => <th key={p.label} style={headerCell}>{p.label}</th>)}
      </tr></thead>
      <tbody>{shown.map(product => {
        const series = buildDemandSupplyGap(items, product, incrementals, 13, lang)
        const firstDelta = series[0]?.delta || 0
        const status = deltaTone(firstDelta, series[0]?.forecast || 0)
        const m = statusMeta[status]
        const selected = sameProduct(product, selectedSku)
        const metricRows = [
          { key:'forecast', label: lang === JP ? '需要予測' : 'Forecast', values:periods.map(p => periodValue(series, p, 'forecast')) },
          { key:'supply', label: lang === JP ? '供給数量' : 'Supply', values:periods.map(p => periodValue(series, p, 'supply')) },
          { key:'delta', label: lang === JP ? '差分' : 'Gap', values:periods.map(p => periodValue(series, p, 'delta')) },
        ]
        return metricRows.map((row, idx) => <tr key={`${product.id}-${row.key}`}>
          {idx === 0 && <td rowSpan={3} onClick={()=>onSelect(product)} style={{ position:'sticky', left:0, zIndex:2, cursor:'pointer', background:selected ? 'linear-gradient(90deg,rgba(59,130,246,.26),#06223d)' : '#06223d', padding:'10px 12px', borderBottom:`1px solid ${T.line}`, borderRight:`1px solid ${T.line}` }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontWeight:900, fontSize:14, color:'#f8fbff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName(product, lang)}</div>
              <div style={{ color:T.muted, fontSize:11, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{product.supplier || product.subset || (lang === JP ? '全仕入先合計' : 'All suppliers total')}</div>
              <div style={{ marginTop:5, color:m.color, fontSize:11, fontWeight:900 }}>{m[lang]}</div>
            </div>
          </td>}
          {idx === 0 && <td rowSpan={3} style={{ padding:'6px 8px', borderBottom:`1px solid ${T.line}`, textAlign:'center' }}><TinyTrend points={series} /></td>}
          <td style={metricCell}>{row.label}</td>
          {row.values.map((v, i) => {
            const tone = row.key === 'delta' ? deltaTone(v, metricRows[0].values[i] || 0) : null
            const color = row.key === 'delta' ? statusMeta[tone].color : '#f8fbff'
            return <td key={i} style={{ textAlign:'center', padding:'6px 4px', borderBottom:`1px solid ${T.line}` }}>
              <div style={{
                border: row.key === 'delta' ? `1px solid ${color}` : '1px solid rgba(255,255,255,.08)',
                background: row.key === 'delta' ? `${color}22` : 'rgba(255,255,255,.02)',
                color,
                borderRadius:7,
                padding:'7px 4px',
                fontWeight:900,
                minWidth:0,
                fontSize: isMonthly ? 14 : 12,
              }}>{row.key === 'delta' && v > 0 ? '+' : ''}{fmt(v)}</div>
            </td>
          })}
        </tr>)
      })}</tbody>
    </table>
  </div>
}

function HeatmapSignalBar({ lang }) {
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', border:`1px solid ${T.line}`, borderRadius:10, padding:12, background:'rgba(0,0,0,.12)', margin:'12px 0 14px' }}>
    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
      <MetricPill color={T.blue}>{lang === JP ? '需要予測' : 'Forecast'}</MetricPill>
      <MetricPill color={T.green}>{lang === JP ? '供給数量' : 'Supply'}</MetricPill>
      <MetricPill color={T.red}>{lang === JP ? '差分（在庫ギャップ）' : 'Gap'}</MetricPill>
    </div>
    <div style={{ display:'flex', gap:8 }}><Btn small kind="blue">Weekly</Btn><Btn small kind="ghost">Monthly</Btn></div>
  </div>
}



function AiMockFeaturesSection({ items, selectedSku, incrementals, lang }) {
  const sku = selectedSku || pickDemoFocus(items) || aggregateProductOptions(items, lang)?.[0]
  if (!sku) return null
  const series = buildDemandSupplyGap(items, sku, incrementals, 13, lang)
  const agg = aggregateSkuForProduct(items, sku, lang)
  const first = series[0] || { forecast:0, supply:Number(agg.stock_qty || 0), delta:0 }
  const supplierRows = (agg.supplier_rows || sku.supplier_rows || (items || []).filter(s => sameProduct(s, sku))).slice(0, 4)
  const bestSupplier = supplierRows.slice().sort((a,b)=>Number(a.lead_time||99)-Number(b.lead_time||99))[0] || agg
  const shortageWeek = series.find(r => Number(r.delta || 0) < 0)?.week
  const recommendedQty = Math.max(
    Number(agg.moq || 0),
    Math.ceil(Math.max(0, Number(first.forecast || 0) - Number(first.supply || 0)) || Number(agg.moq || 0) || Math.round(consumptionPerWeek(agg) * 2))
  )
  const currentWos = calcWeeks(agg)
  const isShort = currentWos < 2 || Number(first.delta || 0) < 0
  const isOver = currentWos >= 8
  const subject = lang === JP
    ? `${displayName(sku, lang)}の前倒し出荷可否について`
    : `Request to confirm earlier shipment for ${displayName(sku, lang)}`
  const body = lang === JP
    ? `${bestSupplier.supplier || 'Supplier'} ご担当者様\n\nいつもお世話になっております。\n${displayName(sku, lang)}について、現在の在庫状況を確認したところ、短期的に供給調整が必要な可能性があります。\n${fmt(recommendedQty)}個の出荷可否をご確認いただけますでしょうか。\n\nどうぞよろしくお願いいたします。`
    : `Hi ${bestSupplier.supplier || 'Supplier'},\n\nWe reviewed the current inventory status for ${displayName(sku, lang)} and noticed a potential short-term supply adjustment need.\nCould you please confirm whether ${fmt(recommendedQty)} units can be shipped earlier?\n\nBest regards,`

  const copyEmail = () => navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`)

  return <div style={{ marginTop:20 }}>
    <section style={{ border:`1px solid ${T.line}`, borderRadius:14, padding:18, background:'rgba(6,34,61,.75)' }}>
      <h2 style={{ margin:'0 0 14px', fontSize:26 }}>{lang === JP ? '業務サポート' : 'Workflow support'}</h2>
      <div style={{ display:'grid', gap:14 }}>
        <div style={{ border:`1px solid ${T.line}`, borderRadius:12, padding:14, background:'rgba(0,0,0,.14)' }}>
          <div style={{ fontWeight:900, marginBottom:8 }}>{lang === JP ? '分析サマリー' : 'Analysis summary'}</div>
          <div style={{ color:'#d7e7f7', lineHeight:1.7 }}>
            {isShort
              ? (lang === JP ? '需要に対して在庫が不足する可能性があります。最短リードタイムの仕入先を優先し、必要数量のみを提案します。' : 'Inventory may fall short against demand. Prioritize the shortest lead-time supplier and propose only the required quantity.')
              : isOver
                ? (lang === JP ? '供給が需要を大きく上回る可能性があります。次回発注の一時停止または数量調整を推奨します。' : 'Supply may exceed demand. Pause the next order or adjust quantity.')
                : (lang === JP ? '現在の需給は大きな不足・過剰がなく、通常監視で問題ありません。' : 'Current supply and demand are balanced. Continue normal monitoring.')
            }
          </div>
        </div>

        <div style={{ border:`1px solid ${T.line}`, borderRadius:12, padding:14, background:'rgba(0,0,0,.14)' }}>
          <div style={{ fontWeight:900, marginBottom:10 }}>{lang === JP ? '発注提案' : 'Order proposal'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
            <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12 }}><div style={{ color:T.muted, fontSize:12, fontWeight:900 }}>{lang === JP ? '推奨仕入先' : 'Supplier'}</div><b>{bestSupplier.supplier || bestSupplier.subset || 'Supplier'}</b></div>
            <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12 }}><div style={{ color:T.muted, fontSize:12, fontWeight:900 }}>{lang === JP ? '発注数量' : 'Order qty'}</div><b>{fmt(recommendedQty)} {copy(lang,'units')}</b></div>
            <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12 }}><div style={{ color:T.muted, fontSize:12, fontWeight:900 }}>{lang === JP ? '希望納期' : 'Target ETA'}</div><b>{shortageWeek ? (lang === JP ? `${shortageWeek}週目前` : `Before W${shortageWeek}`) : (lang === JP ? '次回入荷可能週' : 'Next available week')}</b></div>
            <div style={{ border:`1px solid ${T.line}`, borderRadius:10, padding:12 }}><div style={{ color:T.muted, fontSize:12, fontWeight:900 }}>{lang === JP ? '発注種別' : 'Order type'}</div><b>{isShort ? (lang === JP ? '通常発注' : 'Standard') : (lang === JP ? '数量調整' : 'Quantity adjustment')}</b></div>
          </div>
        </div>

        <div style={{ border:`1px solid ${T.line}`, borderRadius:12, padding:14, background:'rgba(0,0,0,.14)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ fontWeight:900 }}>{lang === JP ? '作成メール' : 'Generated email'}</div>
            <button onClick={copyEmail} style={{ border:`1px solid ${T.line}`, background:'rgba(255,255,255,.06)', color:'#f8fbff', borderRadius:8, padding:'7px 11px', fontWeight:900 }}>{lang === JP ? 'コピー' : 'Copy'}</button>
          </div>
          <pre style={{ whiteSpace:'pre-wrap', margin:0, color:'#d7e7f7', lineHeight:1.6, fontFamily:T.font, border:`1px solid ${T.line}`, borderRadius:10, padding:12, background:'rgba(0,0,0,.14)' }}>{`Subject: ${subject}\n\n${body}`}</pre>
        </div>
      </div>
    </section>
  </div>
}



function isTotalSupplierRow(s) {
  const v = String(s?.supplier || s?.subset || '').trim().toLowerCase()
  return v === 'all suppliers total' || v === '全仕入先合計' || v === 'total supplier'
}

function hideTotalSupplierRowsOnlyIfDetailsExist(rows) {
  const list = safeArray(rows)
  const hasDetailedByName = new Set(
    list
      .filter(s => s?.name && !isTotalSupplierRow(s))
      .map(s => String(s.name).trim().toLowerCase())
  )
  return list.filter(s => {
    const nameKey = String(s?.name || '').trim().toLowerCase()
    return !(isTotalSupplierRow(s) && hasDetailedByName.has(nameKey))
  })
}


function MobileBottomNav({ tab, setTab, lang }) {
  const item = (key, label, icon) => <button onClick={() => setTab(key)} style={{ flex:1, border:'none', background:tab === key ? 'rgba(34,201,133,.12)' : 'transparent', color:tab === key ? T.green : '#b9cde0', fontFamily:T.font, fontWeight:900, fontSize:11, padding:'9px 4px 8px', display:'grid', gap:3, placeItems:'center', borderTop:tab === key ? `2px solid ${T.green}` : '2px solid transparent' }}>
    <span style={{ fontSize:18, lineHeight:1 }}>{icon}</span><span>{label}</span>
  </button>
  return <div style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:50, display:'flex', borderTop:`1px solid ${T.line}`, background:'rgba(1,19,35,.97)', backdropFilter:'blur(12px)', paddingBottom:'env(safe-area-inset-bottom)' }}>
    {item('dashboard', lang === JP ? 'ホーム' : 'Home', '⌂')}
    {item('heatmap', lang === JP ? 'ヒートマップ' : 'Heatmap', '▦')}
    {item('items', lang === JP ? '品目' : 'Items', '□')}
  </div>
}

function MobileSummaryCard({ title, value, note, tone='blue' }) {
  const color = tone === 'red' ? T.red : tone === 'green' ? T.green : tone === 'orange' ? '#f59e0b' : T.blue
  return <div style={{
    flex:1,
    minWidth:0,
    border:`1px solid ${color}55`,
    background:'#fff',
    borderRadius:12,
    padding:'13px 12px',
    boxShadow:'0 8px 20px rgba(15,23,42,.06)'
  }}>
    <div style={{ color, fontSize:12, fontWeight:900, lineHeight:1.25 }}>{title}</div>
    <div style={{ color, fontSize:30, lineHeight:1, fontWeight:900, marginTop:8 }}>{value}<span style={{ fontSize:12, color:'#64748b', marginLeft:4 }}>{langSafeUnit(note)}</span></div>
    {note && <div style={{ color, fontSize:11, fontWeight:900, marginTop:6 }}>{note}</div>}
  </div>
}

function langSafeUnit(note) {
  return ''
}

function MobileStatusChip({ status, lang }) {
  const meta = statusMeta[status] || statusMeta.good
  const label = status === 'alert' || status === 'attention'
    ? (lang === JP ? (meta.ja || '不足') : (meta.en || 'Alert'))
    : meta[lang]
  return <span style={{
    display:'inline-flex',
    alignItems:'center',
    justifyContent:'center',
    color:meta.color,
    background:`${meta.color}12`,
    border:`1px solid ${meta.color}45`,
    borderRadius:999,
    padding:'3px 8px',
    fontSize:11,
    fontWeight:900,
    whiteSpace:'nowrap'
  }}>{label}</span>
}

function MobileItemCard({ sku, lang, incrementals, onOpen }) {
  const fallbackForecast = Math.round(consumptionPerWeek(sku))
  const weeks = calcWeeks(sku)
  const status = statusOf(sku)
  const color = weeks < 2 ? T.red : weeks >= 8 ? T.blue : T.green
  return <button onClick={onOpen} style={{ width:'100%', textAlign:'left', border:'none', borderBottom:'1px solid #e5edf5', background:'#fff', padding:'14px 2px', color:'#0f172a', fontFamily:T.font }}>
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:15.5, fontWeight:900, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName(sku, lang)}</div>
        <div style={{ color:'#64748b', fontSize:12, fontWeight:800, marginTop:3 }}>{sku.sku || 'SKU'} / {sku.supplier || sku.subset || (lang === JP ? '本社倉庫' : 'Warehouse')}</div>
        <div style={{ marginTop:7 }}><MobileStatusChip status={status} lang={lang} /></div>
      </div>
      <div style={{ textAlign:'right', color, fontSize:18, fontWeight:900, whiteSpace:'nowrap' }}>
        {Number(weeks || 0).toFixed(1)}<span style={{ fontSize:11, color:'#64748b', marginLeft:2 }}>{lang === JP ? '週分' : 'w'}</span>
      </div>
      <div style={{ color:'#94a3b8', fontSize:22 }}>›</div>
    </div>
  </button>
}

function MobileProductPulse({ series }) {
  const values = (series || []).map(r => Number(r.delta || 0))
  if (!values.length) return null
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const d = values.map((v, i) => {
    const x = 4 + (i / Math.max(1, values.length - 1)) * 108
    const y = 42 - ((v - min) / span) * 32
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return <svg viewBox="0 0 120 48" style={{ width:120, height:48 }}>
    <path d={d} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {values.map((v,i)=>{
      const x = 4 + (i / Math.max(1, values.length - 1)) * 108
      const y = 42 - ((v - min) / span) * 32
      return <circle key={i} cx={x} cy={y} r="2.5" fill="#2563eb" />
    })}
  </svg>
}

function MobileHeatCell({ row, children }) {
  const meta = statusMeta[row.status] || statusMeta.good
  return <td style={{ padding:'9px 7px', textAlign:'center', background:`${meta.color}12`, border:'1px solid #e5edf5', fontSize:12, fontWeight:900, color:children !== undefined && String(children).startsWith('-') ? T.red : '#0f172a' }}>{children}</td>
}

function MobileSupplierHeatmap({ sku, items, incrementals, lang }) {
  const [viewMode, setViewMode] = useState('weekly')
  if (!sku) return null
  const sourceSeries = buildDemandSupplyGap(items, sku, incrementals, 13, lang)
  const series = viewMode === 'monthly'
    ? [1,2,3].map(m => {
        const rows = sourceSeries.slice((m-1)*4, m*4)
        const forecast = rows.reduce((a,r)=>a+Number(r.forecast||0),0)
        const supply = rows.reduce((a,r)=>a+Number(r.supply||0),0)
        const delta = supply - forecast
        return { week:m, forecast, supply, delta, status:deltaTone(delta, forecast) }
      })
    : sourceSeries
  const visibleSeries = viewMode === 'monthly' ? series : sourceSeries.slice(0, 4)
  const agg = aggregateSkuForProduct(items, sku, lang)
  const supplierRows = (sku.supplier_rows || (items || []).filter(s => sameProduct(s, sku))).slice(0, 3)
  const shortageWeek = sourceSeries.find(r => r.delta < 0)?.week
  const recommendedQty = Math.max(Number(agg.moq || 0), Math.ceil(Math.max(0, (sourceSeries[0]?.forecast || 0) - (sourceSeries[0]?.supply || 0)) || Number(agg.moq || 0) || Math.round(consumptionPerWeek(agg) * 2)))
  const bestSupplier = supplierRows.slice().sort((a,b)=>Number(a.lead_time||99)-Number(b.lead_time||99))[0] || agg
  const currentWos = calcWeeks(agg)
  const subject = lang === JP ? `${displayName(sku, lang)}の前倒し出荷可否について` : `Request to confirm earlier shipment for ${displayName(sku, lang)}`
  const body = lang === JP
    ? `${bestSupplier.supplier || 'Supplier'} ご担当者様\n\nいつもお世話になっております。\n${displayName(sku, lang)}について、現在の在庫状況を確認したところ、短期的に供給調整が必要な可能性があります。\n${fmt(recommendedQty)}個の出荷可否をご確認いただけますでしょうか。\n\nどうぞよろしくお願いいたします。`
    : `Hi ${bestSupplier.supplier || 'Supplier'},\n\nWe reviewed the current inventory status for ${displayName(sku, lang)} and noticed a potential short-term supply adjustment need.\nCould you please confirm whether ${fmt(recommendedQty)} units can be shipped earlier?\n\nBest regards,`
  const copyEmail = async () => {
    const text = `Subject: ${subject}\n\n${body}`
    try {
      await navigator.clipboard.writeText(text)
      alert(lang === JP ? 'コピーしました' : 'Copied')
    } catch (_) {
      window.prompt(lang === JP ? 'コピーしてください' : 'Copy this text', text)
    }
  }

  return <div style={{ display:'grid', gap:12 }}>
    <section style={{ background:'#fff', color:'#0f172a', borderRadius:16, padding:15, boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
        <div style={{ minWidth:0 }}>
          <h2 style={{ margin:'0 0 4px', fontSize:20, letterSpacing:'-.03em' }}>{lang === JP ? '在庫ヒートマップ（仕入先別）' : 'Inventory heatmap by supplier'}</h2>
          <div style={{ fontSize:13, color:'#64748b', fontWeight:800, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName(sku, lang)}</div>
          <div style={{ fontSize:12, color:'#94a3b8', fontWeight:800, marginTop:3 }}>{sku.sku || ''} / {sku.supplier || sku.subset || ''}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ color:'#64748b', fontSize:11, fontWeight:900 }}>{lang === JP ? '需給パルス' : 'Supply pulse'}</div>
          <MobileProductPulse series={sourceSeries} />
        </div>
      </div>
      <div style={{ display:'flex', gap:8, margin:'10px 0 12px' }}>
        <button onClick={()=>setViewMode('weekly')} style={{ border:'none', background:viewMode === 'weekly' ? T.green : '#f1f5f9', color:viewMode === 'weekly' ? '#fff' : '#475569', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:900 }}>Weekly</button>
        <button onClick={()=>setViewMode('monthly')} style={{ border:'none', background:viewMode === 'monthly' ? T.green : '#f1f5f9', color:viewMode === 'monthly' ? '#fff' : '#475569', borderRadius:999, padding:'6px 12px', fontSize:12, fontWeight:900 }}>Monthly</button>
      </div>
      <div style={{ overflowX:'auto', border:'1px solid #e5edf5', borderRadius:12 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:420 }}>
          <thead><tr>{['', ...(viewMode === 'monthly' ? ['M1','M2','M3'] : ['1週','2週','3週','4週'])].map(h=><th key={h} style={{ padding:'9px 8px', background:'#f8fafc', color:'#64748b', fontSize:11, fontWeight:900, borderBottom:'1px solid #e5edf5', textAlign:'right' }}>{h}</th>)}</tr></thead>
          <tbody>
            {[
              [lang === JP ? '需要' : 'Forecast', 'forecast'],
              [lang === JP ? '供給' : 'Supply', 'supply'],
              [lang === JP ? '差分' : 'Gap', 'delta']
            ].map(([label,key]) => <tr key={key}>
              <td style={{ padding:'10px 8px', color:'#334155', fontSize:12, fontWeight:900, borderBottom:'1px solid #edf2f7', textAlign:'left' }}>{label}</td>
              {visibleSeries.map(r => <td key={`${key}-${r.week}`} style={{ padding:'10px 8px', color:key === 'delta' ? (Number(r.delta) < 0 ? T.red : T.green) : '#0f172a', fontSize:12, fontWeight:900, borderBottom:'1px solid #edf2f7', textAlign:'right' }}>{Number(r[key]) > 0 && key === 'delta' ? '+' : ''}{fmt(r[key])}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section style={{ background:'#fff', color:'#0f172a', borderRadius:16, padding:15, boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
      <h3 style={{ margin:'0 0 12px', fontSize:17 }}>{lang === JP ? '仕入先比較' : 'Supplier comparison'}</h3>
      <div style={{ border:'1px solid #e5edf5', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{[lang===JP?'優先':'Priority',lang===JP?'仕入先':'Supplier',lang===JP?'在庫週数':'WOS',lang===JP?'単価':'Cost',lang===JP?'LT':'LT'].map(h=><th key={h} style={{ background:'#f8fafc', padding:'9px 7px', borderBottom:'1px solid #e5edf5', fontSize:11, textAlign:'left' }}>{h}</th>)}</tr></thead>
          <tbody>{supplierRows.map((s,i)=><tr key={s.id || i}>
            <td style={{ padding:'10px 7px', borderBottom:'1px solid #edf2f7', color:i===0?T.red:'#64748b', fontWeight:900 }}>{i+1}</td>
            <td style={{ padding:'10px 7px', borderBottom:'1px solid #edf2f7', fontWeight:900 }}>{s.supplier || s.subset || `Supplier ${i+1}`}</td>
            <td style={{ padding:'10px 7px', borderBottom:'1px solid #edf2f7', color:calcWeeks(s) < 2 ? T.red : calcWeeks(s) >= 8 ? T.blue : T.green, fontWeight:900 }}>{calcWeeks(s).toFixed(1)}{lang===JP?'週':'w'}</td>
            <td style={{ padding:'10px 7px', borderBottom:'1px solid #edf2f7', fontWeight:800 }}>¥{fmt(Number(s.unit_cost || 0))}</td>
            <td style={{ padding:'10px 7px', borderBottom:'1px solid #edf2f7', fontWeight:800 }}>{Number(s.lead_time || 0)}{lang===JP?'日':'d'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section style={{ background:'#fff', color:'#0f172a', borderRadius:16, padding:15, boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0, fontSize:17 }}>{lang === JP ? '分析・発注サポート' : 'Analysis & order support'}</h3>
        <span style={{ border:`1px solid ${currentWos < 2 ? T.red : T.blue}`, color:currentWos < 2 ? T.red : T.blue, borderRadius:999, padding:'4px 8px', fontSize:11, fontWeight:900 }}>{currentWos < 2 ? (lang===JP?'欠品リスク':'Shortage risk') : (lang===JP?'過剰リスク':'Overstock risk')}</span>
      </div>
      <div style={{ display:'grid', gap:10, marginTop:12 }}>
        <div style={{ border:'1px solid #e5edf5', borderRadius:12, padding:12 }}>
          <div style={{ fontWeight:900, marginBottom:7 }}>{lang === JP ? '分析サマリー' : 'Analysis summary'}</div>
          <div style={{ color:'#475569', fontSize:13, lineHeight:1.65 }}>{currentWos < 2 ? (lang===JP?'需要に対して在庫が不足する可能性があります。最短リードタイムの仕入先を優先し、必要数量のみを提案します。':'Inventory may be short against demand. Prioritize the shortest lead-time supplier and propose only the required quantity.') : (lang===JP?'供給が需要を上回る週があります。在庫過多の可能性があるため、次回発注の一時停止または数量調整を推奨します。':'Supply exceeds demand in some weeks. Pause the next order or adjust quantity.')}</div>
        </div>
        <div style={{ border:'1px solid #e5edf5', borderRadius:12, padding:12 }}>
          <div style={{ fontWeight:900, marginBottom:8 }}>{lang === JP ? '発注提案' : 'Order proposal'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div style={{ background:'#f8fafc', borderRadius:10, padding:10 }}><div style={{ color:'#64748b', fontSize:11, fontWeight:900 }}>{lang===JP?'推奨仕入先':'Supplier'}</div><b>{bestSupplier.supplier || bestSupplier.subset || 'Supplier A'}</b></div>
            <div style={{ background:'#f8fafc', borderRadius:10, padding:10 }}><div style={{ color:'#64748b', fontSize:11, fontWeight:900 }}>{lang===JP?'発注数量':'Order qty'}</div><b>{fmt(recommendedQty)} {lang===JP?'個':'units'}</b></div>
            <div style={{ background:'#f8fafc', borderRadius:10, padding:10 }}><div style={{ color:'#64748b', fontSize:11, fontWeight:900 }}>{lang===JP?'希望納期':'Target ETA'}</div><b>{shortageWeek ? (lang===JP?`${shortageWeek}週目前`:`Before W${shortageWeek}`) : (lang===JP?'次回入荷可能週':'Next available week')}</b></div>
            <div style={{ background:'#f8fafc', borderRadius:10, padding:10 }}><div style={{ color:'#64748b', fontSize:11, fontWeight:900 }}>{lang===JP?'発注種別':'Order type'}</div><b>{shortageWeek ? (lang===JP?'通常発注':'Standard') : (lang===JP?'数量調整':'Quantity adjustment')}</b></div>
          </div>
        </div>
        <div style={{ border:'1px solid #e5edf5', borderRadius:12, padding:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}><b>{lang === JP ? '作成メール' : 'Generated email'}</b><button onClick={copyEmail} style={{ border:'none', background:'transparent', color:T.green, fontSize:12, fontWeight:900 }}>{lang===JP?'コピー':'Copy'}</button></div>
          <div style={{ color:'#475569', fontSize:12, lineHeight:1.6, background:'#f8fafc', borderRadius:10, padding:10, whiteSpace:'pre-wrap' }}>{`Subject: ${subject}\n\n${body}`}</div>
        </div>
      </div>
    </section>
  </div>
}

function MobileStockwiseApp({ lang, setLang, items, productOptions, incrementals, selectedSku, setSelected, setTab }) {
  const sourceItems = (items && items.length) ? items : (productOptions || [])
  let allProducts = hideTotalSupplierRowsOnlyIfDetailsExist(aggregateProductOptions(sourceItems, lang))
  if (selectedSku && !allProducts.some(p => sameProduct(p, selectedSku))) {
    allProducts = [selectedSku, ...allProducts]
  }

  const mobileHasProducts = allProducts.length > 0
  const [mobileTab, setMobileTab] = useState('dashboard')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [mobileSelected, setMobileSelected] = useState(selectedSku || allProducts?.[0] || null)

  useEffect(() => {
    const next = selectedSku || allProducts?.find(p => sameProduct(p, mobileSelected)) || allProducts?.[0] || null
    setMobileSelected(next)
  }, [items, productOptions, selectedSku, lang])

  const shortageItems = allProducts.filter(s => statusOf(s) === 'alert' || statusOf(s) === 'attention')
  const overItems = allProducts.filter(s => statusOf(s) === 'over')
  const reorderItems = allProducts.filter(s => Number(s.stock_qty || 0) < calcRp(s))
  const inboundTotal = safeArray(incrementals).reduce((a,r)=>a+Number(r.qty||0),0)
  const stockValue = sourceItems.reduce((a,s)=>a+Number(s.stock_qty||0)*Number(s.unit_cost||0),0)
  const displayList = allProducts

  const filteredProducts = allProducts.filter(s => {
    const q = query.trim().toLowerCase()
    const matchesQuery = !q || [s.name, s.name_en, s.sku, s.supplier, s.subset].some(v => String(v || '').toLowerCase().includes(q))
    const st = statusOf(s)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'shortage' && (st === 'alert' || st === 'attention')) ||
      (filter === 'over' && st === 'over') ||
      (filter === 'good' && st === 'good')
    return matchesQuery && matchesFilter
  })

  const openItem = (sku) => {
    setMobileSelected(sku)
    setSelected(sku)
    setTab('heatmap')
    setMobileTab('heatmap')
  }

  return <div style={{ minHeight:'100vh', background:'#f3f7fb', color:'#0f172a', fontFamily:T.font, padding:'0 14px 78px', fontSize:15 }}>
    <header style={{ position:'sticky', top:0, zIndex:20, margin:'0 -14px 14px', padding:'14px 16px 12px', background:'linear-gradient(135deg,#03180e,#07170f)', color:'#fff', boxShadow:'0 8px 24px rgba(2,6,23,.18)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <img src="/stockwise-icon.png" alt="Stockwise" style={{ width:28, height:28, borderRadius:0, objectFit:'cover', boxShadow:'0 6px 16px rgba(0,0,0,.25)' }} />
          <div style={{ fontSize:18, fontWeight:900 }}>Stockwise</div>
        </div>
        <button onClick={()=>setLang(lang === JP ? EN : JP)} style={{ border:'1px solid rgba(255,255,255,.25)', background:'rgba(255,255,255,.08)', color:'#fff', borderRadius:999, padding:'7px 11px', fontWeight:900 }}>{lang === JP ? 'EN' : 'JP'}</button>
      </div>
    </header>

    {mobileTab === 'dashboard' && <main style={{ display:'grid', gap:14 }}>
      <section style={{ background:'#fff', borderRadius:16, padding:15, boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
        <h1 style={{ margin:'0 0 13px', fontSize:21, letterSpacing:'-.03em' }}>{lang === JP ? 'ダッシュボード' : 'Dashboard'}</h1>
        {!mobileHasProducts && <div style={{ color:'#64748b', fontSize:13, lineHeight:1.6, marginBottom:10 }}>{lang === JP ? '品目データがまだ同期されていません。PC本番URLでCSVをアップロード後、再読み込みしてください。' : 'Item data is not synced yet. Upload the CSV on the desktop production URL, then refresh.'}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <MobileSummaryCard title={lang === JP ? '発注必要案件' : 'Items to order'} value={reorderItems.length} note={lang === JP ? '要確認' : 'Review'} tone="red" />
          <MobileSummaryCard title={lang === JP ? '在庫過多' : 'Overstock'} value={overItems.length} note={lang === JP ? '8週以上' : '8w+'} tone="blue" />
          <MobileSummaryCard title={lang === JP ? '輸入数量予定' : 'Inbound plan'} value={fmt(inboundTotal)} note={lang === JP ? '個' : 'units'} tone="green" />
          <MobileSummaryCard title={lang === JP ? '在庫金額' : 'Stock value'} value={currency(stockValue, lang)} note={lang === JP ? '現在の在庫' : 'Current'} tone="green" />
        </div>
      </section>
      <section style={{ background:'#fff', borderRadius:16, padding:'14px 15px 6px', boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
          <h2 style={{ margin:0, fontSize:17 }}>{lang === JP ? '品目一覧（上位5件）' : 'Top items'}</h2>
          <button onClick={()=>setMobileTab('items')} style={{ border:'none', background:'transparent', color:T.green, fontWeight:900 }}>{lang === JP ? 'すべて見る' : 'View all'}</button>
        </div>
        {(displayList || []).slice(0,5).map(s => <MobileItemCard key={s.id || `${s.name}-${s.supplier}`} sku={s} lang={lang} incrementals={incrementals} onOpen={()=>openItem(s)} />)}
      </section>
    </main>}

    {mobileTab === 'heatmap' && <MobileSupplierHeatmap sku={mobileSelected || allProducts?.[0]} items={sourceItems} incrementals={incrementals} lang={lang} />}

    {mobileTab === 'items' && <main style={{ display:'grid', gap:12 }}>
      <section style={{ background:'#fff', borderRadius:16, padding:15, boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
        <h1 style={{ margin:'0 0 12px', fontSize:21 }}>{lang === JP ? '品目一覧' : 'Items'}</h1>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={lang === JP ? '品目名・品目コードで検索' : 'Search item or SKU'} style={{ width:'100%', border:'1px solid #dbe5ef', borderRadius:12, padding:'12px 13px', fontSize:14, outline:'none', marginBottom:10 }} />
        <div style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:2 }}>
          {[
            ['all', lang === JP ? 'すべて' : 'All'],
            ['shortage', lang === JP ? '不足' : 'Shortage'],
            ['good', lang === JP ? '適正' : 'Healthy'],
            ['over', lang === JP ? '過剰' : 'Overstock'],
          ].map(([k,label])=><button key={k} onClick={()=>setFilter(k)} style={{ border:'1px solid #dbe5ef', background:filter === k ? (k === 'shortage' ? T.red : k === 'over' ? T.blue : T.green) : '#fff', color:filter === k ? '#fff' : '#334155', borderRadius:999, padding:'7px 12px', fontWeight:900, whiteSpace:'nowrap' }}>{label}</button>)}
        </div>
        <div style={{ color:'#94a3b8', fontSize:12, fontWeight:800, marginTop:10 }}>{lang === JP ? `登録数：${filteredProducts.length}品目` : `${filteredProducts.length} items`}</div>
      </section>
      <section style={{ background:'#fff', borderRadius:16, padding:'2px 15px 6px', boxShadow:'0 8px 24px rgba(15,23,42,.08)' }}>
        {filteredProducts.map(s => <MobileItemCard key={s.id || `${s.name}-${s.supplier}`} sku={s} lang={lang} incrementals={incrementals} onOpen={()=>openItem(s)} />)}
      </section>
    </main>}

    <MobileBottomNav tab={mobileTab} setTab={setMobileTab} lang={lang} />
  </div>
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
  const color = tone === 'red' ? T.red : tone === 'orange' ? T.red : tone === 'green' ? T.green : T.text
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
      <DetailMetric title={copy(lang, 'recommendedOrder')} value={`+${fmt(recommended)}`} suffix={copy(lang, 'units')} tone="red" />
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
      <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:10, minWidth:170, fontSize:13, color:'#d2e2f1' }}>
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
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
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
    <div onClick={e=>e.stopPropagation()} style={{ width:'min(440px, calc(100vw - 48px))', background:'linear-gradient(180deg,#082947,#041d36)', border:`1px solid ${T.line}`, borderRadius:14, padding:20, boxShadow:'0 24px 80px rgba(0,0,0,.42)', fontFamily:T.font, color:T.text, fontSize:15 }}>
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
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>{['alert','attention','good','over'].map(k=><span key={k} style={{ fontSize:13, color:'#d2e2f1' }}><b style={{ color:statusMeta[k].color }}>●</b> {statusMeta[k][lang]}</span>)}</div>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(13,minmax(62px,1fr))', gap:8, overflowX:'auto', paddingBottom:6 }}>
      {forecast.map(f=>{ const m=statusMeta[f.status]; const h=Math.max(12, Math.min(92, (Number(f.wos||0)/maxWos)*92)); return <div key={f.week} style={{ minWidth:62, border:`1px solid ${m.color}`, borderRadius:8, padding:'8px 6px', background:`${m.color}18`, textAlign:'center' }}>
        <div style={{ fontSize:13, color:'#d5e5f3', fontWeight:900 }}>{weekLabel(f.week, lang)}</div>
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
      <div style={{ color:T.muted, fontSize:14, marginTop:4 }}>{displayName(target, lang)}{lang === JP ? 'について、仕入先ごとの価格・リードタイムを比較します。' : ': compare supplier price and lead time.'}</div>
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
            <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:qty?T.red:T.muted, fontWeight:900 }}>{qty ? `+${fmt(qty)} ${copy(lang, 'units')}` : '—'}</td>
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
        <DetailMetric title={lang === JP ? '推奨発注量' : 'Recommended Qty'} value={`+${fmt(recommendedQty)}`} suffix={copy(lang, 'units')} tone="red" />
        <DetailMetric title={lang === JP ? '13週入荷予定合計' : '13-week Inbound Total'} value={fmt(totalInbound)} suffix={copy(lang, 'units')} />
      </div>
    </div>
  </div>
}


function ForecastAnalysisPanel({ items, forecastRows, actualRows, lang }) {
  const rows = buildForecastVariance(items, forecastRows, actualRows, lang)
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:12, overflow:'hidden', background:'rgba(7,43,76,.62)' }}>
    <div style={{ padding:'16px 18px', borderBottom:`1px solid ${T.line}` }}>
      <h3 style={{ margin:'0 0 6px', fontSize:22 }}>{copy(lang, 'forecastAnalysis')}</h3>
      <p style={{ margin:0, color:T.muted, lineHeight:1.6 }}>{lang === JP ? '登録データから需要と実際消費のズレを確認し、次アクションを整理します。' : 'Checks demand and actual consumption balance, then summarizes next actions.'}</p>
    </div>
    <div style={{ overflowX:'auto' }}><table style={{ width:'100%', minWidth:920, borderCollapse:'collapse' }}>
      <thead><tr>{[lang === JP ? '品目' : 'Item', lang === JP ? '顧客' : 'Customer', 'Forecast', lang === JP ? '実績消費' : 'Actual', lang === JP ? '差異' : 'Variance', lang === JP ? '差異率' : 'Variance %', lang === JP ? '次アクション' : 'Next Action'].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 14px', background:'rgba(255,255,255,.04)', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=>{ const color = r.diffRate > .2 ? T.red : r.diffRate < -.2 ? T.blue : T.green; return <tr key={`${r.item}-${i}`}>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{r.item}</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{displayCustomerName(r, lang)}</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{fmt(r.forecast)}</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{fmt(r.actual)}</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color, fontWeight:900 }}>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color, fontWeight:900 }}>{Math.round(r.diffRate * 100)}%</td>
        <td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, lineHeight:1.5 }}>{r.action}</td>
      </tr>})}</tbody>
    </table></div>
  </div>
}
function AiActionListPanel({ items, incrementals, forecastRows, actualRows, lang }) {
  const rows = buildAiActionList(items, incrementals, forecastRows, actualRows, lang)
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:12, background:'rgba(7,43,76,.62)', padding:18 }}>
    <h3 style={{ margin:'0 0 12px', fontSize:22 }}>{copy(lang, 'aiActionList')}</h3>
    <div style={{ display:'grid', gap:10 }}>{rows.map((r,i)=><div key={i} style={{ border:`1px solid ${r.priority==='High'?T.red:T.line}`, background:r.priority==='High'?'rgba(255,70,93,.12)':'rgba(255,255,255,.04)', borderRadius:10, padding:14 }}>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}><b style={{ color:r.priority==='High'?T.red:T.green }}>{r.priority}</b><b>{r.item}</b><span style={{ color:T.muted }}>{r.type}</span></div>
      <div style={{ color:'#d8e6f4', marginTop:8, lineHeight:1.6 }}>{r.action}</div>
    </div>)}</div>
  </div>
}
function EmailAiPanel({ selectedSku, lang }) {
  const item = selectedSku ? displayName(selectedSku, lang) : ''
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:12, background:'rgba(7,43,76,.62)', padding:18 }}>
    <h3 style={{ margin:'0 0 8px', fontSize:22 }}>{copy(lang, 'emailAI')}</h3>
    <p style={{ margin:'0 0 14px', color:T.muted }}>{lang === JP ? '在庫・Forecast・入荷状況をもとに、顧客向け/仕入先向けのメール下書きを作ります。' : 'Creates customer and supplier email drafts based on inventory, forecast, and inbound status.'}</p>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
      <div><b style={{ color:T.blue }}>{lang === JP ? '顧客向け' : 'Customer'}</b><pre style={{ whiteSpace:'pre-wrap', background:'rgba(0,0,0,.22)', border:`1px solid ${T.line}`, borderRadius:10, padding:14, color:'#e4eef8', lineHeight:1.55, fontFamily:T.font }}>{buildCustomerEmailDraft(item, lang)}</pre></div>
      <div><b style={{ color:T.red }}>{lang === JP ? '仕入先向け' : 'Supplier'}</b><pre style={{ whiteSpace:'pre-wrap', background:'rgba(0,0,0,.22)', border:`1px solid ${T.line}`, borderRadius:10, padding:14, color:'#e4eef8', lineHeight:1.55, fontFamily:T.font }}>{buildSupplierEmailDraft(item, lang)}</pre></div>
    </div>
  </div>
}
function MeetingPrepPanel({ items, incrementals, forecastRows, actualRows, lang }) {
  const actions = buildAiActionList(items, incrementals, forecastRows, actualRows, lang).slice(0,5)
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:12, background:'rgba(7,43,76,.62)', padding:18 }}>
    <h3 style={{ margin:'0 0 8px', fontSize:22 }}>{copy(lang, 'meetingPrep')}</h3>
    <p style={{ margin:'0 0 14px', color:T.muted }}>{lang === JP ? '顧客・仕入先・社内会議で確認すべき内容をToDo化します。' : 'Turns items to confirm in customer, supplier, and internal meetings into ToDos.'}</p>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
      <div><b>{lang === JP ? '会議アジェンダ' : 'Meeting Agenda'}</b><ol style={{ lineHeight:1.8, color:'#d8e6f4' }}>{actions.map((a,i)=><li key={i}>{a.item}: {a.type}</li>)}</ol></div>
      <div><b>{lang === JP ? '確認ToDo' : 'ToDo'}</b><ul style={{ lineHeight:1.8, color:'#d8e6f4' }}><li>{lang === JP ? '顧客Forecastの更新有無を確認' : 'Confirm whether customer forecast was updated'}</li><li>{lang === JP ? '仕入先の最新LTと出荷可能数を確認' : 'Confirm supplier latest LT and available shipment quantity'}</li><li>{lang === JP ? '在庫過多品目の発注停止判断を確認' : 'Confirm order pause for overstock items'}</li><li>{lang === JP ? '会議後の発注計画CSVを更新' : 'Update order plan CSV after the meeting'}</li></ul></div>
    </div>
  </div>
}
function AiSupportCard({ title, desc, children }) {
  return <div style={{ border:`1px solid ${T.line}`, borderRadius:12, background:'rgba(255,255,255,.035)', padding:18 }}>
    <h3 style={{ margin:'0 0 8px', fontSize:20 }}>{title}</h3>
    {desc && <p style={{ margin:'0 0 14px', color:T.muted, lineHeight:1.6 }}>{desc}</p>}
    {children}
  </div>
}

function OverseasSalesAiPanel({ items, selectedSku, incrementals, forecastRows, actualRows, lang }) {
  const target = selectedSku || uniqueProductOptions(items)[0]
  const supplierRows = getSupplierSkuRows(items, target, incrementals, lang).sort((a,b)=>a.weeks-b.weeks)
  const risky = buildAiActionList(items, incrementals, forecastRows, actualRows, lang).filter(r => r.priority === 'High').slice(0, 5)
  return <Panel title={copy(lang, '')}>
    <div style={{ display:'grid', gap:16 }}>
      <AiSupportCard
        title={lang === JP ? '1. 今日見るべき在庫リスク' : '1. Inventory risks to review today'}
        desc={lang === JP ? '発注不足・在庫過多・需要差異をまとめて、優先度の高い確認事項だけ表示します。' : 'Summarizes shortage, overstock, and demand variance into high-priority review items.'}
      >
        <AiActionListPanel items={items} incrementals={incrementals} forecastRows={forecastRows} actualRows={actualRows} lang={lang} />
      </AiSupportCard>

      <AiSupportCard
        title={lang === JP ? '2. 仕入先・顧客への連絡サポート' : '2. Supplier / customer communication support'}
        desc={lang === JP ? '選択中の品目と在庫状況をもとに、顧客向け・仕入先向けの下書きを整理します。' : 'Drafts customer and supplier messages based on the selected item and inventory status.'}
      >
        <EmailAiPanel selectedSku={target} lang={lang} />
      </AiSupportCard>

      <AiSupportCard
        title={lang === JP ? '3. 会議準備とToDo整理' : '3. Meeting prep and ToDo organizer'}
        desc={lang === JP ? '会議前に確認すべき論点と、会議後に更新すべきアクションをまとめます。' : 'Organizes discussion points before meetings and follow-up actions after meetings.'}
      >
        <MeetingPrepPanel items={items} incrementals={incrementals} forecastRows={forecastRows} actualRows={actualRows} lang={lang} />
      </AiSupportCard>

      <AiSupportCard
        title={lang === JP ? '4. 仕入先別の優先確認' : '4. Supplier-level priority check'}
        desc={lang === JP ? '選択中の品目について、価格・リードタイム・在庫週数から確認順を整理します。' : 'Prioritizes suppliers by price, lead time, and weeks of stock for the selected item.'}
      >
        <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:720 }}>
          <thead><tr>{[lang===JP?'確認順':'Priority', copy(lang,'supplier'), lang===JP?'在庫週数':'Weeks', lang===JP?'LT':'LT', lang===JP?'単価':'Unit Cost', lang===JP?'次アクション':'Next Action'].map(h=><th key={h} style={{ textAlign:'left', padding:'10px 12px', borderBottom:`1px solid ${T.line}`, background:'rgba(255,255,255,.04)' }}>{h}</th>)}</tr></thead>
          <tbody>{supplierRows.map((r,i)=><tr key={`${r.supplier}-${i}`}><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{i+1}</td><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}` }}>{r.supplier}</td><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}`, color:statusMeta[r.status].color, fontWeight:900 }}>{fmtWeeks(r.weeks)}{copy(lang,'week')}</td><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}` }}>{Number(r.sku.lead_time||0)}d</td><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}` }}>{r.sku.unit_cost ? (lang===JP ? `¥${fmt(Number(r.sku.unit_cost)*150)}` : `$${fmt(r.sku.unit_cost)}`) : '—'}</td><td style={{ padding:'10px 12px', borderBottom:`1px solid ${T.line}` }}>{r.action}</td></tr>)}</tbody>
        </table></div>
      </AiSupportCard>
    </div>
  </Panel>
}

function buildSupporterAnswer(question, { items, selectedSku, incrementals, forecastRows, actualRows, lang }) {
  const q = textKey(question)
  const options = uniqueProductOptions(items)
  const target = selectedSku || options[0]
  const itemName = target ? displayName(target, lang) : (lang === JP ? '対象品目' : 'selected item')
  const supplierRows = target ? getSupplierSkuRows(items, target, incrementals, lang).sort((a,b)=>a.weeks-b.weeks) : []
  const actions = buildAiActionList(items, incrementals, forecastRows, actualRows, lang)
  const highActions = actions.filter(a => a.priority === 'High')
  const overItems = options.filter(s => statusOf(aggregateSkuForProduct(items, s, lang)) === 'over')
  const reorderItems = options.filter(s => {
    const agg = aggregateSkuForProduct(items, s, lang)
    return Number(agg.stock_qty || 0) < calcRp(agg)
  })
  const forecastVariance = buildForecastVariance(items, forecastRows, actualRows, lang)
  const topSupplier = supplierRows[0]
  const optimalStockLevel = target ? Math.round(Math.max(Number(target.safety_stock||0), consumptionPerDay(target) * 7 * (Math.max(1, Math.ceil(Number(target.lead_time||7) / 7)) + 2))) : 0
  const recommendedQty = target ? Math.max(Number(target.moq||0), Math.max(0, optimalStockLevel - Number(target.stock_qty||0))) : 0
  const line = arr => arr.filter(Boolean).join('\n')

  if (!q) return lang === JP ? '質問を入力してください。' : 'Please enter a question.'

  if (q.includes('メール') || q.includes('email') || q.includes('customer') || q.includes('顧客')) {
    return line([
      lang === JP ? `顧客向けメール下書き（${itemName}）` : `Customer email draft (${itemName})`,
      '---',
      buildCustomerEmailDraft(itemName, lang),
    ])
  }

  if (q.includes('仕入') || q.includes('supplier') || q.includes('vendor') || q.includes('サプライヤ')) {
    const rows = supplierRows.slice(0, 4).map((r, i) => `${i+1}. ${r.supplier}: ${fmtWeeks(r.weeks)}${copy(lang,'week')} / LT ${Number(r.sku.lead_time||0)}d / ${r.action}`)
    return line([
      lang === JP ? `仕入先別の確認ポイント（${itemName}）` : `Supplier follow-up points (${itemName})`,
      ...rows,
      '',
      lang === JP ? '優先確認は、在庫週数が短く、LTが長い仕入先です。必要なら仕入先向けメールも作成できます。' : 'Prioritize suppliers with low weeks of stock and longer lead time. I can also draft a supplier email.'
    ])
  }

  if (q.includes('会議') || q.includes('meeting') || q.includes('todo') || q.includes('to do')) {
    const focus = highActions.slice(0, 4).map((a, i) => `${i+1}. ${a.item}: ${a.action}`)
    return line([
      lang === JP ? '会議前アジェンダ案' : 'Suggested meeting agenda',
      ...(focus.length ? focus : [lang === JP ? '現時点で優先度の高い確認事項は限定的です。' : 'There are limited high-priority items right now.']),
      '',
      lang === JP ? '会議後ToDo: 発注計画CSV更新 / 仕入先LT確認 / 顧客Forecast更新確認' : 'Post-meeting ToDos: update order plan CSV / confirm supplier LT / confirm customer forecast updates'
    ])
  }

  if (q.includes('forecast') || q.includes('フォーキャスト') || q.includes('実績') || q.includes('actual') || q.includes('消費')) {
    const rows = forecastVariance.slice(0, 4).map(r => `${r.item}: Forecast ${fmt(r.forecast)} / Actual ${fmt(r.actual)} / ${r.diff >= 0 ? '+' : ''}${fmt(r.diff)} (${Math.round(r.diffRate * 100)}%) → ${r.action}`)
    return line([
      lang === JP ? 'Forecast / 実績消費の差異確認' : 'Forecast vs actual consumption check',
      ...(rows.length ? rows : [lang === JP ? 'Forecastや実績消費CSVが未登録のため、現在の消費量から簡易推定しています。' : 'No forecast/actual CSV is registered, so this is estimated from current consumption data.'])
    ])
  }

  if (q.includes('過多') || q.includes('overstock') || q.includes('多すぎ')) {
    const rows = overItems.map(s => `・${displayName(s, lang)}: ${fmtWeeks(calcWeeks(aggregateSkuForProduct(items, s, lang)))}${copy(lang,'week')} ${lang === JP ? '相当。追加注文停止を検討。' : 'equivalent. Consider pausing additional orders.'}`)
    return line([
      lang === JP ? '在庫過多の確認結果' : 'Overstock check',
      ...(rows.length ? rows : [lang === JP ? '現在、明確な在庫過多品目は見つかっていません。' : 'No clear overstock items were found.'])
    ])
  }

  if (q.includes('発注') || q.includes('order') || q.includes('reorder') || q.includes('不足') || q.includes('risk') || q.includes('リスク')) {
    const rows = (highActions.length ? highActions : actions).slice(0, 5).map(a => `・${a.item}: ${a.action}`)
    return line([
      lang === JP ? '今日見るべき対応項目' : 'Items to review today',
      ...(rows.length ? rows : [lang === JP ? '現時点で緊急対応が必要な品目は限定的です。' : 'There are limited urgent items at this time.']),
      '',
      target ? (lang === JP ? `選択中の${itemName}は、優先仕入先 ${topSupplier?.supplier || '—'}、推奨発注量 ${recommendedQty > 0 ? '+' + fmt(recommendedQty) : '0'}個 を目安に確認できます。` : `For ${itemName}, check priority supplier ${topSupplier?.supplier || '—'} and recommended order ${recommendedQty > 0 ? '+' + fmt(recommendedQty) : '0'} units.`) : ''
    ])
  }

  return line([
    lang === JP ? '確認しました。現在のCSV・在庫・入荷予定から見ると、次の観点で確認できます。' : 'Understood. Based on the current CSV, inventory, and inbound plan, I can help with:',
    lang === JP ? `・発注リスク: ${reorderItems.length}件` : `・Reorder risk: ${reorderItems.length} items`,
    lang === JP ? `・在庫過多: ${overItems.length}件` : `・Overstock: ${overItems.length} items`,
    lang === JP ? `・選択中品目: ${itemName}` : `・Selected item: ${itemName}`,
  ])
}

function IntelligenceSupporterPopup({ open, onClose, items, selectedSku, incrementals, forecastRows, actualRows, lang }) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const listRef = useRef(null)
  const target = selectedSku || uniqueProductOptions(items)[0]
  const itemName = target ? displayName(target, lang) : (lang === JP ? '対象品目' : 'selected item')
  const quickReplies = [
    lang === JP ? '今日見るべきリスクは？' : 'What risks should I review today?',
    lang === JP ? '在庫過多だけ教えて' : 'Show overstock only',
    lang === JP ? '仕入先への確認事項を整理して' : 'Summarize supplier follow-up points',
    lang === JP ? '顧客向けメールを作って' : 'Draft a customer email',
  ]

  useEffect(() => {
    if (!open) return
    setMessages([{
      role:'assistant',
      text: lang === JP
        ? `こんにちは。です。${itemName}を中心に、在庫リスク、発注判断、仕入先確認、メール下書き、会議準備について質問できます。`
        : `Hi, I’m your . Ask me about inventory risks, ordering decisions, supplier follow-ups, email drafts, and meeting prep for ${itemName}.`
    }])
  }, [open, lang, itemName])

  useEffect(() => {
    if (open) setTimeout(() => listRef.current?.scrollTo({ top:listRef.current.scrollHeight, behavior:'smooth' }), 30)
  }, [messages, open])

  if (!open) return null

  function ask(text) {
    const q = String(text || '').trim()
    if (!q) return
    const answer = buildSupporterAnswer(q, { items, selectedSku:target, incrementals, forecastRows, actualRows, lang })
    setMessages(prev => [...prev, { role:'user', text:q }, { role:'assistant', text:answer }])
    setDraft('')
  }

  return <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,7,15,.62)', display:'flex', alignItems:'flex-end', justifyContent:'flex-end', padding:18 }} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{ width:'min(720px,100%)', height:'min(760px,88vh)', display:'flex', flexDirection:'column', border:`1px solid ${T.line}`, borderRadius:18, background:'linear-gradient(180deg,#082947,#031b32)', boxShadow:'0 28px 80px rgba(0,0,0,.45)', color:T.text }}>
      <div style={{ padding:'16px 18px', borderBottom:`1px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#3b82f6,#22c985)', display:'grid', placeItems:'center', fontSize:18, fontWeight:900 }}>AI</div>
          <div><div style={{ fontSize:18, fontWeight:900 }}>{copy(lang, '')}</div><div style={{ color:T.muted, fontSize:13 }}>{lang === JP ? '質問すると、現在のCSV・在庫・入荷予定をもとに回答します' : 'Ask questions and get answers based on current CSV, stock, and inbound data'}</div></div>
        </div>
        <button onClick={onClose} style={{ border:`1px solid ${T.line}`, background:'rgba(255,255,255,.06)', color:T.text, width:36, height:36, borderRadius:10, cursor:'pointer', fontSize:20 }}>×</button>
      </div>

      <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:18 }}>
        <div style={{ display:'grid', gap:12 }}>
          {messages.map((m, i) => <div key={i} style={{ justifySelf:m.role==='user'?'end':'start', maxWidth:m.role==='user'?'82%':'92%', background:m.role==='user'?'rgba(34,201,133,.13)':'rgba(255,255,255,.07)', border:`1px solid ${m.role==='user'?T.green:T.line}`, borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px', padding:'12px 14px', whiteSpace:'pre-wrap', lineHeight:1.65, color:m.role==='user'?'#eafff6':'#e4eef8' }}>
            {m.text}
          </div>)}
        </div>
      </div>

      <div style={{ padding:'0 18px 12px', display:'flex', gap:8, flexWrap:'wrap' }}>
        {quickReplies.map(q => <button key={q} onClick={()=>ask(q)} style={{ border:`1px solid ${T.line}`, background:'rgba(255,255,255,.055)', color:'#cfe7ff', borderRadius:999, padding:'8px 12px', fontFamily:T.font, cursor:'pointer', fontSize:12 }}>{q}</button>)}
      </div>

      <div style={{ borderTop:`1px solid ${T.line}`, padding:'12px 18px', color:T.muted, fontSize:12 }}>
        {lang === JP ? '上の項目を選択すると、現在のCSV・在庫・入荷予定をもとに回答します。' : 'Select a topic above to get an answer based on current CSV, stock, and inbound data.'}
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
      <div style={{ border:`1px solid ${T.red}`, background:'rgba(255,138,28,.12)', borderRadius:12, padding:18 }}><b style={{ color:T.red }}>{lang === JP ? '推奨発注量' : 'Recommended Order'}</b><div style={{ fontSize:24, fontWeight:900, marginTop:10 }}>+{fmt(qty)} {copy(lang, 'units')}</div></div>
      <div style={{ border:`1px solid ${T.green}`, background:'rgba(34,201,133,.12)', borderRadius:12, padding:18 }}><b style={{ color:T.green }}>{lang === JP ? '優先仕入先' : 'Supplier Priority'}</b><div style={{ fontSize:18, fontWeight:900, marginTop:10 }}>{rows.slice(0,3).map(r=>r.supplier).join(' → ') || '—'}</div></div>
    </div>
    <div style={{ marginTop:18, border:`1px solid ${T.line}`, borderRadius:10, overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{[lang === JP ? '優先順位' : 'Priority', copy(lang,'supplier'), copy(lang,'stockWeek'), lang === JP ? '提案' : 'Proposal'].map(h=><th key={h} style={{ textAlign:'left', padding:'12px 14px', background:'rgba(255,255,255,.04)', borderBottom:`1px solid ${T.line}` }}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=>{ const color = i===0 ? T.red : i===1 ? T.red : T.green; return <tr key={r.supplier}><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color, fontWeight:900 }}>{i+1}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, fontWeight:900 }}>{r.supplier}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}`, color:statusMeta[r.status].color, fontWeight:900 }}>{fmtWeeks(r.weeks)}{copy(lang,'week')}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${T.line}` }}>{r.action}</td></tr>})}</tbody></table>
    </div>
  </Panel>
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [lang, setLang] = useState(() => detectLang())
  const [tab, setTab] = useState('dashboard')
  const isMobile = useIsMobile()
  const forceMobile = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mobile') === '1'
  const [heatmapViewMode, setHeatmapViewMode] = useState('weekly')
  const [reorderView, setReorderView] = useState('status')
  const [skus, setSkus] = useState([])
  const [incrementals, setIncrementals] = useState([])
  const [uploadedItems, setUploadedItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showCsvSettings, setShowCsvSettings] = useState(false)
  const [forecastRows, setForecastRows] = useState([])
  const [actualRows, setActualRows] = useState([])
  const skuCsvRef = useRef(null)
  const incCsvRef = useRef(null)
  const forecastCsvRef = useRef(null)
  const actualCsvRef = useRef(null)
  const actionItemsRef = useRef(null)

  useEffect(() => { localStorage.setItem('stockwise_lang', lang); document.documentElement.lang = lang }, [lang])
  useEffect(() => { if (user) fetchSkus() }, [user])

  // hard Supabase sync minimal schema fix
// Supabase unique user_id name aggregate fix
// safe total supplier display filter and mobile empty-state fix
  // Cross-device item sync: PC updates are saved to Supabase; phones refresh from Supabase.
  useEffect(() => {
    if (!user) return

    const refresh = () => fetchSkus()
    const onVisibility = () => { if (!document.hidden) refresh() }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(refresh, 15000)

    let channel = null
    try {
      channel = supabase
        .channel(`stockwise-skus-sync-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'skus', filter: `user_id=eq.${user.id}` },
          () => refresh()
        )
        .subscribe()
    } catch (err) {
      console.warn('skus realtime subscription failed', err)
    }

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user])

  function scrollToActionItems() {
    setTab('dashboard')
    setTimeout(() => actionItemsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 50)
  }

  function skuRowsForDb(rows) {
    const grouped = new Map()

    safeArray(rows).filter(r => r?.name).forEach(row => {
      const key = String(row.name || '').trim()
      if (!key) return

      const weekly = Number(row.actual_consumption || 0)
      const daily = Number(row.daily_usage || (weekly ? Math.round(weekly / 7) : 0) || 0)
      const existing = grouped.get(key)

      if (!existing) {
        grouped.set(key, {
          user_id: user.id,
          name: key,
          supplier: row.supplier || row.subset || 'All suppliers total',
          stock_qty: Number(row.stock_qty || 0),
          daily_usage: daily,
          lead_time: Number(row.lead_time || 7),
          safety_stock: row.safety_stock == null || row.safety_stock === '' ? null : Number(row.safety_stock || 0),
          moq: row.moq == null || row.moq === '' ? null : Number(row.moq || 0),
          unit_cost: row.unit_cost == null || row.unit_cost === '' ? null : Number(row.unit_cost || 0),
        })
        return
      }

      existing.supplier = 'All suppliers total'
      existing.stock_qty += Number(row.stock_qty || 0)
      existing.daily_usage = Math.max(Number(existing.daily_usage || 0), daily)
      existing.lead_time = Math.min(Number(existing.lead_time || 999), Number(row.lead_time || 999))
      existing.safety_stock = Math.max(Number(existing.safety_stock || 0), Number(row.safety_stock || 0))
      existing.moq = Math.max(Number(existing.moq || 0), Number(row.moq || 0))
      const cost = Number(row.unit_cost || 0)
      existing.unit_cost = existing.unit_cost ? Math.min(Number(existing.unit_cost || 0), cost || Number(existing.unit_cost || 0)) : (cost || null)
    })

    return Array.from(grouped.values())
  }

  async function saveItemsToSupabase(rows, reason = 'manual') {
    const cleanRows = skuRowsForDb(rows)
    try {
      const del = await supabase.from('skus').delete().eq('user_id', user.id)
      if (del.error) {
        console.warn('Supabase item delete failed', reason, del.error)
        alert(lang === JP ? `Supabase保存に失敗しました：${del.error.message}` : `Supabase save failed: ${del.error.message}`)
        return false
      }

      if (cleanRows.length) {
        const inserted = await supabase.from('skus').insert(cleanRows)
        if (inserted.error) {
          console.warn('Supabase item insert failed', reason, inserted.error, cleanRows)
          alert(lang === JP ? `Supabase保存に失敗しました：${inserted.error.message}` : `Supabase save failed: ${inserted.error.message}`)
          return false
        }
      }

      return true
    } catch (err) {
      console.warn('Supabase item sync failed', reason, err)
      alert(lang === JP ? `Supabase保存に失敗しました：${err?.message || err}` : `Supabase save failed: ${err?.message || err}`)
      return false
    }
  }

  async function fetchSkus() {
    let data = []
    try {
      const res = await supabase.from('skus').select('*').order('name', { ascending:true })
      if (res.error) console.warn('skus fetch failed', res.error)
      data = safeArray(res.data)
    } catch (err) {
      console.warn('skus fetch failed', err)
    }
    const readStoredArray = key => {
      try { return safeArray(JSON.parse(localStorage.getItem(key) || '[]')) } catch (_) { return [] }
    }
    const localItems = readStoredArray(`stockwise_items_${user.id}`)
    const localInbound = readStoredArray(`stockwise_inbound_${user.id}`)
    const localForecast = readStoredArray(`stockwise_forecast_${user.id}`)
    const localActual = readStoredArray(`stockwise_actual_${user.id}`)

    // Publish existing PC localStorage items to Supabase once, so phone can read the same item list.
    const localHash = JSON.stringify(localItems.map(r => ({
      name:r.name, supplier:r.supplier || r.subset, stock_qty:r.stock_qty, daily_usage:r.daily_usage,
      actual_consumption:r.actual_consumption, lead_time:r.lead_time, safety_stock:r.safety_stock, unit_cost:r.unit_cost
    })))
    const syncKey = `stockwise_items_synced_hash_${user.id}`
    if (localItems.length && localStorage.getItem(syncKey) !== localHash) {
      const ok = await saveItemsToSupabase(localItems, 'localStorage publish')
      if (ok) localStorage.setItem(syncKey, localHash)
      data = skuRowsForDb(localItems)
    }

    const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const baseSource = (data && data.length ? data : (localItems.length ? [] : (isLocalDev ? sampleSkus : [])))
    const base = baseSource.map((s, i) => ({
      ...s,
      id: s.id || `base-${i}-${s.name}-${s.supplier || s.subset || ''}`,
      icon: s.icon || ['audio','box','mouse','keyboard','cable','box'][i % 6],
      sku: s.sku || s.name,
      supplier: s.supplier || s.subset || 'Supplier',
      subset: s.subset || s.supplier || 'Supplier',
      superset: s.superset || s.name,
      name_en: s.name_en || s.name,
    }))
    const normalizedLocal = localItems.map((s, i) => ({
      ...s,
      id: s.id || `local-item-${i}-${s.name}-${s.supplier || s.subset || ''}`,
      icon: s.icon || ['audio','box','mouse','keyboard','cable','box'][i % 6],
      sku: s.sku || s.name,
      supplier: s.supplier || s.subset || 'Supplier',
      subset: s.subset || s.supplier || 'Supplier',
      superset: s.superset || s.name,
      name_en: s.name_en || s.name,
    }))
    const merged = includeInboundOnlySuppliers(mergeByItemSupplier(base, normalizedLocal), localInbound)
    setUploadedItems(localItems)
    setSkus(merged)
    setIncrementals(localInbound)
    setForecastRows(localForecast)
    setActualRows(localActual)
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

  function downloadForecastTemplate() {
    const headers = lang === JP ? ['品目名','顧客名','週','Forecast数量','希望納期','確度','備考'] : ['item','customer','week','forecast_qty','requested_eta','confidence','note']
    const source = productOptions.length ? productOptions : sampleSkus
    const rows = source.map((s,i) => [s.name, lang === JP ? `顧客${i+1}` : `Customer ${i+1}`, 1, Math.round(consumptionPerDay(s) * 7 * 1.05), '', 'High', ''])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_forecast.csv'
    a.click()
  }
  function downloadActualTemplate() {
    const headers = lang === JP ? ['品目名','顧客名','週','実績消費量','出荷数量','備考'] : ['item','customer','week','actual_qty','shipped_qty','note']
    const source = productOptions.length ? productOptions : sampleSkus
    const rows = source.map((s,i) => [s.name, lang === JP ? `顧客${i+1}` : `Customer ${i+1}`, 1, Math.round(consumptionPerDay(s) * 7), Math.round(consumptionPerDay(s) * 7), ''])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(csvBlob([csvLine(headers), ...rows.map(csvLine)]))
    a.download = 'stockwise_actual_consumption.csv'
    a.click()
  }
  function uploadForecastCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    readCsvText(file, text => {
      const table = parseCSV(String(text)); const headers = table[0] || []; const h = headers.map(normalizedHeader)
      const idx = names => names.map(n=>h.findIndex(x=>x===n)).find(i=>i>=0)
      const itemIdx = idx(['品目名','item']) ?? 0, customerIdx = idx(['顧客名','customer']) ?? 1, weekIdx = idx(['週','week']) ?? 2, qtyIdx = idx(['forecast数量','forecast_qty','forecast']) ?? 3, etaIdx = idx(['希望納期','requested_eta']) ?? 4, confIdx = idx(['確度','confidence']) ?? 5, noteIdx = idx(['備考','note']) ?? 6
      const rows = table.slice(1).map(cols => ({ item:cols[itemIdx]?.trim(), customer:cols[customerIdx]?.trim(), week:Number(cols[weekIdx]||1), forecast_qty:Number(cols[qtyIdx]||0), requested_eta:cols[etaIdx]||'', confidence:cols[confIdx]||'', note:cols[noteIdx]||'' })).filter(r=>r.item)
      localStorage.setItem(`stockwise_forecast_${user.id}`, JSON.stringify(rows)); setForecastRows(rows); e.target.value=''; alert((lang===JP?'Forecast CSVを更新しました：':'Forecast CSV updated: ')+rows.length)
    })
  }
  function uploadActualCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    readCsvText(file, text => {
      const table = parseCSV(String(text)); const headers = table[0] || []; const h = headers.map(normalizedHeader)
      const idx = names => names.map(n=>h.findIndex(x=>x===n)).find(i=>i>=0)
      const itemIdx = idx(['品目名','item']) ?? 0, customerIdx = idx(['顧客名','customer']) ?? 1, weekIdx = idx(['週','week']) ?? 2, actualIdx = idx(['実績消費量','actual_qty','actual_consumption']) ?? 3, shippedIdx = idx(['出荷数量','shipped_qty']) ?? 4, noteIdx = idx(['備考','note']) ?? 5
      const rows = table.slice(1).map(cols => ({ item:cols[itemIdx]?.trim(), customer:cols[customerIdx]?.trim(), week:Number(cols[weekIdx]||1), actual_qty:Number(cols[actualIdx]||0), shipped_qty:Number(cols[shippedIdx]||0), note:cols[noteIdx]||'' })).filter(r=>r.item)
      localStorage.setItem(`stockwise_actual_${user.id}`, JSON.stringify(rows)); setActualRows(rows); e.target.value=''; alert((lang===JP?'実績消費CSVを更新しました：':'Actual Consumption CSV updated: ')+rows.length)
    })
  }


  // Second item checkout paywall: 2+ unique products opens Stripe Checkout.
  async function startUpgradeCheckout(reason = 'second_item') {
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'basic',
          reason,
          userId: user?.id || null,
          email: user?.email || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || 'Checkout session failed')
      if (data?.url) {
        window.location.href = data.url
        return
      }
      throw new Error(lang === JP ? 'Stripe Checkout URLを取得できませんでした。' : 'Could not get Stripe Checkout URL.')
    } catch (err) {
      console.error('Stripe checkout error', err)
      alert(lang === JP
        ? `アップグレード画面を開けませんでした。\nVercelのSTRIPE_SECRET_KEY / STRIPE_PRICE_BASIC / APIログを確認してください。\n\n${err?.message || err}`
        : `Could not open the upgrade checkout.\nPlease check Vercel STRIPE_SECRET_KEY / STRIPE_PRICE_BASIC / API logs.\n\n${err?.message || err}`
      )
    }
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
      if (uniqueProductCount(rows) > 1) {
        const ok = window.confirm(lang === JP
          ? '無料デモでアップロードできる品目は1品目までです。2品目以上を利用するには、テスト価格 $19.99 / month のアップグレードが必要です。Stripe Checkoutへ進みますか？'
          : 'The free demo supports 1 item. To use 2 or more items, upgrade with the test price $19.99/month. Continue to Stripe Checkout?'
        )
        e.target.value = ''
        if (ok) await startUpgradeCheckout('second_item_upload')
        return
      }
      // CSVアップロードは「差分追加」ではなく、CSVの内容で発注候補品目を置き換えます。
      // これにより、以前のデモ行・仕入先0・古い仕入先が画面に残らないようにします。
      const acceptedRows = rows
      const saved = mergeByItemSupplier([], acceptedRows)
      const filteredInbound = (incrementals || []).filter(r =>
        saved.some(s => inboundMatchesSku(r, s) && sameSupplier(r.supplier, s.supplier || s.subset || ''))
      )
      localStorage.setItem(`stockwise_items_${user.id}`, JSON.stringify(saved))
      localStorage.setItem(`stockwise_inbound_${user.id}`, JSON.stringify(filteredInbound))
      setUploadedItems(saved)
      setIncrementals(filteredInbound)
      const nextItems = includeInboundOnlySuppliers(mergeByItemSupplier([], saved), filteredInbound)
      setSkus(nextItems)
      const preferred = acceptedRows[0] || selectedSku
      setSelected(findMatchingItem(nextItems, preferred) || findMatchingItem(nextItems, selectedSku) || pickDemoFocus(nextItems))
      const synced = await saveItemsToSupabase(acceptedRows, 'csv upload')
      if (synced) {
        const syncHash = JSON.stringify(acceptedRows.map(r => ({
          name:r.name, supplier:r.supplier || r.subset, stock_qty:r.stock_qty, daily_usage:r.daily_usage,
          actual_consumption:r.actual_consumption, lead_time:r.lead_time, safety_stock:r.safety_stock, unit_cost:r.unit_cost
        })))
        localStorage.setItem(`stockwise_items_synced_hash_${user.id}`, syncHash)
        await fetchSkus()
      }
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
      const currentLocal = JSON.parse(localStorage.getItem(`stockwise_items_${user.id}`) || '[]')
      const baseForInbound = currentLocal.length ? currentLocal : (skus.length ? skus : [])
      const nextItems = includeInboundOnlySuppliers(baseForInbound.map(applyInboundMeta), parsed)
      setSkus(nextItems)
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
  const displayProductOptions = hideTotalSupplierRowsOnlyIfDetailsExist(productOptions)
  const selectedSku = findMatchingItem(items, selected) || selected || productOptions[0] || items[0]
  const productActionItems = uniqueActionProducts(items, lang)
  const alertItems = productActionItems.filter(s => statusOf(s) === 'alert')
  const reorder = productActionItems.filter(s => Number(s.stock_qty || 0) < calcRp(s))
  const overItems = productActionItems.filter(s => statusOf(s) === 'over')
  const actionItems = productActionItems
  const inboundTotal = safeArray(incrementals).reduce((a,r)=>a+Number(r.qty||0),0) || 1400
  const stockValue = items.reduce((a,s)=>a+Number(s.stock_qty||0)*Number(s.unit_cost||0),0) || 284000
  const forecast = selectedSku ? buildForecast(selectedSku, incrementals, 13) : []
  const suppliers = [...new Set(items.map(s => s.supplier || s.subset || '未設定'))]
  const supplierRows = suppliers.map(sup => ({ supplier:sup, items: items.filter(s => (s.supplier || s.subset || '未設定') === sup) }))

  if (authLoading) return <div style={{ minHeight:'100vh', background:T.navy, color:T.text, display:'grid', placeItems:'center', fontFamily:T.font }}>Loading...</div>
  if (!user) return <LoginPage lang={lang} setLang={setLang} />

  if (isMobile || forceMobile) return <MobileStockwiseApp
    lang={lang}
    setLang={setLang}
    items={items}
    productOptions={aggregateProductOptions(items, lang)}
    incrementals={incrementals}
    selectedSku={selectedSku}
    setSelected={setSelected}
    setTab={setTab}
  />

  return <div style={{ minHeight:'100vh', background:`radial-gradient(circle at 50% -10%, #093255 0%, ${T.bg} 45%, #000915 100%)`, color:T.text, fontFamily:T.font }}>
    <div style={{ maxWidth:1220, margin:'0 auto', padding:'18px 22px 34px' }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}><img src="/stockwise-icon.png" alt="Stockwise" style={{ width:40, height:40, borderRadius:0, objectFit:'cover', boxShadow:'0 8px 24px rgba(0,0,0,.25)' }} /><div style={{ fontSize:26, fontWeight:900 }}>Stockwise</div></div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}><Btn small onClick={()=>setLang(l=>l===JP?EN:JP)}>EN / JP</Btn><Btn small onClick={signOut}>{copy(lang, 'logout')}</Btn></div>
      </header>

      <nav style={{ display:'flex', gap:10, marginBottom:16 }}>
        <Btn kind={tab==='dashboard'?'blue':'ghost'} onClick={()=>setTab('dashboard')}>{copy(lang, 'dashboard')}</Btn>
        <Btn kind={tab==='heatmap'?'blue':'ghost'} onClick={()=>setTab('heatmap')}>{copy(lang, 'heatmap')}</Btn>
      </nav>

      {tab === 'dashboard' && <>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <MetricCard lang={lang} tone="red" icon="🛒" title={copy(lang, 'reorder')} sub={copy(lang, 'reorderSub')} value={reorder.length} note={copy(lang, 'reorderNote')} button={copy(lang, 'check')} onClick={scrollToActionItems} />
          <MetricCard lang={lang} tone="blue" icon="📦" title={copy(lang, 'overstock')} sub={copy(lang, 'overstockSub')} value={overItems.length} note={copy(lang, 'overstockNote')} button={copy(lang, 'check')} onClick={scrollToActionItems} />
        </div>

        <div style={{ marginTop:18, display:'flex', flexWrap:'wrap', background:'linear-gradient(90deg,rgba(7,43,76,.9),rgba(5,34,62,.95))', border:`1px solid ${T.line}`, borderRadius:10 }}>
          <MiniMetric icon="" title={copy(lang, 'inbound')} value={`${fmt(inboundTotal)}${lang === JP ? '個' : ' units'}`} note={lang === JP ? '登録済みの輸入数量予定' : 'Registered inbound plan'} />
          <MiniMetric icon="" title={copy(lang, 'stockValue')} value={currency(stockValue, lang)} note={`${displayProductOptions.length} ${copy(lang, 'activeItems')}`} />
        </div>

        <Panel title={copy(lang, 'heatmap')}>
          <p style={{ color:'#cbd9e8', marginTop:-6 }}>{copy(lang, 'heatmapHint')}</p>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:10 }}>{displayProductOptions.slice(0,5).map(s=><HeatCard key={s.id} lang={lang} sku={s} active={sameProduct(s, selectedSku)} onClick={()=>{setSelected(s); setTab('heatmap')}} />)}</div>
          <div style={{ display:'flex', gap:18, flexWrap:'wrap', color:'#c9d8e8', fontSize:14 }}>{Object.entries(statusMeta).filter(([k])=>k !== 'attention').map(([k,m])=><span key={k}><b style={{ color:m.color }}>● {m[lang]}</b>：{lang === JP ? m.descJa : m.descEn}</span>)}</div>
        </Panel>

        <div ref={actionItemsRef} style={{ scrollMarginTop:20 }}><Panel title={copy(lang, 'reorderItems')}>
          <div style={{ display:'grid', gap:12 }}>
            {(actionItems.length ? actionItems : displayProductOptions).map(s => { const st=statusOf(s); const m=statusMeta[st]; const recommended = st === 'over' ? 0 : (s.moq || Math.max(0, calcRp(s)-Number(s.stock_qty||0))); return <div key={s.id} onClick={()=>{setSelected(s); setTab('heatmap')}} style={{ display:'grid', gridTemplateColumns:'110px 1.4fr .65fr .75fr 260px', gap:16, alignItems:'center', cursor:'pointer', border:`1px solid ${m.color}`, background:`${m.color}12`, borderRadius:10, padding:12 }}>
              <IconBox icon={s.icon || 'box'} active />
              <div><h3 style={{ margin:'0 0 8px', fontSize:22 }}>{displayName(s, lang)}</h3><div style={{ color:T.muted, fontSize:14 }}>{copy(lang, 'itemLabel')}: {s.name}</div><div style={{ marginTop:9 }}><span style={{ background:m.color, color:'#fff', borderRadius:4, padding:'4px 8px', fontSize:13, fontWeight:900 }}>{m[lang].toUpperCase()}</span><span style={{ marginLeft:10, color:'#cfddeb' }}>{st === 'over' ? (lang === JP ? '在庫過多の可能性があります' : 'Possible overstock detected') : (lang === JP ? '在庫不足のリスクがあります' : 'Stockout risk detected')}</span></div></div>
              <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:18 }}><div style={{ color:T.muted, fontWeight:800 }}>{copy(lang, 'currentStock')}</div><div style={{ fontSize:24, fontWeight:900, marginTop:10 }}>{fmt(s.stock_qty)} <span style={{ fontSize:14 }}>{copy(lang, 'units')}</span></div></div>
              <div style={{ borderLeft:`1px solid ${T.line}`, paddingLeft:18 }}><div style={{ color:T.muted, fontWeight:800 }}>{st === 'over' ? (lang === JP ? '対応' : 'Action') : copy(lang, 'recommendedOrder')}</div><div style={{ color:st === 'over' ? T.blue : T.red, fontSize:22, fontWeight:900, marginTop:10 }}>{st === 'over' ? (lang === JP ? '追加停止' : 'Stop') : `+${fmt(recommended)} ${copy(lang, 'units')}`}</div></div>
              <div style={{ border:`1px solid ${T.line}`, borderRadius:8, padding:14 }}>
                <b>{lang === JP ? '需給確認' : 'Supply check'}</b>
                <div style={{ display:'grid', gap:8, marginTop:10, fontSize:14, color:'#d7e7f7' }}>
                  <div>{lang === JP ? '週次所要' : 'Weekly need'}：<b>{fmt(consumptionPerWeek(s))}</b> {copy(lang, 'units')}</div>
                  <div>{lang === JP ? 'LT必要数' : 'Lead-time need'}：<b>{fmt(calcRp(s))}</b> {copy(lang, 'units')}</div>
                  <div>{lang === JP ? '安全在庫' : 'Safety stock'}：<b>{fmt(s.safety_stock || 0)}</b> {copy(lang, 'units')}</div>
                  <div>{lang === JP ? '主仕入先' : 'Main supplier'}：<b>{s.supplier || s.subset || 'Supplier'}</b></div>
                </div>
              </div>
            </div>})}
          </div>
        </Panel></div>

      </>}

      {tab === 'heatmap' && <Panel title={copy(lang, 'heatmap')} action={<button onClick={()=>setShowCsvSettings(true)} title={copy(lang, 'csvSettings')} style={{ width:40, height:40, borderRadius:10, border:`1px solid ${T.line}`, background:'rgba(255,255,255,.06)', color:T.text, fontSize:20, cursor:'pointer' }}>⚙</button>}>
        <input ref={skuCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadSkuCSV}/>
        <input ref={incCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={uploadCsv}/>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:12 }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', color:'#cbd9e8', fontSize:14, fontWeight:800 }}>
            <span>{lang === JP ? '表示：需要予測 / 供給数量 / 差分' : 'View: Forecast / Supply / Gap'}</span>
            <span style={{ color:T.red }}>■ {lang === JP ? '不足' : 'Shortage'}</span>
            <span style={{ color:T.green }}>■ {lang === JP ? '適正' : 'Healthy'}</span>
            <span style={{ color:T.blue }}>■ {lang === JP ? '過剰' : 'Overstock'}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setHeatmapViewMode('weekly')} style={{ border:`1px solid ${heatmapViewMode === 'weekly' ? T.blue : T.line}`, background:heatmapViewMode === 'weekly' ? 'rgba(59,130,246,.18)' : 'rgba(255,255,255,.04)', color:'#f8fbff', borderRadius:8, padding:'8px 12px', fontWeight:900, fontFamily:T.font }}>Weekly</button>
            <button onClick={()=>setHeatmapViewMode('monthly')} style={{ border:`1px solid ${heatmapViewMode === 'monthly' ? T.blue : T.line}`, background:heatmapViewMode === 'monthly' ? 'rgba(59,130,246,.18)' : 'rgba(255,255,255,.04)', color:'#f8fbff', borderRadius:8, padding:'8px 12px', fontWeight:900, fontFamily:T.font }}>Monthly</button>
          </div>
        </div>

        <ForecastSupplyGapTable products={aggregateProductOptions(items, lang)} items={items} incrementals={incrementals} selectedSku={selectedSku || aggregateProductOptions(items, lang)?.[0]} onSelect={setSelected} lang={lang} viewMode={heatmapViewMode} />

        {(selectedSku || aggregateProductOptions(items, lang)?.[0]) && <div style={{ marginTop:18 }}>
          <ReorderSimulationPanel items={items} selectedSku={selectedSku || aggregateProductOptions(items, lang)?.[0]} incrementals={incrementals} lang={lang} />
          <AiMockFeaturesSection items={items} selectedSku={selectedSku || aggregateProductOptions(items, lang)?.[0]} incrementals={incrementals} lang={lang} />
        </div>}
      </Panel>}

    </div>

    {showCsvSettings && <CsvSettingsModal lang={lang} onClose={()=>setShowCsvSettings(false)} onDownloadSku={downloadSkuTemplate} onUploadSku={()=>skuCsvRef.current?.click()} onDownloadInbound={downloadCsvTemplate} onUploadInbound={()=>incCsvRef.current?.click()} />}
  </div>
}
