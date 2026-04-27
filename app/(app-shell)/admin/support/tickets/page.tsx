'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type SupportTicketRow = {
  id: string
  user_id: string
  booking_id: string | null
  type: string | null
  category: string | null
  message: string | null
  status: string | null
  created_at: string
  evidence_url: string | null
}

type SupportTicketMessageMetaRow = {
  ticket_id: string
  created_at: string
  is_internal: boolean
}

type TicketMeta = {
  replyCount: number
  lastActivityAt: string
}

function shortId(id: string | null) {
  if (!id) return null
  return id.slice(0, 8)
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
  } catch {
    return value
  }
}

function getMessagePreview(message: string | null) {
  if (!message) return 'No message content.'
  const cleaned = message.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 160) return cleaned
  return `${cleaned.slice(0, 160)}...`
}

function statusLabel(status: string | null) {
  const normalized = (status || 'new').toLowerCase()

  if (normalized === 'new' || normalized === 'open') return 'New'
  if (
    normalized === 'in_review' ||
    normalized === 'in review' ||
    normalized === 'reviewing'
  ) {
    return 'In Review'
  }
  if (
    normalized === 'waiting_for_user' ||
    normalized === 'waiting for user'
  ) {
    return 'Waiting for User'
  }
  if (normalized === 'resolved') return 'Resolved'

  return status || 'New'
}

function statusSortValue(status: string | null) {
  const normalized = (status || 'new').toLowerCase()

  if (normalized === 'new' || normalized === 'open') return 0
  if (
    normalized === 'in_review' ||
    normalized === 'in review' ||
    normalized === 'reviewing'
  ) {
    return 1
  }
  if (
    normalized === 'waiting_for_user' ||
    normalized === 'waiting for user'
  ) {
    return 2
  }
  if (normalized === 'resolved') return 3

  return 9
}

function StatusPill({ status }: { status: string | null }) {
  const normalized = (status || 'new').toLowerCase()

  let classes = 'border-slate-700 bg-slate-800 text-slate-200'

  if (normalized === 'new' || normalized === 'open') {
    classes = 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
  } else if (
    normalized === 'in_review' ||
    normalized === 'in review' ||
    normalized === 'reviewing'
  ) {
    classes = 'border-amber-500/20 bg-amber-500/10 text-amber-300'
  } else if (
    normalized === 'waiting_for_user' ||
    normalized === 'waiting for user'
  ) {
    classes = 'border-sky-500/20 bg-sky-500/10 text-sky-300'
  } else if (normalized === 'resolved') {
    classes = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {statusLabel(status)}
    </span>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
    </div>
  )
}

function buildTicketMeta(
  tickets: SupportTicketRow[],
  messageRows: SupportTicketMessageMetaRow[]
): Record<string, TicketMeta> {
  const metaMap: Record<string, TicketMeta> = {}

  for (const ticket of tickets) {
    metaMap[ticket.id] = {
      replyCount: 0,
      lastActivityAt: ticket.created_at,
    }
  }

  for (const row of messageRows) {
    if (row.is_internal) continue

    const current = metaMap[row.ticket_id]
    if (!current) continue

    current.replyCount += 1

    const currentTime = new Date(current.lastActivityAt).getTime()
    const rowTime = new Date(row.created_at).getTime()

    if (!Number.isNaN(rowTime) && rowTime > currentTime) {
      current.lastActivityAt = row.created_at
    }
  }

  return metaMap
}

