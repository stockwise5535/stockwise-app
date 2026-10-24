// Pure, deterministic rules. Demo records never touch Supabase or legacy storage.
export const TYPES = ['Stockout Risk', 'Below Safety Stock', 'Excess Inventory', 'Late PO', 'Late Inbound', 'Supplier Delay', 'Supplier No Response', 'Lead-Time Deviation', 'Demand Spike', 'Forecast Deviation', 'Missing Data', 'Overdue Action', 'Customer Decision Required']
export const STATUSES = ['Open', 'Investigating', 'Waiting Supplier', 'Waiting Customer', 'Approved', 'In Progress', 'Resolved', 'Snoozed']
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low']
const DAY = 86400000
const shift = (now, days) => new Date(new Date(now).getTime() + days * DAY).toISOString()
export const isAtRiskPO = p => p.status !== 'Closed' && (new Date(p.expectedDate) > new Date(p.promisedDate) || ['Critical','High'].includes(p.risk))
export const isActive = e => !['Resolved', 'Snoozed'].includes(e.status)
export function prioritize(rows) {
  return [...rows].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.daysToImpact ?? Infinity) - (b.daysToImpact ?? Infinity) || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
}
export function makeDemo(now = new Date().toISOString()) {
  const customers = [{ id:'demo-north', name:'Northstar Devices (Demo)' }, { id:'demo-harbor', name:'Harbor Components (Demo)' }]
  const suppliers = ['Aster Manufacturing', 'Bluewave Components', 'Cedar Electronics', 'Delta Packaging']
  const skus = Array.from({ length:24 }, (_, i) => ({
    id:`DEMO-SKU-${String(i + 1).padStart(3, '0')}`, customerId:customers[i % 2].id,
    name:['Sensor module', 'Control board', 'Cable assembly', 'Protective case'][i % 4] + ` ${i + 1}`,
    supplier:suppliers[i % 4], stock:i % 6 === 0 ? 0 : i % 6 === 1 ? 12 : i % 6 === 2 ? 3000 : 240,
    dailyDemand:12, safetyStock:60, leadTime:14, updatedAt:now,
  }))
  const pos = skus.slice(0, 8).map((sku, i) => ({ id:`DEMO-PO-${100 + i}`, customerId:sku.customerId, skuId:sku.id, supplier:sku.supplier, promisedDate:shift(now, i - 3), expectedDate:shift(now, i + 4), confirmedQty:240, availableQty:i % 2 ? 120 : 240, lastUpdate:shift(now, i === 3 ? -10 : -1), delayReason:'Demo production schedule change', followUpStatus:'Waiting Supplier', risk:'High' }))
  const actions = [{ id:'DEMO-ACT-001', customerId:customers[0].id, skuId:skus[0].id, supplier:suppliers[0], description:'Confirm partial shipment availability', owner:'Demo Operator A', dueDate:shift(now,-2), status:'Waiting Supplier', approvalRequired:true }]
  const decisions = [{ id:'DEMO-DEC-001', customerId:customers[0].id, skuId:skus[0].id, supplier:suppliers[0], actionId:actions[0].id, status:'Pending', recommendation:'Review optional expedited freight', reason:'Demo stockout before planned receipt', supportingData:'0 units on hand; 12 units/day', expectedImpact:'Potentially reduce interruption; freight cost requires review', approver:null }]
  return { source:'synthetic', asOf:now, customers, suppliers, skus, pos, actions, decisions }
}
export function detectExceptions(data) {
  const out = []
  const add = (type, record, severity, issue, reason, impact, nextAction, days, underlying) => {
    const customer = data.customers.find(c => c.id === record.customerId)
    const id = `${record.customerId}:${record.id}:${type}`
    out.push({ id, customerId:record.customerId, customer:customer?.name || record.customerId, severity, type,
      skuId:record.skuId || record.id, poId:record.id.startsWith('DEMO-PO-') ? record.id : null,
      supplier:record.supplier || '—', issue, reason, impact, nextAction, daysToImpact:days,
      underlying, dataTimestamp:data.asOf, updatedAt:data.asOf, owner:'Unassigned', dueDate:shift(data.asOf, days == null ? 1 : Math.max(0, Math.min(7, days))),
      status:'Open', source:data.source, history:[{ at:data.asOf, actor:'Demo monitoring rules', text:`Detected: ${type}` }],
    })
  }
  for (const s of data.skus) {
    const days = s.dailyDemand > 0 ? Math.floor(s.stock / s.dailyDemand) : null
    const facts = { stock:s.stock, dailyDemand:s.dailyDemand, safetyStock:s.safetyStock, leadTime:s.leadTime, sku:s.name }
    if (s.stock >= 0 && days !== null && days < s.leadTime) add('Stockout Risk', s, days < 7 ? 'Critical' : 'High', 'Coverage ends before replenishment lead time', `${days} days of stock < ${s.leadTime}-day lead time`, 'Potential interruption of supply', 'Review inbound coverage and prepare replenishment options', days, facts)
    if (s.stock < s.safetyStock) add('Below Safety Stock', s, 'High', 'Stock is below the safety threshold', `${s.stock} units < ${s.safetyStock} units`, 'Reduced operating buffer', 'Review safety stock and available receipts', days, facts)
    if (days > 56) add('Excess Inventory', s, 'Medium', 'Coverage exceeds eight weeks', `${days} days of stock > 56-day threshold`, 'Working capital tied up in inventory', 'Review demand and propose deferring future receipts', days, facts)
    if (!s.supplier || !s.leadTime || !s.name) add('Missing Data', s, 'Medium', 'Required planning fields are missing', 'SKU name, supplier and lead time are required', 'Risk calculations may be incomplete', 'Confirm missing fields with the data owner', null, facts)
  }
  for (const p of data.pos) {
    const days = Math.floor((new Date(p.promisedDate) - new Date(data.asOf)) / DAY)
    const late = Math.round((new Date(p.expectedDate) - new Date(p.promisedDate)) / DAY)
    if (days < 0) add('Late PO', p, 'High', 'Promised delivery date has passed', 'Open PO has a past promised date', 'Receipt is overdue', 'Request a revised commitment', days, p)
    if (late > 0) add('Supplier Delay', p, 'High', `Supplier expects a ${late}-day delay`, 'Expected date is later than promised date', 'Replenishment may arrive after need date', 'Confirm partial shipment and revised ETA', days, p)
    if ((new Date(data.asOf) - new Date(p.lastUpdate)) / DAY > 7) add('Supplier No Response', p, 'Medium', 'No supplier update for over seven days', 'Last supplier update exceeds follow-up threshold', 'Delivery status is unconfirmed', 'Prepare a supplier follow-up draft for human review', days, p)
  }
  for (const a of data.actions) {
    if (a.status !== 'Resolved' && a.dueDate < data.asOf) add('Overdue Action', a, 'High', a.description, 'Open action is past due', 'Operational follow-up is delayed', 'Assign an owner and confirm next follow-up', -1, a)
  }
  for (const d of data.decisions) {
    if (d.status === 'Pending') add('Customer Decision Required', d, 'High', d.recommendation, d.reason, d.expectedImpact, 'Prepare options for customer approval; do not execute', 0, d)
  }
  return prioritize(out)
}
export function demoExceptions(data) {
  const rows = detectExceptions(data)
  // Explicitly resolved synthetic history, excluded from open operational totals.
  const resolved = { ...rows[0], id:'demo-resolved', type:'Late Inbound', status:'Resolved', severity:'Low', issue:'Demo receipt confirmed', reason:'Receipt was previously overdue', impact:'Closed synthetic example', nextAction:'No further follow-up', history:[{ at:shift(data.asOf,-2), actor:'Demo Operator A', text:'Receipt confirmed; exception resolved' }] }
  return prioritize([...rows, resolved])
}
export function filterExceptions(rows, filters = {}) {
  return rows.filter(row => ['customerId','severity','type','supplier','owner','status'].every(key => !filters[key] || row[key] === filters[key]) && (!filters.dueDate || row.dueDate.slice(0,10) <= filters.dueDate))
}
export function summarize(rows, data) {
  const active = rows.filter(isActive)
  return {
    openActions:data.actions.filter(a => a.status !== 'Resolved').length,
    atRiskPOs:new Set(data.pos.filter(isAtRiskPO).map(p => p.id)).size,
    stockoutRisks:active.filter(e => e.type === 'Stockout Risk').length,
    supplierUpdates:data.pos.filter(p => (new Date(data.asOf) - new Date(p.lastUpdate)) / DAY <= 1).length,
    decisionsNeeded:active.filter(e => e.type === 'Customer Decision Required').length,
    lateInbound:active.filter(e => e.type === 'Late Inbound').length,
    criticalExceptions:active.filter(e => e.severity === 'Critical').length,
  }
}
export function updateException(row, patch, actor, at = new Date().toISOString()) {
  if (!STATUSES.includes(patch.status)) throw new Error('Invalid exception status')
  const owner = String(patch.owner || '').trim()
  if (!owner || owner.length > 80) throw new Error('Owner must contain 1–80 characters')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) || Number.isNaN(Date.parse(patch.dueDate + 'T00:00:00Z')) || new Date(patch.dueDate + 'T00:00:00Z').toISOString().slice(0,10) !== patch.dueDate) throw new Error('Invalid due date')
  const dueDate = patch.dueDate + 'T00:00:00.000Z'
  if (row.status === patch.status && row.owner === owner && row.dueDate.slice(0,10) === patch.dueDate) return row
  return { ...row, status:patch.status, owner, dueDate, updatedAt:at, history:[...row.history, { at, actor, text:`${row.status} → ${patch.status}; ${row.owner} → ${owner}; due ${patch.dueDate}` }] }
}
