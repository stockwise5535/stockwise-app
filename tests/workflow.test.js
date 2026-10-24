import test from 'node:test'
import assert from 'node:assert/strict'
import { demoExceptions, makeDemo, summarize } from '../src/operations/model.js'
import { createAction, decisionHistory, latestDecision, linkAction, migrateSnapshot, recordDecision, requestDecision, saveAction, saveReport, supplierRows, updateSupplierPO, weeklyReport } from '../src/operations/workflow.js'
const now = '2026-10-24T18:00:00.000Z'
const later = '2026-10-24T19:00:00.000Z'
const fresh = () => { const data = makeDemo(now); return migrateSnapshot({version:1,data,rows:demoExceptions(data)}) }
const fields = {description:'Confirm alternative shipment',owner:'Demo Operator',dueDate:'2026-10-26',priority:'High',approvalRequired:false}
const edit = a => ({owner:a.owner,dueDate:a.dueDate.slice(0,10),priority:a.priority,status:a.status,approvalRequired:a.approvalRequired,resolution:a.resolution})
const proposal = {recommendation:'Expedite 50 demo units',reason:'Coverage shortfall',supportingData:'0 units on hand',expectedImpact:'Reduce interruption risk; review freight cost'}
const choice = (value, extra = {}) => ({choice:value,approver:'Demo customer',note:'Reviewed synthetic options',...extra})

