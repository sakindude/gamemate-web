'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const guard = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      console.log('[ADMIN_LAYOUT] session email:', session?.user?.email || null)
      console.log('[ADMIN_LAYOUT] session user id:', session?.user?.id || null)

      if (!session?.user) {
        console.log('[ADMIN_LAYOUT] no session -> /login')
        router.replace('/login')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', session.user.id)
        .maybeSingle()

      console.log('[ADMIN_LAYOUT] profile row:', profile)
      console.log('[ADMIN_LAYOUT] profile error:', error)

      if (error || !profile || profile.role !== 'admin') {
        console.log('[ADMIN_LAYOUT] blocked -> /explore')
        router.replace('/explore')
        return
      }

      if (!cancelled) {
        console.log('[ADMIN_LAYOUT] allowed')
        setAllowed(true)
        setLoading(false)
      }
    }

    void guard()

    return () => {
      cancelled = true
    }
  }, [router])

  if (loading || !allowed) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">Checking admin access...</p>
        </section>
      </main>
    )
  }

  return <>{children}</>
}