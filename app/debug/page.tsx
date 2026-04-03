'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type AuditEvent = {
  id: string
  event_type: string
  table_name: string
  operation: string
  entity_id: string | null
  actor_user_id?: string | null
  booking_id?: string | null
  conversation_id?: string | null
  payload: any
  created_at: string
}

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
  status: string | null
  game: string | null
  communication_method: string | null
  created_at: string
  total_amount_cents: number | null
}

type ProfileMap = Record<string, ProfileRow>
type BookingMap = Record<string, BookingRow>

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function prettyJson(value: any) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getProfileName(profile?: ProfileRow | null) {
  if (!profile) return null

  return (
    profile.display_name ||
    profile.username ||
    profile.full_name ||
    profile.nickname ||
    profile.name ||
    null
  )
}

function formatMoneyFromCents(value: number | null | undefined) {
  return `$${(Number(value || 0) / 100).toFixed(2)}`
}

function collectIdsFromPayload(payload: any) {
  const userIds = new Set<string>()
  const bookingIds = new Set<string>()

  if (!payload || typeof payload !== 'object') {
    return {
      userIds: [] as string[],
      bookingIds: [] as string[],
    }
  }

  const userKeys = new Set([
    'user_id',
    'actor_user_id',
    'buyer_id',
    'seller_id',
    'target_user_id',
    'other_user_id',
    'sender_id',
  ])

  const bookingKeys = new Set([
    'booking_id',
    'request_id',
  ])

  const walk = (value: any) => {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }

    for (const [key, inner] of Object.entries(value)) {
      if (typeof inner === 'string') {
        if (userKeys.has(key)) userIds.add(inner)
        if (bookingKeys.has(key)) bookingIds.add(inner)
      }

      if (inner && typeof inner === 'object') {
        walk(inner)
      }
    }
  }

  walk(payload)

  return {
    userIds: Array.from(userIds),
    bookingIds: Array.from(bookingIds),
  }
}

function getColor(type: string) {
  if (type.includes('conversation_messages')) return 'text-pink-400'
  if (type.includes('booking_requests')) return 'text-indigo-400'
  if (type.includes('booking_request_slots')) return 'text-yellow-400'
  if (type.includes('wallet')) return 'text-green-400'
  if (type.includes('profiles_balance_update')) return 'text-emerald-300'
  if (type.includes('support')) return 'text-rose-300'
  return 'text-white'
}

