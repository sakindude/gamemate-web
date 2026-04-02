'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type PendingBookingRow = {
  id: string
  buyer_id: string
  seller_id: string
  status: string
  game: string | null
  communication_method: string | null
  created_at: string
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
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

type BookingInfoRow = {
  id: string
  game: string | null
  communication_method: string | null
  created_at: string
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
}

type SlotRow = {
  request_id: string
  date: string
  time: string
}

type ProfileRow = {
  id: string
  username?: string | null
  display_name?: string | null
  full_name?: string | null
  nickname?: string | null
  name?: string | null
}

type ProfileMap = Record<string, ProfileRow>

type PendingBookingCard = PendingBookingRow & {
  kind: 'pending_booking'
  role: 'buyer' | 'seller'
  other_user_id: string
  priority: number
  role_label: string
  action_label: string
}

type SessionCard = SessionRow & {
  kind: 'session'
  role: 'buyer' | 'seller'
  other_user_id: string
  priority: number
  role_label: string
  action_label: string
  game: string | null
  communication_method: string | null
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
}

type FeedCard = PendingBookingCard | SessionCard

type RpcJsonResult = {
  success?: boolean
  message?: string
  [key: string]: any
}

const AUTO_REFRESH_MS = 10000
const AUTO_REFRESH_TICK_MS = 100
const HISTORY_PAGE_SIZE = 10

function formatMoneyFromCents(value: number | null | undefined) {
  const amount = Number(value || 0) / 100
  return `₺${amount.toFixed(2)}`
}

function formatPersonName(profile?: ProfileRow | null) {
  if (!profile) return 'User'
  return (
    profile.username ||
    profile.display_name ||
    profile.full_name ||
    profile.nickname ||
    profile.name ||
    'User'
  )
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'active':
      return 'Active'
    case 'awaiting_completion_confirmation':
      return 'Awaiting Completion Confirmation'
    case 'completed':
      return 'Completed'
    case 'disputed':
      return 'Disputed'
    case 'cancelled':
      return 'Cancelled'
    case 'no_show_buyer':
      return 'Buyer No-Show'
    case 'no_show_seller':
      return 'Seller No-Show'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
    case 'active':
      return 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
    case 'awaiting_completion_confirmation':
    case 'disputed':
      return 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
    case 'rejected':
    case 'cancelled':
    case 'no_show_buyer':
    case 'no_show_seller':
      return 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
    default:
      return 'bg-slate-500/20 text-slate-300 border border-slate-400/30'
  }
}

function getPendingBookingPriority(row: PendingBookingRow, myUserId: string): number {
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 1
  if (row.status === 'pending') return 2
  if (row.status === 'rejected') return 6

  return 7
}

function getPendingBookingActionLabel(row: PendingBookingRow, myUserId: string) {
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 'You need to respond'
  if (row.status === 'pending') return 'Waiting for seller response'
  if (row.status === 'rejected') return 'Rejected'

  return 'No action'
}

function getSessionPriority(row: SessionRow, myUserId: string): number {
  const isBuyer = row.buyer_id === myUserId
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending') {
    if ((isBuyer && !row.buyer_started_at) || (isSeller && !row.seller_started_at)) return 1
    return 2
  }

  if (row.status === 'active') {
    if ((isBuyer && !row.buyer_completed_at) || (isSeller && !row.seller_completed_at)) return 3
    return 4
  }

  if (row.status === 'awaiting_completion_confirmation') {
    if ((isBuyer && !row.buyer_completed_at) || (isSeller && !row.seller_completed_at)) return 3
    return 4
  }

  if (row.status === 'completed') return 5
  if (row.status === 'disputed') return 5
  if (row.status === 'cancelled' || row.status.startsWith('no_show')) return 6

  return 7
}

