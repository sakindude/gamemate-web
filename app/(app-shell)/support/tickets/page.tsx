// START_FILE: app/(app-shell)/support/tickets/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

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

const TICKET_LIMIT = 50
const MESSAGE_META_LIMIT = 300

function statusLabel(status: string | null) {
  const normalized = (status || 'open').toLowerCase()

  if (normalized === 'open' || normalized === 'new') return 'Open'
  if (normalized === 'in_review' || normalized === 'in review' || normalized === 'reviewing') return 'In Review'
  if (normalized === 'waiting_for_user' || normalized === 'waiting for user') return 'Waiting for You'
  if (normalized === 'resolved') return 'Resolved'
  if (normalized === 'closed') return 'Closed'

  return status || 'Open'
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
  if (cleaned.length <= 180) return cleaned
  return `${cleaned.slice(0, 180)}...`
}

function shortId(id: string | null) {
  if (!id) return null
  return id.slice(0, 8)
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

const primaryPanelClasses =
  'relative overflow-hidden rounded-[30px] border border-[rgba(164,82,58,0.20)] bg-[linear-gradient(180deg,rgba(21,12,15,0.96)_0%,rgba(13,8,10,0.985)_100%)] shadow-[inset_0_1px_0_rgba(255,170,130,0.04),0_16px_40px_rgba(0,0,0,0.22)]'

const secondaryPanelClasses =
  'relative overflow-hidden rounded-[28px] border border-[rgba(112,61,46,0.18)] bg-[linear-gradient(180deg,rgba(20,12,15,0.94)_0%,rgba(13,8,10,0.975)_100%)] shadow-[inset_0_1px_0_rgba(255,145,110,0.03),0_12px_24px_rgba(0,0,0,0.14)]'

const filterPanelClasses =
  'relative overflow-hidden rounded-[28px] border border-[rgba(126,67,50,0.18)] bg-[linear-gradient(180deg,rgba(24,13,16,0.94)_0%,rgba(15,9,11,0.975)_100%)] shadow-[inset_0_1px_0_rgba(255,152,116,0.03),0_12px_26px_rgba(0,0,0,0.15)]'

const subtlePanelClasses =
  'relative overflow-hidden rounded-[24px] border border-[rgba(96,54,43,0.14)] bg-[linear-gradient(180deg,rgba(18,12,15,0.84)_0%,rgba(12,9,11,0.92)_100%)] shadow-[inset_0_1px_0_rgba(255,140,110,0.02)]'

const fieldClasses =
  'w-full rounded-[18px] border border-[rgba(110,66,52,0.20)] bg-[linear-gradient(180deg,rgba(14,17,23,0.86)_0%,rgba(10,13,18,0.96)_100%)] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02),inset_0_-8px_18px_rgba(0,0,0,0.16)] outline-none transition placeholder:text-[#91888a] hover:border-[rgba(132,78,61,0.28)] focus:border-[rgba(182,96,71,0.36)] focus:ring-2 focus:ring-[rgba(182,96,71,0.12)]'

const quietButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(126,72,56,0.18)] bg-[linear-gradient(180deg,rgba(22,12,14,0.72)_0%,rgba(14,8,10,0.88)_100%)] px-4 py-2.5 text-sm font-semibold text-[#f0ddd6] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:border-[rgba(156,84,62,0.26)] hover:text-white'

const primaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#a24c35_0%,#783221_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,196,166,0.10)] transition hover:bg-[linear-gradient(180deg,#b1553c_0%,#853826_100%)]'

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(130,73,57,0.22)] bg-[linear-gradient(180deg,rgba(24,13,16,0.76)_0%,rgba(15,9,11,0.92)_100%)] px-6 py-3 font-semibold text-[#efddd6] transition hover:border-[rgba(156,84,62,0.28)] hover:text-white'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#af887b]">
      {children}
    </div>
  )
}

function PanelTopAccent({ strength = 'soft' }: { strength?: 'soft' | 'strong' }) {
  return (
    <span
      className={`pointer-events-none absolute left-8 right-8 top-0 h-px ${
        strength === 'strong'
          ? 'bg-[linear-gradient(90deg,transparent_0%,rgba(226,118,84,0.16)_50%,transparent_100%)]'
          : 'bg-[linear-gradient(90deg,transparent_0%,rgba(190,96,67,0.10)_50%,transparent_100%)]'
      }`}
    />
  )
}

