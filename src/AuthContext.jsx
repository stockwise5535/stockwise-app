import { createContext, useContext, useEffect, useState } from 'react'
import { resetAnalyticsIdentity } from './growth/analytics.js'
import { supabase, configurationError } from './supabase.js'
const Ctx = createContext(null)
const unavailable = async () => ({error:new Error(configurationError || 'Authentication unavailable')})
export function AuthProvider({ children }) {
  const [session,setSession] = useState(null)
  const [sessionEpoch,setSessionEpoch] = useState(0)
  const user=session?.user ?? null
  const [loading,setLoading] = useState(Boolean(supabase))
  const [error,setError] = useState(configurationError)
  useEffect(() => {
    if(!supabase)return
    let alive=true, changes=0
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{changes++;if(alive){setSession(session??null);setError(null);if(event==='SIGNED_OUT')setSessionEpoch(n=>n+1);setLoading(false)}})
    const current=changes
    supabase.auth.getSession().then(({data,error})=>{if(alive && current===changes){setSession(data?.session ?? null);setError(error?.message || null);setLoading(false)}}).catch(()=>{if(alive && current===changes){setError('Unable to restore the session. Please sign in again.');setLoading(false)}})
    return ()=>{alive=false;subscription.unsubscribe()}
  },[])
  return <Ctx.Provider value={{user,session,sessionEpoch,loading,error,configurationError,
    signUp:supabase ? (email,password)=>supabase.auth.signUp({email,password,options:{emailRedirectTo:new URL('/growth',window.location.origin).href}}) : unavailable,
    signIn:supabase ? (email,password)=>supabase.auth.signInWithPassword({email,password}) : unavailable,
    signOut:supabase ? ()=>supabase.auth.signOut().then(result=>{if(!result.error)resetAnalyticsIdentity();return result}) : unavailable,
  }}>{children}</Ctx.Provider>
}
export const useAuth=()=>useContext(Ctx)
