'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

type InboxRow = {
  conversation_id: string
  other_user_id: string
  other_display_name: string
  last_message: string
  last_message_at: string | null
  unread: boolean
}

type DisplayInboxRow = InboxRow & {
  grouped_conversation_ids: string[]
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string | null
  message: string
  message_type: 'user' | 'system'
  metadata: Record<string, unknown>
  created_at: string
}

type BookingPanelRow = {
  id: string
  game: string | null
  status: string | null
  communication_method: string | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
  created_at: string
}

type ConversationReadRow = {
  conversation_id: string
  user_id: string
  last_read_at: string
}

const MESSAGE_LIMIT = 200
const MESSAGE_POLL_VISIBLE_MS = 12000
const MESSAGE_POLL_HIDDEN_MS = 60000
const INBOX_POLL_VISIBLE_MS = 90000
const INBOX_POLL_HIDDEN_MS = 180000
const READ_SYNC_THROTTLE_MS = 8000
const FOCUS_REFRESH_THROTTLE_MS = 30000

function formatMessageTime(dateString: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateString))
}

function formatMoneyFromCents(value: number | null | undefined) {
  return `$${(Number(value || 0) / 100).toFixed(2)}`
}

function getBookingPriceCents(row: BookingPanelRow | null | undefined) {
  if (!row) return 0
  if (typeof row.total_amount_cents === 'number') return row.total_amount_cents
  if (typeof row.seller_payout_cents === 'number') return row.seller_payout_cents
  return 0
}

function getInboxRowSortTime(row: InboxRow) {
  return row.last_message_at ? new Date(row.last_message_at).getTime() : 0
}

function statusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'border border-amber-400/30 bg-amber-500/10 text-amber-200'
    case 'accepted':
      return 'border border-blue-400/30 bg-blue-500/10 text-blue-200'
    case 'rejected':
      return 'border border-rose-400/30 bg-rose-500/10 text-rose-200'
    case 'awaiting_buyer_confirmation':
      return 'border border-violet-400/30 bg-violet-500/10 text-violet-200'
    case 'completed':
      return 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
    default:
      return 'border border-slate-400/20 bg-slate-500/10 text-slate-300'
  }
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'accepted':
      return 'Accepted'
    case 'rejected':
      return 'Rejected'
    case 'awaiting_buyer_confirmation':
      return 'Awaiting Confirmation'
    case 'completed':
      return 'Completed'
    default:
      return status || 'Unknown'
  }
}

function systemMessageAccent(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'border-amber-400/15 bg-amber-500/[0.08] text-amber-100/90'
    case 'accepted':
      return 'border-blue-400/15 bg-blue-500/[0.08] text-blue-100/90'
    case 'rejected':
      return 'border-rose-400/15 bg-rose-500/[0.08] text-rose-100/90'
    case 'awaiting_buyer_confirmation':
      return 'border-violet-400/15 bg-violet-500/[0.08] text-violet-100/90'
    case 'completed':
      return 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-100/90'
    default:
      return 'border-slate-700/80 bg-slate-800/60 text-slate-300/90'
  }
}

function extractBookingIdFromMessages(messages: MessageRow[]) {
  for (const msg of messages) {
    if (msg.message_type !== 'system') continue

    const bookingId = (msg.metadata as Record<string, unknown> | null)?.booking_id

    if (typeof bookingId === 'string' && bookingId) {
      return bookingId
    }
  }

  return ''
}

function getMessageDeliveryState(params: {
  msg: MessageRow
  myUserId: string
  otherUserId: string
  readsMap: Record<string, string>
}) {
  const { msg, myUserId, otherUserId, readsMap } = params

  if (msg.message_type !== 'user') return null
  if (msg.sender_id !== myUserId) return null
  if (!otherUserId) return 'sent'

  const otherReadAt = readsMap[otherUserId]
  if (!otherReadAt) return 'sent'

  const seen = new Date(otherReadAt).getTime() >= new Date(msg.created_at).getTime()

  return seen ? 'seen' : 'sent'
}

