import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth }    from './AuthContext.jsx'
import { supabase }   from './supabase.js'
import { detectLang, t } from './i18n.js'
import LoginPage      from './components/LoginPage.jsx'
import PricingModal   from './components/PricingModal.jsx'

// ── Plan limits ────────────────────────────────────────────
const FREE_SKU_LIMIT = 2          // 3個目から有料
const BASIC_PRICE    = '$49.99/mo'

// ── Design tokens ──────────────────────────────────────────
const T = {
  font:'Arial,Helvetica,sans-serif', fontNum:"'Courier New',Courier,monospace",
  navy:'#0d1b2a', navyM:'#1b2e42', slate:'#394f66', muted:'#6b7d93', dim:'#a0b0c0',
  border:'#dde3ea', borderL:'#edf0f4', bg:'#f4f6f9', surface:'#fff',
  red:'#c0392b', redBg:'#fdf3f2', redBdr:'#f5c6c3',
  orange:'#c0620b', oBg:'#fdf6ee', oBdr:'#f5d9b8',
  green:'#1a6e3c', gBg:'#f0faf4', gBdr:'#b8e8cc',
  blue:'#1a4fa0', bluBg:'#f0f5ff', bluBdr:'#b8ccf5',
  indigo:'#3730a3',
}
const SC = {
  critical: { t:T.red,    bg:T.redBg, bd:T.redBdr, dot:T.red    },
  warning:  { t:T.orange, bg:T.oBg,   bd:T.oBdr,   dot:T.orange },
  healthy:  { t:T.green,  bg:T.gBg,   bd:T.gBdr,   dot:T.green  },
  overstock:{ t:T.blue,   bg:T.bluBg, bd:T.bluBdr, dot:T.blue   },
  nodata:   { t:T.muted,  bg:'#f9fafb',bd:T.border, dot:T.dim   },
}
const SSN_STATUS_C = {
  booked:    { t:T.indigo,  bg:'#f5f3ff' },
  in_transit:{ t:T.orange,  bg:T.oBg    },
  customs:   { t:'#b45309', bg:'#fffbeb' },
  arrived:   { t:T.green,   bg:T.gBg    },
  cancelled: { t:T.muted,   bg:'#f9fafb'},
}

// ── Business logic ─────────────────────────────────────────
const calcDos = s => s.daily_usage > 0 ? s.stock_qty / s.daily_usage : Infinity
const calcRp  = s => (s.lead_time || 0) * (s.daily_usage || 0)
const calcSs  = s => s.safety_stock || (s.daily_usage || 0) * 3
function getStatus(s) {
  const d = calcDos(s)
  if (d===Infinity) return 'nodata'
  if (d<7)  return 'critical'
  if (d<14) return 'warning'
  if (d>45) return 'overstock'
  return 'healthy'
}

// SSN risk check — returns risk level and reason
function ssnRisk(ssn) {
  const today = new Date()
  const eta   = new Date(ssn.eta_date)
  const daysToEta = Math.ceil((eta - today) / 86400000)
  const conf  = ssn.confidence || 1

  if (ssn.status === 'cancelled') return { level:'cancelled', msg: 'SSN cancelled' }
  if (ssn.status === 'arrived')   return { level:'ok',        msg: 'Arrived' }

  if (daysToEta < 0) {
    return { level:'critical', msg: `ETA overdue by ${Math.abs(daysToEta)}d` }
  }
  if (daysToEta <= 3 && ssn.status === 'booked') {
    return { level:'critical', msg: `ETA in ${daysToEta}d but still Booked — not shipped yet` }
  }
  if (conf < 0.5) {
    return { level:'critical', msg: `Low confidence (${Math.round(conf*100)}%) — high delay risk` }
  }
  if (conf < 0.7) {
    return { level:'warning', msg: `Moderate delay risk (conf ${Math.round(conf*100)}%)` }
  }
  if (daysToEta <= 7 && ssn.status === 'in_transit') {
    return { level:'ok', msg: `Arriving in ${daysToEta}d` }
  }
  return { level:'ok', msg: '' }
}

function buildPipeline(sku, ssns) {
  let stock = sku.stock_qty
  return Array.from({length:12},(_,i)=>{
    const w=i+1
    const dFrom=new Date(Date.now()+i*7*86400000).toISOString().slice(0,10)
    const dTo=new Date(Date.now()+w*7*86400000).toISOString().slice(0,10)
    const inbound=(ssns||[]).filter(n=>n.sku_id===sku.id&&n.eta_date>=dFrom&&n.eta_date<dTo&&n.status!=='cancelled').reduce((s,n)=>s+(n.arrival_qty||n.ship_qty||0),0)
    stock=Math.max(0,stock-(sku.daily_usage||0)*7+inbound)
    const wos=sku.daily_usage>0?stock/(sku.daily_usage*7):99
    return {week:w,date:dTo,proj_stock:Math.round(stock),inbound,wos:Math.round(wos),status:wos<1?'critical':wos<2?'warning':wos<6?'healthy':'overstock'}
  })
}

const fmt=(v,d=0)=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:d})
const fmtC=v=>v==null?'—':`$${Number(v).toFixed(2)}`

// ── Style helpers ───────────────────────────────────────────
const TH=(align='left')=>({padding:'8px 12px',textAlign:align,fontSize:10,fontWeight:700,fontFamily:T.font,color:T.muted,background:T.bg,borderBottom:`2px solid ${T.border}`,whiteSpace:'nowrap',letterSpacing:'0.05em',textTransform:'uppercase'})
const TD=(align='left')=>({padding:'9px 12px',textAlign:align,fontSize:12,fontFamily:T.font,borderBottom:`1px solid ${T.borderL}`,verticalAlign:'middle',color:T.navy})
const TDN=(align='right')=>({...TD(align),fontFamily:T.fontNum})
const LBL={display:'block',fontSize:11,fontWeight:700,fontFamily:T.font,color:T.slate,marginBottom:4,letterSpacing:'0.02em'}
const INP={width:'100%',padding:'8px 10px',borderRadius:3,border:`1px solid ${T.border}`,fontSize:12,marginBottom:12,outline:'none',fontFamily:T.font,color:T.navy}
const ERR={background:T.redBg,border:`1px solid ${T.redBdr}`,borderLeft:`3px solid ${T.red}`,borderRadius:3,padding:'8px 12px',fontSize:12,color:T.red,marginBottom:12,fontFamily:T.font}

// ── Micro components ────────────────────────────────────────
function StatusBadge({status,lang}){
  const m=SC[status]||SC.nodata
  const label=t(`status_${status}`,lang)||status
  return <span style={{display:'inline-block',fontSize:10,fontWeight:700,fontFamily:T.font,padding:'2px 8px',borderRadius:2,letterSpacing:'0.04em',background:m.bg,color:m.t,border:`1px solid ${m.bd}`}}>{label}</span>
}
function SSNBadge({status,lang}){
  const m=SSN_STATUS_C[status]||{}
  const label=t(`ssn_${status}`,lang)||status
  return <span style={{display:'inline-block',fontSize:10,fontWeight:700,fontFamily:T.font,padding:'2px 8px',borderRadius:2,background:m.bg,color:m.t}}>{label}</span>
}
function Dot({status}){
  const m=SC[status]||SC.nodata
  return <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:m.dot,marginRight:8,flexShrink:0}}/>
}
function WOSBar({wos}){
  const p=Math.min(100,(wos/8)*100)
  const c=wos<1?T.red:wos<2?T.orange:wos<4?'#a16207':T.green
  return(<div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:4,background:T.borderL,borderRadius:2,overflow:'hidden'}}><div style={{width:`${p}%`,height:'100%',background:c,borderRadius:2}}/></div><span style={{fontSize:10,color:c,fontFamily:T.fontNum,minWidth:20,textAlign:'right',fontWeight:700}}>{wos}w</span></div>)
}
function ConfBar({value}){
  const p=Math.round((value||0)*100)
  const c=p>=85?T.green:p>=65?T.orange:T.red
  return(<div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:48,height:3,background:T.borderL,borderRadius:2,overflow:'hidden'}}><div style={{width:`${p}%`,height:'100%',background:c}}/></div><span style={{fontSize:10,color:c,fontFamily:T.fontNum}}>{p}%</span></div>)
}

