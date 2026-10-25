import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import {useAuth} from '../AuthContext.jsx'
import {supabase} from '../supabase.js'
import {createGrowthService} from './service.js'
import {loadStarterContext} from './bootstrap.js'
import './growth.css'
const Context=createContext(null)
export const useStarterContext=()=>useContext(Context)
export default function StarterContext({children}){
 const {user,session,loading,signOut,sessionEpoch}=useAuth()
 const api=useMemo(()=>supabase?createGrowthService(supabase):null,[])
 const [state,setState]=useState({phase:'idle'}),[retry,setRetry]=useState(0)
 const userId=user?.id,sessionReady=!!session?.access_token&&session.user?.id===userId
 useEffect(()=>{
  let active=true
  if(loading||!userId||!sessionReady){setState({phase:'idle'});return()=>{active=false}}
  setState({phase:'loading',userId})
  void loadStarterContext({client:supabase,api,userId}).then(context=>{if(active)setState({phase:'ready',userId,context})},error=>{if(active)setState({phase:'error',userId,error:error.message})})
  return()=>{active=false}
 },[api,userId,sessionReady,loading,sessionEpoch,retry])
 if(!loading&&!user)return children
 if(state.phase==='ready'&&state.userId===userId&&sessionReady)return <Context.Provider value={state.context}>{children}</Context.Provider>
 return <main className="growth"><section className="growth-card" aria-label="Workspace setup">
  <h1>{state.phase==='error'?'Workspace setup needs attention':'Preparing your workspace'}</h1>
  {state.phase==='error'?<><p role="alert">{state.error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry workspace setup</button><button onClick={()=>void signOut()}>Sign out</button></>:<p role="status">{loading||!sessionReady?'Restoring your session…':'Preparing your starter workspace…'}</p>}
 </section></main>
}
