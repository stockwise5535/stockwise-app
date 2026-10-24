import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth } from '../AuthContext.jsx'
import { supabase } from '../supabase.js'
import LoginPage from '../components/LoginPage.jsx'
import OperationsWorkspace from '../operations/OperationsWorkspace.jsx'
import { bookingUrl, conversion, createGrowthService, csvExport, MARKETS, qualifiedExport } from './service.js'
import { capture, analyticsConsent, setAnalyticsConsent } from './analytics.js'
import OutboundReview from './OutboundReview.jsx'
import AnalyticsConsent from './AnalyticsConsent.jsx'
import './growth.css'

export default function GrowthApplication() { return <AuthProvider><GrowthAuth/></AuthProvider> }
function GrowthAuth() {
 const {user,loading}=useAuth()
 const [lang,setLang]=useState('en')
 if(loading)return <main className="growth"><p>Restoring your session…</p></main>
 if(!user)return <><LoginPage lang={lang} setLang={setLang} campaign initialMode={location.pathname==='/signup'?'signup':'login'}/><AnalyticsConsent/></>
 return <GrowthWorkspace key={user.id} user={user}/>
}
function GrowthWorkspace({user}) {
 const {signOut}=useAuth()
 const api=useMemo(()=>createGrowthService(supabase),[])
 const [workspaces,setWorkspaces]=useState([]),[selected,setSelected]=useState(''),[profile,setProfile]=useState(null),[memberships,setMemberships]=useState([])
 const [activation,setActivation]=useState(null),[leads,setLeads]=useState([]),[qualifications,setQualifications]=useState([])
 const [page,setPage]=useState(new URLSearchParams(location.search).get('view') || (location.pathname==='/invite'?'referrals':'product')),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(true),[ready,setReady]=useState(false)
 const [metrics,setMetrics]=useState(null),[invite,setInvite]=useState('')
 const [analyticsAllowed,setAnalyticsAllowed]=useState(analyticsConsent)
 const [name,setName]=useState(''),[market,setMarket]=useState('SG'),[marketing,setMarketing]=useState(false)
 const requestId=useRef(crypto.randomUUID()),scope=useRef(0)
 const selectedRef=useRef(selected);selectedRef.current=selected
 const workspace=workspaces.find(w=>w.id===selected)
 const role=memberships.find(m=>m.workspace_id===selected && m.user_id===user.id)?.role
 const canManage=['owner','admin','operator'].includes(role)
 useEffect(()=>{
  let active=true
  async function load(){
   try {
    const first=await api.bootstrap()
    const [ws,p,ms]=await Promise.all([api.workspaces(),api.profile(),api.memberships()])
    if(active){setWorkspaces(ws);setProfile(p);setMarketing(p.marketing_opt_in);setMemberships(ms);setSelected(first);setReady(true)}
   } catch(e){if(active)setError(`Backend setup required: ${e.message}`)} finally {if(active)setBusy(false)}
  }
  void load();return()=>{active=false}
 },[api])
 const reloadScope=useCallback(async(id)=>{
   if(id!==selectedRef.current)return
   const revision=++scope.current
   const [a,l,q]=await Promise.all([api.activation(id),api.leads(id),api.qualifications(id)])
   if(revision===scope.current && id===selectedRef.current){setActivation(a.find(r=>r.user_id===user.id) || null);setLeads(l);setQualifications(q)}
 },[api,user.id])
 useEffect(()=>{
  setActivation(null);setLeads([]);setQualifications([]);setInvite('');setError('');setNotice('')
  if(selected)void reloadScope(selected).catch(e=>setError(e.message))
  return()=>{scope.current++}
 },[selected,reloadScope])
 const seen=useRef(new Set())
 useEffect(()=>{if(activation?.activated_at && !seen.current.has('activation:'+selected)){seen.current.add('activation:'+selected);void capture('activation_completed',{workspace_type:workspace?.workspace_type || 'demo'},{distinctId:user.id})}},[activation,selected,workspace,user.id])
 const onEvent=useCallback((event,props={})=>{
   if(!workspace)return
   const signature=`${workspace.id}:${event}`
   if(seen.current.has(signature))return
   seen.current.add(signature)
   const properties={locale:workspace.locale,market:workspace.market,workspace_type:workspace.workspace_type,data_mode:workspace.workspace_type==='demo'?'synthetic':'customer',...props}
   void capture(event,properties,{distinctId:user.id})
   void api.track(event,workspace.id,properties).then(()=>reloadScope(workspace.id)).catch(e=>{seen.current.delete(signature);setError(`Activity could not be saved: ${e.message}`)})
 },[api,workspace,user.id,reloadScope])
 useEffect(()=>{if(workspace){onEvent('login_completed');if(workspace.workspace_type==='demo')onEvent('demo_workspace_opened')}},[workspace,onEvent])
 async function run(fn){setError('');setNotice('');try{await fn();setNotice('Saved to Supabase.')}catch(e){setError(e.message)}}
 function go(next){setPage(next);history.pushState({},'',`${location.pathname}?view=${next}`)}
 useEffect(()=>{const pop=()=>setPage(new URLSearchParams(location.search).get('view') || (location.pathname==='/invite'?'referrals':'product'));addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop)},[])
 const calendar=bookingUrl(import.meta.env.VITE_BOOKING_URL)
 return <main className="growth"><header><a href="/en" className="growth-brand">NEXOPS</a><span>Free 30-day access · No credit card</span><button onClick={()=>void signOut()}>Sign out</button></header>
  <nav aria-label="Growth workspace pages">{[['product','Product'],['activation','Get started'],['consultation','Book a Consultation'],['leads','Consultation requests'],['referrals','Invite a colleague'],['account','Account'],['dashboard','Internal Growth Dashboard'],['communications','Outbound Review']].map(([id,label])=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>{if(id==='consultation')onEvent('consultation_clicked');go(id)}}>{label}</button>)}<a href="/">Existing StockWise analytics</a></nav>
  {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p>Preparing your workspace…</p>}
  {ready && <><label>Workspace<select aria-label="Workspace" value={selected} onChange={e=>setSelected(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name} ({w.workspace_type})</option>)}</select></label><p className="growth-muted">Role: {role || 'Loading'} · Trial ends: {profile?.trial_end_date?.slice(0,10)} · No payment wall is enabled.</p>
   {page==='product' && (workspace?.workspace_type==='demo' ? <OperationsWorkspace lang={workspace.locale} onEvent={onEvent} onLegacy={()=>{location.href='/'}}/> : <section className="growth-card"><h1>Customer workspace foundation</h1><p>This workspace has no operational data. The existing synthetic demo is separate and will never be copied here automatically.</p><p>Customer CSV ingestion needs a dedicated validation and import service before these operational screens can use your data.</p><button onClick={()=>setSelected(workspaces.find(w=>w.is_starter)?.id || selected)}>Open my demo workspace</button></section>)}
   {page==='activation' && <section className="growth-card"><h1>Reach first value</h1><ol>{[['demo_opened_at','Open your demo workspace'],['today_viewed_at','View TODAY'],['exception_opened_at','Open an exception'],['first_value_at','Review a recommended action']].map(([key,text])=><li key={key}>{activation?.[key]?'✓':'○'} {text}</li>)}</ol><p>{activation?.activated_at?'Activation completed.':'Explore TODAY and open an exception to see the recommended next action.'}</p><button onClick={()=>go('product')}>Continue to product</button><p>CSV upload and consultation are optional. No upload is needed to explore the demo.</p></section>}
   {page==='consultation' && <section className="growth-card"><h1>Book a Consultation</h1><p>Discuss inventory, PO and supplier workload with Nexops. Submitting records a request; it does not confirm a booking.</p>{calendar && <a href={calendar} target="_blank" rel="noreferrer" onClick={()=>onEvent('consultation_clicked')}>Open Google Calendar appointment schedule</a>}{canManage ? <ConsultationForm key={workspace.id} api={api} workspace={workspace} onSaved={async()=>{await reloadScope(selected);onEvent('consultation_submitted');setNotice('Consultation request saved. A booking is not yet confirmed.')}}/> : <p>A workspace owner or operator can submit a consultation request.</p>}</section>}
   {page==='communications' && <OutboundReview key={selected} api={api} workspaceId={selected}/>}
   {page==='leads' && <section className="growth-card"><h1>Consultation requests</h1><p>Only this workspace’s permitted requests are shown. Qualification is a transparent heuristic, not a guaranteed sales outcome.</p>{leads.map(lead=><article key={lead.id}><h2>{lead.company}</h2><p>{lead.contact_name} · {lead.email} · {lead.market}</p><p>{lead.main_problem}</p><p>{qualifications.find(q=>q.lead_id===lead.id)?.status || 'Not assessed'} · Score {qualifications.find(q=>q.lead_id===lead.id)?.score ?? '—'}</p></article>)}{!leads.length && <p>No requests to show. Viewers cannot read lead contact data.</p>}{canManage && <button onClick={()=>{const records=qualifiedExport(leads,qualifications);if(!records.length){setNotice('No qualified leads to export.');return}const u=URL.createObjectURL(new Blob([csvExport(records)],{type:'text/csv'}));const a=document.createElement('a');a.href=u;a.download='nexops-qualified-leads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}}>Export qualified leads for CRM review</button>}</section>}
   {page==='referrals' && <section className="growth-card"><h1>Invite a colleague</h1><p>Create a single-use viewer invitation, valid for seven days. Anyone with this link can accept it after confirmed sign-in. Share it privately. No invitation email is sent.</p>{['owner','admin'].includes(role) && <button onClick={()=>void run(async()=>{const token=await api.invite(selected);setInvite(`${location.origin}/invite?token=${token}`)})}>Create viewer invitation link</button>}{invite && <label>Private invitation link<input aria-label="Private invitation link" readOnly value={invite}/></label>}<AcceptInvite api={api} onSaved={()=>location.reload()}/></section>}
   {page==='account' && <section className="growth-card"><h1>Account and workspaces</h1><label className="growth-check"><input type="checkbox" checked={analyticsAllowed} onChange={e=>{setAnalyticsAllowed(e.target.checked);setAnalyticsConsent(e.target.checked)}}/>Allow optional product analytics on this browser</label><form onSubmit={e=>{e.preventDefault();void run(async()=>{await api.preferences(marketing,profile.locale);setProfile({...profile,marketing_opt_in:marketing})})}}><label className="growth-check"><input type="checkbox" checked={marketing} onChange={e=>setMarketing(e.target.checked)}/>Send optional activation, product and consultation reminders. I can opt out here at any time.</label><button>Save communication preferences</button></form><h2>Create a separate customer workspace</h2><form onSubmit={e=>{e.preventDefault();void run(async()=>{const id=await api.createWorkspace({name,market,locale:'en'},requestId.current);setWorkspaces(await api.workspaces());setMemberships(await api.memberships());setSelected(id);requestId.current=crypto.randomUUID();setName('')})}}><label>Company / workspace name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>APAC market<select value={market} onChange={e=>setMarket(e.target.value)}>{MARKETS.map(m=><option key={m}>{m}</option>)}</select></label><button>Create empty customer workspace</button></form><button onClick={()=>void run(()=>api.deletion())}>Request account and data deletion</button><p>Deletion requests require a manual administrator workflow; requesting does not claim deletion is complete. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></section>}
   {page==='dashboard' && <section className="growth-card"><h1>Internal Growth Dashboard</h1><p>Requires a server-assigned growth administrator. No customer can grant this role from the browser.</p><button onClick={()=>void run(async()=>setMetrics(await api.metrics()))}>Load authorized metrics</button>{metrics && <><dl>{Object.entries(metrics).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{value ?? 'Not connected'}</dd></div>)}</dl><p>Visitor → Signup: {conversion(metrics.registered_users,metrics.visitors) ?? 'Unavailable'} · Signup → Activated: {conversion(metrics.activated_users,metrics.registered_users) ?? 'Unavailable'}% · Activated → CSV: {conversion(metrics.activated_csv_users,metrics.activated_users) ?? 'Unavailable'}% · Activated → Consultation: {conversion(metrics.activated_consultation_users,metrics.activated_users) ?? 'Unavailable'}%.</p></>}</section>}
  </>}<AnalyticsConsent/><footer><a href="/privacy">Privacy notice</a> · <a href="/terms">Terms</a> · <a href="/demo/operations">Public synthetic demo</a></footer>
 </main>
}
function ConsultationForm({api,workspace,onSaved}) {
 const [fields,setFields]=useState({company:'',contact_name:'',email:'',role:'',industry:'',market:workspace.market,company_size:'unspecified',sku_count:'',supplier_count:'',tools:'',main_problem:'',hiring:false,pilot_scope:''})
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
 const request=useRef(crypto.randomUUID())
 return <form onSubmit={async e=>{e.preventDefault();if(busy || saved)return;setBusy(true);setError('');try{await api.consult(workspace.id,fields,request.current);setSaved(true);await onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}}>{[['company','Company'],['contact_name','Contact name'],['email','Contact email'],['role','Role (optional)'],['industry','Industry (optional)'],['tools','ERP / tools (optional)'],['main_problem','Main operational workload / problem'],['pilot_scope','Potential pilot scope (optional)'],['sku_count','Approximate SKU count (optional)'],['supplier_count','Approximate supplier count (optional)']].map(([key,label])=><label key={key}>{label}<input aria-label={label} type={key==='email'?'email':key.endsWith('_count')?'number':'text'} min={0} maxLength={key==='main_problem'?4000:500} required={['company','contact_name','email','main_problem'].includes(key)} value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}<label>Market<select value={fields.market} onChange={e=>setFields({...fields,market:e.target.value})}>{MARKETS.map(m=><option key={m}>{m}</option>)}</select></label><label>Company size (optional)<select value={fields.company_size} onChange={e=>setFields({...fields,company_size:e.target.value})}>{['unspecified','1-10','11-50','51-200','201+'].map(v=><option key={v}>{v}</option>)}</select></label><label className="growth-check"><input type="checkbox" checked={fields.hiring} onChange={e=>setFields({...fields,hiring:e.target.checked})}/>Currently hiring supply-chain staff</label><p>Submitting requests a reply about this consultation. It does not subscribe you to marketing emails.</p>{error && <p role="alert">{error}</p>}<button disabled={busy || saved}>{saved?'Request saved':busy?'Saving…':'Submit consultation request'}</button></form>
}
function AcceptInvite({api,onSaved}) {
 const [token,setToken]=useState(new URLSearchParams(location.search).get('token') || ''),[error,setError]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();try{await api.acceptInvite(token);onSaved()}catch(e){setError(e.message)}}}><label>Invitation token<input required value={token} onChange={e=>setToken(e.target.value)}/></label><button>Accept workspace invitation</button>{error && <p role="alert">{error}</p>}</form>
}
