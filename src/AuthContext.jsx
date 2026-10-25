import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (!error) {
      setUser(null)
    }

    setLoading(false)
    return { error }
  }

  return (
    <Ctx.Provider value={{
      user,
      loading,
      signUp: (e, p) => supabase.auth.signUp({ email: e, password: p }),
      signIn: (e, p) => supabase.auth.signInWithPassword({ email: e, password: p }),
      signOut,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
