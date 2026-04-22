import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth }  from './AuthContext.jsx'
import { supabase } from './supabase.js'
import LoginPage    from './components/LoginPage.jsx'
import PricingModal from './components/PricingModal.jsx'

const T = {
  font:'Arial, Helvetica, sans-serif', fontNum:"'Courier New',Courier,monospace",
  navy:'#0d1b2a', navyM:'#1b2e42', slate:'#394f66', muted:'#6b7d93', dim:'#a0b0c0',
  border:'#dde3ea', borderL:'#edf0f4', bg:'#f4f6f9', surface:'#ffffff',
  red:'#c0392b', redBg:'#fdf3f2', redBdr:'#f5c6c3',
  orange:'#c0620b', oBg:'#fdf6ee', oBdr:'#f5d9b8',
  green:'#1a6e3c', gBg:'#f0faf4', gBdr:'#b8e8cc',
  blue:'#1a4fa0', bluBg:'#f0f5ff', bluBdr:'#b8ccf5',
  indigo:'#3730a3',
}
const SC = {
  critical:{ t:T.red,    bg:T.redBg, bd:T.redBdr, dot:T.red    },
  warning: { t:T.orange, bg:T.oBg,   bd:T.oBdr,   dot:T.orange  },
  healthy: { t:T.green,  bg:T.gBg,   bd:T.gBdr,   dot:T.green   },
  overstock:{ t:T.blue,  bg:T.bluBg, bd:T.bluBdr, dot:T.blue    },
  nodata:  { t:T.muted,  bg:'#f9fafb',bd:T.border, dot:T.dim    },
}
const SSN_C = {
  booked:    { t:T.indigo, bg:'#f5f3ff' },
  in_transit:{ t:T.orange, bg:T.oBg     },
  customs:   { t:'#b45309',bg:'#fffbeb'  },
  arrived:   { t:T.green,  bg:T.gBg     },
  cancelled: { t:T.muted,  bg:'#f9fafb' },
}

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

const TH=(align='left')=>({padding:'8px 12px',textAlign:align,fontSize:10,fontWeight:700,fontFamily:T.font,color:T.muted,background:T.bg,borderBottom:`2px solid ${T.border}`,whiteSpace:'nowrap',letterSpacing:'0.05em',textTransform:'uppercase'})
const TD=(align='left')=>({padding:'9px 12px',textAlign:align,fontSize:12,fontFamily:T.font,borderBottom:`1px solid ${T.borderL}`,verticalAlign:'middle',color:T.navy})
const TDN=(align='right')=>({...TD(align),fontFamily:T.fontNum})
const LBL={display:'block',fontSize:11,fontWeight:700,fontFamily:T.font,color:T.slate,marginBottom:4,letterSpacing:'0.02em'}
const INP={width:'100%',padding:'8px 10px',borderRadius:3,border:`1px solid ${T.border}`,fontSize:12,marginBottom:12,outline:'none',fontFamily:T.font,color:T.navy}
const ERR={background:T.redBg,border:`1px solid ${T.redBdr}`,borderLeft:`3px solid ${T.red}`,borderRadius:3,padding:'8px 12px',fontSize:12,color:T.red,marginBottom:12,fontFamily:T.font}

