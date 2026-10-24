import { useEffect, useState } from 'react'
import { SEVERITIES, STATUSES } from './model.js'
import { createAction as createLinkedAction, linkAction as linkExistingAction, DECISIONS, decisionHistory, latestDecision, pendingDecision, recordDecision, requestDecision, saveAction, saveReport, supplierRows, updateSupplierPO, weeklyReport } from './workflow.js'

function Field({ label, value, onChange, type = 'text', options, required = true, ...rest }) {
  return <label>{label}{options ? <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} {...rest}>{options.map(v => <option key={v} value={v}>{v}</option>)}</select> : <input aria-label={label} type={type} value={value} onChange={e => onChange(e.target.value)} required={required} {...rest}/>}</label>
}
function useReview(mutate) {
  const [message,setMessage] = useState('')
  return [message, fn => { try { mutate(fn); setMessage('Saved in this synthetic demo only.'); return true } catch (error) { setMessage(error.message); return false } }]
}
export function ExceptionActions({ row, snapshot, mutate, openAction, l }) {
  const [description,setDescription] = useState(row.nextAction)
  const [owner,setOwner] = useState(row.owner)
  const [dueDate,setDueDate] = useState(row.dueDate.slice(0,10))
  const [priority,setPriority] = useState(row.severity)
  const [approvalRequired,setApproval] = useState(false)
  const [existing,setExisting] = useState('')
  const [message,run] = useReview(mutate)
  const linked = snapshot.data.actions.filter(a => a.exceptionIds.includes(row.id))
  const available = snapshot.data.actions.filter(a => a.customerId === row.customerId && !a.exceptionIds.includes(row.id))
  return <section className="ops-linked"><h3>{l('Linked actions','関連アクション')} ({linked.length})</h3>{linked.map(a => <p key={a.id}><button type="button" onClick={() => openAction(a.id)}>{a.id} · {a.description}</button><small>{a.owner} · {a.status}</small></p>)}
    <details><summary>{l('Create an action','アクションを作成')}</summary><form onSubmit={e => { e.preventDefault(); run(s => createLinkedAction(s,row.id,{description,owner,dueDate,priority,approvalRequired})) }}>
      <Field label={l('Action description','対応内容')} value={description} onChange={setDescription} maxLength={2000}/><Field label={l('Action owner','アクション担当者')} value={owner} onChange={setOwner} maxLength={80}/><Field label={l('Action due date','アクション期限')} type="date" value={dueDate} onChange={setDueDate}/><Field label={l('Action priority','優先度')} options={SEVERITIES} value={priority} onChange={setPriority}/><label className="ops-check"><input type="checkbox" checked={approvalRequired} onChange={e => setApproval(e.target.checked)}/>{l('Customer approval required','顧客承認が必要')}</label><button type="submit">{l('Create linked action','関連アクションを作成')}</button>
    </form></details>
    <form onSubmit={e => { e.preventDefault(); run(s => linkExistingAction(s,row.id,existing)) }}><label>{l('Link an existing action','既存のアクションを関連付け')}<select aria-label={l('Existing action','既存のアクション')} value={existing} onChange={e => setExisting(e.target.value)} required><option value="">{l('Choose an action','選択してください')}</option>{available.map(a => <option key={a.id} value={a.id}>{a.id} · {a.description}</option>)}</select></label><button disabled={!existing}>{l('Link action','関連付け')}</button></form><p role="status">{message}</p>
  </section>
}