// SSN Risk badge
function RiskBadge({ssn}){
  const r = ssnRisk(ssn)
  if(r.level==='ok') return null
  const style = r.level==='critical'
    ? {background:T.redBg,color:T.red,border:`1px solid ${T.redBdr}`}
    : {background:T.oBg,color:T.orange,border:`1px solid ${T.oBdr}`}
  return(
    <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:2,fontFamily:T.font,...style}}>
      {r.level==='critical'?'⚠':'△'} {r.msg}
    </span>
  )
}

function KPICard2({label,value,accent,sub,icon,children}){
  return(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${accent}`,borderRadius:4,padding:'14px 16px',flex:1,minWidth:130,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:T.muted,fontFamily:T.font,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span><span style={{fontSize:16,opacity:.65}}>{icon}</span></div>
    <div style={{fontSize:26,fontWeight:700,color:T.navy,fontFamily:T.fontNum,letterSpacing:'-0.02em'}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:T.dim,marginTop:3,fontFamily:T.font}}>{sub}</div>}
    {children}
  </div>)
}
function Panel({title,badge,action,children}){
  return(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,overflow:'hidden',marginBottom:16,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
    <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,background:'#f9fafb',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontWeight:700,fontSize:12,fontFamily:T.font,color:T.navy,letterSpacing:'0.02em'}}>{title}</span>
        {badge>0&&<span style={{background:T.red,color:'#fff',fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:2,fontFamily:T.font}}>{badge}</span>}
      </div>
      {action}
    </div>
    {children}
  </div>)
}
function Modal({title,onClose,children}){
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}} onClick={onClose}>
    <div style={{background:T.surface,borderRadius:4,padding:'24px 22px',width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.18)',border:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>
        <span style={{fontWeight:700,fontSize:14,fontFamily:T.font,color:T.navy}}>{title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:T.muted}}>✕</button>
      </div>
      {children}
    </div>
  </div>)
}
function Fld({label,type='text',value,onChange,placeholder,min,step,required}){
  return(<div><label style={LBL}>{label}{required&&<span style={{color:T.red}}> *</span>}</label><input style={INP} type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step}/></div>)
}
function Btn({children,onClick,variant='primary',disabled,small,style:extra}){
  const pad=small?'4px 10px':'7px 14px',sz=small?10:11
  const v={primary:{background:T.navy,color:'#fff',border:'none'},ghost:{background:T.surface,color:T.navy,border:`1px solid ${T.border}`},danger:{background:T.redBg,color:T.red,border:`1px solid ${T.redBdr}`},blue:{background:T.bluBg,color:T.blue,border:`1px solid ${T.bluBdr}`},green:{background:T.gBg,color:T.green,border:`1px solid ${T.gBdr}`}}
  return(<button onClick={onClick} disabled={disabled} style={{padding:pad,borderRadius:3,cursor:disabled?'not-allowed':'pointer',fontSize:sz,fontWeight:700,fontFamily:T.font,transition:'opacity .12s',opacity:disabled?.5:1,letterSpacing:'0.02em',...v[variant],...extra}}>{children}</button>)
}

// SKU limit upgrade wall
function SkuLimitBanner({lang, onUpgrade, current}){
  const F = T.font
  return(
    <div style={{background:'#fffbeb',border:`1px solid #fde68a`,borderLeft:`4px solid #f59e0b`,borderRadius:4,padding:'16px 20px',marginBottom:16,fontFamily:F}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:'#92400e',marginBottom:4}}>
            🔒 {lang==='ja'?`SKU上限に達しました (${current}/${FREE_SKU_LIMIT}件)`:`SKU limit reached (${current}/${FREE_SKU_LIMIT})`}
          </div>
          <div style={{fontSize:12,color:'#b45309'}}>
            {lang==='ja'
              ? `無料プランは${FREE_SKU_LIMIT}件まで。4件目以降を追加するには有料プランにアップグレードしてください。`
              : `Free plan allows up to ${FREE_SKU_LIMIT} SKUs. Upgrade to add more.`}
          </div>
        </div>
        <button onClick={onUpgrade} style={{padding:'8px 18px',borderRadius:3,border:'none',background:'#f59e0b',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F,whiteSpace:'nowrap'}}>
          {lang==='ja'?`有料プランへ — ${BASIC_PRICE}`:`Upgrade — ${BASIC_PRICE}`}
        </button>
      </div>
    </div>
  )
}

