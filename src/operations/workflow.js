import { detectExceptions, demoExceptions, isActive, isAtRiskPO, isPendingDecision, makeDemo, SEVERITIES, STATUSES } from './model.js'

export const VIEWS = ['today', 'exceptions', 'actions', 'decisions', 'history', 'suppliers', 'report']
export const DECISIONS = ['Approve', 'Modify', 'Reject', 'Defer']
export const pendingDecision = isPendingDecision
export const latestDecision = (s, actionId) => s.data.decisions.filter(d => d.actionId === actionId).at(-1)
const event = (at, actor, text, extra = {}) => ({ at, actor, text, ...extra })
const requireText = (value, field, max = 2000) => {
  const text = String(value ?? '').trim()
  if (!text || text.length > max) throw new Error(`${field} must contain 1–${max} characters`)
  return text
}
function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Invalid date')
  return value + 'T00:00:00.000Z'
}
function nextId(rows, prefix) {
  let n = rows.length + 1
  while (rows.some(row => row.id === `${prefix}-${String(n).padStart(3, '0')}`)) n++
  return `${prefix}-${String(n).padStart(3, '0')}`
}
const getAction = (s,id) => {
  const action = s.data.actions.find(a => a.id === id)
  if (!action) throw new Error('Action not found')
  return action
}
const patchAction = (s,action) => ({ ...s, data:{ ...s.data, actions:s.data.actions.map(a => a.id === action.id ? action : a) } })
function annotate(s, ids, at, text) {
  return { ...s, rows:s.rows.map(row => ids.includes(row.id) ? { ...row, updatedAt:at, history:[...row.history,event(at,'Demo operator',text)] } : row) }
}

// Preserve the Phase 1 snapshot, IDs, evidence and browser review history in-place.
export function migrateSnapshot(input) {
  if (input?.version === 2 && input.data?.source === 'synthetic' && Array.isArray(input.rows) && Array.isArray(input.reports) && Array.isArray(input.data.actions) && input.data.actions.every(a => Array.isArray(a.exceptionIds) && Array.isArray(a.history)) && Array.isArray(input.data.decisions) && input.data.decisions.every(d => Array.isArray(d.history))) return input
  const data = input?.version === 1 && input.data?.source === 'synthetic' ? input.data : makeDemo()
  const rows = input?.version === 1 && Array.isArray(input.rows) ? input.rows : demoExceptions(data)
  const at = data.asOf
  const actions = data.actions.map(a => ({
    ...a, exceptionIds:rows.filter(r => r.customerId === a.customerId && r.skuId === a.skuId && r.type === 'Stockout Risk').slice(0,1).map(r => r.id),
    type:'Supplier follow-up', poId:null, priority:'High', createdAt:at, updatedAt:at, resolution:'',
    history:[event(at,'Demo fixture','Seeded synthetic action')],
  }))
  const decisions = data.decisions.map(d => ({ ...d, createdAt:at, updatedAt:at, modifiedAction:'', approvalTimestamp:null, history:[event(at,'Demo fixture','Seeded pending customer decision', { from:null, to:'Pending', originalRecommendation:d.recommendation, reason:d.reason, finalAction:null })] }))
  return { version:2, data:{ ...data, actions, decisions, pos:data.pos.map(p => ({ ...p, status:'Open', history:[event(p.lastUpdate,'Demo fixture','Seeded synthetic supplier update')] })) }, rows, reports:[] }
}

// Only action/decision-generated exceptions are reconciled. Existing inventory evidence/reviews stay intact.
export function reconcileWorkflow(s, at) {
  const generatedTypes = ['Overdue Action','Customer Decision Required']
  const detected = detectExceptions({ ...s.data, asOf:at, skus:[], pos:[], decisions:s.data.decisions.filter(d => pendingDecision(d) && latestDecision(s,d.actionId)?.id === d.id).map(d => ({ ...d, status:'Pending' })) })
  const byId = new Map(detected.map(r => [r.id,r]))
  const rows = s.rows.map(row => {
    if (!generatedTypes.includes(row.type)) return row
    const fresh = byId.get(row.id)
    byId.delete(row.id)
    if (!fresh && row.status !== 'Resolved') return { ...row, status:'Resolved', updatedAt:at, history:[...row.history,event(at,'Demo workflow','Underlying action or decision no longer requires follow-up')] }
    if (fresh && row.status === 'Resolved') return { ...row, status:'Open', underlying:fresh.underlying, updatedAt:at, history:[...row.history,event(at,'Demo workflow','Underlying follow-up reopened')] }
    return fresh ? { ...row, underlying:fresh.underlying } : row
  })
  return { ...s, rows:[...rows,...byId.values()] }
}

