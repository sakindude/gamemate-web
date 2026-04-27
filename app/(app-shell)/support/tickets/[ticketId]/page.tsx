// START_FILE: app/(app-shell)/support/tickets/[id]/page.tsx
'use client'

import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

type SupportTicketMessageRow = {
  id: string
  ticket_id: string
  sender_user_id: string | null
  sender_role: 'user' | 'support' | 'system'
  message: string
  attachment_url: string | null
  is_internal: boolean
  created_at: string
}

function statusLabel(status: string | null) {
  const normalized = (status || 'open').toLowerCase()

  if (normalized === 'open' || normalized === 'new') return 'Open'
  if (normalized === 'in_review' || normalized === 'in review' || normalized === 'reviewing') {
    return 'In Review'
  }
  if (normalized === 'waiting_for_user' || normalized === 'waiting for user') {
    return 'Waiting for You'
  }
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

const primaryPanelClasses =
  'relative overflow-hidden rounded-[30px] border border-[rgba(164,82,58,0.20)] bg-[linear-gradient(180deg,rgba(21,12,15,0.96)_0%,rgba(13,8,10,0.985)_100%)] shadow-[inset_0_1px_0_rgba(255,170,130,0.04),0_16px_40px_rgba(0,0,0,0.22)]'

const secondaryPanelClasses =
  'relative overflow-hidden rounded-[28px] border border-[rgba(112,61,46,0.18)] bg-[linear-gradient(180deg,rgba(20,12,15,0.94)_0%,rgba(13,8,10,0.975)_100%)] shadow-[inset_0_1px_0_rgba(255,145,110,0.03),0_12px_24px_rgba(0,0,0,0.14)]'

const subtlePanelClasses =
  'relative overflow-hidden rounded-[24px] border border-[rgba(96,54,43,0.14)] bg-[linear-gradient(180deg,rgba(18,12,15,0.84)_0%,rgba(12,9,11,0.92)_100%)] shadow-[inset_0_1px_0_rgba(255,140,110,0.02)]'

const fieldClasses =
  'w-full rounded-[18px] border border-[rgba(110,66,52,0.20)] bg-[linear-gradient(180deg,rgba(14,17,23,0.86)_0%,rgba(10,13,18,0.96)_100%)] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02),inset_0_-8px_18px_rgba(0,0,0,0.16)] outline-none transition placeholder:text-[#91888a] hover:border-[rgba(132,78,61,0.28)] focus:border-[rgba(182,96,71,0.36)] focus:ring-2 focus:ring-[rgba(182,96,71,0.12)]'

const quietButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(126,72,56,0.18)] bg-[linear-gradient(180deg,rgba(22,12,14,0.72)_0%,rgba(14,8,10,0.88)_100%)] px-4 py-2.5 text-sm font-semibold text-[#f0ddd6] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:border-[rgba(156,84,62,0.26)] hover:text-white'

const primaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#a24c35_0%,#783221_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,196,166,0.10)] transition hover:bg-[linear-gradient(180deg,#b1553c_0%,#853826_100%)] disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-[18px] border border-[rgba(130,73,57,0.22)] bg-[linear-gradient(180deg,rgba(24,13,16,0.76)_0%,rgba(15,9,11,0.92)_100%)] px-6 py-3 font-semibold text-[#efddd6] transition hover:border-[rgba(156,84,62,0.28)] hover:text-white'

function Eyebrow({ children }: { children: ReactNode }) {
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
  children: ReactNode
  tone?: 'primary' | 'secondary' | 'subtle'
  className?: string
}) {
  const classes =
    tone === 'primary'
      ? primaryPanelClasses
      : tone === 'subtle'
        ? subtlePanelClasses
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
  children: ReactNode
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
  } else if (
    normalized === 'in_review' ||
    normalized === 'in review' ||
    normalized === 'reviewing'
  ) {
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

function InfoCard({
  label,
  value,
  breakAll = false,
}: {
  label: string
  value: string
  breakAll?: boolean
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(104,58,45,0.14)] bg-[linear-gradient(180deg,rgba(14,17,23,0.78)_0%,rgba(11,14,18,0.92)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a8b88]">
        {label}
      </div>
      <div className={`mt-2 text-sm text-[#f1e1da] ${breakAll ? 'break-all' : ''}`}>{value}</div>
    </div>
  )
}

function TimelineMessage({ item }: { item: SupportTicketMessageRow }) {
  const isUser = item.sender_role === 'user'
  const isSupport = item.sender_role === 'support'

  const wrapperClass = isUser
    ? 'border-[rgba(171,84,59,0.18)] bg-[linear-gradient(180deg,rgba(95,39,28,0.12)_0%,rgba(23,12,14,0.82)_100%)]'
    : isSupport
      ? 'border-emerald-500/16 bg-[linear-gradient(180deg,rgba(16,48,38,0.18)_0%,rgba(14,19,18,0.86)_100%)]'
      : 'border-[rgba(92,92,100,0.18)] bg-[linear-gradient(180deg,rgba(26,28,34,0.26)_0%,rgba(18,19,24,0.86)_100%)]'

  const label = isUser ? 'You' : isSupport ? 'Support' : 'System'

  return (
    <div className={`rounded-[24px] border p-5 ${wrapperClass}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ThemedChip>{label}</ThemedChip>
          <ThemedChip>{formatDate(item.created_at)}</ThemedChip>
        </div>
      </div>

      <div className="whitespace-pre-wrap text-sm leading-7 text-[#e6d7d1]">{item.message}</div>

      {item.attachment_url ? (
        <div className="mt-4">
          <a
            href={item.attachment_url}
            target="_blank"
            rel="noreferrer"
            className={secondaryButtonClasses}
          >
            Open Attachment
          </a>
        </div>
      ) : null}
    </div>
  )
}

export default function SupportTicketDetailPage() {
  const router = useRouter()
  const params = useParams<{ id?: string; ticketId?: string }>()
  const rawTicketId = params?.id || params?.ticketId || ''
  const ticketId = Array.isArray(rawTicketId) ? rawTicketId[0] : rawTicketId

  const { user, loading: authLoading } = useAuth()
  const userId = user?.id || ''

  const [loading, setLoading] = useState(true)
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null)
  const [messages, setMessages] = useState<SupportTicketMessageRow[]>([])
  const [pageError, setPageError] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyStatus, setReplyStatus] = useState('')

  const loadTicketAndMessages = useCallback(async () => {
    if (!ticketId) {
      setPageError('Ticket id is missing.')
      setLoading(false)
      return
    }

    if (!userId) {
      router.push('/login')
      return
    }

    setLoading(true)

    const { data: ticketData, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, user_id, booking_id, type, category, message, status, created_at, evidence_url')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .maybeSingle()

    if (ticketError) {
      setPageError(ticketError.message)
      setTicket(null)
      setMessages([])
      setLoading(false)
      return
    }

    if (!ticketData) {
      setPageError('Ticket not found or you do not have access to it.')
      setTicket(null)
      setMessages([])
      setLoading(false)
      return
    }

    const nextTicket = ticketData as SupportTicketRow

    const { data: messageData, error: messageError } = await supabase
      .from('support_ticket_messages')
      .select('id, ticket_id, sender_user_id, sender_role, message, attachment_url, is_internal, created_at')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })

    if (messageError) {
      setPageError(messageError.message)
      setTicket(nextTicket)
      setMessages([])
      setLoading(false)
      return
    }

    const visibleMessages = (messageData as SupportTicketMessageRow[]) || []

    const initialTicketMessage: SupportTicketMessageRow = {
      id: `initial-${nextTicket.id}`,
      ticket_id: nextTicket.id,
      sender_user_id: nextTicket.user_id,
      sender_role: 'user',
      message: nextTicket.message || 'No message content.',
      attachment_url: nextTicket.evidence_url,
      is_internal: false,
      created_at: nextTicket.created_at,
    }

    setTicket(nextTicket)
    setMessages([initialTicketMessage, ...visibleMessages])
    setPageError('')
    setLoading(false)
  }, [router, ticketId, userId])

  const refreshTicketOnly = useCallback(async () => {
    if (!ticketId || !userId) return

    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, user_id, booking_id, type, category, message, status, created_at, evidence_url')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('support ticket refresh error:', error)
      return
    }

    if (data) {
      setTicket(data as SupportTicketRow)
    }
  }, [ticketId, userId])

  useEffect(() => {
    if (authLoading) return

    if (!userId) {
      router.push('/login')
      return
    }

    void loadTicketAndMessages()
  }, [authLoading, loadTicketAndMessages, router, userId])

  const pageTitle = useMemo(() => {
    if (!ticket) return 'Support Ticket'
    return `Ticket #${ticket.id.slice(0, 8)}`
  }, [ticket])

  const canReply = useMemo(() => {
    if (!ticket?.status) return true
    const normalized = ticket.status.toLowerCase()
    return normalized !== 'closed'
  }, [ticket])

  const isResolved = useMemo(() => {
    if (!ticket?.status) return false
    return ticket.status.toLowerCase() === 'resolved'
  }, [ticket])

  const submitReply = async () => {
    const text = replyMessage.trim()
    const attachment = attachmentUrl.trim()

    if (!ticket?.id) {
      setReplyStatus('Ticket not found.')
      return
    }

    if (!userId) {
      setReplyStatus('You must be logged in.')
      return
    }

    if (!text) {
      setReplyStatus('Write a reply first.')
      return
    }

    if (replyLoading) return

    setReplyLoading(true)
    setReplyStatus('')

    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_user_id: userId,
        sender_role: 'user',
        message: text,
        attachment_url: attachment || null,
        is_internal: false,
      })
      .select('id, ticket_id, sender_user_id, sender_role, message, attachment_url, is_internal, created_at')
      .single()

    if (error) {
      setReplyStatus(error.message)
      setReplyLoading(false)
      return
    }

    const insertedMessage = data as SupportTicketMessageRow

    setMessages((prev) => [...prev, insertedMessage])
    setReplyMessage('')
    setAttachmentUrl('')
    setReplyStatus('Reply sent.')
    setReplyLoading(false)

    void refreshTicketOnly()
  }

  if (authLoading || loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_18%,rgba(132,58,35,0.11),transparent_20%),radial-gradient(circle_at_50%_32%,rgba(7,8,11,0.16)_0%,rgba(7,8,11,0.72)_38%,rgba(6,7,9,0.98)_78%),linear-gradient(180deg,#0b0b0d_0%,#08080a_100%)]" />
        <div className="relative z-10 mx-auto max-w-[1180px] px-6 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[980px]">
            <ThemedPanel tone="secondary" className="p-5">
              <p className="text-sm text-[#cfc0ba]">
                {authLoading ? 'Checking session...' : 'Loading ticket...'}
              </p>
            </ThemedPanel>
          </div>
        </div>
      </main>
    )
  }

  if (pageError || !ticket) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_18%,rgba(132,58,35,0.11),transparent_20%),radial-gradient(circle_at_50%_32%,rgba(7,8,11,0.16)_0%,rgba(7,8,11,0.72)_38%,rgba(6,7,9,0.98)_78%),linear-gradient(180deg,#0b0b0d_0%,#08080a_100%)]" />
        <section className="relative z-10 mx-auto max-w-[1180px] px-6 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[980px]">
            <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/10 p-6">
              <h1 className="text-2xl font-bold text-white">Ticket unavailable</h1>
              <p className="mt-3 text-sm leading-7 text-rose-200">
                {pageError || 'This ticket could not be loaded.'}
              </p>

              <div className="mt-5">
                <Link href="/support/tickets" className={quietButtonClasses}>
                  Back to My Tickets
                </Link>
              </div>
            </div>
          </div>
        </section>
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
                <ThemedChip tone="warm">Ticket Detail</ThemedChip>
              </div>

              <Eyebrow>Support Center</Eyebrow>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-white md:text-4xl">
                {pageTitle}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c3b3ae] md:text-[15px]">
                Review the ticket you submitted, its status, and the message timeline for this case.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/support/tickets" className={quietButtonClasses}>
                Back to My Tickets
              </Link>
              <Link href="/support" className={primaryButtonClasses}>
                Open Support
              </Link>
            </div>
          </div>

          <ThemedPanel tone="secondary" className="mb-6 p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <ThemedChip>{ticket.category || 'Uncategorized'}</ThemedChip>
                  {ticket.type ? <ThemedChip>{ticket.type}</ThemedChip> : null}
                </div>

                <p className="text-sm leading-7 text-[#d7c7c0]">
                  This page shows your ticket details and the visible message history for this case.
                </p>
              </div>

              <StatusPill status={ticket.status} />
            </div>
          </ThemedPanel>

          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Ticket ID" value={ticket.id} breakAll />
            <InfoCard label="Created" value={formatDate(ticket.created_at)} />
            <InfoCard label="Booking" value={ticket.booking_id || 'Not linked'} breakAll />
            <InfoCard label="Evidence" value={ticket.evidence_url ? 'Attached' : 'None'} />
          </div>

          <ThemedPanel tone="secondary" className="mb-6 p-5 md:p-6">
            <h2 className="text-xl font-bold text-white">Case Timeline</h2>
            <p className="mt-2 text-sm leading-7 text-[#c5b5af]">
              This includes your original ticket message and any visible replies added later.
            </p>

            <div className="mt-5 space-y-4">
              {messages.map((item) => (
                <TimelineMessage key={item.id} item={item} />
              ))}
            </div>
          </ThemedPanel>

          <ThemedPanel tone="primary" className="p-5 md:p-6">
            <h2 className="text-xl font-bold text-white">Reply</h2>
            <p className="mt-2 text-sm leading-7 text-[#c7b7b1]">
              Add more context, answer support questions, or share extra details for this case.
            </p>

            {!canReply ? (
              <div className="mt-4 rounded-[22px] border border-[rgba(96,54,43,0.14)] bg-[linear-gradient(180deg,rgba(18,12,15,0.84)_0%,rgba(12,9,11,0.92)_100%)] p-5">
                <p className="text-sm leading-7 text-[#d6c8c2]">
                  This ticket is currently marked as{' '}
                  <span className="font-semibold text-white">{ticket.status}</span>. New user
                  replies are disabled for this status.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {isResolved ? (
                  <div className="rounded-[22px] border border-emerald-500/18 bg-emerald-500/10 p-5">
                    <p className="text-sm leading-7 text-emerald-100">
                      This ticket is currently marked as{' '}
                      <span className="font-semibold text-white">{ticket.status}</span>. If your
                      issue is still not resolved, you can reply here and the case will reopen for
                      review.
                    </p>
                  </div>
                ) : null}

                <textarea
                  placeholder="Write your reply..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  className={`${fieldClasses} min-h-[180px] resize-y`}
                />

                <input
                  type="text"
                  placeholder="Attachment URL (optional for now)"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  className={fieldClasses}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void submitReply()}
                    disabled={replyLoading}
                    className={primaryButtonClasses}
                  >
                    {replyLoading ? 'Sending...' : 'Send Reply'}
                  </button>

                  {replyStatus ? <p className="text-sm text-[#d3c3bd]">{replyStatus}</p> : null}
                </div>
              </div>
            )}
          </ThemedPanel>
        </div>
      </section>
    </main>
  )
}
// END_FILE