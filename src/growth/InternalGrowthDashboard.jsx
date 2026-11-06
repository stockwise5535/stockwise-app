import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../AuthContext.jsx';
import {supabase} from '../supabase.js';
import LoginPage from '../components/LoginPage.jsx';
import SocialMetrics from './SocialMetrics.jsx';
import SocialAutomation from './SocialAutomation.jsx';
import './growth.css';

// Additive internal page. No bootstrap, signup side effects, CRM writes or billing calls.
export default function InternalGrowthDashboard(){
  const {user,loading,signOut}=useAuth();
  const [lang,setLang]=useState('ja'),[access,setAccess]=useState(null),[selected,setSelected]=useState(''),[retry,setRetry]=useState(0);
  const seq=useRef(0);
  useEffect(()=>{
    const current=++seq.current;setAccess(null);setSelected('');
    if(!user)return;
    if(!user.email_confirmed_at){setAccess({userId:user.id,status:'denied'});return;}
    (async()=>{
      try{
        const admin=await supabase.rpc('nexops_is_growth_admin');
        if(admin.error)throw Error();
        if(admin.data!==true){if(current===seq.current)setAccess({userId:user.id,status:'denied'});return;}
        const [workspaces,memberships]=await Promise.all([
          supabase.from('nexops_workspaces').select('id,name,organization_id').order('name'),
          supabase.from('nexops_organization_memberships').select('organization_id,user_id,role').eq('user_id',user.id),
        ]);
        if(workspaces.error||memberships.error)throw Error();
        const orgs=new Set(memberships.data.filter(m=>m.user_id===user.id&&['owner','admin'].includes(m.role)).map(m=>m.organization_id));
        const allowed=workspaces.data.filter(w=>orgs.has(w.organization_id));
        if(current===seq.current){setAccess({userId:user.id,status:'allowed',workspaces:allowed});setSelected(allowed[0]?.id || '');}
      }catch{if(current===seq.current)setAccess({userId:user.id,status:'error'});}
    })();
    return()=>{seq.current++;};
  },[user?.id,user?.email_confirmed_at,retry]);
  if(loading)return <main className="growth"><p role="status">Checking session…</p></main>;
  if(!user)return <LoginPage lang={lang} setLang={setLang}/>;
  const current=access?.userId===user.id?access:null;
  return <main className="growth">
    <header><a href="/">Stockwise</a><h1>Internal Growth Dashboard</h1><button onClick={()=>void signOut()}>Sign out</button></header>
    {!current&&<p role="status">Checking administrator access…</p>}
    {current?.status==='denied'&&<p role="alert">Growth administrator access is required.</p>}
    {current?.status==='error'&&<><p role="alert">Administrator access or workspace configuration could not be verified.</p><button onClick={()=>setRetry(n=>n+1)}>Retry access check</button></>}
    {current?.status==='allowed'&&<>
      <p>Social performance and publishing controls only. Existing inventory, Early Access and billing remain in Stockwise.</p>
      <label>Workspace<select aria-label="Workspace" value={selected} onChange={e=>setSelected(e.target.value)}>{current.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {!selected&&<p role="alert">No authorized workspace is configured. No workspace or permission is created automatically.</p>}
      {selected&&<><SocialMetrics key={'metrics:'+user.id+':'+selected} client={supabase} workspaceId={selected}/><SocialAutomation key={'automation:'+user.id+':'+selected} client={supabase} workspaceId={selected}/></>}
    </>}
  </main>;
}