function downloadSkuTemplate(){
  const hdr='name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier'
  const rows=[
    'Wireless Earbuds Pro,Earbuds,Supplier A Model A,420,62,18,186,200,28.50,Supplier-A',
    'Gaming Mouse RGB,Input Devices,Supplier B Model B,85,98,14,294,500,12.80,Supplier-B',
    'USB-C Hub 12-Port,Hubs,,1840,45,21,135,300,19.20,Supplier-C',
  ]
  const blob=new Blob([[hdr,...rows].join('\n')],{type:'text/csv'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download='sku_import_template.csv';a.click()
  URL.revokeObjectURL(url)
}

function downloadSSNTemplate(){
  const hdr='ssn_id,superset,subset,supplier,ship_qty,arrival_qty,ship_date,eta_date,status,confidence,vessel,bl_number,origin_port,dest_port'
  const rows=[
    'SSN-2026-001,Earbuds,Supplier A Model A,Supplier-A,500,500,2026-05-01,2026-05-15,booked,0.85,EVER GRACE,BL240501,Shenzhen,Los Angeles',
    'SSN-2026-002,Earbuds,Supplier B Model B,Supplier-B,300,300,2026-05-05,2026-05-20,in_transit,0.70,MSC OSCAR,BL240505,Taipei,Long Beach',
  ]
  const blob=new Blob([[hdr,...rows].join('\n')],{type:'text/csv'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download='ssn_template.csv';a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App(){
  const {user,loading:authLoading,signOut}=useAuth()
  const [lang,setLang]=useState(()=>detectLang())
  const L=key=>t(key,lang)

  const [plan,setPlan]=useState('free')   // 'free'|'basic'|'pro'
  const [tab,setTab]=useState('dashboard')
  const [skus,setSkus]=useState([])
  const [ssns,setSsns]=useState([])
  const [selSku,setSelSku]=useState(null)
  const [showPricing,setShowPricing]=useState(false)

  const [skuModal,setSkuModal]=useState(false)
  const [ssnModal,setSsnModal]=useState(false)
  const [saving,setSaving]=useState(false)
  const [err,setErr]=useState(null)

  const BSKU={name:'',superset:'',subset:'',category:'',supplier:'',stock_qty:'',daily_usage:'',lead_time:'',safety_stock:'',moq:'',unit_cost:''}
  const BSSN={sku_id:'',superset:'',subset:'',supplier:'',ship_qty:'',arrival_qty:'',ship_date:'',eta_date:'',status:'booked',confidence:'0.7',vessel:'',bl_number:'',origin_port:'',dest_port:''}

  const [sf,setSf]=useState(BSKU)
  const [snf,setSnf]=useState(BSSN)

  const csvRef=useRef(null)

  const isFree  = plan==='free'
  const isBasic = plan==='basic'
  const isPro   = plan==='pro'
  const isPaid  = isBasic||isPro
  const skuLimitReached = isFree && skus.length>=FREE_SKU_LIMIT

  useEffect(()=>{if(user)fetchAll()},[user])

  async function fetchAll(){
    const [{data:s},{data:n},{data:sub}]=await Promise.all([
      supabase.from('skus').select('*').order('superset,subset,name'),
      supabase.from('ssns').select('*, skus(name,superset,subset)').order('eta_date'),
      supabase.from('subscriptions').select('plan,status').eq('user_id',user.id).single(),
    ])
    setSkus(s||[])
    setSsns(n||[])
    if(sub?.plan)setPlan(sub.plan)
  }

  // ── SKU CRUD ──────────────────────────────────────────────
  async function saveSku(){
    setErr(null);setSaving(true)
    try{
      // Check limit on new add
      if(skuModal==='add' && isFree && skus.length>=FREE_SKU_LIMIT){
        throw new Error(lang==='ja'?`無料プランはSKU${FREE_SKU_LIMIT}件まです。アップグレードしてください。`:`Free plan limit is ${FREE_SKU_LIMIT} SKUs. Please upgrade.`)
      }
      const p={user_id:user.id,name:sf.name.trim(),superset:sf.superset.trim()||null,subset:sf.subset.trim()||null,category:sf.category||null,supplier:sf.supplier||null,stock_qty:+sf.stock_qty,daily_usage:+sf.daily_usage,lead_time:+sf.lead_time,safety_stock:sf.safety_stock?+sf.safety_stock:null,moq:sf.moq?+sf.moq:null,unit_cost:sf.unit_cost?+sf.unit_cost:null}
      if(!p.name)throw new Error(L('err_sku_name'))
      const{error:e}=skuModal==='add'?await supabase.from('skus').insert(p):await supabase.from('skus').update(p).eq('id',skuModal.id)
      if(e)throw e
      await fetchAll();setSkuModal(false)
    }catch(e){setErr(e.message)}finally{setSaving(false)}
  }
  async function deleteSku(id){
    if(!confirm(L('confirm_delete_sku')))return
    await supabase.from('ssns').delete().eq('sku_id',id)
    await supabase.from('skus').delete().eq('id',id)
    await fetchAll()
  }
  function handleSkuCSV(e){
    if(isFree){setShowPricing(true);e.target.value='';return}
    const file=e.target.files[0];if(!file)return
    const reader=new FileReader()
    reader.onload=async ev=>{
      const rows=ev.target.result.trim().split('\n').slice(1).map(l=>{
        const[name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier]=l.split(',')
        return{user_id:user.id,name:(name||'').trim(),superset:(superset||'').trim()||null,subset:(subset||'').trim()||null,stock_qty:+stock_qty||0,daily_usage:+daily_usage||0,lead_time:+lead_time||7,safety_stock:safety_stock?+safety_stock:null,moq:moq?+moq:null,unit_cost:unit_cost?+unit_cost:null,supplier:(supplier||'').trim()||null}
      }).filter(r=>r.name)
      if(!rows.length){alert(L('csv_no_rows'));return}
      const{error}=await supabase.from('skus').upsert(rows,{onConflict:'user_id,name'})
      error?alert(L('csv_error')+error.message):(alert(rows.length+L('csv_success')),fetchAll())
      e.target.value=''
    }
    reader.readAsText(file)
  }

  // ── SSN CRUD ──────────────────────────────────────────────
  async function saveSsn(){
    setErr(null);setSaving(true)
    try{
      const p={user_id:user.id,sku_id:snf.sku_id,superset:snf.superset||null,subset:snf.subset||null,supplier:snf.supplier||null,ship_qty:+snf.ship_qty||0,arrival_qty:+snf.arrival_qty||+snf.ship_qty||0,ship_date:snf.ship_date||null,eta_date:snf.eta_date,status:snf.status,confidence:+snf.confidence||0.7,vessel:snf.vessel||null,bl_number:snf.bl_number||null,origin_port:snf.origin_port||null,dest_port:snf.dest_port||null}
      if(!p.sku_id||!p.eta_date)throw new Error(L('err_ssn_req'))
      const{error:e}=ssnModal==='add'?await supabase.from('ssns').insert(p):await supabase.from('ssns').update(p).eq('id',ssnModal.id)
      if(e)throw e
      await fetchAll();setSsnModal(false)
    }catch(e){setErr(e.message)}finally{setSaving(false)}
  }

  // ── Derived ───────────────────────────────────────────────
  const alertSkus  = skus.filter(s=>getStatus(s)==='critical')
  const expiredSkus= skus.filter(s=>calcDos(s)<=0 && s.daily_usage>0)   // 期限切れ (stock = 0)
  const reorderNow = skus.filter(s=>s.stock_qty<calcRp(s))
  const overstock  = skus.filter(s=>getStatus(s)==='overstock')
  const inTransit  = ssns.filter(n=>n.status==='in_transit'||n.status==='customs').reduce((a,n)=>a+(n.arrival_qty||n.ship_qty||0),0)
  const pipeline   = useMemo(()=>selSku?buildPipeline(selSku,ssns):[],[selSku,ssns])
  const supersets  = [...new Set(skus.map(s=>s.superset).filter(Boolean))]
  const noSuperset = skus.filter(s=>!s.superset)

  // Today's new alerts (simulated: critical status skus)
  const todayAlerts = alertSkus

  // SSN risks
  const ssnRisks = ssns.filter(n=>ssnRisk(n).level!=='ok'&&ssnRisk(n).level!=='cancelled')

  if(authLoading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:T.muted,fontFamily:T.font}}>{L('loading')}</div>
  if(!user)return<LoginPage lang={lang} setLang={setLang}/>

  const TabBtn=({id,label,badge})=>(
    <button onClick={()=>setTab(id)} style={{padding:'11px 20px',border:'none',background:'transparent',cursor:'pointer',fontFamily:T.font,fontSize:12,fontWeight:tab===id?700:400,color:tab===id?T.navy:T.muted,letterSpacing:'0.02em',borderBottom:tab===id?`2px solid ${T.navy}`:'2px solid transparent',marginBottom:-2,transition:'all .12s',display:'flex',alignItems:'center',gap:6}}>
      {label}
      {badge>0&&<span style={{background:T.red,color:'#fff',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:2}}>{badge}</span>}
    </button>
  )

  const SkuRow=({s})=>{
    const gap=s.stock_qty-calcRp(s),d=calcDos(s)
    return(<div style={{display:'grid',gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto',alignItems:'center',borderBottom:`1px solid ${T.borderL}`,background:SC[getStatus(s)]?.bg+'44'}}>
      <div style={{padding:'8px 16px',fontWeight:600,fontSize:12,color:T.navy,display:'flex',alignItems:'center'}}><Dot status={getStatus(s)}/>{s.name}{s.supplier&&<span style={{marginLeft:8,fontSize:10,color:T.muted}}>{s.supplier}</span>}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12}}>{fmt(s.stock_qty)}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,color:T.muted}}>{s.daily_usage}{lang==='ja'?'/日':'/d'}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,color:T.indigo}}>{s.lead_time}d</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,fontWeight:700,color:SC[getStatus(s)]?.t}}>{d===Infinity?'∞':d.toFixed(1)}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12}}>{fmt(calcRp(s))}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,fontWeight:700,color:gap<0?T.red:T.green}}>{gap>=0?'+':''}{fmt(gap)}</div>
      <div style={{padding:'8px 10px'}}><StatusBadge status={getStatus(s)} lang={lang}/></div>
      <div style={{padding:'8px 10px',display:'flex',gap:4}}>
        <Btn variant="blue" small onClick={()=>{setSelSku(s);setTab('lt_pipeline')}}>LT</Btn>
        <Btn variant="ghost" small onClick={()=>{setSf({name:s.name,superset:s.superset||'',subset:s.subset||'',category:s.category||'',supplier:s.supplier||'',stock_qty:s.stock_qty,daily_usage:s.daily_usage,lead_time:s.lead_time,safety_stock:s.safety_stock||'',moq:s.moq||'',unit_cost:s.unit_cost||''});setErr(null);setSkuModal(s)}}>{L('edit')}</Btn>
        <Btn variant="danger" small onClick={()=>deleteSku(s.id)}>{L('delete')}</Btn>
      </div>
    </div>)
  }

  // ════════════════════════════════════════════════════════
  return(<div style={{minHeight:'100vh',background:T.bg,fontFamily:T.font,color:T.navy}}>

    {/* NAV */}
    <nav style={{background:T.navy,height:52,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:28,height:28,background:'#2563eb',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',fontFamily:T.font}}>S</div>
        <span style={{color:'#fff',fontWeight:700,fontSize:15,fontFamily:T.font,letterSpacing:'0.04em'}}>StockWise</span>
        {isPaid&&<span style={{background:'#2563eb',color:'#fff',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:2,letterSpacing:'0.06em',fontFamily:T.font}}>{isPro?'PRO':'BASIC'}</span>}
        {isFree&&<span style={{background:'#334155',color:'#94a3b8',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:2,letterSpacing:'0.06em',fontFamily:T.font}}>FREE ({skus.length}/{FREE_SKU_LIMIT} SKUs)</span>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {!isPro&&<Btn onClick={()=>setShowPricing(true)} style={{background:'#2563eb',color:'#fff',border:'none',padding:'5px 14px',fontSize:11}}>{isFree?`Upgrade — ${BASIC_PRICE}`:L('upgrade')}</Btn>}
        <button onClick={()=>setLang(l=>l==='ja'?'en':'ja')} style={{padding:'4px 10px',borderRadius:3,border:'1px solid #334155',background:'#1e293b',color:'#93c5fd',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:T.font}}>
          {L('lang_switch')} | {L('lang_label')}
        </button>
        <span style={{fontSize:11,color:'#93c5fd',fontFamily:T.font,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</span>
        <Btn onClick={signOut} style={{background:T.navyM,color:T.dim,border:`1px solid ${T.navyM}`,padding:'5px 12px',fontSize:11}}>{L('logout')}</Btn>
      </div>
    </nav>

    <div style={{maxWidth:1280,margin:'0 auto',padding:'20px'}}>

      {/* TABS — SSN & Movements removed */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:`2px solid ${T.border}`,background:T.surface,borderRadius:'4px 4px 0 0',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <TabBtn id="dashboard"   label={L('tab_dashboard')}   badge={todayAlerts.length}/>
        <TabBtn id="inventory"   label={L('tab_inventory')}/>
        <TabBtn id="lt_pipeline" label={L('tab_lt_pipeline')} badge={ssnRisks.length}/>
      </div>

      {/* ════ DASHBOARD ════ */}
      {tab==='dashboard'&&(<>

        {/* 2-KPI row: アラート(7日以内) + 期限切れ  */}
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>

          {/* アラート (7日以内) — SKU名リスト付き */}
          <KPICard2 label={lang==='ja'?'アラート (7日以内) 商品件数':'Alert: SKUs < 7 Days'} value={alertSkus.length} accent={T.red} icon="⚠">
            {alertSkus.length>0&&(
              <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                {alertSkus.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:T.redBg,border:`1px solid ${T.redBdr}`,borderRadius:3,padding:'3px 8px'}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.red,fontFamily:T.font}}>{s.name}</span>
                    <span style={{fontSize:10,color:T.red,fontFamily:T.fontNum}}>{calcDos(s).toFixed(1)}{lang==='ja'?'日':'d'}</span>
                  </div>
                ))}
              </div>
            )}
            {alertSkus.length===0&&<div style={{fontSize:10,color:T.dim,marginTop:6,fontFamily:T.font}}>{L('kpi_none')}</div>}
          </KPICard2>

          {/* 期限切れ */}
          <KPICard2 label={lang==='ja'?'期限切れ (在庫ゼロ)':'Expired (Zero Stock)'} value={expiredSkus.length} accent={T.orange} icon="✕">
            {expiredSkus.length>0&&(
              <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:3}}>
                {expiredSkus.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:T.oBg,border:`1px solid ${T.oBdr}`,borderRadius:3,padding:'3px 8px'}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.orange,fontFamily:T.font}}>{s.name}</span>
                    <span style={{fontSize:10,color:T.orange,fontFamily:T.font,fontWeight:700}}>{lang==='ja'?'在庫ゼロ':'STOCKOUT'}</span>
                  </div>
                ))}
              </div>
            )}
            {expiredSkus.length===0&&<div style={{fontSize:10,color:T.dim,marginTop:6,fontFamily:T.font}}>{L('kpi_none')}</div>}
          </KPICard2>

          {/* 輸送中 */}
          <KPICard2 label={lang==='ja'?'輸送中 (SSN)':'In Transit (SSN)'} value={fmt(inTransit)} accent="#a16207" icon="🚢">
            <div style={{fontSize:10,color:T.dim,marginTop:4,fontFamily:T.font}}>{ssns.filter(n=>['in_transit','customs'].includes(n.status)).length} {lang==='ja'?'件のSSN':'active SSNs'}</div>
          </KPICard2>

          {/* 過剰在庫 */}
          <KPICard2 label={lang==='ja'?'過剰在庫 (45日超)':'Overstock (>45d)'} value={overstock.length} accent={T.blue} icon="▲">
            <div style={{fontSize:10,color:T.dim,marginTop:4,fontFamily:T.font}}>{lang==='ja'?'在庫過多':'Excess inventory'}</div>
          </KPICard2>
        </div>

        {/* Today's alert banner — 今日時点でアラートになったSKU */}
        {todayAlerts.length>0&&(
          <div style={{background:T.redBg,border:`1px solid ${T.redBdr}`,borderLeft:`4px solid ${T.red}`,borderRadius:4,padding:'12px 16px',marginBottom:14,fontFamily:T.font}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <span style={{fontSize:18}}>❗</span>
              <span style={{fontWeight:700,fontSize:13,color:T.red}}>{lang==='ja'?'本日のアラート — 即対応が必要なSKU':'Today\'s Alerts — Immediate action required'}</span>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {todayAlerts.map(s=>(
                <div key={s.id} style={{display:'inline-flex',alignItems:'center',gap:8,background:'#fff',border:`1px solid ${T.redBdr}`,borderRadius:3,padding:'5px 12px',cursor:'pointer'}}
                  onClick={()=>{setSelSku(s);setTab('lt_pipeline')}}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:T.red,display:'inline-block',flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:700,color:T.red}}>{s.name}</span>
                  <span style={{fontSize:10,color:T.muted}}>{lang==='ja'?`残${calcDos(s).toFixed(1)}日`:`${calcDos(s).toFixed(1)}d left`}</span>
                  <span style={{fontSize:10,color:T.blue,fontWeight:600}}>{lang==='ja'?'→ LT確認':'→ View LT'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Actions */}
        <Panel title={lang==='ja'?'⚡ 本日のアクション':'⚡ Today\'s Actions'} badge={reorderNow.length}>
          {reorderNow.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>{L('kpi_all_ok')}</div>
            :reorderNow.map(s=>{
              const d=calcDos(s),urgent=d<7
              const ssnIn=ssns.find(n=>n.sku_id===s.id&&['in_transit','customs','booked'].includes(n.status))
              return(<div key={s.id} style={{padding:'10px 16px',borderBottom:`1px solid ${T.borderL}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:urgent?T.redBg:'transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <Dot status={getStatus(s)}/>
                  <div>
                    <span style={{fontWeight:700,fontSize:12,fontFamily:T.font}}>{s.name}</span>
                    {s.superset&&<span style={{marginLeft:8,fontSize:10,color:T.muted,fontFamily:T.font}}>{s.superset} › {s.subset}</span>}
                    <span style={{marginLeft:10,fontSize:10,color:T.muted,fontFamily:T.font}}>
                      {lang==='ja'?`在庫:${fmt(s.stock_qty)} · LT:${s.lead_time}日 · 日使用:${s.daily_usage}`:`Stock:${fmt(s.stock_qty)} · LT:${s.lead_time}d · Daily:${s.daily_usage}`}
                    </span>
                    {ssnIn&&<span style={{marginLeft:10,fontSize:10,color:T.orange,fontFamily:T.font}}>🚢 +{fmt(ssnIn.arrival_qty||ssnIn.ship_qty)} ETA {ssnIn.eta_date}</span>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <StatusBadge status={getStatus(s)} lang={lang}/>
                  <span style={{fontSize:10,fontWeight:700,fontFamily:T.fontNum,color:SC[getStatus(s)]?.t,minWidth:70,textAlign:'right'}}>
                    {d===Infinity?L('no_usage_data'):lang==='ja'?`残${d.toFixed(1)}日`:`${d.toFixed(1)}d left`}
                  </span>
                  <Btn style={{fontSize:11,padding:'4px 12px'}}>{lang==='ja'?'発注':'Order'}</Btn>
                </div>
              </div>)
            })
          }
        </Panel>

        {/* Heatmap */}
        <Panel title={L('heatmap')}>
          {skus.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>{L('add_sku_first')}</div>
            :<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {[L('col_superset'),L('col_subset'),L('col_sku'),L('col_stock'),L('col_daily'),L('col_lt'),L('col_days_left'),L('col_rp'),L('col_ss'),L('col_status')].map((h,i)=><th key={h} style={TH(i>2?'right':'left')}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[...skus].sort((a,b)=>calcDos(a)-calcDos(b)).map((s,i)=>{
                  const st=getStatus(s),d=calcDos(s)
                  return(<tr key={s.id} style={{background:i%2===0?SC[st]?.bg+'33':'#fafbfc',cursor:'pointer'}} onClick={()=>{setSelSku(s);setTab('lt_pipeline')}}>
                    <td style={{...TD(),color:T.indigo,fontWeight:600,fontSize:11}}>{s.superset||'—'}</td>
                    <td style={{...TD(),color:T.slate,fontSize:11}}>{s.subset||'—'}</td>
                    <td style={TD()}><div style={{display:'flex',alignItems:'center'}}><Dot status={st}/><span style={{fontWeight:600}}>{s.name}</span></div></td>
                    <td style={TDN()}>{fmt(s.stock_qty)}</td>
                    <td style={TDN()}>{s.daily_usage}{lang==='ja'?'/日':'/d'}</td>
                    <td style={{...TDN(),color:T.indigo}}>{s.lead_time}d</td>
                    <td style={{...TDN(),fontWeight:700,color:SC[st]?.t}}>{d===Infinity?'∞':d.toFixed(1)}</td>
                    <td style={TDN()}>{fmt(calcRp(s))}</td>
                    <td style={TDN()}>{fmt(calcSs(s))}</td>
                    <td style={TD()}><StatusBadge status={st} lang={lang}/></td>
                  </tr>)
                })}
              </tbody>
            </table></div>
          }
        </Panel>
      </>)}

      {/* ════ INVENTORY ════ */}
      {tab==='inventory'&&(<>

        {/* SKU limit banner for free plan */}
        {isFree&&skus.length>=FREE_SKU_LIMIT&&(
          <SkuLimitBanner lang={lang} onUpgrade={()=>setShowPricing(true)} current={skus.length}/>
        )}

        <div style={{display:'flex',gap:8,marginBottom:6,alignItems:'center',flexWrap:'wrap'}}>
          <Btn onClick={()=>{if(skuLimitReached){setShowPricing(true);return}setSf(BSKU);setErr(null);setSkuModal('add')}}
            style={skuLimitReached?{background:'#94a3b8',cursor:'not-allowed'}:{}}
          >{L('add_sku')}</Btn>
          <Btn variant="ghost" onClick={()=>{if(isFree){setShowPricing(true);return}csvRef.current.click()}}>{L('import_csv')}</Btn>
          <input ref={csvRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleSkuCSV}/>
          <Btn variant="green" onClick={downloadSkuTemplate}>
            {lang==='ja'?'↓ CSVテンプレート':'↓ CSV Template'}
          </Btn>
        </div>

        {/* CSV format hint */}
        <div style={{background:T.gBg,border:`1px solid ${T.gBdr}`,borderRadius:4,padding:'10px 14px',marginBottom:14,fontSize:11,fontFamily:T.font}}>
          <div style={{fontWeight:700,color:T.green,marginBottom:6}}>{lang==='ja'?'📋 CSVフォーマット (インポート用)':'📋 CSV Import Format'}</div>
          <div style={{background:'#fff',border:`1px solid ${T.gBdr}`,borderRadius:3,padding:'8px 12px',fontFamily:T.fontNum,fontSize:10,color:T.slate,lineHeight:1.8}}>
            <div style={{color:T.muted,marginBottom:4}}>{lang==='ja'?'# 列名 (1行目ヘッダー)':'# Column headers (row 1)'}</div>
            name, superset, subset, stock_qty, daily_usage, lead_time[, safety_stock, moq, unit_cost, supplier]<br/>
            <div style={{color:T.muted,marginTop:6,marginBottom:4}}>{lang==='ja'?'# サンプルデータ':'# Sample data'}</div>
            Wireless Earbuds Pro, Earbuds, Supplier A, 420, 62, 18, 186, 200, 28.50, Supplier-A<br/>
            Gaming Mouse RGB, Input Devices, Supplier B, 85, 98, 14, 294, 500, 12.80, Supplier-B
          </div>
          <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
            <span style={{fontSize:10,color:T.green,background:T.surface,border:`1px solid ${T.gBdr}`,borderRadius:2,padding:'2px 8px'}}>name ✱ {lang==='ja'?'必須':'required'}</span>
            <span style={{fontSize:10,color:T.green,background:T.surface,border:`1px solid ${T.gBdr}`,borderRadius:2,padding:'2px 8px'}}>stock_qty ✱</span>
            <span style={{fontSize:10,color:T.green,background:T.surface,border:`1px solid ${T.gBdr}`,borderRadius:2,padding:'2px 8px'}}>daily_usage ✱</span>
            <span style={{fontSize:10,color:T.green,background:T.surface,border:`1px solid ${T.gBdr}`,borderRadius:2,padding:'2px 8px'}}>lead_time ✱</span>
            <span style={{fontSize:10,color:T.muted,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:'2px 8px'}}>superset {lang==='ja'?'任意':'optional'}</span>
            <span style={{fontSize:10,color:T.muted,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:'2px 8px'}}>subset {lang==='ja'?'任意':'optional'}</span>
            <span style={{fontSize:10,color:T.muted,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:'2px 8px'}}>safety_stock {lang==='ja'?'任意 (自動)':'optional (auto)'}</span>
          </div>
        </div>

        {/* Column legend */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,padding:'10px 14px',marginBottom:14,fontSize:10,fontFamily:T.font}}>
          <div style={{fontWeight:700,color:T.slate,marginBottom:6}}>{lang==='ja'?'📊 列の説明':'📊 Column Guide'}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'4px 16px'}}>
            {[
              {k:lang==='ja'?'在庫数':'Stock',     v:lang==='ja'?'現在の手持ち在庫数量':'Current on-hand stock qty'},
              {k:lang==='ja'?'日使用量':'Daily Use', v:lang==='ja'?'1日あたりの平均出荷・使用数':'Avg daily consumption'},
              {k:'LT(日)',                           v:lang==='ja'?'発注〜入荷までのリードタイム日数':'Lead time in days'},
              {k:lang==='ja'?'残日数':'Days Left',   v:lang==='ja'?'在庫数÷日使用量（在庫の残り日数）':'Stock ÷ Daily Usage'},
              {k:lang==='ja'?'発注点':'Reorder Pt',  v:lang==='ja'?'LT×日使用量 — これを下回ったら発注':'LT × Daily Usage threshold'},
              {k:'Gap',                              v:lang==='ja'?'在庫数 − 発注点（マイナス=要発注）':'Stock minus Reorder Point'},
            ].map(c=>(
              <div key={c.k} style={{display:'flex',gap:6,alignItems:'baseline'}}>
                <span style={{fontWeight:700,color:T.navy,minWidth:70}}>{c.k}</span>
                <span style={{color:T.muted}}>{c.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Superset groups */}
        {supersets.map(ss=>{
          const subsets=[...new Set(skus.filter(s=>s.superset===ss).map(s=>s.subset).filter(Boolean))]
          const ssSkus=skus.filter(s=>s.superset===ss)
          const critical=ssSkus.filter(s=>getStatus(s)==='critical').length
          return(<Panel key={ss} title={`📦 ${ss}`} badge={critical}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto',background:T.bg,borderBottom:`1px solid ${T.border}`}}>
              {[L('inv_col_name'),L('inv_col_stock'),L('inv_col_daily'),L('inv_col_lt'),L('inv_col_days'),L('inv_col_rp'),L('inv_col_gap'),L('inv_col_status'),''].map((h,i)=>(
                <div key={i} style={{padding:'6px 10px',fontSize:9,fontWeight:700,color:T.muted,fontFamily:T.font,letterSpacing:'0.05em',textTransform:'uppercase',textAlign:i>0&&i<7?'right':'left'}}>{h}</div>
              ))}
            </div>
            {subsets.map(sub=>(<div key={sub}>
              <div style={{padding:'5px 16px',background:'#f5f3ff',borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:700,color:T.indigo,fontFamily:T.font}}>▸ {sub}</div>
              {ssSkus.filter(s=>s.subset===sub).map(s=><SkuRow key={s.id} s={s}/>)}
            </div>))}
            {ssSkus.filter(s=>!s.subset).map(s=><SkuRow key={s.id} s={s}/>)}
          </Panel>)
        })}
        {noSuperset.length>0&&<Panel title={L('other')}>{noSuperset.map(s=><SkuRow key={s.id} s={s}/>)}</Panel>}
        {skus.length===0&&<div style={{padding:'48px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>{L('no_skus')}</div>}
      </>)}

      {/* ════ LT PIPELINE ════ */}
      {tab==='lt_pipeline'&&(<>

        {/* SSN risk alerts at top */}
        {ssnRisks.length>0&&(
          <div style={{background:T.redBg,border:`1px solid ${T.redBdr}`,borderLeft:`4px solid ${T.red}`,borderRadius:4,padding:'12px 16px',marginBottom:14,fontFamily:T.font}}>
            <div style={{fontWeight:700,fontSize:12,color:T.red,marginBottom:8}}>
              ⚠ {lang==='ja'?`SSNリスクアラート — ${ssnRisks.length}件の問題が検出されました`:`SSN Risk Alert — ${ssnRisks.length} issue(s) detected`}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ssnRisks.map(n=>{
                const r=ssnRisk(n)
                const skuName=skus.find(s=>s.id===n.sku_id)?.name||n.sku_id
                return(
                  <div key={n.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',border:`1px solid ${r.level==='critical'?T.redBdr:T.oBdr}`,borderRadius:3,padding:'6px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12}}>{r.level==='critical'?'🔴':'🟡'}</span>
                      <div>
                        <span style={{fontSize:11,fontWeight:700,color:T.navy}}>{skuName}</span>
                        <span style={{marginLeft:8,fontSize:10,color:T.muted}}>{n.superset} › {n.subset}</span>
                        <span style={{marginLeft:8,fontSize:10,color:T.muted}}>ETA: {n.eta_date} · {n.status}</span>
                      </div>
                    </div>
                    <RiskBadge ssn={n}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {skus.map(s=>{
            const a=selSku?.id===s.id,st=getStatus(s)
            return(<button key={s.id} onClick={()=>setSelSku(s)} style={{padding:'5px 12px',borderRadius:3,border:`1px solid ${a?SC[st]?.bd:T.border}`,background:a?SC[st]?.bg:T.surface,color:a?SC[st]?.t:T.slate,fontSize:10,fontWeight:a?700:400,fontFamily:T.font,cursor:'pointer',display:'flex',alignItems:'center',gap:5,outline:a?`2px solid ${SC[st]?.t}`:0,outlineOffset:1}}>
              <Dot status={st}/>{s.superset?`${s.superset} › `:''}{s.name}
            </button>)
          })}
        </div>

        {!selSku&&<div style={{padding:'48px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>{L('lt_select_sku')}</div>}

        {selSku&&(<>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
            {[
              {k:'lt_cur_stock',v:fmt(selSku.stock_qty),a:T.blue},
              {k:'lt_daily',v:`${selSku.daily_usage}${lang==='ja'?'/日':'/d'}`,a:T.indigo},
              {k:'lt_lt',v:`${selSku.lead_time}${lang==='ja'?'日':'d'}`,a:T.indigo},
              {k:'lt_rp',v:fmt(calcRp(selSku)),a:T.orange},
              {k:'lt_ss',v:fmt(calcSs(selSku)),a:T.green},
              {k:'lt_days',v:calcDos(selSku)===Infinity?'∞':calcDos(selSku).toFixed(1)+(lang==='ja'?'日':'d'),a:SC[getStatus(selSku)]?.t},
            ].map(c=>(
              <div key={c.k} style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${c.a}`,borderRadius:4,padding:'10px 14px',flex:1,minWidth:100,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:9,color:T.muted,fontFamily:T.font,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{L(c.k)}</div>
                <div style={{fontSize:15,fontWeight:700,color:T.navy,fontFamily:T.fontNum}}>{c.v}</div>
              </div>
            ))}
          </div>

          <Panel title={`${L('lt_panel_title')} — ${selSku.name}`}
            action={<Btn variant="blue" small onClick={()=>{setSnf({...BSSN,sku_id:selSku.id,superset:selSku.superset||'',subset:selSku.subset||''});setErr(null);setSsnModal('add')}}>{L('lt_add_ssn')}</Btn>}>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {[L('col_week'),L('col_date'),L('col_proj_stock'),L('col_inbound'),L('col_wos'),L('col_coverage'),L('col_status')].map((h,i)=><th key={h} style={TH(i>=2&&i<=4?'right':'left')}>{h}</th>)}
              </tr></thead>
              <tbody>{pipeline.map((w,i)=>{const m=SC[w.status];return(<tr key={w.week} style={{background:w.status==='critical'?T.redBg:i%2===0?'transparent':'#fafbfc'}}>
                <td style={{...TD(),fontWeight:700,color:T.slate,fontFamily:T.fontNum}}>W{w.week}</td>
                <td style={{...TD(),color:T.muted,fontSize:11,fontFamily:T.fontNum}}>{w.date}</td>
                <td style={{...TDN(),fontWeight:700,color:m?.t}}>{fmt(w.proj_stock)}</td>
                <td style={{...TDN(),color:T.green,fontWeight:w.inbound>0?700:400}}>{w.inbound>0?`+${fmt(w.inbound)}`:'—'}</td>
                <td style={{...TDN(),fontWeight:700,color:m?.t}}>{w.wos}</td>
                <td style={{...TD(),minWidth:140}}><WOSBar wos={w.wos}/></td>
                <td style={TD()}><StatusBadge status={w.status} lang={lang}/></td>
              </tr>)})}</tbody>
            </table></div>
          </Panel>

          {/* SSNs for this SKU — with risk display */}
          {ssns.filter(n=>n.sku_id===selSku.id).length>0&&(
            <Panel title={`${L('lt_ssn_for')} — ${selSku.name}`}>
              <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {[lang==='ja'?'リスク':'Risk',L('col_arr_qty'),L('col_eta'),L('col_status'),lang==='ja'?'出荷日':'Ship Date',L('col_supplier'),L('col_vessel'),L('col_bl'),L('col_confidence'),''].map((h,i)=><th key={i} style={TH(i===1?'right':'left')}>{h}</th>)}
                </tr></thead>
                <tbody>{ssns.filter(n=>n.sku_id===selSku.id).map((n,i)=>{
                  const r=ssnRisk(n)
                  return(<tr key={n.id} style={{background:r.level==='critical'?T.redBg:r.level==='warning'?T.oBg:i%2===0?'transparent':'#fafbfc'}}>
                    <td style={TD()}><RiskBadge ssn={n}/>{r.level==='ok'&&<span style={{fontSize:10,color:T.green,fontWeight:600}}>✓ OK</span>}</td>
                    <td style={{...TDN(),fontWeight:700,color:T.green}}>+{fmt(n.arrival_qty)}</td>
                    <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,fontWeight:600}}>{n.eta_date}</td>
                    <td style={TD()}><SSNBadge status={n.status} lang={lang}/></td>
                    <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,color:T.muted}}>{n.ship_date||'—'}</td>
                    <td style={{...TD(),color:T.muted,fontSize:11}}>{n.supplier||'—'}</td>
                    <td style={{...TD(),color:T.muted,fontSize:11}}>{n.vessel||'—'}</td>
                    <td style={{...TD(),fontFamily:T.fontNum,color:T.muted,fontSize:10}}>{n.bl_number||'—'}</td>
                    <td style={TD()}><ConfBar value={n.confidence}/></td>
                    <td style={TD()}>
                      <Btn variant="ghost" small style={{marginRight:4}} onClick={()=>{setSnf({sku_id:n.sku_id,superset:n.superset||'',subset:n.subset||'',supplier:n.supplier||'',ship_qty:n.ship_qty,arrival_qty:n.arrival_qty,ship_date:n.ship_date||'',eta_date:n.eta_date,status:n.status,confidence:n.confidence,vessel:n.vessel||'',bl_number:n.bl_number||'',origin_port:n.origin_port||'',dest_port:n.dest_port||''});setErr(null);setSsnModal(n)}}>{L('edit')}</Btn>
                      <Btn variant="danger" small onClick={async()=>{if(confirm(L('confirm_delete_ssn'))){await supabase.from('ssns').delete().eq('id',n.id);fetchAll()}}}>{L('delete')}</Btn>
                    </td>
                  </tr>)
                })}</tbody>
              </table></div>
            </Panel>
          )}
        </>)}
      </>)}
    </div>

    {/* ════ MODALS ════ */}

    {skuModal&&(<Modal title={skuModal==='add'?L('modal_add_sku'):`${L('modal_edit_sku')} — ${skuModal.name}`} onClose={()=>setSkuModal(false)}>
      {err&&<div style={ERR}>{err}</div>}
      {skuModal==='add'&&isFree&&skus.length>=FREE_SKU_LIMIT&&(
        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:3,padding:'10px 12px',marginBottom:14,fontSize:11,color:'#92400e',fontFamily:T.font}}>
          ⚠ {lang==='ja'?`無料プランはSKU${FREE_SKU_LIMIT}件まで。アップグレードしてください。`:`Free plan limit: ${FREE_SKU_LIMIT} SKUs. Upgrade to add more.`}
        </div>
      )}
      <div style={{background:T.bluBg,border:`1px solid ${T.bluBdr}`,borderRadius:3,padding:'10px 12px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:11,color:T.blue,fontFamily:T.font,marginBottom:6}}>{L('modal_ss_title')}</div>
        <div style={{fontSize:10,color:T.slate,fontFamily:T.font,marginBottom:10}}>{L('modal_ss_hint')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Fld label={L('modal_superset')} value={sf.superset} onChange={e=>setSf(f=>({...f,superset:e.target.value}))} placeholder={L('ph_superset')}/>
          <Fld label={L('modal_subset')}   value={sf.subset}   onChange={e=>setSf(f=>({...f,subset:e.target.value}))}   placeholder={L('ph_subset')}/>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
        <div style={{gridColumn:'1/-1'}}><Fld label={L('modal_sku_name')} required value={sf.name} onChange={e=>setSf(f=>({...f,name:e.target.value}))} placeholder={L('ph_sku_name')}/></div>
        <Fld label={L('modal_supplier')}  value={sf.supplier}    onChange={e=>setSf(f=>({...f,supplier:e.target.value}))}    placeholder={L('ph_supplier')}/>
        <Fld label={L('modal_category')}  value={sf.category}    onChange={e=>setSf(f=>({...f,category:e.target.value}))}    placeholder={L('ph_category')}/>
        <Fld label={L('modal_stock_qty')} required type="number" min="0" value={sf.stock_qty}   onChange={e=>setSf(f=>({...f,stock_qty:e.target.value}))}/>
        <Fld label={L('modal_daily')}     required type="number" min="0" value={sf.daily_usage} onChange={e=>setSf(f=>({...f,daily_usage:e.target.value}))} placeholder={L('ph_daily')}/>
        <Fld label={L('modal_lead_time')} required type="number" min="0" value={sf.lead_time}   onChange={e=>setSf(f=>({...f,lead_time:e.target.value}))} placeholder={L('ph_lead_time')}/>
        <Fld label={L('modal_safety')}    type="number" min="0" value={sf.safety_stock} onChange={e=>setSf(f=>({...f,safety_stock:e.target.value}))} placeholder={`${L('auto_prefix')}${(+sf.daily_usage||0)*3}`}/>
        <Fld label={L('modal_moq')}       type="number" min="0" value={sf.moq}          onChange={e=>setSf(f=>({...f,moq:e.target.value}))}          placeholder={L('ph_moq')}/>
        <div style={{gridColumn:'1/-1'}}><Fld label={L('modal_unit_cost')} type="number" min="0" step="0.01" value={sf.unit_cost} onChange={e=>setSf(f=>({...f,unit_cost:e.target.value}))} placeholder={L('ph_unit_cost')}/></div>
      </div>
      <div style={{fontSize:10,color:T.muted,background:T.bg,borderRadius:3,padding:'8px 10px',marginBottom:12,fontFamily:T.font}}>
        {L('modal_rp_preview')} = {(+sf.lead_time||0)*(+sf.daily_usage||0)} {L('modal_unit')} | {L('modal_ss_preview')} = {sf.safety_stock||(+sf.daily_usage||0)*3} {L('modal_unit')}
      </div>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={saveSku} disabled={saving||skuLimitReached&&skuModal==='add'} style={{flex:1,padding:10}}>{saving?L('modal_save'):skuModal==='add'?L('modal_add_btn'):L('modal_save_btn')}</Btn>
        <Btn variant="ghost" onClick={()=>setSkuModal(false)} style={{flex:1,padding:10}}>{L('modal_cancel')}</Btn>
      </div>
    </Modal>)}

    {/* SSN Modal — with tracking + risk fields */}
    {ssnModal&&(<Modal title={ssnModal==='add'?L('modal_add_ssn'):L('modal_edit_ssn')} onClose={()=>setSsnModal(false)}>
      {err&&<div style={ERR}>{err}</div>}
      <div style={{background:T.gBg,border:`1px solid ${T.gBdr}`,borderRadius:3,padding:'8px 12px',marginBottom:14,fontSize:11,color:T.green,fontFamily:T.font}}>💡 {L('ssn_tip')}</div>
      <label style={LBL}>{L('modal_ssn_sku')} <span style={{color:T.red}}>*</span></label>
      <select style={INP} value={snf.sku_id} onChange={e=>setSnf(f=>({...f,sku_id:e.target.value}))}>
        <option value="">{L('ssn_select')}</option>
        {skus.map(s=><option key={s.id} value={s.id}>{s.superset?`${s.superset} › ${s.subset||s.name}`:s.name}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
        <Fld label={L('modal_superset')}  value={snf.superset}    onChange={e=>setSnf(f=>({...f,superset:e.target.value}))}    placeholder={L('ph_superset')}/>
        <Fld label={L('modal_subset')}    value={snf.subset}      onChange={e=>setSnf(f=>({...f,subset:e.target.value}))}      placeholder={L('ph_subset')}/>
        <Fld label={L('modal_ship_qty')}  type="number" min="0"  value={snf.ship_qty}    onChange={e=>setSnf(f=>({...f,ship_qty:e.target.value}))}    placeholder={L('ph_ship_qty')}/>
        <Fld label={L('modal_arr_qty')}   type="number" min="0"  value={snf.arrival_qty} onChange={e=>setSnf(f=>({...f,arrival_qty:e.target.value}))} placeholder={L('ph_arr_qty')}/>
        <Fld label={L('modal_ship_date')} type="date" value={snf.ship_date} onChange={e=>setSnf(f=>({...f,ship_date:e.target.value}))}/>
        <Fld label={L('modal_eta')}       required type="date" value={snf.eta_date} onChange={e=>setSnf(f=>({...f,eta_date:e.target.value}))}/>
      </div>
      <label style={LBL}>{L('modal_status')}</label>
      <select style={INP} value={snf.status} onChange={e=>setSnf(f=>({...f,status:e.target.value}))}>
        {['booked','in_transit','customs','arrived','cancelled'].map(v=><option key={v} value={v}>{L(`ssn_${v}`)}</option>)}
      </select>

      {/* Tracking section */}
      <div style={{background:T.bluBg,border:`1px solid ${T.bluBdr}`,borderRadius:3,padding:'10px 12px',marginBottom:4}}>
        <div style={{fontWeight:700,fontSize:11,color:T.blue,fontFamily:T.font,marginBottom:8}}>🚢 {lang==='ja'?'輸送・追跡情報':'Shipping & Tracking Info'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Fld label={L('modal_supplier')}   value={snf.supplier}    onChange={e=>setSnf(f=>({...f,supplier:e.target.value}))}    placeholder={L('ph_supplier')}/>
          <Fld label={L('modal_vessel')}     value={snf.vessel}      onChange={e=>setSnf(f=>({...f,vessel:e.target.value}))}      placeholder={L('ph_vessel')}/>
          <Fld label={L('modal_bl')}         value={snf.bl_number}   onChange={e=>setSnf(f=>({...f,bl_number:e.target.value}))}   placeholder={L('ph_bl')}/>
          <div>
            <label style={LBL}>{L('modal_confidence')} <span style={{fontSize:9,fontWeight:400,color:T.muted}}>({lang==='ja'?'低いとリスクアラート':'Low = risk alert'})</span></label>
            <input style={INP} type="number" min="0" max="1" step="0.05" value={snf.confidence} onChange={e=>setSnf(f=>({...f,confidence:e.target.value}))}/>
          </div>
          <Fld label={L('modal_origin')}     value={snf.origin_port} onChange={e=>setSnf(f=>({...f,origin_port:e.target.value}))} placeholder={L('ph_origin')}/>
          <Fld label={L('modal_dest')}       value={snf.dest_port}   onChange={e=>setSnf(f=>({...f,dest_port:e.target.value}))}   placeholder={L('ph_dest')}/>
        </div>
      </div>

      {/* Live risk preview */}
      {(snf.eta_date||snf.confidence)&&(()=>{
        const preview={...snf,id:'preview',status:snf.status,eta_date:snf.eta_date,confidence:+snf.confidence||0.7}
        const r=ssnRisk(preview)
        return r.level!=='ok'?(
          <div style={{background:r.level==='critical'?T.redBg:T.oBg,border:`1px solid ${r.level==='critical'?T.redBdr:T.oBdr}`,borderRadius:3,padding:'8px 12px',marginBottom:12,fontSize:11,fontFamily:T.font,color:r.level==='critical'?T.red:T.orange}}>
            {r.level==='critical'?'⚠ ':'△ '}{lang==='ja'?'リスク検知:':'Risk detected:'} {r.msg}
          </div>
        ):null
      })()}

      <div style={{display:'flex',gap:8,marginTop:8}}>
        <Btn onClick={saveSsn} disabled={saving} style={{flex:1,padding:10}}>{saving?L('modal_save'):ssnModal==='add'?L('modal_add_ssn_btn'):L('modal_save_btn')}</Btn>
        <Btn variant="ghost" onClick={()=>setSsnModal(false)} style={{flex:1,padding:10}}>{L('modal_cancel')}</Btn>
      </div>
    </Modal>)}

    {showPricing&&<PricingModal lang={lang} user={user} onClose={()=>setShowPricing(false)}/>}
  </div>)
}