export function linkAction(s, exceptionId, actionId, at = new Date().toISOString()) {
  const row = s.rows.find(r => r.id === exceptionId)
  const action = getAction(s,actionId)
  if (!row || row.customerId !== action.customerId) throw new Error('Action and exception must belong to the same demo customer')
  if (action.exceptionIds.includes(exceptionId)) return s
  const updated = { ...action, exceptionIds:[...action.exceptionIds,exceptionId], updatedAt:at, history:[...action.history,event(at,'Demo operator',`Linked exception ${exceptionId}`)] }
  return annotate(patchAction(s,updated),[exceptionId],at,`Linked action ${action.id}`)
}
export function createAction(s, exceptionId, fields, at = new Date().toISOString()) {
  const row = s.rows.find(r => r.id === exceptionId)
  if (!row) throw new Error('Exception not found')
  const description = requireText(fields.description,'Description')
  const owner = requireText(fields.owner,'Owner',80)
  if (!SEVERITIES.includes(fields.priority)) throw new Error('Invalid priority')
  const action = { id:nextId(s.data.actions,'DEMO-ACT'), customerId:row.customerId, exceptionIds:[row.id], type:row.type, skuId:row.skuId, poId:row.poId, supplier:row.supplier, description, owner, dueDate:dateOnly(fields.dueDate), priority:fields.priority, status:fields.approvalRequired ? 'Waiting Customer' : 'Open', approvalRequired:Boolean(fields.approvalRequired), createdAt:at, updatedAt:at, resolution:'', history:[event(at,'Demo operator',`Created from ${row.id}`)] }
  let next = { ...s, data:{ ...s.data, actions:[...s.data.actions,action] } }
  next = annotate(next,[row.id],at,`Created action ${action.id}`)
  if (action.approvalRequired) next = requestDecision(next,action.id,{ recommendation:description, reason:row.reason, supportingData:JSON.stringify(row.underlying), expectedImpact:row.impact },at)
  return reconcileWorkflow(next,at)
}
export function saveAction(s,id,fields,at = new Date().toISOString()) {
  const action = getAction(s,id)
  const owner = requireText(fields.owner,'Owner',80)
  if (!SEVERITIES.includes(fields.priority) || !STATUSES.includes(fields.status)) throw new Error('Invalid action priority or status')
  if (action.approvalRequired && !fields.approvalRequired) throw new Error('Customer approval cannot be removed from an action that already requires it')
  const decision = latestDecision(s,id)
  const authorized = decision && ['Approved','Modified'].includes(decision.status)
  if (fields.status === 'Approved' && !authorized) throw new Error('Approved status requires a recorded customer decision')
  if (fields.approvalRequired && ['In Progress','Resolved','Approved'].includes(fields.status) && !authorized) throw new Error('Customer approval or a recorded modified decision is required before progress or resolution')
  const resolution = fields.status === 'Resolved' ? requireText(fields.resolution,'Resolution') : String(fields.resolution || '').trim()
  const changes = { owner, dueDate:dateOnly(fields.dueDate), priority:fields.priority, status:fields.status, approvalRequired:Boolean(fields.approvalRequired), resolution }
  if (Object.entries(changes).every(([key,value]) => action[key] === value)) return s
  const updated = { ...action,...changes,updatedAt:at,history:[...action.history,event(at,'Demo operator','Action review updated',{ before:Object.fromEntries(Object.keys(changes).map(k => [k,action[k]])), after:changes })] }
  let next = annotate(patchAction(s,updated),action.exceptionIds,at,`Action ${id}: ${action.status} → ${updated.status}`)
  if (!action.approvalRequired && updated.approvalRequired && !decision) next = requestDecision(next,id,{ recommendation:action.description,reason:'Customer approval requested during action review',supportingData:action.exceptionIds.join(', '),expectedImpact:'Review before proceeding' },at)
  return reconcileWorkflow(next,at)
}
export function requestDecision(s,id,fields,at = new Date().toISOString()) {
  const action = getAction(s,id)
  if (action.status === 'Resolved') throw new Error('Reopen the action before requesting another customer decision')
  const prior = latestDecision(s,id)
  if (prior && pendingDecision(prior)) throw new Error('Review the existing pending/deferred decision before creating another proposal')
  const decision = { id:nextId(s.data.decisions,'DEMO-DEC'),actionId:id,customerId:action.customerId,skuId:action.skuId,supplier:action.supplier,
    recommendation:requireText(fields.recommendation,'Proposed action'),reason:requireText(fields.reason,'Reason'),supportingData:requireText(fields.supportingData,'Supporting data'),expectedImpact:requireText(fields.expectedImpact,'Expected impact'),
    status:'Pending',modifiedAction:'',approver:null,approvalTimestamp:null,createdAt:at,updatedAt:at,history:[] }
  decision.history = [event(at,'Demo operator','Requested customer decision',{ from:null,to:'Pending',originalRecommendation:decision.recommendation,reason:decision.reason,finalAction:null })]
  const updated = { ...action,approvalRequired:true,status:'Waiting Customer',updatedAt:at,history:[...action.history,event(at,'Demo operator',`Requested ${decision.id}`)] }
  return reconcileWorkflow({ ...patchAction(s,updated),data:{ ...s.data,actions:s.data.actions.map(a => a.id === id ? updated : a),decisions:[...s.data.decisions,decision] } },at)
}
export function recordDecision(s,id,fields,at = new Date().toISOString()) {
  const decision = s.data.decisions.find(d => d.id === id)
  if (!decision) throw new Error('Decision not found')
  const action = getAction(s,decision.actionId)
  if (latestDecision(s,action.id)?.id !== id) throw new Error('Only the latest proposal can be reviewed')
  if (action.status === 'Resolved') throw new Error('Reopen the resolved action before changing its decision')
  if (!DECISIONS.includes(fields.choice)) throw new Error('Invalid customer decision')
  const actor = requireText(fields.approver,'Demo approver',80)
  const note = requireText(fields.note,'Decision reason')
  const status = { Approve:'Approved',Modify:'Modified',Reject:'Rejected',Defer:'Deferred' }[fields.choice]
  const modifiedAction = fields.choice === 'Modify' ? requireText(fields.modifiedAction,'Modified decision') : ''
  const finalAction = fields.choice === 'Modify' ? modifiedAction : fields.choice === 'Approve' ? decision.recommendation : null
  const historyEvent = event(at,actor,note,{ from:decision.status,to:status,originalRecommendation:decision.recommendation,reason:decision.reason,changes:modifiedAction,finalAction })
  const updated = { ...decision,status,modifiedAction,approver:actor,approvalTimestamp:['Approved','Modified'].includes(status) ? at : null,updatedAt:at,history:[...decision.history,historyEvent] }
  // Approval records a recommendation only. It never starts or executes an action.
  const updatedAction = { ...action,status:status === 'Rejected' ? 'Snoozed' : status === 'Deferred' ? 'Waiting Customer' : 'Open',updatedAt:at,history:[...action.history,event(at,actor,`${id}: ${status}`,{ finalAction })] }
  const next = { ...s,data:{ ...s.data,actions:s.data.actions.map(a => a.id === action.id ? updatedAction : a),decisions:s.data.decisions.map(d => d.id === id ? updated : d) } }
  return reconcileWorkflow(annotate(next,action.exceptionIds,at,`Customer decision ${id}: ${status} (demo only)`),at)
}
export function updateSupplierPO(s,id,fields,at = new Date().toISOString()) {
  const po = s.data.pos.find(p => p.id === id)
  if (!po) throw new Error('PO not found')
  const qty = Number(fields.confirmedQty)
  if (String(fields.confirmedQty).trim() === '' || !Number.isFinite(qty) || qty < 0) throw new Error('Confirmed quantity must be nonnegative')
  if (!STATUSES.includes(fields.followUpStatus) || !SEVERITIES.includes(fields.risk)) throw new Error('Invalid follow-up status or risk')
  const changes = { promisedDate:dateOnly(fields.promisedDate),expectedDate:dateOnly(fields.expectedDate),confirmedQty:qty,delayReason:requireText(fields.delayReason,'Delay reason / update note'),followUpStatus:fields.followUpStatus,risk:fields.risk }
  const updated = { ...po,...changes,lastUpdate:at,history:[...po.history,event(at,'Demo buyer','Supplier monitoring updated',{ before:Object.fromEntries(Object.keys(changes).map(k => [k,po[k]])),after:changes })] }
  const data = { ...s.data,pos:s.data.pos.map(p => p.id === id ? updated : p) }
  const detected = detectExceptions({ ...data,asOf:at,skus:[],pos:[updated],actions:[],decisions:[] })
  const ids = new Map(detected.map(r => [r.id,r]))
  const rows = s.rows.map(row => {
    if (row.poId !== id || !['Late PO','Supplier Delay','Supplier No Response'].includes(row.type)) return row
    const fresh = ids.get(row.id)
    ids.delete(row.id)
    return { ...row,...(fresh ? { issue:fresh.issue,reason:fresh.reason,impact:fresh.impact,daysToImpact:fresh.daysToImpact,underlying:fresh.underlying,status:row.status === 'Resolved' ? 'Open' : row.status } : { status:'Resolved',underlying:updated }),dataTimestamp:at,updatedAt:at,history:[...row.history,event(at,'Demo buyer',fresh ? 'Re-evaluated after supplier update' : 'Supplier condition no longer applies')] }
  })
  return { ...s,data,rows:[...rows,...ids.values()] }
}
export function supplierRows(s,customerId = '') {
  return s.data.pos.filter(p => p.status !== 'Closed' && (!customerId || p.customerId === customerId)).map(p => ({ ...p,delayDays:Math.max(0,Math.round((new Date(p.expectedDate)-new Date(p.promisedDate))/86400000)) }))
}
export function decisionHistory(s,customerId = '') {
  return s.data.decisions.filter(d => !customerId || d.customerId === customerId).flatMap(d => d.history.map((h,i) => ({ ...h,id:`${d.id}:${i}`,decisionId:d.id,actionId:d.actionId,customerId:d.customerId,resolution:getAction(s,d.actionId).resolution }))).sort((a,b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}
export function weeklyReport(s,{ customerId = '',endDate = new Date().toISOString().slice(0,10),baselineId = '' } = {}) {
  const end = new Date(dateOnly(endDate)).getTime()+86400000-1
  const start = end-7*86400000+1
  const inPeriod = at => new Date(at).getTime() >= start && new Date(at).getTime() <= end
  const rows = s.rows.filter(r => !customerId || r.customerId === customerId)
  const active = rows.filter(isActive)
  const actions = s.data.actions.filter(a => !customerId || a.customerId === customerId)
  const decisions = s.data.decisions.filter(d => (!customerId || d.customerId === customerId) && latestDecision(s,d.actionId)?.id === d.id && pendingDecision(d))
  const pos = supplierRows(s,customerId)
  const current = { exceptions:rows.map(r => ({ id:r.id,status:r.status,owner:r.owner,dueDate:r.dueDate,severity:r.severity,issue:r.issue,updatedAt:r.updatedAt,historyCount:r.history.length })),actions:actions.map(a => ({ id:a.id,status:a.status,owner:a.owner,dueDate:a.dueDate,priority:a.priority,approvalRequired:a.approvalRequired,resolution:a.resolution,updatedAt:a.updatedAt,historyCount:a.history.length })),decisions:s.data.decisions.filter(d => !customerId || d.customerId === customerId).map(d => ({ id:d.id,status:d.status,modifiedAction:d.modifiedAction,approver:d.approver,approvalTimestamp:d.approvalTimestamp,updatedAt:d.updatedAt,historyCount:d.history.length })),suppliers:pos.map(p => ({ id:p.id,promisedDate:p.promisedDate,expectedDate:p.expectedDate,confirmedQty:p.confirmedQty,delayReason:p.delayReason,followUpStatus:p.followUpStatus,risk:p.risk,lastUpdate:p.lastUpdate })) }
  const previous = s.reports.find(r => r.id === baselineId && r.customerId === customerId)
  const changes = previous ? Object.fromEntries(Object.entries(current).map(([key,list]) => {
    const before = new Map(previous.records[key].map(r => [r.id,JSON.stringify(r)]))
    return [key,{ added:list.filter(r => !before.has(r.id)).length,changed:list.filter(r => before.has(r.id) && before.get(r.id) !== JSON.stringify(r)).length }]
  })) : null
  return { customerId,endDate,start:new Date(start).toISOString(),end:new Date(end).toISOString(),records:current,previous:previous || null,changes,
    criticalRisks:active.filter(r => r.severity === 'Critical'),newRisks:rows.filter(r => inPeriod(r.history[0]?.at || r.dataTimestamp)),resolvedRisks:rows.filter(r => r.status === 'Resolved' && inPeriod([...r.history].reverse().find(h => /Resolved|resolved|no longer/.test(h.text))?.at || r.updatedAt)),
    openActions:actions.filter(a => a.status !== 'Resolved'),decisionsNeeded:decisions,atRiskPOs:pos.filter(isAtRiskPO),supplierIssues:active.filter(r => ['Supplier Delay','Supplier No Response','Late PO','Late Inbound','Lead-Time Deviation'].includes(r.type)),inventoryRisks:active.filter(r => ['Stockout Risk','Below Safety Stock','Excess Inventory'].includes(r.type)),upcomingDeadlines:actions.filter(a => a.status !== 'Resolved' && new Date(a.dueDate).getTime() > end && new Date(a.dueDate).getTime() <= end+7*86400000),overdueActions:actions.filter(a => a.status !== 'Resolved' && new Date(a.dueDate).getTime() <= end),
  }
}
export function saveReport(s,options,at = new Date().toISOString()) {
  const report = weeklyReport(s,options)
  const record = { id:nextId(s.reports,'DEMO-REPORT'),customerId:report.customerId,at,endDate:report.endDate,records:report.records }
  return { ...s,reports:[...s.reports,record] }
}
