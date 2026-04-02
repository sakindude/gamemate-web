'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type SessionRow = {
  id: string
  buyer_id: string
  seller_id: string
  status: string
  game: string | null
  communication_method: string | null
  created_at: string
  completed_at: string | null
  buyer_confirmed_at: string | null
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

type ProfileMap = Record<
  string,
  {
    id: string
    username?: string | null
    display_name?: string | null
    full_name?: string | null
    nickname?: string | null
    name?: string | null
  }
>

type SessionCard = SessionRow & {
  role: 'buyer' | 'seller'
  other_user_id: string
  priority: number
  role_label: string
  action_label: string
}

type FilterMode = 'all' | 'action_needed' | 'active' | 'completed'

function formatMoneyFromCents(value: number | null | undefined) {
  const amount = Number(value || 0) / 100
  return `₺${amount.toFixed(2)}`
}

function formatPersonName(profile: any) {
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
    case 'accepted':
      return 'Booked'
    case 'rejected':
      return 'Rejected'
    case 'awaiting_buyer_confirmation':
      return 'Awaiting Buyer Confirmation'
    case 'completed':
      return 'Completed'
    default:
      return status
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
    case 'accepted':
      return 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
    case 'rejected':
      return 'bg-red-500/20 text-red-300 border border-red-400/30'
    case 'awaiting_buyer_confirmation':
      return 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
    default:
      return 'bg-slate-500/20 text-slate-300 border border-slate-400/30'
  }
}

function getPriority(row: SessionRow, myUserId: string): number {
  const isBuyer = row.buyer_id === myUserId
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 1
  if (row.status === 'awaiting_buyer_confirmation' && isBuyer) return 1

  if (row.status === 'accepted') return 2
  if (row.status === 'pending') return 3
  if (row.status === 'completed') return 4
  if (row.status === 'rejected') return 5

  return 6
}

function getActionLabel(row: SessionRow, myUserId: string) {
  const isBuyer = row.buyer_id === myUserId
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 'You need to respond'
  if (row.status === 'pending' && isBuyer) return 'Waiting for seller response'

  if (row.status === 'accepted' && isSeller) return 'You can mark this session completed'
  if (row.status === 'accepted' && isBuyer) return 'Session is booked'

  if (row.status === 'awaiting_buyer_confirmation' && isBuyer) return 'You need to confirm completion'
  if (row.status === 'awaiting_buyer_confirmation' && isSeller) return 'Waiting for buyer confirmation'

  if (row.status === 'completed') return 'Completed'
  if (row.status === 'rejected') return 'Rejected'

  return 'No action'
}

function matchesFilter(card: SessionCard, filter: FilterMode) {
  if (filter === 'all') return true

  if (filter === 'action_needed') {
    return card.priority === 1
  }

  if (filter === 'active') {
    return ['pending', 'accepted', 'awaiting_buyer_confirmation'].includes(card.status)
  }

  if (filter === 'completed') {
    return ['completed', 'rejected'].includes(card.status)
  }

  return true
}