function getSessionActionLabel(row: SessionRow, myUserId: string) {
  const isBuyer = row.buyer_id === myUserId
  const iStarted = isBuyer ? !!row.buyer_started_at : !!row.seller_started_at
  const otherStarted = isBuyer ? !!row.seller_started_at : !!row.buyer_started_at
  const iCompleted = isBuyer ? !!row.buyer_completed_at : !!row.seller_completed_at

  if (row.status === 'pending') {
    if (!iStarted) return 'You need to start the session'
    if (!otherStarted) return 'Waiting for the other side to start'
    return 'Session is getting ready'
  }

  if (row.status === 'active') {
    if (!iCompleted) return 'You can complete this session'
    return 'Waiting for the other side to complete'
  }

  if (row.status === 'awaiting_completion_confirmation') {
    if (!iCompleted) return 'You need to confirm completion'
    return 'Waiting for the other side to confirm'
  }

  if (row.status === 'completed') return 'Completed'
  if (row.status === 'disputed') return 'Under dispute review'
  if (row.status === 'no_show_buyer' || row.status === 'no_show_seller') return 'No-show recorded'
  if (row.status === 'cancelled') return 'Cancelled'

  return 'No action'
}

function addOneHour(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const endHour = (hours + 1) % 24
  return `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatSlotRange(time: string) {
  return `${time} - ${addOneHour(time)}`
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function RefreshIcon({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function applyStartSessionOptimistic(
  rows: SessionRow[],
  sessionId: string,
  myUserId: string | null,
  result?: RpcJsonResult | null
) {
  if (!myUserId) return rows

  return rows.map((row) => {
    if (row.id !== sessionId) return row

    const nowIso = new Date().toISOString()
    const next = { ...row }

    if (myUserId === row.buyer_id && !next.buyer_started_at) {
      next.buyer_started_at = nowIso
    }

    if (myUserId === row.seller_id && !next.seller_started_at) {
      next.seller_started_at = nowIso
    }

    if (result?.buyer_started_at !== undefined) {
      next.buyer_started_at = result.buyer_started_at
    }

    if (result?.seller_started_at !== undefined) {
      next.seller_started_at = result.seller_started_at
    }

    if (result?.started_at !== undefined) {
      next.started_at = result.started_at
    }

    if (result?.status) {
      next.status = result.status
    } else if (next.buyer_started_at && next.seller_started_at) {
      next.status = 'active'
      next.started_at = next.started_at || nowIso
    }

    return next
  })
}

function applyCompleteSessionOptimistic(
  rows: SessionRow[],
  sessionId: string,
  myUserId: string | null,
  result?: RpcJsonResult | null
) {
  if (!myUserId) return rows

  return rows.map((row) => {
    if (row.id !== sessionId) return row

    const nowIso = new Date().toISOString()
    const next = { ...row }

    if (myUserId === row.buyer_id && !next.buyer_completed_at) {
      next.buyer_completed_at = nowIso
    }

    if (myUserId === row.seller_id && !next.seller_completed_at) {
      next.seller_completed_at = nowIso
    }

    if (result?.buyer_completed_at !== undefined) {
      next.buyer_completed_at = result.buyer_completed_at
    }

    if (result?.seller_completed_at !== undefined) {
      next.seller_completed_at = result.seller_completed_at
    }

    if (result?.completed_at !== undefined) {
      next.completed_at = result.completed_at
    }

    if (result?.auto_complete_at !== undefined) {
      next.auto_complete_at = result.auto_complete_at
    }

    if (result?.dispute_deadline_at !== undefined) {
      next.dispute_deadline_at = result.dispute_deadline_at
    }

    if (result?.status) {
      next.status = result.status
    } else if (next.buyer_completed_at && next.seller_completed_at) {
      next.status = 'completed'
      next.completed_at = next.completed_at || nowIso
    } else {
      next.status = 'awaiting_completion_confirmation'
      next.auto_complete_at = next.auto_complete_at || nowIso
    }

    return next
  })
}

export default function SessionsPage() {
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [pendingBookings, setPendingBookings] = useState<PendingBookingRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [bookingInfoMap, setBookingInfoMap] = useState<Record<string, BookingInfoRow>>({})
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [autoRefreshProgress, setAutoRefreshProgress] = useState(0)
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE)

  const loadAll = useCallback(
    async (options?: { silent?: boolean; preserveMessages?: boolean }) => {
      const silent = options?.silent === true
      const preserveMessages = options?.preserveMessages === true

      if (!silent) {
        setLoading(true)
      }

      if (!preserveMessages) {
        setErrorText('')
        setSuccessText('')
      }

      const sessionResult = await supabase.auth.getSession()
      const authSession = sessionResult.data.session

      if (!authSession?.user) {
        setErrorText('You must be logged in.')
        if (!silent) {
          setLoading(false)
        }
        return false
      }

      const userId = authSession.user.id
      setMyUserId(userId)

      const [{ data: pendingData, error: pendingError }, { data: sessionData, error: sessionsError }] =
        await Promise.all([
          supabase
            .from('booking_requests')
            .select(`
              id,
              buyer_id,
              seller_id,
              status,
              game,
              communication_method,
              created_at,
              base_price_cents,
              tip_cents,
              processing_fee_cents,
              platform_fee_cents,
              total_amount_cents,
              seller_payout_cents
            `)
            .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .in('status', ['pending', 'rejected'])
            .order('created_at', { ascending: false }),

          supabase
            .from('sessions')
            .select('*')
            .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .order('created_at', { ascending: false }),
        ])

      if (pendingError) {
        console.error('pending bookings load error:', pendingError)
        setErrorText(pendingError.message || 'Failed to load pending bookings.')
        if (!silent) {
          setLoading(false)
        }
        return false
      }

      if (sessionsError) {
        console.error('sessions load error:', sessionsError)
        setErrorText(sessionsError.message || 'Failed to load sessions.')
        if (!silent) {
          setLoading(false)
        }
        return false
      }

      const pendingRows = (pendingData || []) as PendingBookingRow[]
      const sessionRows = (sessionData || []) as SessionRow[]

      setPendingBookings(pendingRows)
      setSessions(sessionRows)

      const sessionBookingIds = sessionRows.map((row) => row.booking_request_id)
      const allBookingIds = Array.from(new Set([...pendingRows.map((row) => row.id), ...sessionBookingIds]))

      let bookingInfoRows: BookingInfoRow[] = []
      if (allBookingIds.length > 0) {
        const { data: bookingInfoData, error: bookingInfoError } = await supabase
          .from('booking_requests')
          .select(`
            id,
            game,
            communication_method,
            created_at,
            base_price_cents,
            tip_cents,
            processing_fee_cents,
            platform_fee_cents,
            total_amount_cents,
            seller_payout_cents
          `)
          .in('id', allBookingIds)

        if (bookingInfoError) {
          console.error('booking info load error:', bookingInfoError)
        } else {
          bookingInfoRows = (bookingInfoData || []) as BookingInfoRow[]
        }
      }

      const nextBookingInfoMap: Record<string, BookingInfoRow> = {}
      for (const row of bookingInfoRows) {
        nextBookingInfoMap[row.id] = row
      }
      setBookingInfoMap(nextBookingInfoMap)

      if (allBookingIds.length > 0) {
        const { data: slotData, error: slotError } = await supabase
          .from('booking_request_slots')
          .select('request_id, date, time')
          .in('request_id', allBookingIds)
          .order('date', { ascending: true })
          .order('time', { ascending: true })

        if (slotError) {
          console.error('booking_request_slots load error:', slotError)
          setSlots([])
        } else {
          setSlots((slotData || []) as SlotRow[])
        }
      } else {
        setSlots([])
      }

      const otherUserIds = Array.from(
        new Set(
          [
            ...pendingRows.map((row) => (row.buyer_id === userId ? row.seller_id : row.buyer_id)),
            ...sessionRows.map((row) => (row.buyer_id === userId ? row.seller_id : row.buyer_id)),
          ].filter(Boolean)
        )
      )

      if (otherUserIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', otherUserIds)

        if (profileError) {
          console.error('profiles load error:', profileError)
          setProfiles({})
        } else {
          const nextMap: ProfileMap = {}
          for (const row of profileData || []) {
            nextMap[row.id] = row as ProfileRow
          }
          setProfiles(nextMap)
        }
      } else {
        setProfiles({})
      }

      if (!silent) {
        setLoading(false)
      }

      return true
    },
    []
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const refresh = useCallback(
    async (options?: { silent?: boolean; preserveMessages?: boolean }) => {
      setRefreshing(true)
      const ok = await loadAll({
        silent: options?.silent ?? true,
        preserveMessages: options?.preserveMessages ?? true,
      })
      setRefreshing(false)
      setAutoRefreshProgress(0)
      return ok
    },
    [loadAll]
  )

  useEffect(() => {
    if (loading) return
    if (!autoRefreshEnabled) {
      setAutoRefreshProgress(0)
      return
    }

    const step = (AUTO_REFRESH_TICK_MS / AUTO_REFRESH_MS) * 100

    const interval = window.setInterval(() => {
      setAutoRefreshProgress((prev) => {
        const next = prev + step

        if (next >= 100) {
          if (!refreshing && !busyId) {
            void refresh({ silent: true, preserveMessages: true })
          }
          return 0
        }

        return next
      })
    }, AUTO_REFRESH_TICK_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [autoRefreshEnabled, busyId, loading, refresh, refreshing])

  const slotMap = useMemo(() => {
    const map: Record<string, SlotRow[]> = {}
    for (const slot of slots) {
      if (!map[slot.request_id]) map[slot.request_id] = []
      map[slot.request_id].push(slot)
    }
    return map
  }, [slots])

  const cards = useMemo(() => {
    if (!myUserId) return []

    const pendingCards: PendingBookingCard[] = pendingBookings.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id

      return {
        ...row,
        kind: 'pending_booking',
        role,
        other_user_id: otherUserId,
        priority: getPendingBookingPriority(row, myUserId),
        role_label: role === 'buyer' ? 'Your booking request' : 'Incoming booking request',
        action_label: getPendingBookingActionLabel(row, myUserId),
      }
    })

    const sessionCards: SessionCard[] = sessions.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id
      const bookingInfo = bookingInfoMap[row.booking_request_id]

      return {
        ...row,
        kind: 'session',
        role,
        other_user_id: otherUserId,
        priority: getSessionPriority(row, myUserId),
        role_label: role === 'buyer' ? 'Your session' : 'Incoming session',
        action_label: getSessionActionLabel(row, myUserId),
        game: bookingInfo?.game || null,
        communication_method: bookingInfo?.communication_method || null,
        base_price_cents: bookingInfo?.base_price_cents || 0,
        tip_cents: bookingInfo?.tip_cents || 0,
        processing_fee_cents: bookingInfo?.processing_fee_cents || 0,
        platform_fee_cents: bookingInfo?.platform_fee_cents || 0,
        total_amount_cents: bookingInfo?.total_amount_cents || 0,
        seller_payout_cents: bookingInfo?.seller_payout_cents || 0,
      }
    })

    const merged: FeedCard[] = [...pendingCards, ...sessionCards]

    return merged.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      const aDate = new Date(a.created_at).getTime()
      const bDate = new Date(b.created_at).getTime()
      return bDate - aDate
    })
  }, [bookingInfoMap, myUserId, pendingBookings, sessions])

  const historyCount = useMemo(() => {
    return cards.filter((card) => {
      if (card.kind === 'pending_booking') return card.status === 'rejected'
      return ['completed', 'disputed', 'cancelled', 'no_show_buyer', 'no_show_seller'].includes(
        card.status
      )
    }).length
  }, [cards])

  const visibleCards = useMemo(() => {
    let historySeen = 0

    return cards.filter((card) => {
      const isHistory =
        card.kind === 'pending_booking'
          ? card.status === 'rejected'
          : ['completed', 'disputed', 'cancelled', 'no_show_buyer', 'no_show_seller'].includes(
              card.status
            )

      if (!isHistory) return true

      historySeen += 1
      return historySeen <= historyVisibleCount
    })
  }, [cards, historyVisibleCount])

  const hasMoreHistory = historyCount > historyVisibleCount

  const runAction = async (action: () => Promise<any>, successMessage: string) => {
    setErrorText('')
    setSuccessText('')

    const result = await action()

    if (result?.error) {
      console.error(result.error)
      setErrorText(result.error.message || 'Action failed.')
      return { ok: false, data: null as RpcJsonResult | null }
    }

    if (result?.data && typeof result.data === 'object' && result.data.success === false) {
      setErrorText(result.data.message || 'Action failed.')
      return { ok: false, data: result.data as RpcJsonResult }
    }

    setSuccessText(successMessage)
    return { ok: true, data: (result?.data ?? null) as RpcJsonResult | null }
  }

  const handleAccept = async (bookingId: string) => {
    setBusyId(bookingId)

    const result = await runAction(
      async () =>
        supabase.rpc('advance_booking_request_states', {
          p_request_id: bookingId,
          p_action: 'accept',
        }),
      'Booking accepted.'
    )

    if (result.ok) {
      await refresh({ silent: true, preserveMessages: true })
    }

    setBusyId(null)
  }

  const handleReject = async (bookingId: string) => {
    setBusyId(bookingId)

    const result = await runAction(
      async () =>
        supabase.rpc('update_booking_request_status_with_refund', {
          p_request_id: bookingId,
          p_status: 'rejected',
        }),
      'Booking rejected and refund processed.'
    )

    if (result.ok) {
      await refresh({ silent: true, preserveMessages: true })
    }

    setBusyId(null)
  }

  const handleStartSession = async (sessionId: string) => {
    setBusyId(sessionId)

    const result = await runAction(
      async () =>
        supabase.rpc('start_session', {
          p_session_id: sessionId,
        }),
      'Start session clicked.'
    )

    if (result.ok) {
      setSessions((prev) => applyStartSessionOptimistic(prev, sessionId, myUserId, result.data))
      void refresh({ silent: true, preserveMessages: true })
    }

    setBusyId(null)
  }

  const handleCompleteSession = async (sessionId: string) => {
    setBusyId(sessionId)

    const result = await runAction(
      async () =>
        supabase.rpc('complete_session', {
          p_session_id: sessionId,
        }),
      'Complete session clicked.'
    )

    if (result.ok) {
      setSessions((prev) => applyCompleteSessionOptimistic(prev, sessionId, myUserId, result.data))
      void refresh({ silent: true, preserveMessages: true })
    }

    setBusyId(null)
  }

  const handleStartChat = async (otherUserId: string) => {
    setErrorText('')
    setSuccessText('')

    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other_user_id: otherUserId,
    })

    if (error) {
      console.error(error)
      setErrorText(error.message || 'Could not start chat.')
      return
    }

    if (!data) {
      setErrorText('Could not start chat.')
      return
    }

    window.location.href = '/chat'
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <TopNav />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Sessions</h1>
            <p className="mt-3 text-lg text-slate-400">
              Booking requests first. Accepted work continues as real sessions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-[#08122f] px-4 py-3">
              <span className="text-sm font-semibold text-slate-300">Auto</span>

              <button
                type="button"
                role="switch"
                aria-checked={autoRefreshEnabled}
                onClick={() => setAutoRefreshEnabled((prev) => !prev)}
                className={`relative h-7 w-12 rounded-full transition ${
                  autoRefreshEnabled ? 'bg-emerald-600' : 'bg-[#24314f]'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                    autoRefreshEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </label>

            <button
              type="button"
              onClick={() => void refresh({ silent: true, preserveMessages: true })}
              disabled={refreshing}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#24314f] p-3 text-white transition hover:bg-[#324163] disabled:opacity-60"
              title={autoRefreshEnabled ? 'Refresh (auto every 10s active)' : 'Refresh'}
            >
              {autoRefreshEnabled && (
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-emerald-500/35 transition-[height] duration-100"
                  style={{ height: `${autoRefreshProgress}%` }}
                />
              )}

              <span className="relative z-10 flex items-center justify-center">
                <RefreshIcon
                  className={`h-5 w-5 ${
                    refreshing ? 'animate-spin' : autoRefreshEnabled ? 'animate-spin' : ''
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {errorText ? <p className="mb-5 text-base font-medium text-red-400">{errorText}</p> : null}
        {successText ? (
          <p className="mb-5 text-base font-medium text-emerald-400">{successText}</p>
        ) : null}

        {loading ? (
          <p className="text-slate-300">Loading sessions...</p>
        ) : visibleCards.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-8 text-slate-300">
            No sessions found.
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {visibleCards.map((row) => {
                const otherProfile = profiles[row.other_user_id]
                const personName = formatPersonName(otherProfile)
                const slotRequestId =
                  row.kind === 'pending_booking' ? row.id : row.booking_request_id
                const bookingSlots = slotMap[slotRequestId] || []
                const busy = busyId === row.id
                const isSession = row.kind === 'session'

                const iStarted =
                  isSession &&
                  (row.role === 'buyer' ? !!row.buyer_started_at : !!row.seller_started_at)

                const iCompleted =
                  isSession &&
                  (row.role === 'buyer' ? !!row.buyer_completed_at : !!row.seller_completed_at)

                return (
                  <article
                    key={`${row.kind}-${row.id}`}
                    className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl"
                  >
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-white/10 bg-[#101b38] px-4 py-2 text-sm font-semibold text-slate-300">
                            {row.role_label}
                          </span>

                          <span
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${statusBadgeClass(
                              row.status
                            )}`}
                          >
                            {statusLabel(row.status)}
                          </span>

                          <span className="rounded-full border border-white/10 bg-[#101b38] px-4 py-2 text-sm font-semibold text-slate-400">
                            Created {formatDate(row.created_at)}
                          </span>
                        </div>

                        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                          <div className="text-4xl font-bold leading-none text-white">
                            {personName}
                          </div>

                          {row.game ? (
                            <div className="text-lg text-slate-300">
                              <span className="text-slate-400">Game:</span>{' '}
                              <span className="font-semibold text-white">{row.game}</span>
                            </div>
                          ) : null}

                          {row.communication_method ? (
                            <div className="text-lg text-slate-300">
                              <span className="text-slate-400">Communication:</span>{' '}
                              <span className="font-semibold text-white">
                                {row.communication_method}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="mb-5 text-lg font-medium text-indigo-300">
                          {row.action_label}
                        </div>

                        {isSession ? (
                          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-[#061127] p-4">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Your Start
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {row.role === 'buyer'
                                  ? formatDateTime(row.buyer_started_at)
                                  : formatDateTime(row.seller_started_at)}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-[#061127] p-4">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Other Side Start
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {row.role === 'buyer'
                                  ? formatDateTime(row.seller_started_at)
                                  : formatDateTime(row.buyer_started_at)}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-[#061127] p-4">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Started At
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {formatDateTime(row.started_at)}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-[#061127] p-4">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Completed At
                              </div>
                              <div className="mt-2 text-sm text-slate-200">
                                {formatDateTime(row.completed_at)}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-[24px] border border-white/10 bg-[#061127] p-5">
                          <div
                            className={`grid gap-6 ${
                              row.role === 'buyer' ? 'md:grid-cols-2' : 'md:grid-cols-3'
                            }`}
                          >
                            <div>
                              <div className="text-sm uppercase tracking-wide text-slate-400">
                                Service
                              </div>
                              <div className="mt-1 text-4xl font-bold text-white">
                                {formatMoneyFromCents(row.base_price_cents)}
                              </div>
                            </div>

                            <div>
                              <div className="text-sm uppercase tracking-wide text-slate-400">
                                Tip
                              </div>
                              <div className="mt-1 text-3xl font-bold text-white">
                                {formatMoneyFromCents(row.tip_cents)}
                              </div>
                            </div>

                            {row.role === 'buyer' ? (
                              <div>
                                <div className="text-sm uppercase tracking-wide text-slate-400">
                                  Customer Total
                                </div>
                                <div className="mt-1 text-4xl font-bold text-emerald-400">
                                  {formatMoneyFromCents(row.total_amount_cents)}
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <div className="text-sm uppercase tracking-wide text-slate-400">
                                    Platform Fee
                                  </div>
                                  <div className="mt-1 text-3xl font-bold text-white">
                                    {formatMoneyFromCents(row.platform_fee_cents)}
                                  </div>
                                </div>

                                <div className="md:col-span-3">
                                  <div className="text-sm uppercase tracking-wide text-slate-400">
                                    You Receive
                                  </div>
                                  <div className="mt-1 text-4xl font-bold text-emerald-400">
                                    {formatMoneyFromCents(row.seller_payout_cents)}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {isSession && row.status === 'awaiting_completion_confirmation' ? (
                          <div className="mt-4 rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4 text-sm text-purple-200">
                            <div className="font-semibold">Auto-complete is armed.</div>
                            <div className="mt-1">Auto complete at: {formatDateTime(row.auto_complete_at)}</div>
                            <div className="mt-1">
                              Dispute deadline: {formatDateTime(row.dispute_deadline_at)}
                            </div>
                          </div>
                        ) : null}

                        {isSession && row.status === 'completed' ? (
                          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                            <div className="font-semibold">Session completed.</div>
                            <div className="mt-1">
                              Dispute deadline: {formatDateTime(row.dispute_deadline_at)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="w-full xl:w-[360px]">
                        <div className="flex flex-col gap-4">
                          <div className="rounded-[24px] border border-white/10 bg-[#061127] p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div className="text-sm uppercase tracking-wide text-slate-400">
                                Scheduled Slots
                              </div>
                              <div className="rounded-full bg-[#101b38] px-3 py-1 text-xs font-semibold text-slate-300">
                                {bookingSlots.length} slot{bookingSlots.length === 1 ? '' : 's'}
                              </div>
                            </div>

                            {bookingSlots.length === 0 ? (
                              <p className="text-sm text-slate-400">No slot details found.</p>
                            ) : (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                {bookingSlots.map((slot, index) => (
                                  <div
                                    key={`${slotRequestId}-${slot.date}-${slot.time}-${index}`}
                                    className="rounded-2xl border border-white/10 bg-[#0b1835] px-4 py-3"
                                  >
                                    <div className="text-sm text-slate-400">{slot.date}</div>
                                    <div className="mt-1 text-lg font-semibold text-white">
                                      {formatSlotRange(slot.time)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {row.kind === 'pending_booking' && row.role === 'seller' && row.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleAccept(row.id)}
                                className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                              >
                                {busy ? 'Working...' : 'Accept'}
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleReject(row.id)}
                                className="w-full rounded-[18px] bg-[#24314f] px-5 py-4 text-xl font-bold text-white transition hover:bg-[#324163] disabled:opacity-60"
                              >
                                {busy ? 'Working...' : 'Reject'}
                              </button>
                            </>
                          ) : null}

                          {row.kind === 'session' && row.status === 'pending' && !iStarted ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleStartSession(row.id)}
                              className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                            >
                              {busy ? 'Working...' : 'Start Session'}
                            </button>
                          ) : null}

                          {row.kind === 'session' &&
                          (row.status === 'active' || row.status === 'awaiting_completion_confirmation') &&
                          !iCompleted ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleCompleteSession(row.id)}
                              className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                            >
                              {busy ? 'Working...' : 'Complete Session'}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => void handleStartChat(row.other_user_id)}
                            className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500"
                          >
                            Start Chat
                          </button>

                          <button
                            type="button"
                            disabled
                            className="w-full rounded-[18px] bg-[#24314f] px-5 py-4 text-xl font-bold text-slate-400 opacity-70"
                            title="Report flow will be rebuilt later"
                          >
                            Report User (Soon)
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {hasMoreHistory && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setHistoryVisibleCount((prev) => prev + HISTORY_PAGE_SIZE)}
                  className="rounded-2xl bg-[#24314f] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#324163]"
                >
                  Show Older
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}