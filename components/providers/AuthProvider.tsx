// START_FILE: components/providers/AuthProvider.tsx
'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const mountedRef = useRef(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true

    const applySession = (nextSession: Session | null) => {
      if (!mountedRef.current) return

      setSession((prev) => {
        if (prev?.access_token === nextSession?.access_token) return prev
        return nextSession
      })

      setLoading(false)
      initializedRef.current = true
    }

    const initialize = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          console.error('AuthProvider getSession error:', error.message)
          applySession(null)
          return
        }

        applySession(data.session ?? null)
      } catch (error) {
        console.error('AuthProvider getSession threw:', error)
        applySession(null)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
    })

    void initialize()

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  const user = session?.user ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
    }),
    [user, session, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }

  return context
}
// END_FILE