'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type AdminLinkCardProps = {
  title: string
  description: string
  href?: string
  status?: string
  disabled?: boolean
}

function AdminLinkCard({
  title,
  description,
  href,
  status,
  disabled = false,
}: AdminLinkCardProps) {
  const content = (
    <div
      className={`rounded-2xl border p-6 transition ${
        disabled
          ? 'cursor-not-allowed border-slate-800 bg-slate-900/70 opacity-70'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-900/90'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        </div>

        {status ? (
          <span className="shrink-0 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
            {status}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <span
          className={`inline-flex rounded-xl px-4 py-2 text-sm font-semibold ${
            disabled ? 'bg-slate-800 text-slate-400' : 'bg-indigo-600 text-white'
          }`}
        >
          {disabled ? 'Not Ready Yet' : 'Open'}
        </span>
      </div>
    </div>
  )

  if (disabled || !href) {
    return content
  }

  return <Link href={href}>{content}</Link>
}

export default function AdminPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      setLoading(false)
    }

    void load()
  }, [router])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">Loading admin...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Admin</h1>
          <p className="mt-2 text-slate-400">
            Moderation, support, and operations control surface.
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Control Center</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Access moderation references, support guidance, support ticket operations, payout
                visibility, and operational oversight from one place.
              </p>
            </div>

            <Link
              href="/explore"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back to Explore
            </Link>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AdminLinkCard
            title="OPS"
            description="Open the operations view for platform activity, internal oversight, and light operational reference."
            href="/ops"
            status="Ready"
          />

          <AdminLinkCard
            title="Moderation Matrix"
            description="Open the moderation reference page for dispute handling, refund outcomes, strikes, and evidence review."
            href="/admin/moderation"
            status="Ready"
          />

          <AdminLinkCard
            title="Support / FAQ"
            description="Open the internal support answer bank for booking states, disputes, refunds, busy logic, safety rules, and user-facing explanations."
            href="/admin/support-faq"
            status="Ready"
          />

          <AdminLinkCard
            title="Support Tickets"
            description="Open the real support operations view to review user tickets, open case detail, reply as support, and manage ticket status."
            href="/admin/support/tickets"
            status="Ready"
          />

          <AdminLinkCard
            title="Payouts"
            description="Open the internal payout visibility page for seller eligibility status, blocked payouts, and recent payout release candidates."
            href="/admin/payouts"
            status="Ready"
          />
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">Current Focus</h2>

          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <p>1. Keep OPS accessible here.</p>
            <p>2. Keep Moderation Matrix accessible here.</p>
            <p>3. Keep Support / FAQ accessible here.</p>
            <p>4. Keep Support Tickets accessible here.</p>
            <p>5. Keep Admin Payouts accessible here.</p>
            <p>6. Maintain a clean admin surface focused on visibility and operational clarity.</p>
          </div>
        </div>
      </section>
    </main>
  )
}