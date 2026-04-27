'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type SupportTicketStatus = 'new' | 'in_review' | 'waiting_for_user' | 'resolved'

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

type FeedbackType = 'success' | 'error' | ''

const STATUS_OPTIONS: SupportTicketStatus[] = [
  'new',
  'in_review',
  'waiting_for_user',
  'resolved',
]

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

function normalizeStatus(status: string | null): SupportTicketStatus {
  const normalized = (status || 'new').toLowerCase()

  if (normalized === 'new' || normalized === 'open') return 'new'
  if (
    normalized === 'in_review' ||
    normalized === 'in review' ||
    normalized === 'reviewing'
  ) {
    return 'in_review'
  }
  if (
    normalized === 'waiting_for_user' ||
    normalized === 'waiting for user'
  ) {
    return 'waiting_for_user'
  }

  return 'resolved'
}

function statusLabel(status: string | null) {
  const normalized = normalizeStatus(status)

  if (normalized === 'new') return 'New'
  if (normalized === 'in_review') return 'In Review'
  if (normalized === 'waiting_for_user') return 'Waiting for User'
  return 'Resolved'
}

function StatusPill({ status }: { status: string | null }) {
  const normalized = normalizeStatus(status)

  let classes = 'border-slate-700 bg-slate-800 text-slate-200'

  if (normalized === 'new') {
    classes = 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
  } else if (normalized === 'in_review') {
    classes = 'border-amber-500/20 bg-amber-500/10 text-amber-300'
  } else if (normalized === 'waiting_for_user') {
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

function InfoCard({
  label,
  value,
  secondary,
  actionHref,
  actionLabel,
}: {
  label: string
  value: string
  secondary?: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#020617] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-sm text-slate-200">{value}</div>

      {secondary ? (
        <div className="mt-1 break-all text-xs text-slate-500">{secondary}</div>
      ) : null}

      {actionHref && actionLabel ? (
        <div className="mt-3">
          <a
            href={actionHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            {actionLabel}
          </a>
        </div>
      ) : null}
    </div>
  )
}

function TimelineMessage({
  item,
}: {
  item: SupportTicketMessageRow
}) {
  const isUser = item.sender_role === 'user'
  const isSupport = item.sender_role === 'support'

  const wrapperClass = isUser
    ? 'border-indigo-500/20 bg-indigo-500/10'
    : isSupport
      ? 'border-emerald-500/20 bg-emerald-500/10'
      : 'border-slate-700 bg-slate-800'

  const label = isUser ? 'User' : isSupport ? 'Support' : 'System'

  return (
    <div className={`rounded-2xl border p-5 ${wrapperClass}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200">
            {label}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400">
            {formatDate(item.created_at)}
          </span>
        </div>
      </div>

      <div className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
        {item.message}
      </div>

      {item.attachment_url ? (
        <div className="mt-4">
          <a
            href={item.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Open Attachment
          </a>
        </div>
      ) : null}
    </div>
  )
}

function FeedbackBox({
  message,
  type,
}: {
  message: string
  type: FeedbackType
}) {
  if (!message || !type) return null

  const classes =
    type === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200'

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{message}</div>
}

export default function AdminSupportTicketDetailPage() {
  const router = useRouter()
  const params = useParams<{ ticketId: string }>()
  const ticketId = Array.isArray(params?.ticketId) ? params.ticketId[0] : params?.ticketId

  const [loading, setLoading] = useState(true)
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null)
  const [messages, setMessages] = useState<SupportTicketMessageRow[]>([])
  const [pageError, setPageError] = useState('')

  const [selectedStatus, setSelectedStatus] = useState<SupportTicketStatus>('in_review')
  const [replyMessage, setReplyMessage] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  const [replyLoading, setReplyLoading] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('')

  const loadTicketAndMessages = async () => {
    if (!ticketId) {
      setPageError('Ticket id is missing.')
      setLoading(false)
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      router.push('/login')
      return
    }

    const { data: ticketData, error: ticketError } = await supabase
      .from('support_tickets')
      .select(
        'id, user_id, booking_id, type, category, message, status, created_at, evidence_url'
      )
      .eq('id', ticketId)
      .maybeSingle()

    if (ticketError) {
      setPageError(ticketError.message)
      setTicket(null)
      setMessages([])
      setLoading(false)
      return
    }

    if (!ticketData) {
      setPageError('Ticket not found.')
      setTicket(null)
      setMessages([])
      setLoading(false)
      return
    }

    setTicket(ticketData as SupportTicketRow)
    setSelectedStatus(normalizeStatus(ticketData.status))

    const { data: messageData, error: messageError } = await supabase
      .from('support_ticket_messages')
      .select(
        'id, ticket_id, sender_user_id, sender_role, message, attachment_url, is_internal, created_at'
      )
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })

    if (messageError) {
      setPageError(messageError.message)
      setMessages([])
      setLoading(false)
      return
    }

    const visibleMessages = (messageData as SupportTicketMessageRow[]) || []

    const initialTicketMessage: SupportTicketMessageRow = {
      id: `initial-${ticketData.id}`,
      ticket_id: ticketData.id,
      sender_user_id: ticketData.user_id,
      sender_role: 'user',
      message: ticketData.message || 'No message content.',
      attachment_url: ticketData.evidence_url,
      is_internal: false,
      created_at: ticketData.created_at,
    }

    setMessages([initialTicketMessage, ...visibleMessages])
    setPageError('')
    setLoading(false)
  }

  useEffect(() => {
    void loadTicketAndMessages()
  }, [router, ticketId])

  const pageTitle = useMemo(() => {
    if (!ticket) return 'Support Ticket'
    return `Ticket #${shortId(ticket.id)}`
  }, [ticket])

  const currentStatus = useMemo(() => {
    return normalizeStatus(ticket?.status || 'new')
  }, [ticket?.status])

  const saveStatusOnly = async () => {
    if (!ticket?.id) {
      setFeedbackMessage('Ticket not found.')
      setFeedbackType('error')
      return
    }

    if (selectedStatus === currentStatus) {
      setFeedbackMessage('Status is already set to that value.')
      setFeedbackType('error')
      return
    }

    setStatusSaving(true)
    setFeedbackMessage('')
    setFeedbackType('')

    const { error } = await supabase
      .from('support_tickets')
      .update({
        status: selectedStatus,
      })
      .eq('id', ticket.id)

    if (error) {
      setFeedbackMessage(error.message)
      setFeedbackType('error')
      setStatusSaving(false)
      return
    }

    setFeedbackMessage(`Status updated to ${statusLabel(selectedStatus)}.`)
    setFeedbackType('success')
    await loadTicketAndMessages()
    setStatusSaving(false)
  }

  const sendReply = async () => {
    const text = replyMessage.trim()
    const attachment = attachmentUrl.trim()

    if (!ticket?.id) {
      setFeedbackMessage('Ticket not found.')
      setFeedbackType('error')
      return
    }

    if (!text) {
      setFeedbackMessage('Write the support reply first.')
      setFeedbackType('error')
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      setFeedbackMessage('You must be logged in.')
      setFeedbackType('error')
      return
    }

    setReplyLoading(true)
    setFeedbackMessage('')
    setFeedbackType('')

    const { error: replyError } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_user_id: session.user.id,
        sender_role: 'support',
        message: text,
        attachment_url: attachment || null,
        is_internal: false,
      })

    if (replyError) {
      setFeedbackMessage(replyError.message)
      setFeedbackType('error')
      setReplyLoading(false)
      return
    }

    if (selectedStatus !== currentStatus) {
      const { error: statusError } = await supabase
        .from('support_tickets')
        .update({
          status: selectedStatus,
        })
        .eq('id', ticket.id)

      if (statusError) {
        setFeedbackMessage(
          'Reply was sent, but the ticket status could not be updated.'
        )
        setFeedbackType('error')
        await loadTicketAndMessages()
        setReplyMessage('')
        setAttachmentUrl('')
        setReplyLoading(false)
        return
      }
    }

    setReplyMessage('')
    setAttachmentUrl('')
    setFeedbackMessage('Support reply sent successfully.')
    setFeedbackType('success')
    await loadTicketAndMessages()
    setReplyLoading(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1240px] px-8 py-8">
          <p className="text-slate-400">Loading ticket...</p>
        </section>
      </main>
    )
  }

  if (pageError || !ticket) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1240px] px-8 py-8">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
            <h1 className="text-2xl font-bold text-white">Ticket unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-rose-200">
              {pageError || 'This ticket could not be loaded.'}
            </p>

            <div className="mt-5">
              <Link
                href="/admin/support/tickets"
                className="inline-flex rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Back to Support Tickets
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1240px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Admin
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                Ticket Detail
              </span>
            </div>

            <h1 className="text-4xl font-bold">{pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-slate-400">
              Review the case, send a visible support reply, and move the ticket to the correct
              support state.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/support/tickets"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Back to Ticket List
            </Link>

            <Link
              href="/admin"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Admin Home
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
                    Evidence Attached
                  </span>
                ) : null}
              </div>

              <p className="text-sm leading-6 text-slate-300">
                This is the real support-side case view. The thread below includes the original user
                ticket and all visible follow-up replies.
              </p>
            </div>

            <StatusPill status={ticket.status} />
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoCard
            label="Ticket"
            value={`#${shortId(ticket.id)}`}
            secondary={ticket.id}
          />
          <InfoCard
            label="User"
            value={`#${shortId(ticket.user_id)}`}
            secondary={ticket.user_id}
          />
          <InfoCard
            label="Booking"
            value={ticket.booking_id ? `#${shortId(ticket.booking_id)}` : 'Not linked'}
            secondary={ticket.booking_id || undefined}
          />
          <InfoCard
            label="Created"
            value={formatDate(ticket.created_at)}
          />
          <InfoCard
            label="Evidence"
            value={ticket.evidence_url ? 'Attachment added' : 'None'}
            actionHref={ticket.evidence_url || undefined}
            actionLabel={ticket.evidence_url ? 'Open Evidence' : undefined}
          />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">Visible Timeline</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This includes the original user ticket plus all visible support and user replies.
          </p>

          <div className="mt-5 space-y-4">
            {messages.map((item) => (
              <TimelineMessage key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">Support Action</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Choose the correct ticket status, then send a visible reply or save the status only.
          </p>

          <div className="mt-5 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-[#020617] p-5">
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Ticket Status
                </label>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as SupportTicketStatus)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>

                <p className="mt-3 text-xs leading-6 text-slate-500">
                  Current status: <span className="text-slate-300">{statusLabel(ticket.status)}</span>
                </p>

                <button
                  type="button"
                  onClick={saveStatusOnly}
                  disabled={statusSaving || selectedStatus === currentStatus}
                  className="mt-4 w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {statusSaving ? 'Saving...' : 'Save Status Only'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                placeholder="Write the support reply..."
                value={replyMessage}
                onChange={(e) => {
                  setReplyMessage(e.target.value)
                  if (feedbackMessage) {
                    setFeedbackMessage('')
                    setFeedbackType('')
                  }
                }}
                className="min-h-[220px] w-full rounded-xl bg-slate-800 p-4 text-white outline-none"
              />

              <input
                type="text"
                placeholder="Paste attachment link (optional)"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                className="w-full rounded-xl bg-slate-800 p-4 text-white outline-none"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={replyLoading}
                  className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {replyLoading ? 'Sending...' : 'Send Support Reply'}
                </button>
              </div>

              <FeedbackBox message={feedbackMessage} type={feedbackType} />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}