export default function AdminSupportTicketsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<SupportTicketRow[]>([])
  const [ticketMeta, setTicketMeta] = useState<Record<string, TicketMeta>>({})
  const [statusFilter, setStatusFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [pageError, setPageError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setPageError('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      router.push('/login')
      return
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .select(
        'id, user_id, booking_id, type, category, message, status, created_at, evidence_url'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setPageError(error.message)
      setTickets([])
      setTicketMeta({})
      setLoading(false)
      return
    }

    const ticketRows = (data as SupportTicketRow[]) || []
    setTickets(ticketRows)

    if (ticketRows.length === 0) {
      setTicketMeta({})
      setLoading(false)
      return
    }

    const ticketIds = ticketRows.map((ticket) => ticket.id)

    const { data: messageData, error: messageError } = await supabase
      .from('support_ticket_messages')
      .select('ticket_id, created_at, is_internal')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: true })

    if (messageError) {
      setPageError(messageError.message)
      setTicketMeta({})
      setLoading(false)
      return
    }

    const meta = buildTicketMeta(
      ticketRows,
      ((messageData as SupportTicketMessageMetaRow[]) || [])
    )

    setTicketMeta(meta)
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const statusOptions = useMemo(() => {
    const dynamicStatuses = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.status || 'new')
          .filter(Boolean)
      )
    ).sort((a, b) => statusSortValue(a) - statusSortValue(b))

    return ['All', ...dynamicStatuses]
  }, [tickets])

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase()

    const next = tickets.filter((ticket) => {
      const rawStatus = ticket.status || 'new'
      const statusOk = statusFilter === 'All' || rawStatus === statusFilter

      const blob = [
        ticket.id,
        ticket.user_id,
        ticket.booking_id || '',
        ticket.category || '',
        ticket.type || '',
        ticket.status || '',
        ticket.message || '',
      ]
        .join(' ')
        .toLowerCase()

      const queryOk = !q || blob.includes(q)

      return statusOk && queryOk
    })

    return next.sort((a, b) => {
      const aMeta = ticketMeta[a.id]
      const bMeta = ticketMeta[b.id]

      const aStatus = statusSortValue(a.status)
      const bStatus = statusSortValue(b.status)

      if (aStatus !== bStatus) return aStatus - bStatus

      const aTime = new Date(aMeta?.lastActivityAt || a.created_at).getTime()
      const bTime = new Date(bMeta?.lastActivityAt || b.created_at).getTime()

      return bTime - aTime
    })
  }, [query, statusFilter, ticketMeta, tickets])

  const counts = useMemo(() => {
    let newCount = 0
    let inReviewCount = 0
    let waitingCount = 0
    let resolvedCount = 0

    for (const ticket of tickets) {
      const normalized = (ticket.status || 'new').toLowerCase()

      if (normalized === 'new' || normalized === 'open') {
        newCount += 1
      } else if (
        normalized === 'in_review' ||
        normalized === 'in review' ||
        normalized === 'reviewing'
      ) {
        inReviewCount += 1
      } else if (
        normalized === 'waiting_for_user' ||
        normalized === 'waiting for user'
      ) {
        waitingCount += 1
      } else if (normalized === 'resolved') {
        resolvedCount += 1
      }
    }

    return {
      total: tickets.length,
      newCount,
      inReviewCount,
      waitingCount,
      resolvedCount,
    }
  }, [tickets])

  const hasFilters = statusFilter !== 'All' || query.trim() !== ''

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1240px] px-8 py-8">
          <p className="text-slate-400">Loading support tickets...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1240px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Admin
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                Support Tickets
              </span>
            </div>

            <h1 className="text-4xl font-bold">Support Ticket Operations</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Review incoming tickets, monitor current case activity, and open a ticket for
              support-side handling.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back to Admin
            </Link>

            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Total Tickets" value={counts.total} />
          <SummaryCard label="New" value={counts.newCount} />
          <SummaryCard label="In Review" value={counts.inReviewCount} />
          <SummaryCard label="Waiting for User" value={counts.waitingCount} />
          <SummaryCard label="Resolved" value={counts.resolvedCount} />
        </div>

        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === 'All' ? 'All' : statusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticket id, user id, booking, category, or message..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          {hasFilters ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('All')
                  setQuery('')
                }}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>

        {pageError ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
            <p className="text-sm leading-6 text-rose-200">{pageError}</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">
              {tickets.length === 0 ? 'No support tickets yet' : 'No tickets match these filters'}
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              {tickets.length === 0
                ? 'When users open support cases, they will appear here.'
                : 'Try a different search or clear the current filters.'}
            </p>

            {tickets.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('All')
                    setQuery('')
                  }}
                  className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Clear Filters
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const meta = ticketMeta[ticket.id] || {
                replyCount: 0,
                lastActivityAt: ticket.created_at,
              }

              return (
                <Link
                  key={ticket.id}
                  href={`/admin/support/tickets/${ticket.id}`}
                  className="block rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-slate-700 hover:bg-slate-800/70"
                >
                  <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                          {ticket.category || 'Uncategorized'}
                        </span>

                        {ticket.type ? (
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                            {ticket.type}
                          </span>
                        ) : null}

                        {ticket.evidence_url ? (
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                            Evidence
                          </span>
                        ) : null}
                      </div>

                      <h2 className="text-lg font-semibold text-white">
                        Ticket #{shortId(ticket.id)}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {getMessagePreview(ticket.message)}
                      </p>
                    </div>

                    <StatusPill status={ticket.status} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        User
                      </div>
                      <div className="mt-2 text-sm text-slate-200">#{shortId(ticket.user_id)}</div>
                      <div className="mt-1 break-all text-xs text-slate-500">{ticket.user_id}</div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Booking
                      </div>
                      <div className="mt-2 text-sm text-slate-200">
                        {ticket.booking_id ? `#${shortId(ticket.booking_id)}` : 'Not linked'}
                      </div>
                      {ticket.booking_id ? (
                        <div className="mt-1 break-all text-xs text-slate-500">{ticket.booking_id}</div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Created
                      </div>
                      <div className="mt-2 text-sm text-slate-200">
                        {formatDate(ticket.created_at)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Last Activity
                      </div>
                      <div className="mt-2 text-sm text-slate-200">
                        {formatDate(meta.lastActivityAt)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Replies
                      </div>
                      <div className="mt-2 text-sm text-slate-200">{meta.replyCount}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Open this ticket to review the full thread, reply as support, and update its
                      status.
                    </p>
                    <span className="text-sm font-semibold text-indigo-300">Open Ticket →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}