function addOneHour(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const endHour = (hours + 1) % 24
  return `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatSlotRange(time: string) {
  return `${time} - ${addOneHour(time)}`
}

export default function SessionsPage() {
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErrorText('')
    setSuccessText('')

    const sessionResult = await supabase.auth.getSession()
    const session = sessionResult.data.session

    if (!session?.user) {
      setErrorText('You must be logged in.')
      setLoading(false)
      return
    }

    const userId = session.user.id
    setMyUserId(userId)

    const { data: bookingData, error: bookingError } = await supabase
      .from('booking_requests')
      .select(`
        id,
        buyer_id,
        seller_id,
        status,
        game,
        communication_method,
        created_at,
        completed_at,
        buyer_confirmed_at,
        base_price_cents,
        tip_cents,
        processing_fee_cents,
        platform_fee_cents,
        total_amount_cents,
        seller_payout_cents
      `)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (bookingError) {
      console.error('booking_requests load error:', bookingError)
      setErrorText(bookingError.message || 'Failed to load sessions.')
      setLoading(false)
      return
    }

    const bookingRows = (bookingData || []) as SessionRow[]
    setSessions(bookingRows)

    const bookingIds = bookingRows.map((row) => row.id)
    const otherUserIds = Array.from(
      new Set(
        bookingRows
          .map((row) => (row.buyer_id === userId ? row.seller_id : row.buyer_id))
          .filter(Boolean)
      )
    )

    if (bookingIds.length > 0) {
      const { data: slotData, error: slotError } = await supabase
        .from('booking_request_slots')
        .select('request_id, date, time')
        .in('request_id', bookingIds)
        .order('date', { ascending: true })
        .order('time', { ascending: true })

      if (slotError) {
        console.error('booking_request_slots load error:', slotError)
      } else {
        setSlots((slotData || []) as SlotRow[])
      }
    } else {
      setSlots([])
    }

    if (otherUserIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherUserIds)

      if (profileError) {
        console.error('profiles load error:', profileError)
      } else {
        const nextMap: ProfileMap = {}
        for (const row of profileData || []) {
          nextMap[row.id] = row
        }
        setProfiles(nextMap)
      }
    } else {
      setProfiles({})
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const refresh = async () => {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

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

    const mapped: SessionCard[] = sessions.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id

      return {
        ...row,
        role,
        other_user_id: otherUserId,
        priority: getPriority(row, myUserId),
        role_label: role === 'buyer' ? 'Your booking' : 'Incoming booking',
        action_label: getActionLabel(row, myUserId),
      }
    })

    return mapped
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      .filter((card) => matchesFilter(card, filter))
  }, [sessions, myUserId, filter])

  const counts = useMemo(() => {
    if (!myUserId) {
      return {
        all: 0,
        action_needed: 0,
        active: 0,
        completed: 0,
      }
    }

    const rawCards: SessionCard[] = sessions.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id

      return {
        ...row,
        role,
        other_user_id: otherUserId,
        priority: getPriority(row, myUserId),
        role_label: role === 'buyer' ? 'Your booking' : 'Incoming booking',
        action_label: getActionLabel(row, myUserId),
      }
    })

    return {
      all: rawCards.length,
      action_needed: rawCards.filter((card) => matchesFilter(card, 'action_needed')).length,
      active: rawCards.filter((card) => matchesFilter(card, 'active')).length,
      completed: rawCards.filter((card) => matchesFilter(card, 'completed')).length,
    }
  }, [sessions, myUserId])

  const runAction = async (action: () => Promise<any>, successMessage: string) => {
    setErrorText('')
    setSuccessText('')
    const result = await action()

    if (result?.error) {
      console.error(result.error)
      setErrorText(result.error.message || 'Action failed.')
      return false
    }

    if (result?.data && result.data.success === false) {
      setErrorText(result.data.message || 'Action failed.')
      return false
    }

    setSuccessText(successMessage)
    await loadAll()
    return true
  }

  const handleAccept = async (bookingId: string) => {
    setBusyId(bookingId)
    await runAction(
      async () =>
        supabase.rpc('advance_booking_request_states', {
          p_request_id: bookingId,
          p_action: 'accept',
        }),
      'Booking accepted.'
    )
    setBusyId(null)
  }

  const handleReject = async (bookingId: string) => {
    setBusyId(bookingId)
    await runAction(
      async () =>
        supabase.rpc('update_booking_request_status_with_refund', {
          p_request_id: bookingId,
          p_status: 'rejected',
        }),
      'Booking rejected and refund processed.'
    )
    setBusyId(null)
  }

  const handleMarkCompleted = async (bookingId: string) => {
    setBusyId(bookingId)
    await runAction(
      async () =>
        supabase.rpc('mark_booking_completed_by_seller', {
          p_request_id: bookingId,
        }),
      'Marked as completed. Waiting for buyer confirmation.'
    )
    setBusyId(null)
  }

  const handleConfirmCompletion = async (bookingId: string) => {
    setBusyId(bookingId)
    await runAction(
      async () =>
        supabase.rpc('confirm_booking_completion', {
          p_request_id: bookingId,
          p_rating: 5,
          p_comment: '',
        }),
      'Session completion confirmed.'
    )
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

  const handleReport = async (targetUserId: string, bookingId: string) => {
    setSuccessText('')
    setErrorText('')

    const { error } = await supabase.from('support_tickets').insert({
      type: 'report_user',
      target_user_id: targetUserId,
      booking_id: bookingId,
      subject: 'User report',
      message: `Reported from session ${bookingId}`,
      status: 'open',
    })

    if (error) {
      console.error(error)
      setErrorText(error.message || 'Could not create report.')
      return
    }

    setSuccessText('Report submitted.')
    await loadAll()
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <TopNav />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Sessions</h1>
            <p className="mt-3 text-lg text-slate-400">
              Everything in one place. No role tab nonsense.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-2xl bg-[#24314f] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#324163] disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="mb-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#24314f] text-white hover:bg-[#324163]'
            }`}
          >
            All • {counts.all}
          </button>

          <button
            type="button"
            onClick={() => setFilter('action_needed')}
            className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
              filter === 'action_needed'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#24314f] text-white hover:bg-[#324163]'
            }`}
          >
            Action Needed • {counts.action_needed}
          </button>

          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
              filter === 'active'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#24314f] text-white hover:bg-[#324163]'
            }`}
          >
            Active • {counts.active}
          </button>

          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={`rounded-2xl px-5 py-3 text-lg font-semibold transition ${
              filter === 'completed'
                ? 'bg-indigo-600 text-white'
                : 'bg-[#24314f] text-white hover:bg-[#324163]'
            }`}
          >
            History • {counts.completed}
          </button>
        </div>

        {errorText ? <p className="mb-5 text-base font-medium text-red-400">{errorText}</p> : null}
        {successText ? <p className="mb-5 text-base font-medium text-emerald-400">{successText}</p> : null}

        {loading ? (
          <p className="text-slate-300">Loading sessions...</p>
        ) : cards.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-8 text-slate-300">
            No sessions found for this filter.
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map((row) => {
              const otherProfile = profiles[row.other_user_id]
              const personName = formatPersonName(otherProfile)
              const bookingSlots = slotMap[row.id] || []
              const busy = busyId === row.id

              return (
                <article
                  key={row.id}
                  className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl"
                >
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-[#101b38] px-4 py-2 text-sm font-semibold text-slate-300">
                          {row.role_label}
                        </span>

                        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusBadgeClass(row.status)}`}>
                          {statusLabel(row.status)}
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
                            <span className="font-semibold text-white">{row.communication_method}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mb-5 text-lg font-medium text-indigo-300">
                        {row.action_label}
                      </div>

                      <div className={`rounded-[24px] border border-white/10 bg-[#061127] p-5`}>
                        <div className={`grid gap-6 ${row.role === 'buyer' ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                          <div>
                            <div className="text-sm uppercase tracking-wide text-slate-400">Service</div>
                            <div className="mt-1 text-4xl font-bold text-white">
                              {formatMoneyFromCents(row.base_price_cents)}
                            </div>
                          </div>

                          <div>
                            <div className="text-sm uppercase tracking-wide text-slate-400">Tip</div>
                            <div className="mt-1 text-3xl font-bold text-white">
                              {formatMoneyFromCents(row.tip_cents)}
                            </div>
                          </div>

                          {row.role === 'buyer' ? (
                            <div>
                              <div className="text-sm uppercase tracking-wide text-slate-400">Customer Total</div>
                              <div className="mt-1 text-4xl font-bold text-emerald-400">
                                {formatMoneyFromCents(row.total_amount_cents)}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <div className="text-sm uppercase tracking-wide text-slate-400">Platform Fee</div>
                                <div className="mt-1 text-3xl font-bold text-white">
                                  {formatMoneyFromCents(row.platform_fee_cents)}
                                </div>
                              </div>

                              <div className="md:col-span-3">
                                <div className="text-sm uppercase tracking-wide text-slate-400">You Receive</div>
                                <div className="mt-1 text-4xl font-bold text-emerald-400">
                                  {formatMoneyFromCents(row.seller_payout_cents)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:w-[360px]">
                      <div className="flex flex-col gap-4">
                        <div className="rounded-[24px] border border-white/10 bg-[#061127] p-5">
                          <div className="mb-4 text-sm uppercase tracking-wide text-slate-400">
                            Scheduled Slots
                          </div>

                          {bookingSlots.length === 0 ? (
                            <p className="text-sm text-slate-400">No slot details found.</p>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {bookingSlots.map((slot, index) => (
                                <div
                                  key={`${row.id}-${slot.date}-${slot.time}-${index}`}
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

                        {row.role === 'seller' && row.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAccept(row.id)}
                              className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                            >
                              {busy ? 'Working...' : 'Accept'}
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReject(row.id)}
                              className="w-full rounded-[18px] bg-[#24314f] px-5 py-4 text-xl font-bold text-white transition hover:bg-[#324163] disabled:opacity-60"
                            >
                              {busy ? 'Working...' : 'Reject'}
                            </button>
                          </>
                        ) : null}

                        {row.role === 'seller' && row.status === 'accepted' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleMarkCompleted(row.id)}
                            className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                          >
                            {busy ? 'Working...' : 'Mark as Completed'}
                          </button>
                        ) : null}

                        {row.role === 'buyer' && row.status === 'awaiting_buyer_confirmation' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleConfirmCompletion(row.id)}
                            className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                          >
                            {busy ? 'Working...' : 'Confirm Completion'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleStartChat(row.other_user_id)}
                          className="w-full rounded-[18px] bg-indigo-600 px-5 py-4 text-xl font-bold text-white transition hover:bg-indigo-500"
                        >
                          Start Chat
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReport(row.other_user_id, row.id)}
                          className="w-full rounded-[18px] bg-[#24314f] px-5 py-4 text-xl font-bold text-rose-300 transition hover:bg-[#324163]"
                        >
                          Report User
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}