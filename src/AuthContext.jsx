import { createContext, useContext, useEffect, useState } from 'react'
import { resetAnalyticsIdentity } from './growth/analytics.js'
import { supabase, configurationError } from './supabase.js'
const Ctx = createContext(null)
const unavailable = async () => ({error:new Error(configurationError || 'Authentication unavailable')})
export function AuthProvider({ children }) {
  const [user,setUser] = useState(null)
  const [loading,setLoading] = useState(Boolean(supabase))
  const [error,setError] = useState(configurationError)
  useEffect(() => {
    if(!supabase)return
    let alive=true, changes=0
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{changes++;if(alive){setUser(session?.user ?? null);setLoading(false)}})
    const current=changes
    supabase.auth.getSession().then(({data,error})=>{if(alive && current===changes){setUser(data?.session?.user ?? null);setError(error?.message || null);setLoading(false)}}).catch(()=>{if(alive){setError('Unable to restore the session. Please sign in again.');setLoading(false)}})
    return ()=>{alive=false;subscription.unsubscribe()}
  },[])
  return <Ctx.Provider value={{user,loading,error,configurationError,
    signUp:supabase ? (email,password)=>supabase.auth.signUp({email,password}) : unavailable,
    signIn:supabase ? (email,password)=>supabase.auth.signInWithPassword({email,password}) : unavailable,
    signOut:supabase ? ()=>supabase.auth.signOut().then(result=>{if(!result.error)resetAnalyticsIdentity();return result}) : unavailable,
  }}>{children}</Ctx.Provider>
}
export const useAuth=()=>useContext(Ctx)