function DeliveryTicks({ state }: { state: 'sent' | 'seen' | null }) {
  if (!state) return null

  if (state === 'seen') {
    return (
      <span className="inline-flex items-center rounded-full bg-indigo-400/15 px-2 py-0.5 text-[11px] font-bold tracking-tight text-indigo-300">
        ✓✓
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-bold tracking-tight text-slate-400">
      ✓
    </span>
  )
}

function getLatestIncomingMessageTime(messages: MessageRow[], myUserId: string) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.sender_id && msg.sender_id !== myUserId) {
      return new Date(msg.created_at).getTime()
    }
  }

  return 0
}

function clampPreview(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 88) return cleaned
  return `${cleaned.slice(0, 88)}…`
}

function getInitials(name: string | null | undefined) {
  const value = (name || '').trim()
  if (!value) return 'GM'

  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function formatSystemEventText(message: string) {
  const trimmed = message.replace(/\s+/g, ' ').trim()
  const lower = trimmed.toLowerCase()

  if (lower.startsWith('booking accepted')) return 'Booking accepted'
  if (lower.startsWith('booking rejected')) return 'Booking rejected'
  if (lower.startsWith('session started')) return 'Session started'
  if (lower.startsWith('session completed')) return 'Session completed'
  if (lower.startsWith('dispute opened')) return 'Dispute opened'
  if (lower.startsWith('tip sent')) return 'Tip sent'
  if (lower.startsWith('rating submitted')) return 'Rating submitted'
  if (lower.startsWith('booking created:')) {
    return trimmed.replace(/^booking created:/i, 'Booking created •')
  }

  return trimmed
}

export default function ChatPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const userId = user?.id ?? ''

  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')

  const [inbox, setInbox] = useState<InboxRow[]>([])
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessageRow[]>>({})
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [bookingByConversation, setBookingByConversation] = useState<Record<string, BookingPanelRow | null>>({})

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const [conversationReadsByConversation, setConversationReadsByConversation] = useState<
    Record<string, Record<string, string>>
  >({})

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const chatAudioRef = useRef<HTMLAudioElement | null>(null)

  const userIdRef = useRef('')
  const selectedConversationIdRef = useRef('')
  const initialScrolledRef = useRef(false)
  const audioArmedRef = useRef(false)
  const visibilityRef = useRef<'visible' | 'hidden'>('visible')
  const lastReadSyncAtRef = useRef<Record<string, number>>({})
  const lastFocusRefreshAtRef = useRef(0)
  const loadingSelectedConversationRef = useRef(false)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    const handleVisibility = () => {
      visibilityRef.current = document.visibilityState === 'visible' ? 'visible' : 'hidden'
    }

    handleVisibility()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const armAudio = useCallback(() => {
    audioArmedRef.current = true
  }, [])

  useEffect(() => {
    const onFirstInteraction = () => armAudio()

    window.addEventListener('pointerdown', onFirstInteraction, { once: true })
    window.addEventListener('keydown', onFirstInteraction, { once: true })

    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction)
      window.removeEventListener('keydown', onFirstInteraction)
    }
  }, [armAudio])

  const playChatSound = useCallback(() => {
    try {
      if (!chatAudioRef.current) return
      if (!audioArmedRef.current) return
      chatAudioRef.current.currentTime = 0
      void chatAudioRef.current.play().catch(() => {})
    } catch {}
  }, [])

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distanceFromBottom < 120
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current
    if (!el) return

    if (behavior === 'smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      return
    }

    el.scrollTop = el.scrollHeight
  }, [])

  const updateUrlConversation = useCallback((conversationId: string) => {
    if (typeof window === 'undefined') return
    const url = conversationId ? `/chat?id=${conversationId}` : '/chat'
    window.history.replaceState({}, '', url)
  }, [])

  const upsertStableBooking = useCallback((conversationId: string, row: BookingPanelRow | null) => {
    setBookingByConversation((prev) => {
      const current = prev[conversationId] ?? null

      if (row) {
        return {
          ...prev,
          [conversationId]: row,
        }
      }

      if (current) {
        return prev
      }

      return {
        ...prev,
        [conversationId]: null,
      }
    })
  }, [])

  const refreshConversationReads = useCallback(async (conversationId: string) => {
    if (!conversationId) return

    const { data, error } = await supabase.rpc('get_conversation_read_states', {
      p_conversation_id: conversationId,
    })

    if (error) {
      console.error('refreshConversationReads error:', error)
      return
    }

    const rows = (data || []) as ConversationReadRow[]
    const nextMap: Record<string, string> = {}

    for (const row of rows) {
      nextMap[row.user_id] = row.last_read_at
    }

    setConversationReadsByConversation((prev) => ({
      ...prev,
      [conversationId]: nextMap,
    }))
  }, [])

  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!conversationId || !userIdRef.current) return

      const now = new Date().toISOString()

      const { error } = await supabase.from('conversation_reads').upsert({
        conversation_id: conversationId,
        user_id: userIdRef.current,
        last_read_at: now,
      })

      if (error) {
        console.error('markAsRead error:', error)
        return
      }

      await refreshConversationReads(conversationId)
    },
    [refreshConversationReads]
  )

  const refreshInbox = useCallback(async (options?: { silentErrors?: boolean }) => {
    try {
      const { data, error } = await supabase.rpc('get_my_conversation_inbox')

      if (error) {
        console.error('get_my_conversation_inbox error:', error)
        if (!options?.silentErrors) {
          setErrorText(error.message || 'Failed to load inbox.')
        }
        return [] as InboxRow[]
      }

      const rows = ((data || []) as InboxRow[]).sort((a, b) => {
        const ta = getInboxRowSortTime(a)
        const tb = getInboxRowSortTime(b)
        if (tb !== ta) return tb - ta
        return a.conversation_id.localeCompare(b.conversation_id)
      })

      setInbox(rows)
      return rows
    } catch (error) {
      console.error('refreshInbox threw:', error)
      if (!options?.silentErrors) {
        setErrorText('Failed to load inbox.')
      }
      return [] as InboxRow[]
    }
  }, [])

  const refreshBookingPanel = useCallback(
    async (conversationId: string, knownMessages?: MessageRow[]) => {
      if (!conversationId) return

      const messages = knownMessages || messagesByConversation[conversationId] || []
      const bookingIdFromMessages = extractBookingIdFromMessages(messages)

      if (!bookingIdFromMessages) {
        const rpcResult = await supabase.rpc('get_booking_for_conversation', {
          p_conversation_id: conversationId,
        })

        if (rpcResult.error) {
          console.error('get_booking_for_conversation error:', rpcResult.error)
          return
        }

        const row = ((rpcResult.data || [])[0] as BookingPanelRow | undefined) || null
        upsertStableBooking(conversationId, row)
        return
      }

      const { data, error } = await supabase
        .from('booking_requests')
        .select(`
          id,
          game,
          status,
          communication_method,
          total_amount_cents,
          seller_payout_cents,
          created_at
        `)
        .eq('id', bookingIdFromMessages)
        .maybeSingle()

      if (error) {
        console.error('booking panel direct load error:', error)
        return
      }

      upsertStableBooking(conversationId, (data as BookingPanelRow | null) || null)
    },
    [messagesByConversation, upsertStableBooking]
  )

  const refreshConversationMessages = useCallback(
    async (
      conversationId: string,
      options?: {
        playSoundOnIncoming?: boolean
        silentErrors?: boolean
      }
    ) => {
      const wasNearBottom =
        conversationId === selectedConversationIdRef.current ? isNearBottom() : false

      const { data, error } = await supabase.rpc('get_conversation_messages', {
        p_conversation_id: conversationId,
      })

      if (error) {
        console.error('get_conversation_messages error:', error)
        if (!options?.silentErrors) {
          setErrorText(error.message || 'Failed to load messages.')
        }
        return { hadNewIncoming: false, messageCount: 0 }
      }

      const newData = (data || []) as MessageRow[]
      let hadNewIncoming = false

      setMessagesByConversation((prev) => {
        const prevMsgs = prev[conversationId] || []

        if (prevMsgs.length > 0 && newData.length > prevMsgs.length) {
          const prevIds = new Set(prevMsgs.map((m) => m.id))
          const incomingNew = newData.find(
            (m) => !prevIds.has(m.id) && !!m.sender_id && m.sender_id !== userIdRef.current
          )

          if (incomingNew) {
            hadNewIncoming = true

            if (
              options?.playSoundOnIncoming &&
              conversationId === selectedConversationIdRef.current
            ) {
              playChatSound()
            }
          }
        }

        return {
          ...prev,
          [conversationId]: newData,
        }
      })

      const shouldRefreshSecondaryData = options?.silentErrors !== true || hadNewIncoming

      if (shouldRefreshSecondaryData) {
        await refreshBookingPanel(conversationId, newData)
        await refreshConversationReads(conversationId)
      }

      if (conversationId === selectedConversationIdRef.current && wasNearBottom) {
        requestAnimationFrame(() => {
          scrollToBottom('smooth')
        })
      }

      return {
        hadNewIncoming,
        messageCount: newData.length,
      }
    },
    [isNearBottom, playChatSound, refreshBookingPanel, refreshConversationReads, scrollToBottom]
  )

  const loadConversationData = useCallback(
    async (
      conversationId: string,
      options?: {
        markAsReadAfter?: boolean
        playSoundOnIncoming?: boolean
        silentErrors?: boolean
      }
    ) => {
      if (!conversationId) return

      if (loadingSelectedConversationRef.current) return
      loadingSelectedConversationRef.current = true

      try {
        const result = await refreshConversationMessages(conversationId, {
          playSoundOnIncoming: options?.playSoundOnIncoming,
          silentErrors: options?.silentErrors,
        })

        if (options?.markAsReadAfter || result?.hadNewIncoming) {
          await markAsRead(conversationId)
          await refreshInbox({ silentErrors: true })
        }
      } finally {
        loadingSelectedConversationRef.current = false
      }
    },
    [markAsRead, refreshConversationMessages, refreshInbox]
  )
    const loadAll = useCallback(async () => {
    if (authLoading) return

    if (!userId) {
      router.replace('/login')
      return
    }

    setLoading(true)
    setErrorText('')

    try {
      const inboxRows = await refreshInbox()

      let preferredId = ''
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        preferredId = params.get('id') || ''
      }

      const validPreferred =
        preferredId && inboxRows.some((r) => r.conversation_id === preferredId) ? preferredId : ''

      const nextSelected =
        validPreferred || selectedConversationIdRef.current || inboxRows[0]?.conversation_id || ''

      if (nextSelected) {
        initialScrolledRef.current = false
        setSelectedConversationId(nextSelected)
        updateUrlConversation(nextSelected)
        await loadConversationData(nextSelected, {
          markAsReadAfter: true,
          playSoundOnIncoming: false,
        })
      } else {
        setSelectedConversationId('')
        setMessagesByConversation({})
        setBookingByConversation({})
        setConversationReadsByConversation({})
      }
    } finally {
      setLoading(false)
    }
  }, [authLoading, loadConversationData, refreshInbox, router, updateUrlConversation, userId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const displayInbox = useMemo<DisplayInboxRow[]>(() => {
    const grouped = new Map<string, InboxRow[]>()

    for (const row of inbox) {
      const key = row.other_user_id || row.conversation_id
      const existing = grouped.get(key) || []
      existing.push(row)
      grouped.set(key, existing)
    }

    const next: DisplayInboxRow[] = []

    grouped.forEach((rows) => {
      const sortedRows = [...rows].sort((a, b) => {
        const ta = getInboxRowSortTime(a)
        const tb = getInboxRowSortTime(b)

        if (tb !== ta) return tb - ta

        if (!!b.last_message !== !!a.last_message) {
          return Number(!!b.last_message) - Number(!!a.last_message)
        }

        return a.conversation_id.localeCompare(b.conversation_id)
      })

      const representative = sortedRows[0]
      const hasUnread = sortedRows.some((row) => row.unread)

      next.push({
        ...representative,
        unread: hasUnread,
        grouped_conversation_ids: sortedRows.map((row) => row.conversation_id),
      })
    })

    next.sort((a, b) => {
      const ta = getInboxRowSortTime(a)
      const tb = getInboxRowSortTime(b)

      if (tb !== ta) return tb - ta

      return a.other_display_name.localeCompare(b.other_display_name)
    })

    return next
  }, [inbox])

  const selectedConversation = useMemo(
    () => inbox.find((c) => c.conversation_id === selectedConversationId) || null,
    [inbox, selectedConversationId]
  )

  const selectedMessages = useMemo(
    () => messagesByConversation[selectedConversationId] || [],
    [messagesByConversation, selectedConversationId]
  )

  const selectedBooking = useMemo(
    () => bookingByConversation[selectedConversationId] || null,
    [bookingByConversation, selectedConversationId]
  )

  const selectedConversationReads = useMemo(
    () => conversationReadsByConversation[selectedConversationId] || {},
    [conversationReadsByConversation, selectedConversationId]
  )

  const otherParticipantId = useMemo(() => {
    return selectedConversation?.other_user_id || ''
  }, [selectedConversation])

  const syncReadStateIfNeeded = useCallback(async () => {
    if (!selectedConversationIdRef.current || !userIdRef.current) return
    if (visibilityRef.current !== 'visible') return

    const conversationId = selectedConversationIdRef.current
    const currentInboxRow = inbox.find((row) => row.conversation_id === conversationId)
    const currentMessages = messagesByConversation[conversationId] || []
    const currentReads = conversationReadsByConversation[conversationId] || {}

    const myReadAt = currentReads[userIdRef.current]
      ? new Date(currentReads[userIdRef.current]).getTime()
      : 0

    const latestIncomingAt = getLatestIncomingMessageTime(currentMessages, userIdRef.current)
    const unreadFromInbox = !!currentInboxRow?.unread
    const unreadFromReadState = latestIncomingAt > 0 && myReadAt < latestIncomingAt
    const needsSync = unreadFromInbox || unreadFromReadState

    if (!needsSync) return

    const now = Date.now()
    const lastSyncAt = lastReadSyncAtRef.current[conversationId] || 0
    if (now - lastSyncAt < READ_SYNC_THROTTLE_MS) return

    lastReadSyncAtRef.current[conversationId] = now

    await markAsRead(conversationId)
    await refreshInbox({ silentErrors: true })
  }, [conversationReadsByConversation, inbox, markAsRead, messagesByConversation, refreshInbox])

  useEffect(() => {
    if (!selectedConversationId) return
    if (initialScrolledRef.current) return

    requestAnimationFrame(() => {
      scrollToBottom('auto')
      initialScrolledRef.current = true
    })
  }, [scrollToBottom, selectedConversationId])

  useEffect(() => {
    const handleFocusOrVisible = async () => {
      const now = Date.now()
      if (now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return
      if (document.visibilityState !== 'visible') return
      if (!userIdRef.current) return

      lastFocusRefreshAtRef.current = now

      await refreshInbox({ silentErrors: true })

      if (selectedConversationIdRef.current) {
        await loadConversationData(selectedConversationIdRef.current, {
          markAsReadAfter: false,
          playSoundOnIncoming: true,
          silentErrors: true,
        })
        await syncReadStateIfNeeded()
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [loadConversationData, refreshInbox, syncReadStateIfNeeded])

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === selectedConversationIdRef.current) return

      initialScrolledRef.current = false
      setSelectedConversationId(conversationId)
      updateUrlConversation(conversationId)
      setDraft('')
      setErrorText('')

      await loadConversationData(conversationId, {
        markAsReadAfter: true,
        playSoundOnIncoming: false,
      })
    },
    [loadConversationData, updateUrlConversation]
  )

  useEffect(() => {
    if (!userId || !selectedConversationId) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      const conversationId = selectedConversationIdRef.current
      if (!conversationId || cancelled) return

      const result = await refreshConversationMessages(conversationId, {
        playSoundOnIncoming: true,
        silentErrors: true,
      })

      if (result?.hadNewIncoming) {
        await markAsRead(conversationId)
        await refreshInbox({ silentErrors: true })
      } else {
        await syncReadStateIfNeeded()
      }

      if (cancelled) return

      const nextDelay =
        visibilityRef.current === 'visible' ? MESSAGE_POLL_VISIBLE_MS : MESSAGE_POLL_HIDDEN_MS

      timeoutId = setTimeout(tick, nextDelay)
    }

    const initialDelay =
      visibilityRef.current === 'visible' ? MESSAGE_POLL_VISIBLE_MS : MESSAGE_POLL_HIDDEN_MS

    timeoutId = setTimeout(tick, initialDelay)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [
    markAsRead,
    refreshConversationMessages,
    refreshInbox,
    selectedConversationId,
    syncReadStateIfNeeded,
    userId,
  ])

  useEffect(() => {
    if (!userId) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      if (cancelled) return

      await refreshInbox({ silentErrors: true })

      if (cancelled) return

      const nextDelay =
        visibilityRef.current === 'visible' ? INBOX_POLL_VISIBLE_MS : INBOX_POLL_HIDDEN_MS

      timeoutId = setTimeout(tick, nextDelay)
    }

    const initialDelay =
      visibilityRef.current === 'visible' ? INBOX_POLL_VISIBLE_MS : INBOX_POLL_HIDDEN_MS

    timeoutId = setTimeout(tick, initialDelay)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [refreshInbox, userId])

  const sendMessage = async () => {
    if (!draft.trim() || !selectedConversationId) return

    const text = draft.trim().slice(0, MESSAGE_LIMIT)
    const wasNearBottom = isNearBottom()

    setSending(true)
    setErrorText('')

    const optimisticId = `temp-${Date.now()}`
    const optimisticMessage: MessageRow = {
      id: optimisticId,
      conversation_id: selectedConversationId,
      sender_id: userId,
      message: text,
      message_type: 'user',
      metadata: {},
      created_at: new Date().toISOString(),
    }

    setMessagesByConversation((prev) => ({
      ...prev,
      [selectedConversationId]: [...(prev[selectedConversationId] || []), optimisticMessage],
    }))
    setDraft('')

    if (wasNearBottom) {
      requestAnimationFrame(() => {
        scrollToBottom('smooth')
      })
    }

    const { error } = await supabase.rpc('send_conversation_message', {
      p_conversation_id: selectedConversationId,
      p_message: text,
    })

    setSending(false)

    if (error) {
      setMessagesByConversation((prev) => ({
        ...prev,
        [selectedConversationId]: (prev[selectedConversationId] || []).filter(
          (m) => m.id !== optimisticId
        ),
      }))
      setDraft(text)
      setErrorText(error.message || 'Failed to send message.')
      return
    }

    await refreshConversationMessages(selectedConversationId, {
      playSoundOnIncoming: false,
      silentErrors: false,
    })
    await markAsRead(selectedConversationId)
    await refreshInbox({ silentErrors: true })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending) {
        void sendMessage()
      }
    }
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-400">
            {authLoading ? 'Checking session...' : 'Loading conversations...'}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <audio ref={chatAudioRef} src="/sounds/chat.mp3" preload="auto" />

      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <style jsx>{`
          .gm-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: #475569 #0f172a;
          }
          .gm-scrollbar::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          .gm-scrollbar::-webkit-scrollbar-track {
            background: #0f172a;
            border-radius: 9999px;
          }
          .gm-scrollbar::-webkit-scrollbar-thumb {
            background: #475569;
            border-radius: 9999px;
            border: 2px solid #0f172a;
          }
          .gm-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #64748b;
          }
        `}</style>

        {errorText ? (
          <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorText}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(6,11,26,0.98))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
            <div className="gm-scrollbar h-[752px] overflow-y-auto overflow-x-hidden pr-1">
              <div className="space-y-2.5">
                {displayInbox.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5">
                    <div className="text-sm font-semibold text-slate-300">No conversations yet</div>
                    <div className="mt-1 text-sm text-slate-500">
                      New chats will appear here once someone reaches out.
                    </div>
                  </div>
                ) : null}

                {displayInbox.map((conv) => {
                  const rowBooking = bookingByConversation[conv.conversation_id]
                  const isActive = !!otherParticipantId && conv.other_user_id === otherParticipantId
                  const previewText = clampPreview(conv.last_message || 'No messages yet')

                  return (
                    <button
                      key={conv.other_user_id || conv.conversation_id}
                      onClick={() => void handleSelectConversation(conv.conversation_id)}
                      className={`w-full min-w-0 rounded-[20px] border p-4 text-left transition ${
                        isActive
                          ? 'border-indigo-500/30 bg-indigo-500/10 shadow-[0_10px_30px_rgba(99,102,241,0.10)]'
                          : 'border-white/10 bg-[#081121] hover:border-white/15 hover:bg-[#0c162d]'
                      }`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="truncate text-sm font-bold text-slate-100">
                            {conv.other_display_name}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                          {conv.unread ? (
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400" />
                          ) : null}

                          {rowBooking?.status === 'rejected' ? (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadgeClass(rowBooking.status)}`}
                            >
                              {statusLabel(rowBooking.status)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {rowBooking?.game ? (
                        <div className="mt-2 text-[15px] font-semibold text-slate-200">
                          {rowBooking.game}
                        </div>
                      ) : null}

                      <div
                        className={`mt-2.5 pr-2 text-[13px] leading-6 [overflow-wrap:anywhere] ${
                          conv.unread ? 'font-semibold text-slate-200' : 'text-slate-400'
                        }`}
                      >
                        {previewText}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          <div className="min-w-0 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(6,11,26,0.98))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
            <div className="flex h-[752px] min-w-0 flex-col">
              <div className="mb-3 rounded-[22px] border border-white/10 bg-[#081121] px-5 py-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-slate-800 text-[20px] font-bold text-slate-200">
                      {getInitials(selectedConversation?.other_display_name)}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Conversation
                      </div>
                      <div className="mt-1 truncate text-[28px] font-bold leading-tight text-white">
                        {selectedConversation?.other_display_name || 'Select a conversation'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {selectedBooking ? (
                      <>
                        <div className="text-sm font-bold text-emerald-300">
                          {formatMoneyFromCents(getBookingPriceCents(selectedBooking))}
                        </div>
                        <div className="text-[12px] text-slate-400">
                          {selectedBooking.communication_method || '—'}
                        </div>
                        <div className="text-[12px] text-slate-400">
                          {selectedBooking.game || '—'}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                ref={scrollRef}
                className="gm-scrollbar min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[22px] border border-white/10 bg-[#081121] px-4 py-4"
              >
                {selectedMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-center">
                      <div className="text-sm font-semibold text-slate-300">No messages yet</div>
                      <div className="mt-1 text-sm text-slate-500">
                        Send the first message to get this conversation going.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedMessages.map((msg) => {
                      const mine = msg.sender_id === userId
                      const isSystem = msg.message_type === 'system'
                      const deliveryState = getMessageDeliveryState({
                        msg,
                        myUserId: userId,
                        otherUserId: otherParticipantId,
                        readsMap: selectedConversationReads,
                      })

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex items-center gap-3 py-1">
                            <div className="h-px flex-1 bg-white/10" />
                            <div className="flex max-w-[78%] items-center gap-2">
                              <div
                                className={`rounded-full border px-3 py-1.5 text-center text-[12px] font-medium leading-5 break-words [overflow-wrap:anywhere] opacity-90 ${systemMessageAccent(selectedBooking?.status)}`}
                              >
                                {formatSystemEventText(msg.message)}
                              </div>
                              <div className="shrink-0 text-[12px] text-slate-500">
                                {formatMessageTime(msg.created_at)}
                              </div>
                            </div>
                            <div className="h-px flex-1 bg-white/10" />
                          </div>
                        )
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex min-w-0 ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[76%] min-w-0 rounded-[20px] px-4 py-3.5 shadow-sm ${
                              mine ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                            }`}
                          >
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-6 [overflow-wrap:anywhere]">
                              {msg.message}
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-3">
                              <div
                                className={`text-[11px] ${
                                  mine ? 'text-indigo-100/75' : 'text-slate-400'
                                }`}
                              >
                                {formatMessageTime(msg.created_at)}
                              </div>

                              {mine ? (
                                <div className="flex items-center gap-1 text-[11px] font-medium opacity-95">
                                  <DeliveryTicks state={deliveryState} />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-[22px] border border-white/10 bg-[#081121] p-3">
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_LIMIT))}
                      onKeyDown={onKeyDown}
                      rows={3}
                      className="h-[70px] w-full resize-none rounded-[18px] border border-white/10 bg-slate-800 px-4 py-3 text-[15px] outline-none placeholder:text-slate-500"
                      placeholder="Write your message..."
                      maxLength={MESSAGE_LIMIT}
                      disabled={!selectedConversationId || sending}
                    />
                  </div>

                  <button
                    onClick={() => void sendMessage()}
                    disabled={sending || !selectedConversationId || !draft.trim()}
                    className="flex h-[70px] w-[88px] shrink-0 items-center justify-center rounded-[18px] bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? 'Sending' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}