export default function WorkflowScreens({ page, snapshot, mutate, customerId, focusedActionId, openException, l, date }) {
  const actions = snapshot.data.actions.filter(a => !customerId || a.customerId === customerId)
  const customerName = id => snapshot.data.customers.find(c => c.id === id)?.name || id
  if (page === 'actions') return <div className="ops-workflow"><p className="ops-hint">{l('Create or link actions from any exception detail. Customer approval is a demo record and never executes a commercial action.', '例外詳細からアクションを作成・関連付けできます。顧客承認はデモ上の記録であり、商取引を実行しません。')}</p>{!actions.length && <p>No actions for this customer.</p>}{actions.map(a => <ActionCard key={a.id} action={a} snapshot={snapshot} mutate={mutate} customerName={customerName} focused={focusedActionId === a.id} openException={openException} l={l} date={date}/>)}</div>
  if (page === 'decisions') return <div className="ops-workflow"><p className="ops-hint">{l('Demo approver names are annotations, not authenticated customer identity. Only the latest proposal can be reviewed. Approval records an option; it does not start the action.', '承認者名はデモ用の記録で、認証済み顧客の本人確認ではありません。最新提案のみ判断できます。承認による自動実行はありません。')}</p>{snapshot.data.decisions.filter(d => !customerId || d.customerId === customerId).map(d => <DecisionCard key={d.id} decision={d} snapshot={snapshot} mutate={mutate} customerName={customerName} l={l} date={date}/>)}</div>
  if (page === 'history') return <section className="ops-workflow"><p className="ops-hint">{l('Original recommendations and every recorded decision revision remain visible. This browser history is not an immutable production audit log.', '当初の推奨と全判断変更を表示します。ブラウザ履歴は本番向けの改ざん防止監査ログではありません。')}</p>{decisionHistory(snapshot,customerId).map(h => <article className="ops-work-card" key={h.id}><h2>{h.decisionId} · {h.to}</h2><p>{customerName(h.customerId)} · {h.actionId}</p><dl><dt>Timestamp / Approver</dt><dd>{date(h.at)} · {h.actor}</dd><dt>Original recommendation</dt><dd>{h.originalRecommendation}</dd><dt>Original reason</dt><dd>{h.reason}</dd><dt>Decision change</dt><dd>{h.from || '—'} → {h.to}: {h.text}</dd><dt>Modified decision</dt><dd>{h.changes || '—'}</dd><dt>Final action</dt><dd>{h.finalAction || 'No authorized action'}</dd><dt>Current resolution</dt><dd>{h.resolution || 'Unresolved'}</dd></dl></article>)}</section>
  if (page === 'suppliers') return <div className="ops-workflow"><p className="ops-hint">{l('Buyer-side synthetic monitoring only. Updates refresh the linked exception evidence; no supplier messages, real PO changes or ERP writes occur.', '買い手側の架空モニタリングです。更新は関連例外の根拠を再計算します。仕入先への送信や実PO・ERPの変更は行いません。')}</p>{supplierRows(snapshot,customerId).map(po => <SupplierCard key={po.id} po={po} snapshot={snapshot} mutate={mutate} customerName={customerName} openException={openException} l={l} date={date}/>)}</div>
  if (page === 'report') return <Report snapshot={snapshot} mutate={mutate} customerId={customerId} customerName={customerName} l={l} date={date}/>
  return null
}
function ActionCard({ action:a, snapshot, mutate, customerName, focused, openException, l, date }) {
  const [fields,setFields] = useState({ owner:a.owner,dueDate:a.dueDate.slice(0,10),priority:a.priority,status:a.status,approvalRequired:a.approvalRequired,resolution:a.resolution })
  useEffect(() => { setFields({ owner:a.owner,dueDate:a.dueDate.slice(0,10),priority:a.priority,status:a.status,approvalRequired:a.approvalRequired,resolution:a.resolution }) }, [a])
  const [proposal,setProposal] = useState({ recommendation:a.description,reason:'',supportingData:a.exceptionIds.join(', '),expectedImpact:'' })
  const [message,run] = useReview(mutate)
  const decision = latestDecision(snapshot,a.id)
  const set = (key,value) => setFields(prev => ({...prev,[key]:value}))
  return <article className={'ops-work-card' + (focused ? ' ops-highlight' : '')} id={a.id}>
    <p className="ops-eyebrow">{customerName(a.customerId)} · {a.id}</p><h2>{a.description}</h2><p>{a.type} · {a.skuId} {a.poId || ''} · {a.supplier}</p><p>Created: {date(a.createdAt)} · Last update: {date(a.updatedAt)}</p>
    <p>{l('Related exceptions','関連例外')}: {a.exceptionIds.map(id => <button key={id} onClick={() => openException(id)}>{snapshot.rows.find(r => r.id === id)?.type || id} · {snapshot.rows.find(r => r.id === id)?.skuId}</button>)}</p>
    <p>{l('Customer decision','顧客判断')}: {decision ? `${decision.id} · ${decision.status}` : 'Not requested'} · {decision?.status === 'Modified' ? decision.modifiedAction : decision?.status === 'Approved' ? decision.recommendation : l('No approved option','承認済みの選択肢なし')}</p>
    <form className="ops-form-grid" onSubmit={e => { e.preventDefault(); run(s => saveAction(s,a.id,fields)) }}>
      <Field label={l('Owner','担当者')} value={fields.owner} onChange={v => set('owner',v)} maxLength={80}/><Field label={l('Due date','期限')} type="date" value={fields.dueDate} onChange={v => set('dueDate',v)}/><Field label={l('Priority','優先度')} options={SEVERITIES} value={fields.priority} onChange={v => set('priority',v)}/><Field label={l('Action status','アクション状態')} options={STATUSES} value={fields.status} onChange={v => set('status',v)}/>
      <label className="ops-check"><input type="checkbox" checked={fields.approvalRequired} disabled={a.approvalRequired} onChange={e => set('approvalRequired',e.target.checked)}/>{l('Customer approval required','顧客承認が必要')}</label><Field label={l('Resolution','解決内容')} value={fields.resolution} onChange={v => set('resolution',v)} required={fields.status === 'Resolved'} maxLength={2000}/><button type="submit">{l('Save action','アクションを保存')}</button>
    </form>
    <details><summary>{l('Request customer decision / revised proposal','顧客判断・改訂提案を依頼')}</summary>{decision && pendingDecision(decision) ? <p>{l('An outstanding decision already exists. Review it in Customer Decisions.', '未完了の判断依頼があります。顧客判断画面で確認してください。')}</p> : <form className="ops-form-grid" onSubmit={e => { e.preventDefault(); run(s => requestDecision(s,a.id,proposal)) }}>{[['recommendation','Proposed action','提案する対応'],['reason','Reason','理由'],['supportingData','Supporting data','根拠データ'],['expectedImpact','Expected impact','想定される影響']].map(([key,en,ja]) => <Field key={key} label={l(en,ja)} value={proposal[key]} onChange={v => setProposal(prev => ({...prev,[key]:v}))} maxLength={2000}/>)}<button>{l('Request decision','判断を依頼')}</button></form>}</details>
    <p role="status">{message}</p><details><summary>{l('Action activity','アクション履歴')}</summary><ol className="ops-history">{a.history.map((h,i) => <li key={i}>{date(h.at)} · {h.actor}<p>{h.text}</p>{h.after && <pre>{JSON.stringify(h.after,null,2)}</pre>}</li>)}</ol></details>
  </article>
}
function DecisionCard({ decision:d,snapshot,mutate,customerName,l,date }) {
  const [choice,setChoice] = useState('Approve')
  const [approver,setApprover] = useState('Demo Customer Approver')
  const [note,setNote] = useState('')
  const [modifiedAction,setModified] = useState('')
  const [message,run] = useReview(mutate)
  const current = latestDecision(snapshot,d.actionId)?.id === d.id
  return <article className="ops-work-card"><p className="ops-eyebrow">{customerName(d.customerId)} · {d.id} · {d.actionId}</p><h2>{d.recommendation}</h2><p><strong>{d.status}</strong>{!current && ' · Superseded proposal (read only)'}</p><dl><dt>Reason</dt><dd>{d.reason}</dd><dt>Supporting data</dt><dd>{d.supportingData}</dd><dt>Expected impact</dt><dd>{d.expectedImpact}</dd><dt>Recommended option</dt><dd>{d.recommendation}</dd><dt>Modified decision</dt><dd>{d.modifiedAction || '—'}</dd><dt>Approver / Approval timestamp</dt><dd>{d.approver || '—'} / {d.approvalTimestamp ? date(d.approvalTimestamp) : 'Not approved'}</dd><dt>Last update</dt><dd>{date(d.updatedAt)}</dd></dl>
    {current && <form className="ops-form-grid" onSubmit={e => { e.preventDefault(); run(s => recordDecision(s,d.id,{choice,approver,note,modifiedAction})) }}><Field label={l('Customer decision','顧客判断')} options={DECISIONS} value={choice} onChange={setChoice}/><Field label={l('Demo approver','デモ承認者')} value={approver} onChange={setApprover} maxLength={80}/><Field label={l('Decision reason','判断理由')} value={note} onChange={setNote} maxLength={2000}/>{choice === 'Modify' && <Field label={l('Modified decision','変更後の判断')} value={modifiedAction} onChange={setModified} maxLength={2000}/>}<button>{l('Record decision','判断を記録')}</button></form>}<p role="status">{message}</p><details><summary>{l('Decision history','判断履歴')} ({d.history.length})</summary><ol className="ops-history">{d.history.map((h,i) => <li key={i}>{date(h.at)} · {h.actor} · {h.from || '—'} → {h.to}<p>{h.text}</p><p>{h.finalAction || 'No authorized action'}</p></li>)}</ol></details>
  </article>
}
function SupplierCard({ po,snapshot,mutate,customerName,openException,l,date }) {
  const [fields,setFields] = useState({promisedDate:po.promisedDate.slice(0,10),expectedDate:po.expectedDate.slice(0,10),confirmedQty:String(po.confirmedQty),delayReason:po.delayReason,followUpStatus:po.followUpStatus,risk:po.risk})
  const [message,run] = useReview(mutate)
  return <article className="ops-work-card"><p className="ops-eyebrow">{customerName(po.customerId)} · {po.id} · {po.skuId}</p><h2>{po.supplier}</h2><p>{l('Open POs for this customer/supplier','この顧客・仕入先の未完了PO')}: {supplierRows(snapshot,po.customerId).filter(p => p.supplier === po.supplier).length} · Delay days: {po.delayDays} · Available qty: {po.availableQty}</p><p>Last supplier update: {date(po.lastUpdate)} · Risk: {po.risk} · Follow-up: {po.followUpStatus}</p>
    <form className="ops-form-grid" onSubmit={e => { e.preventDefault(); run(s => updateSupplierPO(s,po.id,fields)) }}>{[['promisedDate','Promised date','約束納期','date'],['expectedDate','Expected date','予測納期','date'],['confirmedQty','Confirmed quantity','確定数量','number'],['delayReason','Delay reason / update note','遅延理由・更新メモ','text']].map(([key,en,ja,type]) => <Field key={key} label={l(en,ja)} type={type} value={fields[key]} onChange={v => setFields(prev => ({...prev,[key]:v}))} {...(type === 'number' ? {min:0,step:'any'} : {})}/>)}<Field label={l('Follow-up status','フォローアップ状態')} options={STATUSES} value={fields.followUpStatus} onChange={v => setFields(prev => ({...prev,followUpStatus:v}))}/><Field label={l('Risk level','リスクレベル')} options={SEVERITIES} value={fields.risk} onChange={v => setFields(prev => ({...prev,risk:v}))}/><button>{l('Save monitoring update','モニタリング更新を保存')}</button></form><p role="status">{message}</p><p>{l('Related exceptions','関連例外')}: {snapshot.rows.filter(r => r.poId === po.id).map(r => <button key={r.id} onClick={() => openException(r.id)}>{r.type} · {r.status}</button>)}</p><details><summary>Supplier update history</summary><ol className="ops-history">{po.history.map((h,i) => <li key={i}>{date(h.at)} · {h.actor}: {h.text}{h.after && <pre>{JSON.stringify(h.after,null,2)}</pre>}</li>)}</ol></details>
  </article>
}
function Report({ snapshot,mutate,customerId,customerName,l,date }) {
  const [endDate,setEndDate] = useState(new Date().toISOString().slice(0,10))
  const [baselineId,setBaselineId] = useState('')
  const [message,run] = useReview(mutate)
  const options = {customerId,endDate,baselineId}
  const report = weeklyReport(snapshot,options)
  const baselines = snapshot.reports.filter(r => r.customerId === customerId)
  const sections = [
    ['Critical Risks','緊急リスク',report.criticalRisks,r => `${r.customer} · ${r.type} · ${r.skuId}: ${r.issue}`],
    ['New Risks','新規リスク',report.newRisks,r => `${r.type} · ${r.skuId} · ${r.status}`],
    ['Resolved Risks','解決済みリスク',report.resolvedRisks,r => `${r.type} · ${r.skuId}`],
    ['Open Actions','未完了アクション',report.openActions,a => `${a.id} · ${a.description} · ${a.owner} · ${a.status} · due ${a.dueDate.slice(0,10)}`],
    ['Customer Decisions Needed','顧客判断待ち',report.decisionsNeeded,d => `${d.id} · ${d.recommendation} · ${d.status}`],
    ['At-Risk POs','リスクのあるPO',report.atRiskPOs,p => `${p.id} · ${p.supplier} · ${p.delayDays}-day delay · ${p.risk}`],
    ['Supplier Issues','仕入先の問題',report.supplierIssues,r => `${r.supplier} · ${r.type} · ${r.poId || r.skuId}`],
    ['Inventory Risks','在庫リスク',report.inventoryRisks,r => `${r.type} · ${r.skuId}: ${r.issue}`],
    ['Upcoming Deadlines','今後7日間の期限',report.upcomingDeadlines,a => `${a.id} · ${a.owner} · ${a.dueDate.slice(0,10)}`],
    ['Overdue Actions','期限超過アクション',report.overdueActions,a => `${a.id} · ${a.owner} · ${a.dueDate.slice(0,10)}`],
  ]
  return <section className="ops-report"><div className="ops-report-controls"><Field label={l('Week ending (UTC)','週の終了日（UTC）')} type="date" value={endDate} onChange={value => { if (value && Number.isFinite(Date.parse(value))) setEndDate(value) }}/><label>{l('Compare with saved report','保存済みレポートと比較')}<select aria-label={l('Previous report','前回レポート')} value={baselineId} onChange={e => setBaselineId(e.target.value)}><option value="">{l('No baseline selected','比較対象未選択')}</option>{baselines.map(r => <option key={r.id} value={r.id}>{r.id} · {date(r.at)}</option>)}</select></label><button onClick={() => run(s => saveReport(s,options))}>{l('Save report baseline','比較用レポートを保存')}</button><button onClick={() => window.print()}>{l('Print report','レポートを印刷')}</button><p role="status">{message}</p></div>
    <article className="ops-work-card"><p className="ops-eyebrow">NEXOPS · SYNTHETIC OPERATIONS REPORT</p><h2>{l('Weekly Operations Report','週次運用レポート')}</h2><p>{customerId ? customerName(customerId) : l('All demo customers','すべての架空顧客')} · {report.start.slice(0,10)} – {endDate} UTC</p><p>{l('Current backlog with new/resolved activity during the selected seven-day window. This is not a reconstruction of historical inventory. Compare against a saved baseline to review recorded changes.', '現在の未完了項目と、指定した7日間の新規・解決状況を表示します。過去在庫の再現ではありません。保存した比較用レポートから変更を確認できます。')}</p><h3>{l('Executive Summary','エグゼクティブサマリー')}</h3><p>{l('Structured demo totals','構造化デモデータの集計')}: {report.criticalRisks.length} critical risks; {report.openActions.length} open actions; {report.decisionsNeeded.length} customer decisions needed; {report.atRiskPOs.length} at-risk POs. {report.resolvedRisks.length} risks resolved during the selected week.</p></article>
    <article className="ops-work-card"><h2>{l('Changes Since Previous Report','前回レポートからの変更')}</h2>{report.changes ? <><p>{report.previous.id} · {date(report.previous.at)}</p><ul>{Object.entries(report.changes).map(([key,c]) => <li key={key}>{key}: {c.added} added / {c.changed} changed</li>)}</ul></> : <p>{l('No baseline selected. Save a baseline, make changes, then select it to compare. No historical improvements are fabricated.', '比較対象が未選択です。レポートを保存して変更を行い、比較対象に選択してください。過去の改善値を捏造しません。')}</p>}</article>
    {sections.map(([en,ja,items,render]) => <article className="ops-work-card" key={en}><h2>{l(en,ja)} ({items.length})</h2>{items.length ? <ul>{items.map(r => <li key={r.id}>{render(r)}</li>)}</ul> : <p>{l('None in this scope.','この範囲にはありません。')}</p>}</article>)}<p className="ops-print-note">SYNTHETIC DEMO · Browser-local data · Not a production audit or customer approval record.</p>
  </section>
}
