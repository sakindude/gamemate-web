'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type EligibilityStatus = 'not_started' | 'pending_review' | 'approved' | 'rejected'

type EligibilityOverviewRow = {
  seller_id: string
  display_name: string | null
  username: string | null
  is_online: boolean | null
  payout_eligibility_status: EligibilityStatus | string
  payout_eligibility_updated_at: string | null
  blocked_payout_count: number | null
  blocked_payout_total_cents: number | null
  oldest_blocked_at: string | null
  newest_blocked_at: string | null
}

type BlockedPayoutRow = {
  payout_hold_id: string
  booking_request_id: string | null
  session_id: string | null
  buyer_id: string | null
  seller_id: string
  seller_display_name: string | null
  seller_username: string | null
  seller_payout_eligibility_status: string | null
  currency: string | null
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
  refundable_amount_cents: number | null
  status: string
  held_at: string | null
  releasable_at: string | null
  released_at: string | null
  refunded_at: string | null
  dispute_id: string | null
  blocked_at: string | null
  blocked_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

type RecentCandidateRow = {
  payout_hold_id: string
  booking_request_id: string | null
  session_id: string | null
  seller_id: string
  seller_display_name: string | null
  seller_username: string | null
  payout_eligibility_status: string | null
  status: string
  seller_payout_cents: number | null
  currency: string | null
  releasable_at: string | null
  dispute_id: string | null
  blocked_at: string | null
  blocked_reason: string | null
  created_at: string
  updated_at: string | null
}

type LoadState = 'loading' | 'ready' | 'error'

const ELIGIBILITY_OPTIONS: EligibilityStatus[] = [
  'not_started',
  'pending_review',
  'approved',
  'rejected',
]

function formatMoneyFromCents(value: number | null | undefined, currency = 'USD') {
  const cents = Number(value ?? 0)
  const amount = cents / 100

  const formatted =
    Number.isInteger(amount) || Math.abs(amount % 1) < 0.0000001
      ? `$${amount.toFixed(0)}`
      : `$${amount.toFixed(2)}`

  if (!currency || currency === 'USD') return formatted
  return `${formatted} ${currency}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatSellerLabel(row: {
  seller_display_name?: string | null
  seller_username?: string | null
  display_name?: string | null
  username?: string | null
}) {
  return (
    row.seller_display_name ||
    row.display_name ||
    row.seller_username ||
    row.username ||
    'Unknown seller'
  )
}

function titleCaseStatus(value: string | null | undefined) {
  if (!value) return 'unknown'
  return value.replaceAll('_', ' ')
}

function StatusPill({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'good' | 'warn' | 'danger' | 'muted'
}) {
  const styles =
    tone === 'good'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      : tone === 'danger'
      ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
      : tone === 'muted'
      ? 'border-slate-700 bg-slate-800 text-slate-400'
      : 'border-slate-700 bg-slate-800 text-slate-200'

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  )
}

function eligibilityTone(status: string | null | undefined): 'default' | 'good' | 'warn' | 'danger' {
  switch (status) {
    case 'approved':
      return 'good'
    case 'pending_review':
      return 'warn'
    case 'rejected':
      return 'danger'
    default:
      return 'default'
  }
}

function onlineTone(isOnline: boolean | null | undefined): 'good' | 'muted' {
  return isOnline ? 'good' : 'muted'
}

export default function AdminPayoutsPage() {
  const router = useRouter()

  const [state, setState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [overviewRows, setOverviewRows] = useState<EligibilityOverviewRow[]>([])
  const [blockedRows, setBlockedRows] = useState<BlockedPayoutRow[]>([])
  const [candidateRows, setCandidateRows] = useState<RecentCandidateRow[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const [draftStatuses, setDraftStatuses] = useState<Record<string, EligibilityStatus>>({})
  const [savingSellerId, setSavingSellerId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setState('loading')
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      const [overviewResult, blockedResult, candidatesResult] = await Promise.all([
        supabase
          .from('admin_seller_payout_eligibility_overview')
          .select('*')
          .order('blocked_payout_total_cents', { ascending: false })
          .order('payout_eligibility_updated_at', { ascending: false }),
        supabase
          .from('admin_blocked_payouts')
          .select('*')
          .order('blocked_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('admin_recent_payout_release_candidates')
          .select('*')
          .order('created_at', { ascending: false }),
      ])

      if (overviewResult.error) {
        throw new Error(`Eligibility overview load failed: ${overviewResult.error.message}`)
      }

      if (blockedResult.error) {
        throw new Error(`Blocked payouts load failed: ${blockedResult.error.message}`)
      }

      if (candidatesResult.error) {
        throw new Error(`Recent candidates load failed: ${candidatesResult.error.message}`)
      }

      const nextOverviewRows = (overviewResult.data || []) as EligibilityOverviewRow[]
      const nextBlockedRows = (blockedResult.data || []) as BlockedPayoutRow[]
      const nextCandidateRows = (candidatesResult.data || []) as RecentCandidateRow[]

      setOverviewRows(nextOverviewRows)
      setBlockedRows(nextBlockedRows)
      setCandidateRows(nextCandidateRows)

      setDraftStatuses((current) => {
        const next = { ...current }

        for (const row of nextOverviewRows) {
          const currentStatus = (row.payout_eligibility_status || 'not_started') as EligibilityStatus

          if (!next[row.seller_id]) {
            next[row.seller_id] = currentStatus
          }
        }

        return next
      })

      setState('ready')
      setErrorMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown admin payouts error'
      setErrorMessage(message)
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const summary = useMemo(() => {
    const blockedCount = blockedRows.length
    const blockedTotalCents = blockedRows.reduce(
      (sum, row) => sum + Number(row.seller_payout_cents ?? 0),
      0
    )
    const approvedCount = overviewRows.filter(
      (row) => row.payout_eligibility_status === 'approved'
    ).length
    const notEligibleCount = overviewRows.filter(
      (row) => row.payout_eligibility_status !== 'approved'
    ).length

    return {
      blockedCount,
      blockedTotalCents,
      approvedCount,
      notEligibleCount,
    }
  }, [blockedRows, overviewRows])

  const handleDraftChange = (sellerId: string, status: string) => {
    setDraftStatuses((current) => ({
      ...current,
      [sellerId]: status as EligibilityStatus,
    }))
  }

  const handleApply = async (row: EligibilityOverviewRow) => {
    const nextStatus = draftStatuses[row.seller_id] || (row.payout_eligibility_status as EligibilityStatus)

    if (!nextStatus || nextStatus === row.payout_eligibility_status) {
      return
    }

    try {
      setSavingSellerId(row.seller_id)
      setActionMessage('')
      setActionError('')

      const { data, error } = await supabase.rpc('gm_admin_set_seller_payout_eligibility', {
        p_user_id: row.seller_id,
        p_status: nextStatus,
        p_note: `Admin payouts update: ${row.payout_eligibility_status} -> ${nextStatus}`,
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.success === false) {
        throw new Error(data?.message || 'Eligibility update failed')
      }

      setActionMessage(`Updated ${formatSellerLabel(row)} to ${titleCaseStatus(nextStatus)}.`)
      await loadData(true)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Eligibility update failed')
    } finally {
      setSavingSellerId(null)
    }
  }

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1280px] px-8 py-8">
          <p className="text-slate-400">Loading admin payouts...</p>
        </section>
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1280px] px-8 py-8">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
            <h1 className="text-2xl font-bold text-rose-200">Admin payouts failed to load</h1>
            <p className="mt-3 text-sm leading-6 text-rose-100/90">{errorMessage}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Back to Admin
              </Link>

              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1280px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusPill label="Internal" tone="good" />
              <StatusPill label="Read Only Core + Minimal Write" />
              <StatusPill label="Payout Safety" />
            </div>

            <h1 className="text-4xl font-bold">Admin Payouts</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Internal visibility for seller payout eligibility, blocked payouts, and recent payout
              release candidates.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <Link
              href="/admin"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back to Admin
            </Link>

            <Link
              href="/ops"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Open OPS
            </Link>
          </div>
        </div>

        {actionMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {actionError}
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Blocked payouts
            </div>
            <div className="mt-3 text-3xl font-bold text-white">{summary.blockedCount}</div>
            <p className="mt-2 text-sm text-slate-400">
              Current payout holds blocked by seller eligibility.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Blocked amount
            </div>
            <div className="mt-3 text-3xl font-bold text-white">
              {formatMoneyFromCents(summary.blockedTotalCents)}
            </div>
            <p className="mt-2 text-sm text-slate-400">Total seller payout value currently blocked.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Approved sellers
            </div>
            <div className="mt-3 text-3xl font-bold text-white">{summary.approvedCount}</div>
            <p className="mt-2 text-sm text-slate-400">
              Profiles currently eligible for payout release.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Not eligible
            </div>
            <div className="mt-3 text-3xl font-bold text-white">{summary.notEligibleCount}</div>
            <p className="mt-2 text-sm text-slate-400">
              Profiles not currently eligible for payout release.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">Blocked payouts</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            These payouts were eligible for release timing-wise but were blocked because the seller
            was not approved.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="border-b border-slate-800 px-4 py-3">Seller</th>
                  <th className="border-b border-slate-800 px-4 py-3">Amount</th>
                  <th className="border-b border-slate-800 px-4 py-3">Reason</th>
                  <th className="border-b border-slate-800 px-4 py-3">Blocked At</th>
                  <th className="border-b border-slate-800 px-4 py-3">Booking</th>
                  <th className="border-b border-slate-800 px-4 py-3">Session</th>
                </tr>
              </thead>
              <tbody>
                {blockedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                      No blocked payouts right now.
                    </td>
                  </tr>
                ) : (
                  blockedRows.map((row) => (
                    <tr key={row.payout_hold_id} className="align-top">
                      <td className="border-b border-slate-900 px-4 py-4">
                        <div className="font-semibold text-white">{formatSellerLabel(row)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.seller_id}</div>
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-200">
                        {formatMoneyFromCents(row.seller_payout_cents, row.currency || 'USD')}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusPill label={titleCaseStatus(row.status)} tone="danger" />
                          <StatusPill
                            label={titleCaseStatus(row.seller_payout_eligibility_status)}
                            tone={eligibilityTone(row.seller_payout_eligibility_status)}
                          />
                        </div>
                        <div className="mt-2 text-sm text-slate-400">
                          {titleCaseStatus(row.blocked_reason)}
                        </div>
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-300">
                        {formatDateTime(row.blocked_at)}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 text-xs text-slate-500">
                        {row.booking_request_id || '—'}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 text-xs text-slate-500">
                        {row.session_id || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Eligibility overview</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Lightweight seller-level payout readiness overview with minimal admin status control.
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="border-b border-slate-800 px-4 py-3">Seller</th>
                  <th className="border-b border-slate-800 px-4 py-3">Status</th>
                  <th className="border-b border-slate-800 px-4 py-3">Online</th>
                  <th className="border-b border-slate-800 px-4 py-3">Blocked Count</th>
                  <th className="border-b border-slate-800 px-4 py-3">Blocked Total</th>
                  <th className="border-b border-slate-800 px-4 py-3">Updated</th>
                  <th className="border-b border-slate-800 px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {overviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-sm text-slate-500">
                      No seller payout eligibility rows returned.
                    </td>
                  </tr>
                ) : (
                  overviewRows.map((row) => {
                    const currentStatus = (row.payout_eligibility_status || 'not_started') as EligibilityStatus
                    const draftStatus = draftStatuses[row.seller_id] || currentStatus
                    const dirty = draftStatus !== currentStatus
                    const rowSaving = savingSellerId === row.seller_id

                    return (
                      <tr key={row.seller_id} className="align-top">
                        <td className="border-b border-slate-900 px-4 py-4">
                          <div className="font-semibold text-white">{formatSellerLabel(row)}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.seller_id}</div>
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <StatusPill
                            label={titleCaseStatus(currentStatus)}
                            tone={eligibilityTone(currentStatus)}
                          />
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <StatusPill
                            label={row.is_online ? 'online' : 'offline'}
                            tone={onlineTone(row.is_online)}
                          />
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-200">
                          {Number(row.blocked_payout_count ?? 0)}
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-200">
                          {formatMoneyFromCents(row.blocked_payout_total_cents)}
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-300">
                          {formatDateTime(row.payout_eligibility_updated_at)}
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <div className="flex min-w-[260px] flex-col gap-2 sm:flex-row">
                            <select
                              value={draftStatus}
                              onChange={(e) => handleDraftChange(row.seller_id, e.target.value)}
                              disabled={rowSaving}
                              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {ELIGIBILITY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {titleCaseStatus(option)}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => void handleApply(row)}
                              disabled={!dirty || rowSaving}
                              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {rowSaving ? 'Saving...' : 'Apply'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">Recent payout candidates</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Recent held or blocked payout rows that are relevant to release processing.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="border-b border-slate-800 px-4 py-3">Seller</th>
                  <th className="border-b border-slate-800 px-4 py-3">Amount</th>
                  <th className="border-b border-slate-800 px-4 py-3">Eligibility</th>
                  <th className="border-b border-slate-800 px-4 py-3">Payout Status</th>
                  <th className="border-b border-slate-800 px-4 py-3">Releasable At</th>
                  <th className="border-b border-slate-800 px-4 py-3">Ready</th>
                </tr>
              </thead>
              <tbody>
                {candidateRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                      No recent payout candidates right now.
                    </td>
                  </tr>
                ) : (
                  candidateRows.map((row) => {
                    const ready =
                      !!row.releasable_at &&
                      new Date(row.releasable_at).getTime() <= Date.now() &&
                      !row.dispute_id

                    return (
                      <tr key={row.payout_hold_id} className="align-top">
                        <td className="border-b border-slate-900 px-4 py-4">
                          <div className="font-semibold text-white">{formatSellerLabel(row)}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.seller_id}</div>
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-200">
                          {formatMoneyFromCents(row.seller_payout_cents, row.currency || 'USD')}
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <StatusPill
                            label={titleCaseStatus(row.payout_eligibility_status)}
                            tone={eligibilityTone(row.payout_eligibility_status)}
                          />
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <StatusPill
                            label={titleCaseStatus(row.status)}
                            tone={row.status === 'blocked_unverified_seller' ? 'danger' : 'default'}
                          />
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4 text-sm text-slate-300">
                          {formatDateTime(row.releasable_at)}
                        </td>
                        <td className="border-b border-slate-900 px-4 py-4">
                          <StatusPill label={ready ? 'true' : 'false'} tone={ready ? 'good' : 'muted'} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}