function StatusBadge({status}){
  const m=SC[status]||SC.nodata
  const label={critical:'アラート',warning:'要注意',healthy:'適正',overstock:'過剰在庫',nodata:'データなし'}[status]||status
  return <span style={{display:'inline-block',fontSize:10,fontWeight:700,fontFamily:T.font,padding:'2px 8px',borderRadius:2,letterSpacing:'0.04em',background:m.bg,color:m.t,border:`1px solid ${m.bd}`}}>{label}</span>
}
function SSNBadge({status}){
  const m=SSN_C[status]||{}
  const label={booked:'予約済',in_transit:'輸送中',customs:'通関中',arrived:'着荷',cancelled:'キャンセル'}[status]||status
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
function KPICard({label,value,accent,sub,icon}){
  return(<div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${accent}`,borderRadius:4,padding:'14px 16px',flex:1,minWidth:130,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:T.muted,fontFamily:T.font,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span><span style={{fontSize:16,opacity:.65}}>{icon}</span></div>
    <div style={{fontSize:26,fontWeight:700,color:T.navy,fontFamily:T.fontNum,letterSpacing:'-0.02em'}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:T.dim,marginTop:3,fontFamily:T.font}}>{sub}</div>}
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
    <div style={{background:T.surface,borderRadius:4,padding:'24px 22px',width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,0.18)',border:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>
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
  const pad=small?'4px 10px':'7px 14px', sz=small?10:11
  const v={
    primary:{background:T.navy,color:'#fff',border:'none'},
    ghost:{background:T.surface,color:T.navy,border:`1px solid ${T.border}`},
    danger:{background:T.redBg,color:T.red,border:`1px solid ${T.redBdr}`},
    blue:{background:T.bluBg,color:T.blue,border:`1px solid ${T.bluBdr}`},
    lock:{background:'#f5f3ff',color:T.indigo,border:'1px solid #ddd6fe'},
  }
  return(<button onClick={onClick} disabled={disabled} style={{padding:pad,borderRadius:3,cursor:disabled?'not-allowed':'pointer',fontSize:sz,fontWeight:700,fontFamily:T.font,transition:'opacity .12s',opacity:disabled?.5:1,letterSpacing:'0.02em',...v[variant],...extra}}>{children}</button>)
}
function ProBanner({onUpgrade}){
  return(<div style={{background:T.bluBg,border:`1px solid ${T.bluBdr}`,borderLeft:`4px solid ${T.blue}`,borderRadius:4,padding:'32px',textAlign:'center',margin:'20px 0',fontFamily:T.font}}>
    <div style={{fontSize:28,marginBottom:10}}>🔒</div>
    <div style={{fontWeight:700,fontSize:14,color:T.blue,marginBottom:6}}>この機能はPro限定です</div>
    <div style={{fontSize:12,color:T.slate,marginBottom:18}}>SSN追跡・入出庫履歴はStockWise Proでご利用いただけます</div>
    <Btn onClick={onUpgrade} style={{padding:'8px 20px',fontSize:12}}>Proにアップグレード → $149/月</Btn>
  </div>)
}
function downloadSSNTemplate(){
  const hdr='ssn_id,superset,subset,supplier,ship_qty,arrival_qty,ship_date,eta_date,status,confidence,vessel,bl_number,origin_port,dest_port'
  const rows=['SSN-2026-001,イヤホン,A社 イヤホンA,Supplier-A,500,500,2026-05-01,2026-05-15,booked,0.85,EVER GRACE,BL240501,Shenzhen,Los Angeles','SSN-2026-002,イヤホン,B社 イヤホンB,Supplier-B,300,300,2026-05-05,2026-05-20,in_transit,0.70,MSC OSCAR,BL240505,Taipei,Long Beach']
  const blob=new Blob([[hdr,...rows].join('\n')],{type:'text/csv'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download='ssn_template.csv';a.click()
  URL.revokeObjectURL(url)
}

export default function App(){
  const {user,loading:authLoading,signOut}=useAuth()
  const [plan,setPlan]=useState('basic')
  const [tab,setTab]=useState('dashboard')
  const [skus,setSkus]=useState([])
  const [ssns,setSsns]=useState([])
  const [moves,setMoves]=useState([])
  const [selSku,setSelSku]=useState(null)
  const [ssnFilter,setSsnFilter]=useState('ALL')
  const [showPricing,setShowPricing]=useState(false)
  const [skuModal,setSkuModal]=useState(false)
  const [ssnModal,setSsnModal]=useState(false)
  const [moveModal,setMoveModal]=useState(false)
  const [saving,setSaving]=useState(false)
  const [err,setErr]=useState(null)
  const BSKU={name:'',superset:'',subset:'',category:'',supplier:'',stock_qty:'',daily_usage:'',lead_time:'',safety_stock:'',moq:'',unit_cost:''}
  const BSSN={sku_id:'',superset:'',subset:'',supplier:'',ship_qty:'',arrival_qty:'',ship_date:'',eta_date:'',status:'booked',confidence:'0.7',vessel:'',bl_number:'',origin_port:'',dest_port:''}
  const BMOVE={sku_id:'',qty:'',date:new Date().toISOString().slice(0,10),type:'sale',ref:''}
  const [sf,setSf]=useState(BSKU)
  const [snf,setSnf]=useState(BSSN)
  const [mf,setMf]=useState(BMOVE)
  const csvRef=useRef(null)
  const ssnCsvRef=useRef(null)
  const isPro=plan==='pro'

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  async function fetchAll() {
    const [
      { data: s, error: skusError },
      { data: n, error: ssnsError },
      { data: m, error: movesError },
      { data: sub, error: subError },
    ] = await Promise.all([
      supabase
        .from('skus')
        .select('*')
        .order('superset', { ascending: true })
        .order('subset', { ascending: true })
        .order('name', { ascending: true }),

      supabase
        .from('ssns')
        .select('*')
        .order('eta_date', { ascending: true }),

      supabase
        .from('movements')
        .select('*')
        .order('date', { ascending: false })
        .limit(100),

      supabase
        .from('subscriptions')
        .select('plan,status')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    if (skusError) console.error('skus fetch error:', skusError)
    if (ssnsError) console.error('ssns fetch error:', ssnsError)
    if (movesError) console.error('movements fetch error:', movesError)
    if (subError) console.error('subscriptions fetch error:', subError)

    setSkus(s || [])
    setSsns(n || [])
    setMoves(m || [])

    if (sub?.plan) setPlan(sub.plan)
  }

  async function saveSku(){
    setErr(null);setSaving(true)
    try{
      const p={user_id:user.id,name:sf.name.trim(),superset:sf.superset.trim()||null,subset:sf.subset.trim()||null,category:sf.category||null,supplier:sf.supplier||null,stock_qty:+sf.stock_qty,daily_usage:+sf.daily_usage,lead_time:+sf.lead_time,safety_stock:sf.safety_stock?+sf.safety_stock:null,moq:sf.moq?+sf.moq:null,unit_cost:sf.unit_cost?+sf.unit_cost:null}
      if(!p.name)throw new Error('SKU名は必須です')
      const{error:e}=skuModal==='add'?await supabase.from('skus').insert(p):await supabase.from('skus').update(p).eq('id',skuModal.id)
      if(e)throw e
      await fetchAll();setSkuModal(false)
    }catch(e){setErr(e.message)}finally{setSaving(false)}
  }
  async function deleteSku(id){
    if(!confirm('このSKUと関連SSNを削除しますか？'))return
    await supabase.from('ssns').delete().eq('sku_id',id)
    await supabase.from('skus').delete().eq('id',id)
    await fetchAll()
  }
  function handleSkuCSV(e){
    const file=e.target.files[0];if(!file)return
    const reader=new FileReader()
    reader.onload=async ev=>{
      const rows=ev.target.result.trim().split('\n').slice(1).map(l=>{
        const[name,superset,subset,stock_qty,daily_usage,lead_time,safety_stock,moq,unit_cost,supplier]=l.split(',')
        return{user_id:user.id,name:(name||'').trim(),superset:(superset||'').trim()||null,subset:(subset||'').trim()||null,stock_qty:+stock_qty||0,daily_usage:+daily_usage||0,lead_time:+lead_time||7,safety_stock:safety_stock?+safety_stock:null,moq:moq?+moq:null,unit_cost:unit_cost?+unit_cost:null,supplier:(supplier||'').trim()||null}
      }).filter(r=>r.name)
      if(!rows.length){alert('有効な行がありません');return}
      const{error}=await supabase.from('skus').upsert(rows,{onConflict:'user_id,name'})
      error?alert('エラー: '+error.message):(alert(`${rows.length}件インポート完了`),fetchAll())
      e.target.value=''
    }
    reader.readAsText(file)
  }

  async function saveSsn(){
    setErr(null);setSaving(true)
    try{
      const p={user_id:user.id,sku_id:snf.sku_id,superset:snf.superset||null,subset:snf.subset||null,supplier:snf.supplier||null,ship_qty:+snf.ship_qty||0,arrival_qty:+snf.arrival_qty||+snf.ship_qty||0,ship_date:snf.ship_date||null,eta_date:snf.eta_date,status:snf.status,confidence:+snf.confidence||0.7,vessel:snf.vessel||null,bl_number:snf.bl_number||null,origin_port:snf.origin_port||null,dest_port:snf.dest_port||null}
      if(!p.sku_id||!p.eta_date)throw new Error('SKUとETA日付は必須です')
      const{error:e}=ssnModal==='add'?await supabase.from('ssns').insert(p):await supabase.from('ssns').update(p).eq('id',ssnModal.id)
      if(e)throw e
      await fetchAll();setSsnModal(false)
    }catch(e){setErr(e.message)}finally{setSaving(false)}
  }
  function handleSsnCSV(e){
    const file=e.target.files[0];if(!file)return
    const reader=new FileReader()
    reader.onload=async ev=>{
      const rows=[]
      for(const l of ev.target.result.trim().split('\n').slice(1)){
        const[,superset,subset,supplier,ship_qty,arrival_qty,ship_date,eta_date,status,confidence,vessel,bl_number,origin_port,dest_port]=l.split(',')
        const sku=skus.find(s=>s.subset===(subset||'').trim()||s.name===(subset||'').trim())
        if(!sku)continue
        rows.push({user_id:user.id,sku_id:sku.id,superset:(superset||'').trim()||null,subset:(subset||'').trim()||null,supplier:(supplier||'').trim()||null,ship_qty:+ship_qty||0,arrival_qty:+arrival_qty||+ship_qty||0,ship_date:(ship_date||'').trim()||null,eta_date:(eta_date||'').trim(),status:(status||'booked').trim(),confidence:+confidence||0.7,vessel:(vessel||'').trim()||null,bl_number:(bl_number||'').trim()||null,origin_port:(origin_port||'').trim()||null,dest_port:(dest_port||'').trim()||null})
      }
      if(!rows.length){alert('有効な行がありません');return}
      const{error}=await supabase.from('ssns').insert(rows)
      error?alert('エラー: '+error.message):(alert(`${rows.length}件のSSNを登録しました`),fetchAll())
      e.target.value=''
    }
    reader.readAsText(file)
  }

  async function saveMove(){
    setErr(null);setSaving(true)
    try{
      const qty=+mf.qty
      if(!mf.sku_id||!qty)throw new Error('SKUと数量を入力してください')
      const{error:e1}=await supabase.from('movements').insert({user_id:user.id,sku_id:mf.sku_id,qty,date:mf.date,type:mf.type,ref:mf.ref||null})
      if(e1)throw e1
      const sku=skus.find(s=>s.id===mf.sku_id)
      if(sku)await supabase.from('skus').update({stock_qty:Math.max(0,sku.stock_qty+qty)}).eq('id',sku.id)
      await fetchAll();setMoveModal(false)
    }catch(e){setErr(e.message)}finally{setSaving(false)}
  }

  const alertSkus=skus.filter(s=>getStatus(s)==='critical')
  const reorderNow=skus.filter(s=>s.stock_qty<calcRp(s))
  const overstock=skus.filter(s=>getStatus(s)==='overstock')
  const totalStock=skus.reduce((a,s)=>a+s.stock_qty,0)
  const totalValue=skus.reduce((a,s)=>a+s.stock_qty*(s.unit_cost||0),0)
  const inTransit=ssns.filter(n=>n.status==='in_transit'||n.status==='customs').reduce((a,n)=>a+(n.arrival_qty||n.ship_qty||0),0)
  const pipeline=useMemo(()=>selSku?buildPipeline(selSku,ssns):[],[selSku,ssns])
  const ssnList=ssnFilter==='ALL'?ssns:ssns.filter(n=>n.status===ssnFilter)
  const supersets=[...new Set(skus.map(s=>s.superset).filter(Boolean))]
  const noSuperset=skus.filter(s=>!s.superset)

  if(authLoading)return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:T.muted,fontFamily:T.font}}>Loading…</div>
  if(!user)return <LoginPage/>

  const TabBtn=({id,label,badge,proOnly})=>(
    <button onClick={()=>setTab(id)} style={{padding:'11px 20px',border:'none',background:'transparent',cursor:'pointer',fontFamily:T.font,fontSize:12,fontWeight:tab===id?700:400,color:tab===id?T.navy:T.muted,letterSpacing:'0.02em',borderBottom:tab===id?`2px solid ${T.navy}`:'2px solid transparent',marginBottom:-2,transition:'all .12s',display:'flex',alignItems:'center',gap:6}}>
      {label}
      {badge>0&&<span style={{background:T.red,color:'#fff',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:2}}>{badge}</span>}
      {proOnly&&!isPro&&<span style={{fontSize:8,background:T.bluBg,color:T.blue,padding:'1px 5px',borderRadius:2,fontWeight:700}}>PRO</span>}
    </button>
  )

  const SkuRow=({s})=>{
    const gap=s.stock_qty-calcRp(s), d=calcDos(s)
    return(<div style={{display:'grid',gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto',alignItems:'center',borderBottom:`1px solid ${T.borderL}`,background:SC[getStatus(s)]?.bg+'44'}}>
      <div style={{padding:'8px 16px',fontWeight:600,fontSize:12,color:T.navy,display:'flex',alignItems:'center'}}><Dot status={getStatus(s)}/>{s.name}{s.supplier&&<span style={{marginLeft:8,fontSize:10,color:T.muted}}>{s.supplier}</span>}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12}}>{fmt(s.stock_qty)}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,color:T.muted}}>{s.daily_usage}/日</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,color:T.indigo}}>{s.lead_time}d</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,fontWeight:700,color:SC[getStatus(s)]?.t}}>{d===Infinity?'∞':d.toFixed(1)}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12}}>{fmt(calcRp(s))}</div>
      <div style={{padding:'8px 10px',textAlign:'right',fontFamily:T.fontNum,fontSize:12,fontWeight:700,color:gap<0?T.red:T.green}}>{gap>=0?'+':''}{fmt(gap)}</div>
      <div style={{padding:'8px 10px'}}><StatusBadge status={getStatus(s)}/></div>
      <div style={{padding:'8px 10px',display:'flex',gap:4}}>
        <Btn variant="blue" small onClick={()=>{setSelSku(s);setTab('lt_pipeline')}}>LT</Btn>
        <Btn variant="ghost" small onClick={()=>{setSf({name:s.name,superset:s.superset||'',subset:s.subset||'',category:s.category||'',supplier:s.supplier||'',stock_qty:s.stock_qty,daily_usage:s.daily_usage,lead_time:s.lead_time,safety_stock:s.safety_stock||'',moq:s.moq||'',unit_cost:s.unit_cost||''});setErr(null);setSkuModal(s)}}>編集</Btn>
        <Btn variant="danger" small onClick={()=>deleteSku(s.id)}>削除</Btn>
      </div>
    </div>)
  }

  return(<div style={{minHeight:'100vh',background:T.bg,fontFamily:T.font,color:T.navy}}>
    <nav style={{background:T.navy,height:52,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',boxShadow:'0 2px 6px rgba(0,0,0,0.2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:28,height:28,background:'#2563eb',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',fontFamily:T.font}}>S</div>
        <span style={{color:'#fff',fontWeight:700,fontSize:15,fontFamily:T.font,letterSpacing:'0.04em'}}>StockWise</span>
        {isPro&&<span style={{background:'#2563eb',color:'#fff',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:2,letterSpacing:'0.06em',fontFamily:T.font}}>PRO</span>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        {totalValue>0&&<span style={{fontSize:11,color:'#93c5fd',fontFamily:T.font}}>在庫総額 <strong style={{color:'#fff'}}>${(totalValue/1000).toFixed(0)}K</strong></span>}
        {!isPro&&<Btn onClick={()=>setShowPricing(true)} style={{background:'#2563eb',color:'#fff',border:'none',padding:'5px 14px',fontSize:11}}>Pro へアップグレード</Btn>}
        <span style={{fontSize:11,color:'#93c5fd',fontFamily:T.font,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</span>
        <Btn onClick={signOut} style={{background:T.navyM,color:T.dim,border:`1px solid ${T.navyM}`,padding:'5px 12px',fontSize:11}}>ログアウト</Btn>
      </div>
    </nav>

    <div style={{maxWidth:1280,margin:'0 auto',padding:'20px'}}>
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:`2px solid ${T.border}`,background:T.surface,borderRadius:'4px 4px 0 0',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <TabBtn id="dashboard"   label="Dashboard"  badge={alertSkus.length}/>
        <TabBtn id="inventory"   label="在庫管理"/>
        <TabBtn id="lt_pipeline" label="LT Pipeline"/>
        <TabBtn id="ssn"         label="SSN 追跡"    proOnly/>
        <TabBtn id="movements"   label="入出庫履歴"   proOnly/>
      </div>

      {tab==='dashboard'&&(<>
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
          <KPICard label="総在庫数量"        value={fmt(totalStock)}    accent={T.slate}  icon="📦" sub="全SKU合計"/>
          <KPICard label="アラート (7日未満)" value={alertSkus.length}  accent={T.red}    icon="⚠" sub={alertSkus.length?alertSkus.map(s=>s.name).join(' · '):'なし'}/>
          <KPICard label="今すぐ発注"         value={reorderNow.length} accent={T.orange} icon="↺" sub="発注点割れ"/>
          <KPICard label="輸送中 (SSN)"       value={fmt(inTransit)}    accent="#a16207"  icon="🚢" sub="units in transit"/>
          <KPICard label="過剰在庫 (45日超)"  value={overstock.length}  accent={T.blue}   icon="▲" sub="在庫過多"/>
        </div>
        {alertSkus.length>0&&<div style={{background:T.redBg,border:`1px solid ${T.redBdr}`,borderLeft:`4px solid ${T.red}`,borderRadius:4,padding:'10px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:12,fontSize:12,fontFamily:T.font}}><span style={{fontSize:16}}>⚠</span><span style={{fontWeight:700,color:T.red}}>アラート: </span><span style={{color:'#7f1d1d'}}>{alertSkus.map(s=>s.name).join(' · ')}</span></div>}
        <Panel title="⚡ 本日のアクション" badge={reorderNow.length}>
          {reorderNow.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>✓ 全SKUが発注点以上です</div>
            :reorderNow.map(s=>{
              const d=calcDos(s),urgent=d<7
              const ssnIn=ssns.find(n=>n.sku_id===s.id&&['in_transit','customs','booked'].includes(n.status))
              return(<div key={s.id} style={{padding:'10px 16px',borderBottom:`1px solid ${T.borderL}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:urgent?T.redBg:'transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <Dot status={getStatus(s)}/>
                  <div>
                    <span style={{fontWeight:700,fontSize:12,fontFamily:T.font}}>{s.name}</span>
                    {s.superset&&<span style={{marginLeft:8,fontSize:10,color:T.muted,fontFamily:T.font}}>{s.superset} › {s.subset}</span>}
                    <span style={{marginLeft:10,fontSize:10,color:T.muted,fontFamily:T.font}}>在庫:{fmt(s.stock_qty)} · LT:{s.lead_time}日 · 日使用:{s.daily_usage}</span>
                    {ssnIn&&<span style={{marginLeft:10,fontSize:10,color:T.orange,fontFamily:T.font}}>🚢 +{fmt(ssnIn.arrival_qty||ssnIn.ship_qty)} ETA {ssnIn.eta_date}</span>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <StatusBadge status={getStatus(s)}/>
                  <span style={{fontSize:10,fontWeight:700,fontFamily:T.fontNum,color:SC[getStatus(s)]?.t,minWidth:70,textAlign:'right'}}>{d===Infinity?'データなし':`残${d.toFixed(1)}日`}</span>
                  <Btn style={{fontSize:11,padding:'4px 12px'}}>発注</Btn>
                </div>
              </div>)
            })
          }
        </Panel>
        <Panel title="▦ 在庫ヒートマップ">
          {skus.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>在庫管理タブからSKUを追加してください</div>
            :<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Superset','Subset','SKU名','在庫数','日使用量','LT(日)','残日数','発注点','安全在庫','ステータス'].map((h,i)=><th key={h} style={TH(i>2?'right':'left')}>{h}</th>)}</tr></thead>
              <tbody>{[...skus].sort((a,b)=>calcDos(a)-calcDos(b)).map((s,i)=>{
                const st=getStatus(s),d=calcDos(s)
                return(<tr key={s.id} style={{background:i%2===0?SC[st]?.bg+'33':'#fafbfc',cursor:'pointer'}} onClick={()=>{setSelSku(s);setTab('lt_pipeline')}}>
                  <td style={{...TD(),color:T.indigo,fontWeight:600,fontSize:11}}>{s.superset||'—'}</td>
                  <td style={{...TD(),color:T.slate,fontSize:11}}>{s.subset||'—'}</td>
                  <td style={TD()}><div style={{display:'flex',alignItems:'center'}}><Dot status={st}/><span style={{fontWeight:600}}>{s.name}</span></div></td>
                  <td style={TDN()}>{fmt(s.stock_qty)}</td>
                  <td style={TDN()}>{s.daily_usage}/日</td>
                  <td style={{...TDN(),color:T.indigo}}>{s.lead_time}d</td>
                  <td style={{...TDN(),fontWeight:700,color:SC[st]?.t}}>{d===Infinity?'∞':d.toFixed(1)}</td>
                  <td style={TDN()}>{fmt(calcRp(s))}</td>
                  <td style={TDN()}>{fmt(calcSs(s))}</td>
                  <td style={TD()}><StatusBadge status={st}/></td>
                </tr>)
              })}</tbody>
            </table></div>
          }
        </Panel>
      </>)}

      {tab==='inventory'&&(<>
        <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
          <Btn onClick={()=>{setSf(BSKU);setErr(null);setSkuModal('add')}}>+ SKU追加</Btn>
          <Btn variant="ghost" onClick={()=>csvRef.current.click()}>↑ CSVインポート</Btn>
          <input ref={csvRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleSkuCSV}/>
          <span style={{fontSize:10,color:T.muted,fontFamily:T.font}}>CSV: name, superset, subset, stock_qty, daily_usage, lead_time[, safety_stock, moq, unit_cost, supplier]</span>
        </div>
        {supersets.map(ss=>{
          const subsets=[...new Set(skus.filter(s=>s.superset===ss).map(s=>s.subset).filter(Boolean))]
          const ssSkus=skus.filter(s=>s.superset===ss)
          const critical=ssSkus.filter(s=>getStatus(s)==='critical').length
          return(<Panel key={ss} title={`📦 ${ss}`} badge={critical}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 90px 70px 50px 80px 80px 80px 100px auto',background:T.bg,borderBottom:`1px solid ${T.border}`}}>
              {['SKU名','在庫数','日使用量','LT','残日数','発注点','Gap','ステータス',''].map((h,i)=>(
                <div key={h} style={{padding:'6px 10px',fontSize:9,fontWeight:700,color:T.muted,fontFamily:T.font,letterSpacing:'0.05em',textTransform:'uppercase',textAlign:i>0&&i<7?'right':'left'}}>{h}</div>
              ))}
            </div>
            {subsets.map(sub=>(<div key={sub}>
              <div style={{padding:'5px 16px',background:'#f5f3ff',borderBottom:`1px solid ${T.border}`,fontSize:10,fontWeight:700,color:T.indigo,fontFamily:T.font,letterSpacing:'0.03em'}}>▸ {sub}</div>
              {ssSkus.filter(s=>s.subset===sub).map(s=><SkuRow key={s.id} s={s}/>)}
            </div>))}
            {ssSkus.filter(s=>!s.subset).map(s=><SkuRow key={s.id} s={s}/>)}
          </Panel>)
        })}
        {noSuperset.length>0&&<Panel title="その他">{noSuperset.map(s=><SkuRow key={s.id} s={s}/>)}</Panel>}
        {skus.length===0&&<div style={{padding:'48px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>まだSKUがありません。「SKU追加」ボタンから追加してください。</div>}
      </>)}

      {tab==='lt_pipeline'&&(<>
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {skus.map(s=>{
            const a=selSku?.id===s.id,st=getStatus(s)
            return(<button key={s.id} onClick={()=>setSelSku(s)} style={{padding:'5px 12px',borderRadius:3,border:`1px solid ${a?SC[st]?.bd:T.border}`,background:a?SC[st]?.bg:T.surface,color:a?SC[st]?.t:T.slate,fontSize:10,fontWeight:a?700:400,fontFamily:T.font,cursor:'pointer',display:'flex',alignItems:'center',gap:5,outline:a?`2px solid ${SC[st]?.t}`:0,outlineOffset:1}}>
              <Dot status={st}/>{s.superset?`${s.superset} › `:''}{s.name}
            </button>)
          })}
        </div>
        {!selSku&&<div style={{padding:'48px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>← 上からSKUを選択してください</div>}
        {selSku&&(<>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
            {[{l:'現在庫',v:fmt(selSku.stock_qty),a:T.blue},{l:'日使用量',v:`${selSku.daily_usage}/日`,a:T.indigo},{l:'LT',v:`${selSku.lead_time}日`,a:T.indigo},{l:'発注点',v:fmt(calcRp(selSku)),a:T.orange},{l:'安全在庫',v:fmt(calcSs(selSku)),a:T.green},{l:'残日数',v:calcDos(selSku)===Infinity?'∞':calcDos(selSku).toFixed(1)+'日',a:SC[getStatus(selSku)]?.t}].map(c=>(
              <div key={c.l} style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${c.a}`,borderRadius:4,padding:'10px 14px',flex:1,minWidth:100,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:9,color:T.muted,fontFamily:T.font,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{c.l}</div>
                <div style={{fontSize:15,fontWeight:700,color:T.navy,fontFamily:T.fontNum}}>{c.v}</div>
              </div>
            ))}
          </div>
          <Panel title={`⏱ 12週 LT Pipeline — ${selSku.name}`} action={isPro?<Btn variant="blue" small onClick={()=>{setSnf({...BSSN,sku_id:selSku.id,superset:selSku.superset||'',subset:selSku.subset||''});setErr(null);setSsnModal('add')}}>+ SSN追加</Btn>:null}>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['週','日付','予測在庫','入荷','WOS (週)','カバレッジ','ステータス'].map((h,i)=><th key={h} style={TH(i>=2&&i<=4?'right':'left')}>{h}</th>)}</tr></thead>
              <tbody>{pipeline.map((w,i)=>{const m=SC[w.status];return(<tr key={w.week} style={{background:w.status==='critical'?T.redBg:i%2===0?'transparent':'#fafbfc'}}>
                <td style={{...TD(),fontWeight:700,color:T.slate,fontFamily:T.fontNum}}>W{w.week}</td>
                <td style={{...TD(),color:T.muted,fontSize:11,fontFamily:T.fontNum}}>{w.date}</td>
                <td style={{...TDN(),fontWeight:700,color:m?.t}}>{fmt(w.proj_stock)}</td>
                <td style={{...TDN(),color:T.green,fontWeight:w.inbound>0?700:400}}>{w.inbound>0?`+${fmt(w.inbound)}`:'—'}</td>
                <td style={{...TDN(),fontWeight:700,color:m?.t}}>{w.wos}</td>
                <td style={{...TD(),minWidth:140}}><WOSBar wos={w.wos}/></td>
                <td style={TD()}><StatusBadge status={w.status}/></td>
              </tr>)})}</tbody>
            </table></div>
          </Panel>
          {ssns.filter(n=>n.sku_id===selSku.id).length>0&&(
            <Panel title={`🔢 入荷予定 (SSN) — ${selSku.name}`}>
              <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>{['到着数','ETA','ステータス','仕入先','船名','B/L番号','信頼度',''].map((h,i)=><th key={h} style={TH(i===0?'right':'left')}>{h}</th>)}</tr></thead>
                <tbody>{ssns.filter(n=>n.sku_id===selSku.id).map((n,i)=>(<tr key={n.id} style={{background:i%2===0?'transparent':'#fafbfc'}}>
                  <td style={{...TDN(),fontWeight:700,color:T.green}}>+{fmt(n.arrival_qty)}</td>
                  <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,fontWeight:600}}>{n.eta_date}</td>
                  <td style={TD()}><SSNBadge status={n.status}/></td>
                  <td style={{...TD(),color:T.muted,fontSize:11}}>{n.supplier||'—'}</td>
                  <td style={{...TD(),color:T.muted,fontSize:11}}>{n.vessel||'—'}</td>
                  <td style={{...TD(),fontFamily:T.fontNum,color:T.muted,fontSize:10}}>{n.bl_number||'—'}</td>
                  <td style={TD()}><ConfBar value={n.confidence}/></td>
                  <td style={TD()}>
                    <Btn variant="ghost" small onClick={()=>{setSnf({sku_id:n.sku_id,superset:n.superset||'',subset:n.subset||'',supplier:n.supplier||'',ship_qty:n.ship_qty,arrival_qty:n.arrival_qty,ship_date:n.ship_date||'',eta_date:n.eta_date,status:n.status,confidence:n.confidence,vessel:n.vessel||'',bl_number:n.bl_number||'',origin_port:n.origin_port||'',dest_port:n.dest_port||''});setErr(null);setSsnModal(n)}} style={{marginRight:4}}>編集</Btn>
                    <Btn variant="danger" small onClick={async()=>{if(confirm('削除?')){await supabase.from('ssns').delete().eq('id',n.id);fetchAll()}}}>削除</Btn>
                  </td>
                </tr>))}</tbody>
              </table></div>
            </Panel>
          )}
        </>)}
      </>)}

      {tab==='ssn'&&(isPro?(<>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <Btn onClick={()=>{setSnf({...BSSN,sku_id:skus[0]?.id||''});setErr(null);setSsnModal('add')}} disabled={skus.length===0}>+ SSN追加</Btn>
          <Btn variant="ghost" onClick={()=>ssnCsvRef.current.click()}>↑ CSVインポート</Btn>
          <Btn variant="ghost" onClick={downloadSSNTemplate}>↓ テンプレート</Btn>
          <input ref={ssnCsvRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleSsnCSV}/>
          <div style={{display:'flex',gap:4,marginLeft:8}}>
            {['ALL','booked','in_transit','customs','arrived','cancelled'].map(f=>{
              const cnt=f==='ALL'?ssns.length:ssns.filter(n=>n.status===f).length,a=ssnFilter===f
              return(<button key={f} onClick={()=>setSsnFilter(f)} style={{padding:'4px 10px',borderRadius:3,border:`1px solid ${a?T.navy:T.border}`,background:a?T.navy:T.surface,color:a?'#fff':T.slate,fontSize:10,cursor:'pointer',fontFamily:T.font,fontWeight:a?700:400}}>
                {f==='ALL'?'全て':{booked:'予約済',in_transit:'輸送中',customs:'通関中',arrived:'着荷',cancelled:'キャンセル'}[f]} ({cnt})
              </button>)
            })}
          </div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
          {Object.entries(SSN_C).filter(([k])=>k!=='cancelled').map(([k,v])=>{
            const list=ssns.filter(n=>n.status===k)
            return(<div key={k} style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:`2px solid ${v.t}`,borderRadius:4,padding:'10px 14px',flex:1,minWidth:100,boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:9,color:T.muted,fontFamily:T.font,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{{booked:'予約済',in_transit:'輸送中',customs:'通関中',arrived:'着荷'}[k]}</div>
              <div style={{fontSize:20,fontWeight:700,color:v.t,fontFamily:T.fontNum}}>{list.length}</div>
              <div style={{fontSize:9,color:T.dim,marginTop:2,fontFamily:T.font}}>{fmt(list.reduce((a,n)=>a+(n.arrival_qty||n.ship_qty||0),0))} units</div>
            </div>)
          })}
        </div>
        <Panel title={`🔢 SSN一覧 (${ssnList.length}件)`}>
          {ssnList.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>SSNがありません</div>
            :<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Superset','Subset','仕入先','出荷数','到着数','出荷日','ETA','ステータス','船名','B/L番号','信頼度',''].map((h,i)=><th key={h} style={TH(i===3||i===4?'right':'left')}>{h}</th>)}</tr></thead>
              <tbody>{ssnList.map((n,i)=>(<tr key={n.id} style={{background:i%2===0?'transparent':'#fafbfc'}}>
                <td style={{...TD(),color:T.indigo,fontWeight:600,fontSize:11}}>{n.superset||n.skus?.superset||'—'}</td>
                <td style={{...TD(),color:T.slate,fontSize:11}}>{n.subset||n.skus?.subset||n.skus?.name||'—'}</td>
                <td style={{...TD(),color:T.muted,fontSize:11}}>{n.supplier||'—'}</td>
                <td style={TDN()}>{fmt(n.ship_qty)}</td>
                <td style={{...TDN(),fontWeight:700,color:T.green}}>{fmt(n.arrival_qty)}</td>
                <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,color:T.muted}}>{n.ship_date||'—'}</td>
                <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,fontWeight:600}}>{n.eta_date}</td>
                <td style={TD()}><SSNBadge status={n.status}/></td>
                <td style={{...TD(),color:T.muted,fontSize:11}}>{n.vessel||'—'}</td>
                <td style={{...TD(),fontFamily:T.fontNum,color:T.muted,fontSize:10}}>{n.bl_number||'—'}</td>
                <td style={TD()}><ConfBar value={n.confidence}/></td>
                <td style={TD()}>
                  <Btn variant="ghost" small onClick={()=>{setSnf({sku_id:n.sku_id,superset:n.superset||'',subset:n.subset||'',supplier:n.supplier||'',ship_qty:n.ship_qty,arrival_qty:n.arrival_qty,ship_date:n.ship_date||'',eta_date:n.eta_date,status:n.status,confidence:n.confidence,vessel:n.vessel||'',bl_number:n.bl_number||'',origin_port:n.origin_port||'',dest_port:n.dest_port||''});setErr(null);setSsnModal(n)}} style={{marginRight:4}}>編集</Btn>
                  <Btn variant="danger" small onClick={async()=>{if(confirm('削除?')){await supabase.from('ssns').delete().eq('id',n.id);fetchAll()}}}>削除</Btn>
                </td>
              </tr>))}</tbody>
            </table></div>
          }
        </Panel>
      </>):<ProBanner onUpgrade={()=>setShowPricing(true)}/>)}

      {tab==='movements'&&(isPro?(<>
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <Btn onClick={()=>{setMf({...BMOVE,sku_id:skus[0]?.id||''});setErr(null);setMoveModal(true)}} disabled={skus.length===0}>+ 入出庫記録</Btn>
        </div>
        <Panel title={`↕ 入出庫履歴 (${moves.length}件)`}>
          {moves.length===0
            ?<div style={{padding:'28px',textAlign:'center',color:T.muted,fontSize:12,fontFamily:T.font}}>履歴がありません</div>
            :<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['日付','SKU名','数量','種別','参照番号'].map((h,i)=><th key={h} style={TH(i===2?'right':'left')}>{h}</th>)}</tr></thead>
              <tbody>{moves.map((m,i)=>(<tr key={m.id} style={{background:i%2===0?'transparent':'#fafbfc'}}>
                <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,color:T.muted}}>{m.date}</td>
                <td style={{...TD(),fontWeight:600}}>{m.skus?.name||m.sku_id}</td>
                <td style={{...TDN(),fontWeight:700,color:m.qty>=0?T.green:T.red}}>{m.qty>=0?'+':''}{fmt(m.qty)}</td>
                <td style={TD()}><span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:2,fontFamily:T.font,background:m.type==='inbound'?T.gBg:T.redBg,color:m.type==='inbound'?T.green:T.red}}>{(m.type||'sale').toUpperCase()}</span></td>
                <td style={{...TD(),fontFamily:T.fontNum,fontSize:11,color:T.muted}}>{m.ref||'—'}</td>
              </tr>))}</tbody>
            </table></div>
          }
        </Panel>
      </>):<ProBanner onUpgrade={()=>setShowPricing(true)}/>)}
    </div>

    {skuModal&&(<Modal title={skuModal==='add'?'SKU追加':`編集 — ${skuModal.name}`} onClose={()=>setSkuModal(false)}>
      {err&&<div style={ERR}>{err}</div>}
      <div style={{background:T.bluBg,border:`1px solid ${T.bluBdr}`,borderRadius:3,padding:'10px 12px',marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:11,color:T.blue,fontFamily:T.font,marginBottom:6}}>📦 Superset / Subset 設定</div>
        <div style={{fontSize:10,color:T.slate,fontFamily:T.font,marginBottom:10}}>例: Superset=イヤホン / Subset=A社 イヤホンA</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
          <Fld label="SUPERSET" value={sf.superset} onChange={e=>setSf(f=>({...f,superset:e.target.value}))} placeholder="例: イヤホン"/>
          <Fld label="SUBSET"   value={sf.subset}   onChange={e=>setSf(f=>({...f,subset:e.target.value}))}   placeholder="例: A社 イヤホンA"/>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
        <div style={{gridColumn:'1/-1'}}><Fld label="SKU名" required value={sf.name} onChange={e=>setSf(f=>({...f,name:e.target.value}))} placeholder="例: A社 イヤホンA Pro"/></div>
        <Fld label="仕入先"   value={sf.supplier}    onChange={e=>setSf(f=>({...f,supplier:e.target.value}))}    placeholder="Supplier-A"/>
        <Fld label="カテゴリ" value={sf.category}    onChange={e=>setSf(f=>({...f,category:e.target.value}))}    placeholder="Audio"/>
        <Fld label="在庫数量" required type="number" min="0" value={sf.stock_qty}   onChange={e=>setSf(f=>({...f,stock_qty:e.target.value}))}   placeholder="0"/>
        <Fld label="1日使用量" required type="number" min="0" value={sf.daily_usage} onChange={e=>setSf(f=>({...f,daily_usage:e.target.value}))} placeholder="個/日"/>
        <Fld label="リードタイム(日)" required type="number" min="0" value={sf.lead_time} onChange={e=>setSf(f=>({...f,lead_time:e.target.value}))} placeholder="14"/>
        <Fld label="安全在庫" type="number" min="0" value={sf.safety_stock} onChange={e=>setSf(f=>({...f,safety_stock:e.target.value}))} placeholder={`自動: ${(+sf.daily_usage||0)*3}`}/>
        <Fld label="MOQ" type="number" min="0" value={sf.moq} onChange={e=>setSf(f=>({...f,moq:e.target.value}))} placeholder="最小発注量"/>
        <div style={{gridColumn:'1/-1'}}><Fld label="単価 ($)" type="number" min="0" step="0.01" value={sf.unit_cost} onChange={e=>setSf(f=>({...f,unit_cost:e.target.value}))} placeholder="28.50"/></div>
      </div>
      <div style={{fontSize:10,color:T.muted,background:T.bg,borderRadius:3,padding:'8px 10px',marginBottom:12,fontFamily:T.font}}>発注点 = {(+sf.lead_time||0)*(+sf.daily_usage||0)}個　|　安全在庫 = {sf.safety_stock||(+sf.daily_usage||0)*3}個</div>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={saveSku} disabled={saving} style={{flex:1,padding:10}}>{saving?'保存中…':skuModal==='add'?'追加':'保存'}</Btn>
        <Btn variant="ghost" onClick={()=>setSkuModal(false)} style={{flex:1,padding:10}}>キャンセル</Btn>
      </div>
    </Modal>)}

    {ssnModal&&(<Modal title={ssnModal==='add'?'SSN追加 — 入荷予定登録':'SSN編集'} onClose={()=>setSsnModal(false)}>
      {err&&<div style={ERR}>{err}</div>}
      <div style={{background:T.gBg,border:`1px solid ${T.gBdr}`,borderRadius:3,padding:'8px 12px',marginBottom:14,fontSize:11,color:T.green,fontFamily:T.font}}>💡 サプライヤーから出荷通知を受けたら、出荷・到着数量と日付を登録してください</div>
      <label style={LBL}>SKU <span style={{color:T.red}}>*</span></label>
      <select style={INP} value={snf.sku_id} onChange={e=>setSnf(f=>({...f,sku_id:e.target.value}))}>
        <option value="">選択してください…</option>
        {skus.map(s=><option key={s.id} value={s.id}>{s.superset?`${s.superset} › ${s.subset||s.name}`:s.name}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
        <Fld label="SUPERSET" value={snf.superset} onChange={e=>setSnf(f=>({...f,superset:e.target.value}))} placeholder="イヤホン"/>
        <Fld label="SUBSET"   value={snf.subset}   onChange={e=>setSnf(f=>({...f,subset:e.target.value}))}   placeholder="A社 イヤホンA"/>
        <Fld label="出荷数量" type="number" min="0" value={snf.ship_qty}    onChange={e=>setSnf(f=>({...f,ship_qty:e.target.value}))}    placeholder="個"/>
        <Fld label="到着数量" type="number" min="0" value={snf.arrival_qty} onChange={e=>setSnf(f=>({...f,arrival_qty:e.target.value}))} placeholder="個 (未入力=出荷数)"/>
        <Fld label="出荷日" type="date" value={snf.ship_date} onChange={e=>setSnf(f=>({...f,ship_date:e.target.value}))}/>
        <Fld label="ETA (到着予定日)" required type="date" value={snf.eta_date} onChange={e=>setSnf(f=>({...f,eta_date:e.target.value}))}/>
      </div>
      <label style={LBL}>ステータス</label>
      <select style={INP} value={snf.status} onChange={e=>setSnf(f=>({...f,status:e.target.value}))}>
        {[['booked','予約済'],['in_transit','輸送中'],['customs','通関中'],['arrived','着荷'],['cancelled','キャンセル']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
        <Fld label="仕入先"  value={snf.supplier}    onChange={e=>setSnf(f=>({...f,supplier:e.target.value}))}    placeholder="Supplier-A"/>
        <Fld label="信頼度 (0〜1)" type="number" min="0" max="1" step="0.05" value={snf.confidence} onChange={e=>setSnf(f=>({...f,confidence:e.target.value}))}/>
        <Fld label="船名"    value={snf.vessel}      onChange={e=>setSnf(f=>({...f,vessel:e.target.value}))}      placeholder="EVER GRACE"/>
        <Fld label="B/L番号" value={snf.bl_number}   onChange={e=>setSnf(f=>({...f,bl_number:e.target.value}))}   placeholder="BL240501"/>
        <Fld label="出発港"  value={snf.origin_port} onChange={e=>setSnf(f=>({...f,origin_port:e.target.value}))} placeholder="Shenzhen"/>
        <Fld label="到着港"  value={snf.dest_port}   onChange={e=>setSnf(f=>({...f,dest_port:e.target.value}))}   placeholder="Los Angeles"/>
      </div>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={saveSsn} disabled={saving} style={{flex:1,padding:10}}>{saving?'保存中…':ssnModal==='add'?'登録':'保存'}</Btn>
        <Btn variant="ghost" onClick={()=>setSsnModal(false)} style={{flex:1,padding:10}}>キャンセル</Btn>
      </div>
    </Modal>)}

    {moveModal&&(<Modal title="入出庫記録" onClose={()=>setMoveModal(false)}>
      {err&&<div style={ERR}>{err}</div>}
      <Fld label="日付" type="date" value={mf.date} onChange={e=>setMf(f=>({...f,date:e.target.value}))}/>
      <label style={LBL}>SKU <span style={{color:T.red}}>*</span></label>
      <select style={INP} value={mf.sku_id} onChange={e=>setMf(f=>({...f,sku_id:e.target.value}))}>
        <option value="">選択してください…</option>
        {skus.map(s=><option key={s.id} value={s.id}>{s.superset?`${s.superset} › `:''}{s.name} (在庫:{s.stock_qty})</option>)}
      </select>
      <Fld label="数量 (入庫=正 / 出庫=負)" type="number" value={mf.qty} onChange={e=>setMf(f=>({...f,qty:e.target.value}))} placeholder="+100 または -20"/>
      <label style={LBL}>種別</label>
      <select style={INP} value={mf.type} onChange={e=>setMf(f=>({...f,type:e.target.value}))}>
        {['sale','inbound','adjustment','return','write-off'].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
      </select>
      <Fld label="参照番号 (任意)" value={mf.ref} onChange={e=>setMf(f=>({...f,ref:e.target.value}))} placeholder="ORD-1234"/>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={saveMove} disabled={saving} style={{flex:1,padding:10}}>{saving?'保存中…':'保存'}</Btn>
        <Btn variant="ghost" onClick={()=>setMoveModal(false)} style={{flex:1,padding:10}}>キャンセル</Btn>
      </div>
    </Modal>)}

    {showPricing&&<PricingModal user={user} onClose={()=>setShowPricing(false)}/>}
  </div>)
}
