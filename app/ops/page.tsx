'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type ProfileRow = {
  id: string
  username?: string | null
  display_name?: string | null
  full_name?: string | null
  nickname?: string | null
  name?: string | null
}

type BookingRow = {
  id: string
  buyer_id: string
  seller_id: string
  status: string
  game: string | null
  communication_method: string | null
  created_at: string
  updated_at?: string | null
  base_price_cents?: number | null
  tip_cents?: number | null
  processing_fee_cents?: number | null
  platform_fee_cents?: number | null
  total_amount_cents?: number | null
  seller_payout_cents?: number | null
}

type SessionRow = {
  id: string
  booking_request_id: string
  buyer_id: string
  seller_id: string
  status: string
  started_at: string | null
  ended_at: string | null
  completed_at: string | null
  buyer_started_at: string | null
  seller_started_at: string | null
  buyer_completed_at: string | null
  seller_completed_at: string | null
  no_show_side: string | null
  auto_complete_at: string | null
  dispute_deadline_at: string | null
  created_at: string
  updated_at: string
}

type PayoutHoldRow = {
  id: string
  booking_request_id: string
  session_id: string | null
  buyer_id: string
  seller_id: string
  currency: string
  base_price_cents: number
  tip_cents: number
  processing_fee_cents: number
  platform_fee_cents: number
  total_amount_cents: number
  seller_payout_cents: number
  refundable_amount_cents: number
  status: string
  held_at: string
  releasable_at: string | null
  released_at: string | null
  refunded_at: string | null
  dispute_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type SessionEventRow = {
  id: string
  session_id: string
  event_type: string
  actor_user_id: string | null
  entity_id: string | null
  metadata: Record<string, any> | null
  created_at: string
}

type DisputeRow = {
  id: string
  booking_request_id: string
  session_id: string
  payout_hold_id: string | null
  opened_by_user_id: string
  target_user_id: string | null
  reason_code: string
  description: string | null
  status: string
  resolution_note: string | null
  resolved_by_user_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type StrikeRow = {
  id: string
  user_id: string
  dispute_id: string | null
  session_id: string | null
  booking_request_id: string | null
  reason_code: string
  points: number
  note: string | null
  expires_at: string | null
  created_at: string
}

type ProfileMap = Record<string, ProfileRow>

function formatPersonName(profile?: ProfileRow | null) {
  if (!profile) return 'Unknown User'
  return (
    profile.username ||
    profile.display_name ||
    profile.full_name ||
    profile.nickname ||
    profile.name ||
    profile.id
  )
}

function shortId(value?: string | null) {
  if (!value) return '-'
  if (value.length <= 10) return value
  return `${value.slice(0, 8)}...`
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatMoneyFromCents(value?: number | null) {
  const amount = Number(value || 0) / 100
  return `₺${amount.toFixed(2)}`
}

function statusClass(status?: string | null) {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
    case 'accepted':
    case 'active':
    case 'held':
      return 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
    case 'awaiting_completion_confirmation':
    case 'awaiting_buyer_confirmation':
    case 'disputed':
    case 'under_review':
      return 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
    case 'completed':
    case 'released':
    case 'resolved_buyer_favor':
    case 'resolved_seller_favor':
    case 'resolved_partial':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
    case 'rejected':
    case 'cancelled':
    case 'refunded':
    case 'partial_refund':
    case 'no_show_buyer':
    case 'no_show_seller':
      return 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
    default:
      return 'bg-slate-500/20 text-slate-300 border border-slate-400/30'
  }
}

function CardTitle({
  title,
  count,
}: {
  title: string
  count?: number
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      {typeof count === 'number' ? (
        <div className="rounded-full bg-[#101b38] px-3 py-1 text-sm font-semibold text-slate-300">
          {count}
        </div>
      ) : null}
    </div>
  )
}

export default function OpsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [payoutHolds, setPayoutHolds] = useState<PayoutHoldRow[]>([])
  const [sessionEvents, setSessionEvents] = useState<SessionEventRow[]>([])
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [strikes, setStrikes] = useState<StrikeRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [userEmail, setUserEmail] = useState('')

  useLayoutEffect(() => {
    document.title = 'Ops | GameMate'
  }, [])

  useEffect(() => {
    document.title = 'Ops | GameMate'

    const titleTimer = window.setTimeout(() => {
      document.title = 'Ops | GameMate'
    }, 50)

    return () => {
      window.clearTimeout(titleTimer)
    }
  }, [])

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    setErrorText('')
    setSuccessText('')

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      setErrorText('You must be logged in.')
      setLoading(false)
      setRefreshing(false)
      return
    }

    setUserEmail(session.user.email || '')

    const [
      bookingsResult,
      sessionsResult,
      payoutHoldsResult,
      eventsResult,
      disputesResult,
      strikesResult,
    ] = await Promise.all([
      supabase
        .from('booking_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),

      supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),

      supabase
        .from('payout_holds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),

      supabase
        .from('session_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80),

      supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),

      supabase
        .from('strikes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const firstError =
      bookingsResult.error ||
      sessionsResult.error ||
      payoutHoldsResult.error ||
      eventsResult.error ||
      disputesResult.error ||
      strikesResult.error

    if (firstError) {
      console.error(firstError)
      setErrorText(firstError.message || 'Failed to load ops data.')
      setLoading(false)
      setRefreshing(false)
      return
    }

    const bookingRows = (bookingsResult.data || []) as BookingRow[]
    const sessionRows = (sessionsResult.data || []) as SessionRow[]
    const payoutRows = (payoutHoldsResult.data || []) as PayoutHoldRow[]
    const eventRows = (eventsResult.data || []) as SessionEventRow[]
    const disputeRows = (disputesResult.data || []) as DisputeRow[]
    const strikeRows = (strikesResult.data || []) as StrikeRow[]

    setBookings(bookingRows)
    setSessions(sessionRows)
    setPayoutHolds(payoutRows)
    setSessionEvents(eventRows)
    setDisputes(disputeRows)
    setStrikes(strikeRows)

    const userIds = Array.from(
      new Set(
        [
          ...bookingRows.flatMap((row) => [row.buyer_id, row.seller_id]),
          ...sessionRows.flatMap((row) => [row.buyer_id, row.seller_id]),
          ...payoutRows.flatMap((row) => [row.buyer_id, row.seller_id]),
          ...eventRows.flatMap((row) => [row.actor_user_id].filter(Boolean)),
          ...disputeRows.flatMap((row) =>
            [row.opened_by_user_id, row.target_user_id, row.resolved_by_user_id].filter(Boolean)
          ),
          ...strikeRows.flatMap((row) => [row.user_id].filter(Boolean)),
        ].filter(Boolean)
      )
    ) as string[]

    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)

      if (profilesError) {
        console.error(profilesError)
      } else {
        const nextMap: ProfileMap = {}
        for (const row of profileRows || []) {
          nextMap[row.id] = row as ProfileRow
        }
        setProfiles(nextMap)
      }
    } else {
      setProfiles({})
    }

    setSuccessText('Ops data refreshed.')
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const bookingMap = useMemo(() => {
    const map: Record<string, BookingRow> = {}
    for (const row of bookings) {
      map[row.id] = row
    }
    return map
  }, [bookings])

  const sessionMap = useMemo(() => {
    const map: Record<string, SessionRow> = {}
    for (const row of sessions) {
      map[row.id] = row
    }
    return map
  }, [sessions])

  const snapshotText = useMemo(() => {
    const lines: string[] = []

    lines.push('=== OPS SNAPSHOT START ===')
    lines.push(`Generated At: ${new Date().toLocaleString()}`)
    lines.push(`Bookings: ${bookings.length}`)
    lines.push(`Sessions: ${sessions.length}`)
    lines.push(`Payout Holds: ${payoutHolds.length}`)
    lines.push(`Events: ${sessionEvents.length}`)
    lines.push(`Disputes: ${disputes.length}`)
    lines.push(`Strikes: ${strikes.length}`)
    lines.push('')

    lines.push('--- RECENT BOOKINGS ---')
    if (bookings.length === 0) {
      lines.push('No bookings found.')
    } else {
      for (const row of bookings.slice(0, 15)) {
        lines.push(
          [
            `booking_id=${row.id}`,
            `status=${row.status}`,
            `buyer=${formatPersonName(profiles[row.buyer_id])}`,
            `seller=${formatPersonName(profiles[row.seller_id])}`,
            `game=${row.game || '-'}`,
            `communication=${row.communication_method || '-'}`,
            `total=${formatMoneyFromCents(row.total_amount_cents)}`,
            `seller_payout=${formatMoneyFromCents(row.seller_payout_cents)}`,
            `created=${formatDateTime(row.created_at)}`,
          ].join(' | ')
        )
      }
    }

    lines.push('')
    lines.push('--- RECENT SESSIONS ---')
    if (sessions.length === 0) {
      lines.push('No sessions found.')
    } else {
      for (const row of sessions.slice(0, 15)) {
        lines.push(
          [
            `session_id=${row.id}`,
            `booking_request_id=${row.booking_request_id}`,
            `status=${row.status}`,
            `buyer=${formatPersonName(profiles[row.buyer_id])}`,
            `seller=${formatPersonName(profiles[row.seller_id])}`,
            `buyer_started_at=${formatDateTime(row.buyer_started_at)}`,
            `seller_started_at=${formatDateTime(row.seller_started_at)}`,
            `started_at=${formatDateTime(row.started_at)}`,
            `buyer_completed_at=${formatDateTime(row.buyer_completed_at)}`,
            `seller_completed_at=${formatDateTime(row.seller_completed_at)}`,
            `completed_at=${formatDateTime(row.completed_at)}`,
            `no_show_side=${row.no_show_side || '-'}`,
            `dispute_deadline_at=${formatDateTime(row.dispute_deadline_at)}`,
          ].join(' | ')
        )
      }
    }

    lines.push('')
    lines.push('--- RECENT PAYOUT HOLDS ---')
    if (payoutHolds.length === 0) {
      lines.push('No payout holds found.')
    } else {
      for (const row of payoutHolds.slice(0, 15)) {
        lines.push(
          [
            `hold_id=${row.id}`,
            `booking_request_id=${row.booking_request_id}`,
            `session_id=${row.session_id || '-'}`,
            `status=${row.status}`,
            `buyer=${formatPersonName(profiles[row.buyer_id])}`,
            `seller=${formatPersonName(profiles[row.seller_id])}`,
            `total=${formatMoneyFromCents(row.total_amount_cents)}`,
            `seller_payout=${formatMoneyFromCents(row.seller_payout_cents)}`,
            `refundable=${formatMoneyFromCents(row.refundable_amount_cents)}`,
            `held_at=${formatDateTime(row.held_at)}`,
            `releasable_at=${formatDateTime(row.releasable_at)}`,
            `released_at=${formatDateTime(row.released_at)}`,
            `refunded_at=${formatDateTime(row.refunded_at)}`,
            `dispute_id=${row.dispute_id || '-'}`,
          ].join(' | ')
        )
      }
    }

    lines.push('')
    lines.push('--- RECENT SESSION EVENTS ---')
    if (sessionEvents.length === 0) {
      lines.push('No session events found.')
    } else {
      for (const row of sessionEvents.slice(0, 30)) {
        lines.push(
          [
            `event_id=${row.id}`,
            `session_id=${row.session_id}`,
            `event_type=${row.event_type}`,
            `actor=${row.actor_user_id ? formatPersonName(profiles[row.actor_user_id]) : 'System'}`,
            `entity_id=${row.entity_id || '-'}`,
            `created=${formatDateTime(row.created_at)}`,
            `metadata=${JSON.stringify(row.metadata || {})}`,
          ].join(' | ')
        )
      }
    }

    lines.push('')
    lines.push('--- RECENT DISPUTES ---')
    if (disputes.length === 0) {
      lines.push('No disputes found.')
    } else {
      for (const row of disputes.slice(0, 15)) {
        lines.push(
          [
            `dispute_id=${row.id}`,
            `status=${row.status}`,
            `reason=${row.reason_code}`,
            `booking_request_id=${row.booking_request_id}`,
            `session_id=${row.session_id}`,
            `opened_by=${formatPersonName(profiles[row.opened_by_user_id])}`,
            `target=${row.target_user_id ? formatPersonName(profiles[row.target_user_id]) : '-'}`,
            `created=${formatDateTime(row.created_at)}`,
          ].join(' | ')
        )
      }
    }

    lines.push('')
    lines.push('--- RECENT STRIKES ---')
    if (strikes.length === 0) {
      lines.push('No strikes found.')
    } else {
      for (const row of strikes.slice(0, 15)) {
        lines.push(
          [
            `strike_id=${row.id}`,
            `user=${formatPersonName(profiles[row.user_id])}`,
            `reason=${row.reason_code}`,
            `points=${row.points}`,
            `session_id=${row.session_id || '-'}`,
            `booking_request_id=${row.booking_request_id || '-'}`,
            `expires_at=${formatDateTime(row.expires_at)}`,
            `created=${formatDateTime(row.created_at)}`,
          ].join(' | ')
        )
      }
    }

    lines.push('=== OPS SNAPSHOT END ===')
    return lines.join('\n')
  }, [bookings, sessions, payoutHolds, sessionEvents, disputes, strikes, profiles])

  const handleCopySnapshot = async () => {
    try {
      setCopying(true)
      await navigator.clipboard.writeText(snapshotText)
      setSuccessText('Snapshot copied.')
    } catch (error) {
      console.error(error)
      setErrorText('Could not copy snapshot.')
    } finally {
      setCopying(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Ops</h1>
            <p className="mt-3 text-lg text-slate-400">
              Internal debug view for booking → session → payout → dispute flow.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCopySnapshot}
              disabled={copying || loading}
              className="rounded-2xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {copying ? 'Copying...' : 'Copy Snapshot'}
            </button>

            <button
              type="button"
              onClick={() => void loadAll(true)}
              disabled={refreshing}
              className="rounded-2xl bg-[#24314f] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#324163] disabled:opacity-60"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {errorText ? (
          <p className="mb-5 text-base font-medium text-red-400">{errorText}</p>
        ) : null}

        {successText ? (
          <p className="mb-5 text-base font-medium text-emerald-400">{successText}</p>
        ) : null}

        {loading ? (
          <p className="text-slate-300">Loading ops data...</p>
        ) : (
          <div className="space-y-8">
            <div className="rounded-[28px] border border-indigo-400/20 bg-indigo-600/10 p-5">
              <div className="mb-3 text-sm uppercase tracking-wide text-indigo-300">
                Snapshot Preview
              </div>
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#061127] p-4 text-xs text-slate-300">
{snapshotText}
              </pre>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Bookings</div>
                <div className="mt-2 text-4xl font-bold">{bookings.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Sessions</div>
                <div className="mt-2 text-4xl font-bold">{sessions.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Payout Holds</div>
                <div className="mt-2 text-4xl font-bold">{payoutHolds.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Events</div>
                <div className="mt-2 text-4xl font-bold">{sessionEvents.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Disputes</div>
                <div className="mt-2 text-4xl font-bold">{disputes.length}</div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-5">
                <div className="text-sm uppercase tracking-wide text-slate-400">Strikes</div>
                <div className="mt-2 text-4xl font-bold">{strikes.length}</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
              <CardTitle title="Recent Bookings" count={bookings.length} />
              <div className="space-y-4">
                {bookings.length === 0 ? (
                  <p className="text-slate-400">No bookings found.</p>
                ) : (
                  bookings.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                          Booking {shortId(row.id)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Buyer</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.buyer_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.seller_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Game</div>
                          <div className="mt-1 font-semibold text-white">{row.game || '-'}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
                          <div className="mt-1 font-semibold text-emerald-400">
                            {formatMoneyFromCents(row.total_amount_cents)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Created</div>
                          <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.created_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Communication</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {row.communication_method || '-'}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller Payout</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatMoneyFromCents(row.seller_payout_cents)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Booking ID</div>
                          <div className="mt-1 break-all text-xs text-slate-400">{row.id}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
              <CardTitle title="Recent Sessions" count={sessions.length} />
              <div className="space-y-4">
                {sessions.length === 0 ? (
                  <p className="text-slate-400">No sessions found.</p>
                ) : (
                  sessions.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                          Session {shortId(row.id)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-400">
                          Booking {shortId(row.booking_request_id)}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Buyer</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.buyer_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.seller_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Buyer Started</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatDateTime(row.buyer_started_at)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller Started</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatDateTime(row.seller_started_at)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Started At</div>
                          <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.started_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Completed At</div>
                          <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.completed_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">No Show Side</div>
                          <div className="mt-1 text-sm text-slate-300">{row.no_show_side || '-'}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Dispute Deadline</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatDateTime(row.dispute_deadline_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
              <CardTitle title="Recent Payout Holds" count={payoutHolds.length} />
              <div className="space-y-4">
                {payoutHolds.length === 0 ? (
                  <p className="text-slate-400">No payout holds found.</p>
                ) : (
                  payoutHolds.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                          Hold {shortId(row.id)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.status}
                        </span>
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-400">
                          Booking {shortId(row.booking_request_id)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-400">
                          Session {shortId(row.session_id)}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Buyer</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.buyer_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller</div>
                          <div className="mt-1 font-semibold text-white">
                            {formatPersonName(profiles[row.seller_id])}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
                          <div className="mt-1 font-semibold text-emerald-400">
                            {formatMoneyFromCents(row.total_amount_cents)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Seller Payout</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatMoneyFromCents(row.seller_payout_cents)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Held At</div>
                          <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.held_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Releasable At</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatDateTime(row.releasable_at)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Refundable</div>
                          <div className="mt-1 text-sm text-slate-300">
                            {formatMoneyFromCents(row.refundable_amount_cents)}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Dispute</div>
                          <div className="mt-1 break-all text-xs text-slate-400">
                            {row.dispute_id || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
              <CardTitle title="Recent Session Events" count={sessionEvents.length} />
              <div className="space-y-4">
                {sessionEvents.length === 0 ? (
                  <p className="text-slate-400">No session events found.</p>
                ) : (
                  sessionEvents.map((row) => {
                    const session = sessionMap[row.session_id]
                    const booking = session ? bookingMap[session.booking_request_id] : null

                    return (
                      <div
                        key={row.id}
                        className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                            Event {shortId(row.id)}
                          </span>
                          <span className="rounded-full bg-indigo-600/20 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-400/30">
                            {row.event_type}
                          </span>
                          <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-400">
                            Session {shortId(row.session_id)}
                          </span>
                          {booking ? (
                            <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-400">
                              Booking {shortId(booking.id)}
                            </span>
                          ) : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Actor</div>
                            <div className="mt-1 font-semibold text-white">
                              {row.actor_user_id
                                ? formatPersonName(profiles[row.actor_user_id])
                                : 'System'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Created</div>
                            <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.created_at)}</div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Entity ID</div>
                            <div className="mt-1 break-all text-xs text-slate-400">
                              {row.entity_id || '-'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Metadata</div>
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-[#0b1835] p-3 text-xs text-slate-300">
{JSON.stringify(row.metadata || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
                <CardTitle title="Recent Disputes" count={disputes.length} />
                <div className="space-y-4">
                  {disputes.length === 0 ? (
                    <p className="text-slate-400">No disputes found.</p>
                  ) : (
                    disputes.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                            Dispute {shortId(row.id)}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                            {row.status}
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Opened By</div>
                            <div className="mt-1 font-semibold text-white">
                              {formatPersonName(profiles[row.opened_by_user_id])}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Target</div>
                            <div className="mt-1 font-semibold text-white">
                              {row.target_user_id ? formatPersonName(profiles[row.target_user_id]) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Reason</div>
                            <div className="mt-1 text-sm text-slate-300">{row.reason_code}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Created</div>
                            <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
                <CardTitle title="Recent Strikes" count={strikes.length} />
                <div className="space-y-4">
                  {strikes.length === 0 ? (
                    <p className="text-slate-400">No strikes found.</p>
                  ) : (
                    strikes.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-[22px] border border-white/10 bg-[#061127] p-5"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-white/10 bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                            Strike {shortId(row.id)}
                          </span>
                          <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300 border border-rose-400/30">
                            {row.points} point
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">User</div>
                            <div className="mt-1 font-semibold text-white">
                              {formatPersonName(profiles[row.user_id])}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Reason</div>
                            <div className="mt-1 text-sm text-slate-300">{row.reason_code}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Expires</div>
                            <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.expires_at)}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-400">Created</div>
                            <div className="mt-1 text-sm text-slate-300">{formatDateTime(row.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}