test('v1 migration preserves reviewed exceptions, IDs and history and is idempotent', () => {
  const data = makeDemo(now)
  const rows = demoExceptions(data)
  rows[0] = {...rows[0],owner:'Prior reviewer',status:'Investigating',history:[...rows[0].history,{at:now,actor:'Prior reviewer',text:'Keep me'}]}
  const s = migrateSnapshot({version:1,data,rows})
  assert.equal(s.rows,rows)
  assert.equal(s.rows[0].history.at(-1).text,'Keep me')
  assert.equal(s.data.actions[0].id,data.actions[0].id)
  assert.ok(s.data.actions[0].exceptionIds.length)
  assert.equal(migrateSnapshot(s),s)
})
test('one exception supports multiple actions, action links are deduplicated and customer-bound', () => {
  const s = fresh(), row = s.rows[0]
  let next = createAction(s,row.id,fields,now)
  next = createAction(next,row.id,fields,later)
  assert.equal(next.data.actions.filter(a => a.exceptionIds.includes(row.id)).length,3)
  assert.equal(s.data.actions.length,1)
  const a = next.data.actions.at(-1)
  assert.equal(linkAction(next,row.id,a.id,now),next)
  const other = next.rows.find(r => r.customerId !== row.customerId)
  assert.throws(() => linkAction(next,other.id,a.id,now),/same demo customer/)
  const same = next.rows.find(r => r.customerId === row.customerId && r.id !== row.id)
  next = linkAction(next,same.id,a.id,later)
  assert.ok(next.data.actions.at(-1).exceptionIds.includes(same.id))
  assert.ok(next.rows.find(r => r.id === same.id).history.at(-1).text.includes(a.id))
})
test('approval-required creation creates one linked decision and reconciles TODAY counts', () => {
  let s = fresh()
  s = createAction(s,s.rows[0].id,{...fields,approvalRequired:true},now)
  const a = s.data.actions.at(-1)
  assert.equal(latestDecision(s,a.id).status,'Pending')
  assert.equal(a.status,'Waiting Customer')
  assert.equal(summarize(s.rows,s.data).decisionsNeeded,2)
  assert.throws(() => saveAction(s,a.id,{...edit(a),status:'In Progress'},later),/approval/)
  assert.throws(() => saveAction(s,a.id,{...edit(a),status:'Resolved',resolution:'Done'},later),/approval/)
})
test('all four decision flows preserve original recommendation, history and approval gating', () => {
  let s = fresh()
  const d = s.data.decisions[0], actionId = d.actionId
  for (const [value,status,actionStatus] of [['Approve','Approved','Open'],['Modify','Modified','Open'],['Reject','Rejected','Snoozed'],['Defer','Deferred','Waiting Customer']]) {
    s = recordDecision(s,d.id,choice(value,{modifiedAction:'Use 25 units instead'}),later)
    const decision = latestDecision(s,actionId)
    assert.equal(decision.status,status)
    assert.equal(decision.recommendation,d.recommendation)
    assert.equal(s.data.actions[0].status,actionStatus)
    assert.equal(decision.history.at(-1).originalRecommendation,d.recommendation)
    assert.equal(Boolean(decision.approvalTimestamp),['Approve','Modify'].includes(value))
  }
  assert.equal(latestDecision(s,actionId).history.length,5)
  assert.equal(decisionHistory(s).length,5)
  assert.equal(summarize(s.rows,s.data).decisionsNeeded,1)
  assert.throws(() => recordDecision(s,d.id,choice('Modify',{modifiedAction:''}),later),/Modified decision/)
  assert.throws(() => recordDecision(s,d.id,choice('Approve',{approver:''}),later),/approver/)
  assert.throws(() => recordDecision(s,d.id,choice('Approve',{note:''}),later),/reason/)
})
test('revised proposals supersede old ones and approval never starts work automatically', () => {
  let s = fresh()
  const id = s.data.actions[0].id, d = s.data.decisions[0]
  s = recordDecision(s,d.id,choice('Approve'),later)
  assert.equal(s.data.actions[0].status,'Open')
  assert.equal(summarize(s.rows,s.data).decisionsNeeded,0)
  s = requestDecision(s,id,proposal,later)
  assert.equal(s.data.actions[0].status,'Waiting Customer')
  assert.equal(s.data.decisions.length,2)
  assert.equal(summarize(s.rows,s.data).decisionsNeeded,1)
  assert.throws(() => recordDecision(s,d.id,choice('Reject'),later),/latest proposal/)
  assert.throws(() => requestDecision(s,id,proposal,later),/existing pending/)
})
test('resolution requires evidence, cannot bypass approval, and is visible in decision history', () => {
  let s = fresh(), a = s.data.actions[0]
  assert.throws(() => saveAction(s,a.id,{...edit(a),approvalRequired:false},later),/cannot be removed/)
  s = recordDecision(s,s.data.decisions[0].id,choice('Modify',{modifiedAction:'Ship 25 demo units'}),later)
  a = s.data.actions[0]
  assert.throws(() => saveAction(s,a.id,{...edit(a),status:'Resolved',resolution:''},later),/Resolution/)
  s = saveAction(s,a.id,{...edit(a),status:'Resolved',resolution:'Demo receipt confirmed'},later)
  assert.equal(decisionHistory(s)[0].resolution,'Demo receipt confirmed')
  assert.equal(s.rows.find(r => r.type === 'Overdue Action').status,'Resolved')
  assert.throws(() => recordDecision(s,s.data.decisions[0].id,choice('Reject'),later),/Reopen/)
})
test('action validation rejects invalid dates, owners and priorities without mutating state', () => {
  const s = fresh(), a = s.data.actions[0]
  for (const invalid of [{...fields,dueDate:'2026-02-30'},{...fields,owner:' '},{...fields,priority:'Urgent'}]) assert.throws(() => createAction(s,s.rows[0].id,invalid,now))
  assert.throws(() => saveAction(s,a.id,{...edit(a),dueDate:'invalid'},now))
  assert.equal(s.data.actions.length,1)
})
test('supplier edits update one PO and reconcile its linked exception evidence only', () => {
  let s = fresh()
  const po = s.data.pos[3]
  const oldRows = s.rows.filter(r => r.poId !== po.id)
  s = updateSupplierPO(s,po.id,{promisedDate:'2026-10-27',expectedDate:'2026-10-27',confirmedQty:'200',delayReason:'Demo revised schedule confirmed',followUpStatus:'In Progress',risk:'Low'},later)
  assert.equal(supplierRows(s).find(p => p.id === po.id).delayDays,0)
  assert.equal(s.data.pos.find(p => p.id === po.id).confirmedQty,200)
  assert.equal(s.data.pos.find(p => p.id === po.id).lastUpdate,later)
  assert.ok(s.rows.filter(r => r.poId === po.id).every(r => r.status === 'Resolved'))
  for (const row of oldRows) assert.equal(s.rows.find(r => r.id === row.id),row)
  assert.equal(s.data.pos.find(p => p.id === po.id).history.length,2)
  assert.throws(() => updateSupplierPO(s,po.id,{confirmedQty:-1},later),/nonnegative/)
})
test('report baselines compare real structured changes without mutating stored snapshots', () => {
  let s = fresh()
  const initial = weeklyReport(s,{endDate:'2026-10-24'})
  assert.equal(initial.changes,null)
  assert.equal(initial.criticalRisks.length,8)
  assert.equal(initial.atRiskPOs.length,8)
  s = saveReport(s,{endDate:'2026-10-24'},now)
  const baselineId = s.reports[0].id
  const saved = JSON.stringify(s.reports[0])
  s = createAction(s,s.rows[0].id,fields,later)
  let report = weeklyReport(s,{endDate:'2026-10-24',baselineId})
  assert.equal(report.changes.actions.added,1)
  assert.equal(report.changes.exceptions.changed,1)
  assert.equal(report.openActions.length,2)
  assert.equal(report.upcomingDeadlines.length,1)
  assert.equal(JSON.stringify(s.reports[0]),saved)
  assert.equal(weeklyReport(s,{customerId:'demo-harbor',endDate:'2026-10-24',baselineId}).changes,null)
  assert.ok(weeklyReport(s,{customerId:'demo-harbor',endDate:'2026-10-24'}).records.exceptions.every(r => r.id.startsWith('demo-harbor')))
})
test('weekly activity uses inclusive UTC boundaries while backlog is explicitly current', () => {
  const s = fresh()
  const report = weeklyReport(s,{endDate:'2026-10-24'})
  assert.equal(report.start,'2026-10-18T00:00:00.000Z')
  assert.equal(report.end,'2026-10-24T23:59:59.999Z')
  assert.equal(report.resolvedRisks.length,1)
  assert.ok(report.newRisks.length > 0)
  assert.equal(weeklyReport(s,{endDate:'2026-09-01'}).newRisks.length,0)
  assert.throws(() => weeklyReport(s,{endDate:'2026-02-30'}),/Invalid date/)
})
