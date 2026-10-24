import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDemo, detectExceptions, demoExceptions, filterExceptions, isActive, prioritize, summarize, updateException } from '../src/operations/model.js'
const now = '2026-10-24T18:00:00.000Z'

test('synthetic fixture has two customer boundaries, 24 SKUs and four suppliers', () => {
  const d = makeDemo(now)
  assert.equal(d.source, 'synthetic')
  assert.equal(d.customers.length, 2)
  assert.equal(d.skus.length, 24)
  assert.equal(d.suppliers.length, 4)
  assert.ok(d.skus.every(s => d.customers.some(c => c.id === s.customerId)))
})
test('rules derive risk from underlying quantities and commitments', () => {
  const d = makeDemo(now)
  const rows = detectExceptions(d)
  for (const type of ['Stockout Risk','Excess Inventory','Late PO','Supplier Delay','Supplier No Response','Customer Decision Required','Overdue Action']) assert.ok(rows.some(r => r.type === type), type)
  assert.equal(rows.find(r => r.type === 'Stockout Risk').daysToImpact, 0)
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length)
  const healthy = { ...d, skus:d.skus.map(s => ({ ...s, stock:240 })), pos:[], actions:[], decisions:[] }
  assert.equal(detectExceptions(healthy).length, 0)
})
test('unknown consumption is not treated as zero-day coverage', () => {
  const d = makeDemo(now)
  d.skus = [{ ...d.skus[0], stock:120, dailyDemand:0 }]
  d.pos = []; d.actions = []; d.decisions = []
  assert.equal(detectExceptions(d).length, 0)
})
test('missing fields yield a data exception without inventing a supplier', () => {
  const d = makeDemo(now)
  d.skus = [{ ...d.skus[0], stock:240, supplier:'', leadTime:null }]
  const row = detectExceptions(d).find(r => r.type === 'Missing Data')
  assert.ok(row)
  assert.equal(row.supplier, '—')
})
test('customer filters compose with status, supplier, severity, owner, type and UTC due date', () => {
  const rows = demoExceptions(makeDemo(now))
  const r = rows[0]
  const filters = { customerId:r.customerId, status:r.status, supplier:r.supplier, severity:r.severity, owner:r.owner, type:r.type, dueDate:r.dueDate.slice(0,10) }
  const result = filterExceptions(rows, filters)
  assert.ok(result.length > 0)
  assert.ok(result.every(e => e.customerId === r.customerId && e.type === r.type))
  assert.equal(filterExceptions(rows, { ...filters, dueDate:'2000-01-01' }).length, 0)
  assert.equal(filterExceptions(rows, { customerId:'not-a-customer' }).length, 0)
})
test('priority puts severity first and does not mutate input', () => {
  const rows = [{ id:'later', severity:'Critical', daysToImpact:3, dueDate:now }, { id:'low', severity:'Low', daysToImpact:0, dueDate:now }, { id:'now', severity:'Critical', daysToImpact:0, dueDate:now }]
  assert.deepEqual(prioritize(rows).map(r => r.id), ['now','later','low'])
  assert.equal(rows[0].id, 'later')
})
test('summary deduplicates PO risks and excludes resolved/snoozed exceptions', () => {
  const d = makeDemo(now)
  const rows = demoExceptions(d)
  const summary = summarize(rows, d)
  assert.equal(summary.atRiskPOs, 8)
  assert.equal(summary.lateInbound, 0)
  assert.equal(summary.criticalExceptions, 8)
  assert.equal(summary.openActions, 1)
  assert.equal(summary.decisionsNeeded, 1)
  const closed = rows.map(r => ({ ...r, status:'Snoozed' }))
  assert.equal(summarize(closed,d).criticalExceptions, 0)
  assert.ok(rows.some(r => !isActive(r)))
})
test('review edits append history, reject invalid data, and preserve evidence', () => {
  const row = demoExceptions(makeDemo(now))[0]
  const patch = { status:'Investigating', owner:'Demo Operator A', dueDate:'2026-10-25' }
  const updated = updateException(row, patch, 'Test reviewer', now)
  assert.equal(updated.history.length, row.history.length + 1)
  assert.equal(row.status, 'Open')
  assert.equal(updated.underlying, row.underlying)
  assert.equal(updated.history.at(-1).actor, 'Test reviewer')
  assert.equal(updateException(updated, patch, 'Test reviewer', now), updated)
  for (const invalid of [{ ...patch, status:'Auto purchase' },{ ...patch, owner:' ' },{ ...patch, dueDate:'2026-02-30' }]) assert.throws(() => updateException(row,invalid,'Test',now))
})