function ThemedPanel({
  children,
  tone = 'secondary',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'primary' | 'secondary' | 'subtle' | 'filter'
  className?: string
}) {
  const classes =
    tone === 'primary'
      ? primaryPanelClasses
      : tone === 'subtle'
        ? subtlePanelClasses
        : tone === 'filter'
          ? filterPanelClasses
          : secondaryPanelClasses

  return (
    <div className={`${classes} ${className}`}>
      <PanelTopAccent strength={tone === 'primary' ? 'strong' : 'soft'} />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

function ThemedChip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'warm'
}) {
  const classes =
    tone === 'warm'
      ? 'border-[rgba(171,84,59,0.22)] bg-[rgba(109,44,30,0.16)] text-[#efc1b2]'
      : 'border-[rgba(112,68,57,0.20)] bg-[rgba(24,15,18,0.74)] text-[#d7c1ba]'

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${classes}`}>
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: string | null }) {
  const normalized = (status || 'open').toLowerCase()

  let classes = 'border-[rgba(112,68,57,0.20)] bg-[rgba(24,15,18,0.74)] text-[#d7c1ba]'

  if (normalized === 'open' || normalized === 'new') {
    classes = 'border-[rgba(171,84,59,0.24)] bg-[rgba(109,44,30,0.16)] text-[#efc1b2]'
  } else if (normalized === 'in_review' || normalized === 'in review' || normalized === 'reviewing') {
    classes = 'border-amber-500/18 bg-amber-500/10 text-amber-300'
  } else if (normalized === 'waiting_for_user' || normalized === 'waiting for user') {
    classes = 'border-sky-500/18 bg-sky-500/10 text-sky-300'
  } else if (normalized === 'resolved') {
    classes = 'border-emerald-500/18 bg-emerald-500/10 text-emerald-300'
  } else if (normalized === 'closed') {
    classes = 'border-[rgba(98,98,104,0.20)] bg-[rgba(22,22,28,0.68)] text-[#a5a5af]'
  }

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {statusLabel(status)}
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[20px] border border-[rgba(104,58,45,0.14)] bg-[linear-gradient(180deg,rgba(14,17,23,0.78)_0%,rgba(11,14,18,0.92)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a8b88]">
        {label}
      </div>
      <div className="mt-2 text-sm text-[#f1e1da]">{value}</div>
    </div>
  )
}

export default function SupportTicketsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<SupportTicketRow[]>([])
  const [ticketMeta, setTicketMeta] = useState<Record<string, TicketMeta>>({})
  const [statusFilter, setStatusFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (authLoading) return

      if (!user?.id) {
        router.replace('/login')
        return
      }

      setLoading(true)
      setPageError('')

      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, user_id, booking_id, type, category, message, status, created_at, evidence_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(TICKET_LIMIT)

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
        .order('created_at', { ascending: false })
        .limit(MESSAGE_META_LIMIT)

      if (messageError) {
        console.error('support ticket messages meta load error:', messageError)
        setTicketMeta(buildTicketMeta(ticketRows, []))
        setLoading(false)
        return
      }

      setTicketMeta(
        buildTicketMeta(ticketRows, (messageData as SupportTicketMessageMetaRow[]) || [])
      )
      setLoading(false)
    }

    void load()
  }, [authLoading, router, user?.id])

  const statusOptions = useMemo(() => {
    const dynamicStatuses = Array.from(
      new Set(tickets.map((ticket) => ticket.status || 'open').filter(Boolean))
    )

    return ['All', ...dynamicStatuses]
  }, [tickets])

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase()

    return tickets.filter((ticket) => {
      const statusValue = ticket.status || 'open'
      const statusOk = statusFilter === 'All' || statusValue === statusFilter

      const blob = [
        ticket.category || '',
        ticket.type || '',
        ticket.message || '',
        ticket.booking_id || '',
        ticket.status || '',
      ]
        .join(' ')
        .toLowerCase()

      const queryOk = !q || blob.includes(q)

      return statusOk && queryOk
    })
  }, [tickets, statusFilter, query])

  const hasFilters = statusFilter !== 'All' || query.trim() !== ''

  if (authLoading || loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_18%,rgba(132,58,35,0.11),transparent_20%),radial-gradient(circle_at_50%_32%,rgba(7,8,11,0.16)_0%,rgba(7,8,11,0.72)_38%,rgba(6,7,9,0.98)_78%),linear-gradient(180deg,#0b0b0d_0%,#08080a_100%)]" />
        <div className="relative z-10 mx-auto max-w-[1180px] px-6 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[980px]">
            <ThemedPanel tone="secondary" className="p-5">
              <p className="text-sm text-[#cfc0ba]">
                {authLoading ? 'Checking session...' : 'Loading your tickets...'}
              </p>
            </ThemedPanel>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_18%,rgba(132,58,35,0.11),transparent_20%),radial-gradient(circle_at_10%_80%,rgba(92,39,28,0.055),transparent_18%),radial-gradient(circle_at_100%_0%,rgba(48,20,20,0.035),transparent_16%),radial-gradient(circle_at_50%_32%,rgba(7,8,11,0.16)_0%,rgba(7,8,11,0.72)_38%,rgba(6,7,9,0.98)_78%),linear-gradient(180deg,#0b0b0d_0%,#08080a_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.18),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.02] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.95)_0.7px,transparent_0.7px)] [background-size:14px_14px]" />

      <section className="relative z-10 mx-auto max-w-[1180px] px-6 py-8 md:px-8 md:py-10">
        <div className="mx-auto max-w-[980px]">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <ThemedChip>Support</ThemedChip>
                <ThemedChip tone="warm">My Tickets</ThemedChip>
              </div>

              <Eyebrow>Support Center</Eyebrow>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-white md:text-4xl">
                My Tickets
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c3b3ae] md:text-[15px]">
                Review your support cases, their latest activity, and whether they still need a
                reply from you.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/support" className={quietButtonClasses}>
                Back to Support
              </Link>
            </div>
          </div>

          <ThemedPanel tone="filter" className="mb-8 p-5 md:p-6">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#f0dfd8]">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={fieldClasses}
                  style={{ colorScheme: 'dark' }}
                >
                  {statusOptions.map((status) => (
                    <option
                      key={status}
                      value={status}
                      style={{
                        backgroundColor: '#101317',
                        color: '#f3e5de',
                      }}
                    >
                      {status === 'All' ? 'All' : statusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#f0dfd8]">Search</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search category, message, or booking..."
                  className={fieldClasses}
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
                  className={secondaryButtonClasses}
                >
                  Clear Filters
                </button>
              </div>
            ) : null}
          </ThemedPanel>

          {pageError ? (
            <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-5">
              <p className="text-sm leading-6 text-rose-200">{pageError}</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <ThemedPanel tone="secondary" className="p-6">
              <h2 className="text-lg font-semibold text-white">
                {tickets.length === 0 ? 'No tickets yet' : 'No tickets match these filters'}
              </h2>

              <p className="mt-2 text-sm leading-7 text-[#c6b7b2]">
                {tickets.length === 0
                  ? 'When you open a support case, it will appear here.'
                  : 'Try a different search or clear your current filters.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/support" className={primaryButtonClasses}>
                  Open Support
                </Link>

                {tickets.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('All')
                      setQuery('')
                    }}
                    className={secondaryButtonClasses}
                  >
                    Clear Filters
                  </button>
                ) : null}
              </div>
            </ThemedPanel>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => {
                const meta = ticketMeta[ticket.id] || {
                  replyCount: 0,
                  lastActivityAt: ticket.created_at,
                }

                return (
                  <Link key={ticket.id} href={`/support/tickets/${ticket.id}`} className="block">
                    <ThemedPanel
                      tone="secondary"
                      className="p-5 md:p-6 transition hover:border-[rgba(150,82,61,0.22)]"
                    >
                      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <ThemedChip>{ticket.category || 'Uncategorized'}</ThemedChip>
                            {ticket.type ? <ThemedChip>{ticket.type}</ThemedChip> : null}
                          </div>

                          <h2 className="text-lg font-semibold text-white">
                            Ticket #{shortId(ticket.id)}
                          </h2>

                          <p className="mt-2 text-sm leading-7 text-[#e0d0c9]">
                            {getMessagePreview(ticket.message)}
                          </p>
                        </div>

                        <StatusPill status={ticket.status} />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <MetricCard label="Created" value={formatDate(ticket.created_at)} />
                        <MetricCard label="Last Activity" value={formatDate(meta.lastActivityAt)} />
                        <MetricCard label="Replies" value={meta.replyCount} />
                        <MetricCard
                          label="Booking"
                          value={ticket.booking_id ? `#${shortId(ticket.booking_id)}` : 'Not linked'}
                        />
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#a39895]">
                          Open this ticket to see the full timeline and reply if needed.
                        </p>
                        <span className="text-sm font-semibold text-[#efc1b2]">View Ticket →</span>
                      </div>
                    </ThemedPanel>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
// END_FILE