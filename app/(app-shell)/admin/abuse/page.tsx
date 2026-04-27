'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type TopUser = {
  user_id: string
  total_flags: number
  last_7d_count: number
  last_24h_count: number
}

type RecentFlag = {
  created_at: string
  user_id: string
  related_user_id: string | null
  flag_type: string
  metadata: any
}

type FlagType = {
  flag_type: string
  count: number
}

type Pair = {
  user_id: string
  related_user_id: string | null
  count: number
}

export default function AdminAbusePage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)

  const [topUsers, setTopUsers] = useState<TopUser[]>([])
  const [recentFlags, setRecentFlags] = useState<RecentFlag[]>([])
  const [flagTypes, setFlagTypes] = useState<FlagType[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      // TOP USERS
      const { data: topUsersData } = await supabase
        .from('admin_abuse_top_users_v1')
        .select('*')
        .order('total_flags', { ascending: false })
        .limit(20)

      // RECENT FLAGS
      const { data: recentFlagsData } = await supabase
        .from('admin_abuse_recent_flags_v1')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      // FLAG TYPES
      const { data: flagTypesData } = await supabase
        .from('admin_abuse_flag_types_v1')
        .select('*')
        .order('count', { ascending: false })

      // PAIRS
      const { data: pairsData } = await supabase
        .from('admin_abuse_pairs_v1')
        .select('*')
        .order('count', { ascending: false })
        .limit(20)

      setTopUsers(topUsersData || [])
      setRecentFlags(recentFlagsData || [])
      setFlagTypes(flagTypesData || [])
      setPairs(pairsData || [])

      setLoading(false)
    }

    void load()
  }, [router])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">Loading abuse data...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1160px] px-8 py-8">

        {/* HEADER */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Abuse Signals</h1>
            <p className="mt-2 text-slate-400">
              Internal visibility of suspicious behavior flags.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Back to Admin
          </Link>
        </div>

        {/* TOP USERS */}
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold mb-4">Top Flagged Users</h2>

          <div className="space-y-3">
            {topUsers.map((u) => (
              <div
                key={u.user_id}
                className="flex justify-between rounded-xl border border-slate-800 bg-[#020617] p-4 text-sm"
              >
                <span className="text-slate-300">{u.user_id}</span>

                <div className="flex gap-6 text-slate-400">
                  <span>Total: {u.total_flags}</span>
                  <span>7d: {u.last_7d_count}</span>
                  <span>24h: {u.last_24h_count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FLAG TYPES */}
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold mb-4">Flags by Type</h2>

          <div className="space-y-3">
            {flagTypes.map((t) => (
              <div
                key={t.flag_type}
                className="flex justify-between rounded-xl border border-slate-800 bg-[#020617] p-4 text-sm"
              >
                <span className="text-slate-300">{t.flag_type}</span>
                <span className="text-slate-400">{t.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PAIRS */}
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold mb-4">Repeated Pairs</h2>

          <div className="space-y-3">
            {pairs.map((p, idx) => (
              <div
                key={idx}
                className="flex justify-between rounded-xl border border-slate-800 bg-[#020617] p-4 text-sm"
              >
                <span className="text-slate-300">
                  {p.user_id} → {p.related_user_id}
                </span>

                <span className="text-slate-400">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RECENT FLAGS */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold mb-4">Recent Flags</h2>

          <div className="space-y-3">
            {recentFlags.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-800 bg-[#020617] p-4 text-sm"
              >
                <div className="flex justify-between text-slate-400">
                  <span>{new Date(f.created_at).toLocaleString()}</span>
                  <span>{f.flag_type}</span>
                </div>

                <div className="mt-2 text-slate-300">
                  {f.user_id} → {f.related_user_id || '—'}
                </div>

                <pre className="mt-2 text-xs text-slate-500 overflow-x-auto">
                  {JSON.stringify(f.metadata, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>

      </section>
    </main>
  )
}