function renderMaybeUser(value: string | null | undefined, profiles: ProfileMap) {
  if (!value) {
    return <span className="text-slate-400">—</span>
  }

  const profile = profiles[value]
  const name = getProfileName(profile)

  if (!name) {
    return (
      <div className="min-w-0">
        <div className="font-medium text-white break-all">{value}</div>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="font-semibold text-white break-words">{name}</div>
      <div className="text-xs text-slate-500 break-all">{value}</div>
    </div>
  )
}

function renderMaybeBooking(
  bookingId: string | null | undefined,
  bookings: BookingMap,
  profiles: ProfileMap
) {
  if (!bookingId) {
    return <span className="text-slate-400">—</span>
  }

  const booking = bookings[bookingId]

  if (!booking) {
    return (
      <div className="min-w-0">
        <div className="font-medium text-white break-all">{bookingId}</div>
      </div>
    )
  }

  const buyerName = getProfileName(profiles[booking.buyer_id]) || booking.buyer_id
  const sellerName = getProfileName(profiles[booking.seller_id]) || booking.seller_id

  return (
    <div className="min-w-0">
      <div className="font-semibold text-white break-words">
        {booking.game || 'Booking'}
      </div>

      <div className="mt-1 text-sm text-slate-300 break-words">
        {buyerName} → {sellerName}
      </div>

      <div className="mt-1 flex flex-wrap gap-2 text-xs">
        {booking.status ? (
          <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">
            {booking.status}
          </span>
        ) : null}

        <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">
          {formatMoneyFromCents(booking.total_amount_cents)}
        </span>
      </div>

      <div className="mt-2 text-xs text-slate-500 break-all">{booking.id}</div>
    </div>
  )
}

function buildEventSummary(
  event: AuditEvent,
  profiles: ProfileMap,
  bookings: BookingMap
) {
  const payload = event.payload || {}
  const actorName = event.actor_user_id ? getProfileName(profiles[event.actor_user_id]) : null

  const bookingId =
    event.booking_id ||
    payload.booking_id ||
    payload.request_id ||
    (event.table_name === 'booking_requests' ? event.entity_id : null)

  const booking = bookingId ? bookings[bookingId] : null
  const bookingTitle = booking?.game || 'booking'

  if (event.table_name === 'booking_requests' && event.operation === 'insert') {
    return `New ${bookingTitle} booking created`
  }

  if (event.table_name === 'booking_requests' && event.operation === 'update') {
    const status = payload.status || booking?.status
    return status ? `${bookingTitle} booking updated to ${status}` : `${bookingTitle} booking updated`
  }

  if (event.table_name === 'booking_request_slots' && event.operation === 'insert') {
    return `Slot added to ${bookingTitle} booking`
  }

  if (event.table_name === 'wallet_transactions' && event.operation === 'insert') {
    const txType = payload.tx_type || 'wallet transaction'
    return `${txType} recorded`
  }

  if (event.table_name === 'conversation_messages' && event.operation === 'insert') {
    return actorName ? `Message sent by ${actorName}` : 'New message sent'
  }

  if (event.table_name === 'support_tickets' && event.operation === 'insert') {
    return 'Support ticket created'
  }

  return event.event_type
}

export default function DebugPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [bookings, setBookings] = useState<BookingMap>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [errorText, setErrorText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErrorText('')

    const { data, error } = await supabase.rpc('get_debug_timeline', { p_limit: 150 })

    if (error) {
      console.error(error)
      setErrorText(error.message || 'Failed to load debug timeline.')
      setLoading(false)
      return
    }

    const rows = (data || []) as AuditEvent[]
    setEvents(rows)

    const userIdSet = new Set<string>()
    const bookingIdSet = new Set<string>()

    for (const row of rows) {
      if (row.actor_user_id) userIdSet.add(row.actor_user_id)
      if (row.booking_id) bookingIdSet.add(row.booking_id)

      if (row.table_name === 'booking_requests' && row.entity_id) {
        bookingIdSet.add(row.entity_id)
      }

      const ids = collectIdsFromPayload(row.payload)
      for (const userId of ids.userIds) userIdSet.add(userId)
      for (const bookingId of ids.bookingIds) bookingIdSet.add(bookingId)
    }

    const bookingIds = Array.from(bookingIdSet)

    let bookingRows: BookingRow[] = []

    if (bookingIds.length > 0) {
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
          total_amount_cents
        `)
        .in('id', bookingIds)

      if (bookingError) {
        console.error('debug bookings load error:', bookingError)
      } else {
        bookingRows = (bookingData || []) as BookingRow[]
      }
    }

    for (const booking of bookingRows) {
      if (booking.buyer_id) userIdSet.add(booking.buyer_id)
      if (booking.seller_id) userIdSet.add(booking.seller_id)
    }

    const userIds = Array.from(userIdSet)

    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)

      if (profileError) {
        console.error('debug profiles load error:', profileError)
      } else {
        const nextProfileMap: ProfileMap = {}
        for (const row of (profileRows || []) as ProfileRow[]) {
          nextProfileMap[row.id] = row
        }
        setProfiles(nextProfileMap)
      }
    } else {
      setProfiles({})
    }

    if (bookingRows.length > 0) {
      const nextBookingMap: BookingMap = {}
      for (const row of bookingRows) {
        nextBookingMap[row.id] = row
      }
      setBookings(nextBookingMap)
    } else {
      setBookings({})
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return events

    return events.filter((event) => {
      const payloadText = prettyJson(event.payload).toLowerCase()

      const ids = collectIdsFromPayload(event.payload)

      const payloadUserNames = ids.userIds
        .map((id) => getProfileName(profiles[id]) || '')
        .join(' ')
        .toLowerCase()

      const payloadBookingText = ids.bookingIds
        .map((id) => {
          const booking = bookings[id]
          if (!booking) return ''
          const buyerName = getProfileName(profiles[booking.buyer_id]) || ''
          const sellerName = getProfileName(profiles[booking.seller_id]) || ''
          return `${booking.game || ''} ${booking.status || ''} ${buyerName} ${sellerName}`
        })
        .join(' ')
        .toLowerCase()

      const actorName = getProfileName(event.actor_user_id ? profiles[event.actor_user_id] : null)?.toLowerCase() || ''
      const summary = buildEventSummary(event, profiles, bookings).toLowerCase()

      const directBooking =
        (event.booking_id && bookings[event.booking_id]) ||
        (event.table_name === 'booking_requests' && event.entity_id ? bookings[event.entity_id] : null)

      const directBookingText = directBooking
        ? `${directBooking.game || ''} ${directBooking.status || ''} ${
            getProfileName(profiles[directBooking.buyer_id]) || ''
          } ${getProfileName(profiles[directBooking.seller_id]) || ''}`
        : ''

      const haystack = [
        event.event_type,
        summary,
        event.table_name,
        event.operation,
        event.entity_id || '',
        event.actor_user_id || '',
        event.booking_id || '',
        event.conversation_id || '',
        actorName,
        payloadUserNames,
        payloadBookingText,
        directBookingText,
        payloadText,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [events, profiles, bookings, search])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <TopNav />

      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold">Debug Log</h1>
            <p className="text-sm text-slate-400">
              IDs duruyor ama artık insanlar gibi okunuyor. Şükür.
            </p>
          </div>

          <button
            onClick={() => void load()}
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500"
          >
            Refresh
          </button>
        </div>

        <div className="mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event, name, game, status, id..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none"
          />
        </div>

        {errorText ? <p className="mb-4 text-red-400">{errorText}</p> : null}
        {loading ? <p className="text-slate-400">Loading debug timeline...</p> : null}

        <div className="space-y-4">
          {filteredEvents.map((event) => {
            const expanded = !!expandedIds[event.id]
            const payloadIds = collectIdsFromPayload(event.payload)

            const directBookingId =
              event.booking_id ||
              (event.table_name === 'booking_requests' ? event.entity_id : null) ||
              event.payload?.booking_id ||
              event.payload?.request_id

            const uniquePayloadBookingIds = Array.from(
              new Set(
                [directBookingId, ...payloadIds.bookingIds].filter(Boolean) as string[]
              )
            )

            return (
              <div
                key={event.id}
                className="rounded-2xl border border-slate-800 bg-gray-950 p-5"
              >
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className={`text-lg font-bold ${getColor(event.event_type)}`}>
                      {event.event_type}
                    </div>

                    <div className="mt-1 text-base text-slate-200">
                      {buildEventSummary(event, profiles, bookings)}
                    </div>

                    <div className="mt-2 text-sm text-slate-400">
                      {formatDateTime(event.created_at)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                        table: {event.table_name}
                      </span>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                        op: {event.operation}
                      </span>
                      {event.conversation_id && (
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                          conversation: {event.conversation_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpanded(event.id)}
                    className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
                  >
                    {expanded ? 'Hide Payload' : 'Show Payload'}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Actor</div>
                    {renderMaybeUser(event.actor_user_id, profiles)}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Primary Booking</div>
                    {renderMaybeBooking(directBookingId, bookings, profiles)}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Entity ID</div>
                    <div className="font-medium text-white break-all">{event.entity_id || '—'}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Event ID</div>
                    <div className="font-medium text-white break-all">{event.id}</div>
                  </div>
                </div>

                {(payloadIds.userIds.length > 0 || uniquePayloadBookingIds.length > 1) && (
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
                        Users Found In Payload
                      </div>

                      {payloadIds.userIds.length === 0 ? (
                        <div className="text-slate-400">No user ids found</div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {payloadIds.userIds.map((id) => (
                            <div
                              key={`${event.id}-user-${id}`}
                              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                            >
                              {renderMaybeUser(id, profiles)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">
                        Bookings Found In Payload
                      </div>

                      {uniquePayloadBookingIds.length === 0 ? (
                        <div className="text-slate-400">No booking ids found</div>
                      ) : (
                        <div className="grid gap-3">
                          {uniquePayloadBookingIds.map((id) => (
                            <div
                              key={`${event.id}-booking-${id}`}
                              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                            >
                              {renderMaybeBooking(id, bookings, profiles)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {expanded && (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-black p-4 text-xs text-slate-300">
{prettyJson(event.payload)}
                  </pre>
                )}
              </div>
            )
          })}

          {!loading && filteredEvents.length === 0 && (
            <p className="text-slate-400">No events found.</p>
          )}
        </div>
      </div>
    </main>
  )
}