import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{
      user, loading,
      signUp:  (e, p) => supabase.auth.signUp({ email: e, password: p }),
      signIn:  (e, p) => supabase.auth.signInWithPassword({ email: e, password: p }),
      signOut: ()     => supabase.auth.signOut(),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
