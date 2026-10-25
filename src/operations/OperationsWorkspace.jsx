import { useEffect, useMemo, useRef, useState } from 'react'
import { filterExceptions, isActive, prioritize, SEVERITIES, STATUSES, summarize, TYPES, updateException } from './model.js'
import { migrateSnapshot, VIEWS } from './workflow.js'
import WorkflowScreens, { ExceptionActions } from './WorkflowScreens.jsx'
import AnalyticsConsent from '../growth/AnalyticsConsent.jsx'
import { capture } from '../growth/analytics.js'
import './operations.css'

const STORAGE = 'nexops_synthetic_operations_v1'
const JP = {
  'Stockout Risk':'欠品リスク', 'Below Safety Stock':'安全在庫割れ', 'Excess Inventory':'過剰在庫', 'Late PO':'発注納期超過', 'Late Inbound':'入荷遅延', 'Supplier Delay':'仕入先遅延', 'Supplier No Response':'仕入先未回答', 'Lead-Time Deviation':'LT乖離', 'Demand Spike':'需要急増', 'Forecast Deviation':'予測乖離', 'Missing Data':'データ不足', 'Overdue Action':'対応期限超過', 'Customer Decision Required':'顧客判断待ち',
  Critical:'緊急', High:'高', Medium:'中', Low:'低', Open:'未着手', Investigating:'調査中', 'Waiting Supplier':'仕入先回答待ち', 'Waiting Customer':'顧客回答待ち', Approved:'承認済み', 'In Progress':'対応中', Resolved:'解決済み', Snoozed:'保留',
}
function readDemo() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE))
    if ([1,2].includes(parsed?.version) && parsed.data?.source === 'synthetic' && Array.isArray(parsed.rows) && Array.isArray(parsed.data.actions) && Array.isArray(parsed.data.decisions)) return migrateSnapshot(parsed)
  } catch { /* Corrupt/unavailable storage never prevents demo rendering. */ }
  return migrateSnapshot()
}
export function resetSavedDemo(){try{localStorage.removeItem(STORAGE)}catch{/* Demo can still open without storage. */}}
export default function OperationsWorkspace({ initialPage = 'today', lang:outerLang, onLegacy, onEvent, guided=false, customerFacing=false }) {
  const emit=onEvent || capture
  const [localLang, setLocalLang] = useState('ja')
  const lang = outerLang || localLang
  const l = (en, ja) => lang === 'ja' ? ja : en
  const label = text => lang === 'ja' ? JP[text] || text : text
  const [snapshot, setSnapshot] = useState(readDemo)
  const [storageError, setStorageError] = useState(false)
  const [page, setPage] = useState(VIEWS.includes(initialPage) ? initialPage : 'today')
  const [focusedActionId,setFocusedActionId] = useState(null)
  const [filters, setFilters] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const { data, rows } = snapshot
  const filtered = useMemo(() => prioritize(filterExceptions(rows, filters)), [rows, filters])
  const customerData = { ...data, decisions:data.decisions.filter(d => !filters.customerId || d.customerId === filters.customerId), actions:data.actions.filter(a => !filters.customerId || a.customerId === filters.customerId), pos:data.pos.filter(p => !filters.customerId || p.customerId === filters.customerId) }
  const metrics = summarize(rows.filter(r => !filters.customerId || r.customerId === filters.customerId), customerData)
  const selected = rows.find(r => r.id === selectedId)
  const queue = page === 'today' ? filtered.filter(isActive) : filtered
  const date = value => new Date(value).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { timeZone:'UTC', dateStyle:'medium', timeStyle:'short' }) + ' UTC'
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(snapshot)); setStorageError(false) } catch { setStorageError(true) }
  }, [snapshot])
  useEffect(() => {
    if(page==='today')void emit('today_viewed',{data_mode:'synthetic',workspace_type:'demo',screen:'today'})
    if(page==='suppliers')void emit('supplier_monitoring_viewed',{data_mode:'synthetic',workspace_type:'demo',screen:'suppliers'})
  },[page,emit])
  useEffect(() => {if(selectedId){void emit('exception_opened',{data_mode:'synthetic',workspace_type:'demo'});void emit('recommended_action_viewed',{data_mode:'synthetic',workspace_type:'demo'})}},[selectedId,emit])
  useEffect(()=>{void emit('demo_workspace_opened',{workspace_type:'demo',data_mode:'synthetic'})},[emit])
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]:value }))
  function mutate(operation) { setSnapshot(operation(snapshot)) }
  function go(nextPage) {
    setPage(nextPage)
    if (!onLegacy) window.history.pushState({},'',`${window.location.pathname}?view=${nextPage}`)
  }
  useEffect(() => {
    const change = () => { const next = new URLSearchParams(window.location.search).get('view'); setPage(VIEWS.includes(next) ? next : 'today') }
    window.addEventListener('popstate',change)
    return () => window.removeEventListener('popstate',change)
  }, [])
  const names = { today:'TODAY', exceptions:l('Exception Inbox','例外受信箱'), actions:l('Action Tracker','アクショントラッカー'), decisions:l('Customer Decisions','顧客判断'), history:l('Decision History','判断履歴'), suppliers:l('Supplier Monitoring','仕入先モニタリング'), report:l('Weekly Operations Report','週次運用レポート') }
  function save(row) { setSnapshot(prev => ({ ...prev, rows:prev.rows.map(r => r.id === row.id ? row : r) })) }
  return <section className="nexops" aria-label="Nexops managed operations">
    <header className="ops-header">
      <div className="ops-brand"><span className="ops-mark">N</span><div><strong>NEXOPS</strong><small>MANAGED SUPPLY CHAIN OPERATIONS</small></div></div>
      <div className="ops-toolbar"><span className="ops-demo">{l('SYNTHETIC DEMO', '架空データのデモ')}</span>{!outerLang && <button onClick={() => setLocalLang(lang === 'ja' ? 'en' : 'ja')}>EN / JP</button>}{onLegacy ? <button onClick={onLegacy}>{l('Open existing analytics', '既存の分析画面へ')}</button> : <a href="/">{l('Application sign in', 'アプリにログイン')}</a>}</div>
    </header>
    <aside className="ops-notice">{l('Demonstration workspace · 2 fictional customers / 24 SKUs / 4 suppliers. No live customer data. Updates stay in this browser; no supplier messages or commercial actions are sent.', 'デモ専用ワークスペース：架空の2社・24 SKU・4仕入先。実顧客データは含みません。変更はこのブラウザにのみ保存され、外部への送信や発注は行いません。')}</aside>
    {storageError && <p role="alert">{l('Browser storage is unavailable. Changes will be lost on reload.', 'ブラウザ保存を利用できません。再読み込みすると変更が失われます。')}</p>}
    <nav className="ops-tabs" aria-label={l('Operations pages','運用ページ')}>{VIEWS.map(view => <button key={view} aria-current={page === view ? 'page' : undefined} onClick={() => go(view)}>{names[view]}{view === 'exceptions' && <span>{rows.filter(isActive).length}</span>}</button>)}</nav>
    <div className="ops-heading"><div><p className="ops-eyebrow">{l('OPERATIONS WORKSPACE', '運用ワークスペース')}</p><h1>{names[page]}</h1><p>{page === 'today' ? l('Know what needs attention. Decide what happens next.', '対応が必要な項目を把握し、次の一手を決める。') : l('One queue for supply risks, follow-ups and customer decisions.', '供給リスク・フォローアップ・顧客判断をひとつのキューに。')}</p></div><div className="ops-asof">{l('Demo data timestamp','デモデータの基準日時')}<br/><strong>{date(data.asOf)}</strong></div></div>
    {guided && page==='today' && <aside className="ops-first-value"><p>{l('Open the highest-priority exception to see why it matters and the recommended next action.','優先度の高い例外を開き、影響と推奨する次の対応を確認してください。')}</p>{queue.length>0?<button onClick={()=>setSelectedId(queue[0].id)}>{l('Open highest-priority exception','優先度の高い例外を開く')}</button>:<p>{l('No open exceptions match this view. Clear the filters or explore the Exception Inbox.','この表示に該当する未解決の例外はありません。絞り込みを解除するか、例外受信箱をご覧ください。')}</p>}</aside>}
    {page === 'today' && <div className="ops-metrics">{[
      ['openActions','Open Actions','未完了アクション'], ['atRiskPOs','At-Risk POs','リスクのあるPO'], ['stockoutRisks','Stockout Risks','欠品リスク'], ['supplierUpdates','Supplier Updates','24時間内の仕入先更新'], ['decisionsNeeded','Decisions Needed','判断待ち'], ['lateInbound','Late Inbound','入荷遅延'], ['criticalExceptions','Critical Exceptions','緊急例外'],
    ].map(([key,en,ja]) => <article key={key} className={key === 'criticalExceptions' ? 'ops-metric critical' : 'ops-metric'}><p>{l(en,ja)}</p><strong>{metrics[key]}</strong><small>{l('Synthetic · selected customer scope','架空データ・選択顧客の範囲')}</small></article>)}</div>}
    {!['today','exceptions'].includes(page) && <><div className="ops-scope"><label>{l('Customer','顧客')}<select aria-label={l('Customer','顧客')} value={filters.customerId || ''} onChange={e => setFilter('customerId',e.target.value)}><option value="">{l('All','すべて')}</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><WorkflowScreens key={page + (filters.customerId || '')} page={page} snapshot={snapshot} mutate={mutate} customerId={filters.customerId || ''} focusedActionId={focusedActionId} openException={setSelectedId} l={l} date={date}/></>}
    {['today','exceptions'].includes(page) && <div className="ops-queue">
      <div className="ops-queue-heading"><h2>{page === 'today' ? l('Prioritized operational queue','優先対応キュー') : l('All exceptions','すべての例外')}</h2><span role="status">{queue.length} {l('items','件')}</span></div>
      <div className="ops-filters">
        {[
          ['customerId',l('Customer','顧客'),data.customers.map(c => [c.id,c.name])],
          ['severity',l('Severity','重要度'),SEVERITIES.map(v => [v,label(v)])],
          ['type',l('Type','種類'),TYPES.map(v => [v,label(v)])],
          ['supplier',l('Supplier','仕入先'),data.suppliers.map(v => [v,v])],
          ['owner',l('Owner','担当者'),[...new Set(rows.map(r => r.owner))].map(v => [v,v])],
          ['status',l('Status','状態'),STATUSES.map(v => [v,label(v)])],
        ].map(([key,title,options]) => <label key={key}>{title}<select aria-label={title} value={filters[key] || ''} onChange={e => setFilter(key,e.target.value)}><option value="">{l('All','すべて')}</option>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        <label>{l('Due on or before (UTC)','期限（UTC・指定日まで）')}<input aria-label={l('Due on or before (UTC)','期限（UTC・指定日まで）')} type="date" value={filters.dueDate || ''} onChange={e => setFilter('dueDate',e.target.value)}/></label><button onClick={() => setFilters({})}>{l('Clear filters','絞り込み解除')}</button>
      </div>
      {page === 'today' && <p className="ops-hint">{l('Resolved and snoozed exceptions are excluded. Ordered by severity, days to impact, then due date. Cards follow customer scope; other filters apply to the queue.', '解決済み・保留は除外。重要度 → 影響までの日数 → 期限で表示。カードは顧客範囲を反映し、他の絞り込みはキューに適用します。')}</p>}
      <div className="ops-table-wrap"><table><caption className="ops-sr">{l('Operational exceptions','運用上の例外一覧')}</caption><thead><tr>{['Customer','Severity','Type','SKU / PO','Supplier','Issue','Days to Impact','Business Impact','Last Updated','Owner','Recommended Next Action','Status'].map((en,i) => <th key={en}>{l(en,['顧客','重要度','種類','SKU / PO','仕入先','問題','影響までの日数','事業への影響','最終更新','担当者','推奨する次の対応','状態'][i])}</th>)}</tr></thead><tbody>{queue.map(row => <tr key={row.id}>
        <td>{row.customer}</td><td><span className={`ops-severity ${row.severity.toLowerCase()}`}>{label(row.severity)}</span></td><td><button className="ops-row-link" onClick={() => setSelectedId(row.id)}>{label(row.type)}</button></td><td>{row.skuId}{row.poId && <small>{row.poId}</small>}</td><td>{row.supplier}</td><td>{row.issue}</td><td>{row.daysToImpact ?? '—'}</td><td>{row.impact}</td><td>{date(row.updatedAt)}</td><td>{row.owner}</td><td>{row.nextAction}</td><td>{label(row.status)}</td>
      </tr>)}</tbody></table></div>
      {!queue.length && <div className="ops-empty"><h3>{l('No matching exceptions','該当する例外はありません')}</h3><p>{l('Adjust filters or open the inbox to include resolved and snoozed items.', '絞り込みを変更するか、例外受信箱で解決済み・保留を含めて確認してください。')}</p></div>}
    </div>}
    <footer className="ops-footer"><p>{customerFacing ? l('Explore risks, next actions and follow-ups using sample data.','サンプルデータでリスク・次の対応・フォローアップを確認できます。') : l('Phase 2 · Exceptions → Actions → Customer decisions → Supplier follow-up → Weekly reporting. All records are synthetic and browser-local.', '第2段階：例外 → アクション → 顧客判断 → 仕入先フォロー → 週次レポート。架空データのみをブラウザ内で管理します。')}</p><p>{customerFacing ? l('Your live inventory, orders and suppliers are not connected to this demo.','このデモには実際の在庫・発注・仕入先のデータは接続されていません。') : <>{l('Demo notes and rule explanations are in English.','架空データの説明文・検知理由は英語です。')} · NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED</>}</p></footer>
    {!onEvent && <AnalyticsConsent/>}
    {selected && <ExceptionDetail key={selected.id} row={selected} snapshot={snapshot} mutate={mutate} openAction={id => { setSelectedId(null); setFocusedActionId(id); go('actions') }} save={save} close={() => setSelectedId(null)} l={l} label={label} date={date}/>}
  </section>
}
function ExceptionDetail({ row, snapshot, mutate, openAction, save, close, l, label, date }) {
  const ref = useRef(null)
  const [status, setStatus] = useState(row.status)
  const [owner, setOwner] = useState(row.owner)
  const [dueDate, setDueDate] = useState(row.dueDate.slice(0,10))
  const [message, setMessage] = useState('')
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  function submit(e) {
    e.preventDefault()
    try { save(updateException(row, { status, owner, dueDate }, 'Demo operator')); setMessage(l('Saved to this browser only.', 'このブラウザにのみ保存しました。')) } catch (error) { setMessage(error.message) }
  }
  return <dialog className="ops-detail" ref={ref} onCancel={e => { e.preventDefault(); close() }} aria-labelledby="ops-detail-title">
    <div className="ops-detail-header"><div><p>{row.customer}</p><h2 id="ops-detail-title">{label(row.type)}</h2></div><button onClick={close} aria-label={l('Close detail','詳細を閉じる')}>✕</button></div>
    <span className={`ops-severity ${row.severity.toLowerCase()}`}>{label(row.severity)}</span>
    <dl>{[[l('What happened','発生したこと'),row.issue], [l('Why generated','検知理由'),row.reason], [l('Data timestamp','データ基準日時'),date(row.dataTimestamp)], [l('Potential impact','想定される影響'),row.impact], [l('Recommended next action','推奨する次の対応'),row.nextAction], ['SKU / PO',`${row.skuId}${row.poId ? ' / ' + row.poId : ''}`]].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <details><summary>{l('Underlying demo data','根拠となる架空データ')}</summary><pre>{JSON.stringify(row.underlying,null,2)}</pre></details>
    <p className="ops-hint">{l('Synthetic SKUs have no matching real inventory record. Existing analytics remain available from the application navigation.', '架空SKUに対応する実在庫レコードはありません。既存の分析機能はアプリのナビゲーションから利用できます。')}</p>
    <form onSubmit={submit}><h3>{l('Review & assign','確認・担当割当')}</h3><label>{l('Owner','担当者')}<input aria-label={l('Owner','担当者')} required maxLength={80} value={owner} onChange={e => setOwner(e.target.value)}/></label><label>{l('Due date (UTC)','期限（UTC）')}<input aria-label={l('Due date (UTC)','期限（UTC）')} type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><label>{l('Status','状態')}<select aria-label={l('Status','状態')} value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label><p className="ops-hint">{l('Status changes are demo annotations, not customer approvals or executed actions.', '状態変更はデモ用の記録です。顧客承認や実行済みの処理を意味しません。')}</p><button className="ops-primary" type="submit">{l('Save review','確認内容を保存')}</button><p role="status">{message}</p></form>
    <ExceptionActions row={row} snapshot={snapshot} mutate={mutate} openAction={openAction} l={l}/>
    <h3>{l('Activity history','活動履歴')}</h3><ol className="ops-history">{row.history.map((event,i) => <li key={i}><time>{date(event.at)}</time><strong>{event.actor}</strong><p>{event.text}</p></li>)}</ol>
  </dialog>
}
