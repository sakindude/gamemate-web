'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type InboxRow = {
  conversation_id: string
  other_user_id: string
  other_display_name: string
  last_message: string
  last_message_at: string | null
  unread: boolean
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

const MESSAGE_LIMIT = 1200
const MESSAGE_POLL_VISIBLE_MS = 1000
const MESSAGE_POLL_HIDDEN_MS = 3000
const INBOX_POLL_VISIBLE_MS = 3000
const INBOX_POLL_HIDDEN_MS = 6000
const BOOKING_POLL_VISIBLE_MS = 1500
const BOOKING_POLL_HIDDEN_MS = 4000
const READ_SYNC_THROTTLE_MS = 1200

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
  return `₺${(Number(value || 0) / 100).toFixed(2)}`
}

function statusBadgeClass(status: string | null | undefined) {
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

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'accepted':
      return 'Accepted'
    case 'rejected':
      return 'Rejected'
    case 'awaiting_buyer_confirmation':
      return 'Awaiting Buyer Confirmation'
    case 'completed':
      return 'Completed'
    default:
      return status || 'Unknown'
  }
}

function extractBookingIdFromMessages(messages: MessageRow[]) {
  for (const msg of messages) {
    if (msg.message_type !== 'system') continue

    const bookingId =
      (msg.metadata as Record<string, unknown> | null)?.booking_id

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

  const seen =
    new Date(otherReadAt).getTime() >= new Date(msg.created_at).getTime()

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

export default function ChatPage() {
  const router = useRouter()

  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
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
  const readsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const userIdRef = useRef('')
  const selectedConversationIdRef = useRef('')
  const initialScrolledRef = useRef(false)
  const audioArmedRef = useRef(false)
  const visibilityRef = useRef<'visible' | 'hidden'>('visible')
  const lastReadSyncAtRef = useRef<Record<string, number>>({})

  useLayoutEffect(() => {
    document.title = 'Chat | GameMate'
  }, [])

  useEffect(() => {
    document.title = 'Chat | GameMate'

    const titleTimer = window.setTimeout(() => {
      document.title = 'Chat | GameMate'
    }, 50)

    return () => {
      window.clearTimeout(titleTimer)
    }
  }, [])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    const handleVisibility = () => {
      visibilityRef.current =
        document.visibilityState === 'visible' ? 'visible' : 'hidden'
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
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      })
      return
    }

    el.scrollTop = el.scrollHeight
  }, [])

  const updateUrlConversation = useCallback((conversationId: string) => {
    if (typeof window === 'undefined') return
    const url = conversationId ? `/chat?id=${conversationId}` : '/chat'
    window.history.replaceState({}, '', url)
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

  const markAsRead = useCallback(async (conversationId: string) => {
    if (!conversationId || !userIdRef.current) return

    const now = new Date().toISOString()

    const { error } = await supabase.from('conversation_reads').upsert({
      conversation_id: conversationId,
      user_id: userIdRef.current,
      last_read_at: now,
    })

    if (error) {
      console.error('markAsRead error:', error)
    }

    await refreshConversationReads(conversationId)
  }, [refreshConversationReads])

  const refreshInbox = useCallback(async () => {
    const primary = await supabase.rpc('get_my_chat_inbox')

    if (!primary.error && Array.isArray(primary.data)) {
      const rows = (primary.data as InboxRow[]).sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return tb - ta
      })
      setInbox(rows)
      return rows
    }

    const fallback = await supabase.rpc('get_my_conversation_inbox')

    if (fallback.error) {
      console.error('get_my_conversation_inbox error:', fallback.error)
      setErrorText(fallback.error.message || 'Failed to load inbox.')
      return [] as InboxRow[]
    }

    const rows = ((fallback.data || []) as InboxRow[]).sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return tb - ta
    })

    setInbox(rows)
    return rows
  }, [])

  const refreshBookingPanel = useCallback(async (conversationId: string, knownMessages?: MessageRow[]) => {
    if (!conversationId) return

    const messages = knownMessages || messagesByConversation[conversationId] || []
    const bookingIdFromMessages = extractBookingIdFromMessages(messages)

    if (!bookingIdFromMessages) {
      const rpcResult = await supabase.rpc('get_booking_for_conversation', {
        p_conversation_id: conversationId,
      })

      if (rpcResult.error) {
        console.error('get_booking_for_conversation error:', rpcResult.error)
        setBookingByConversation((prev) => ({
          ...prev,
          [conversationId]: null,
        }))
        return
      }

      const row = ((rpcResult.data || [])[0] as BookingPanelRow | undefined) || null

      setBookingByConversation((prev) => ({
        ...prev,
        [conversationId]: row,
      }))
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
      setBookingByConversation((prev) => ({
        ...prev,
        [conversationId]: null,
      }))
      return
    }

    setBookingByConversation((prev) => ({
      ...prev,
      [conversationId]: (data as BookingPanelRow | null) || null,
    }))
  }, [messagesByConversation])

  const refreshConversationMessages = useCallback(
    async (
      conversationId: string,
      options?: {
        playSoundOnIncoming?: boolean
      }
    ) => {
      const wasNearBottom =
        conversationId === selectedConversationIdRef.current ? isNearBottom() : false

      const { data, error } = await supabase.rpc('get_conversation_messages', {
        p_conversation_id: conversationId,
      })

      if (error) {
        console.error('get_conversation_messages error:', error)
        setErrorText(error.message || 'Failed to load messages.')
        return { hadNewIncoming: false, messageCount: 0 }
      }

      const newData = (data || []) as MessageRow[]
      let hadNewIncoming = false

      setMessagesByConversation((prev) => {
        const prevMsgs = prev[conversationId] || []

        if (prevMsgs.length > 0 && newData.length > prevMsgs.length) {
          const prevIds = new Set(prevMsgs.map((m) => m.id))
          const incomingNew = newData.find(
            (m) =>
              !prevIds.has(m.id) &&
              !!m.sender_id &&
              m.sender_id !== userIdRef.current
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

      await Promise.all([
        refreshBookingPanel(conversationId, newData),
        refreshConversationReads(conversationId),
      ])

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

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErrorText('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)
    userIdRef.current = session.user.id
    setUserEmail(session.user.email || '')

    const inboxRows = await refreshInbox()

    if (inboxRows.length > 0) {
      const grouped: Record<string, MessageRow[]> = {}
      const bookingMap: Record<string, BookingPanelRow | null> = {}
      const readsMap: Record<string, Record<string, string>> = {}

      for (const row of inboxRows) {
        const { data, error } = await supabase.rpc('get_conversation_messages', {
          p_conversation_id: row.conversation_id,
        })

        if (error) {
          console.error('initial get_conversation_messages error:', error)
          setErrorText(error.message || 'Failed to load messages.')
          continue
        }

        const messages = (data || []) as MessageRow[]
        grouped[row.conversation_id] = messages

        const bookingRpc = await supabase.rpc('get_booking_for_conversation', {
          p_conversation_id: row.conversation_id,
        })

        if (bookingRpc.error) {
          console.error('initial get_booking_for_conversation error:', bookingRpc.error)
          bookingMap[row.conversation_id] = null
        } else {
          bookingMap[row.conversation_id] =
            ((bookingRpc.data || [])[0] as BookingPanelRow | undefined) || null
        }

        const readsResult = await supabase.rpc('get_conversation_read_states', {
          p_conversation_id: row.conversation_id,
        })

        if (readsResult.error) {
          console.error('initial conversation_reads rpc error:', readsResult.error)
          readsMap[row.conversation_id] = {}
        } else {
          const nextConversationReadMap: Record<string, string> = {}
          ;((readsResult.data || []) as ConversationReadRow[]).forEach((readRow) => {
            nextConversationReadMap[readRow.user_id] = readRow.last_read_at
          })
          readsMap[row.conversation_id] = nextConversationReadMap
        }
      }

      setMessagesByConversation(grouped)
      setBookingByConversation(bookingMap)
      setConversationReadsByConversation(readsMap)
    } else {
      setMessagesByConversation({})
      setBookingByConversation({})
      setConversationReadsByConversation({})
    }

    let preferredId = ''
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      preferredId = params.get('id') || ''
    }

    const validPreferred =
      preferredId && inboxRows.some((r) => r.conversation_id === preferredId) ? preferredId : ''

    const nextSelected =
      validPreferred ||
      selectedConversationIdRef.current ||
      inboxRows[0]?.conversation_id ||
      ''

    if (nextSelected) {
      setSelectedConversationId(nextSelected)
      updateUrlConversation(nextSelected)
    }

    setLoading(false)
  }, [refreshInbox, router, updateUrlConversation])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

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
    await refreshInbox()
  }, [conversationReadsByConversation, inbox, markAsRead, messagesByConversation, refreshInbox])

  useEffect(() => {
    if (!selectedConversationId || !userId) return

    const run = async () => {
      await markAsRead(selectedConversationId)
      await refreshInbox()
    }

    void run()
  }, [markAsRead, refreshInbox, selectedConversationId, userId])

  useEffect(() => {
    if (!selectedConversationId || !userId) return
    void syncReadStateIfNeeded()
  }, [
    selectedConversationId,
    userId,
    selectedMessages,
    selectedConversationReads,
    inbox,
    syncReadStateIfNeeded,
  ])

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
      if (document.visibilityState === 'visible') {
        visibilityRef.current = 'visible'
        await syncReadStateIfNeeded()
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [syncReadStateIfNeeded])

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === selectedConversationIdRef.current) return

      initialScrolledRef.current = false
      setSelectedConversationId(conversationId)
      updateUrlConversation(conversationId)
      setDraft('')
      setErrorText('')

      await refreshConversationMessages(conversationId)
      await markAsRead(conversationId)
      await refreshInbox()
    },
    [markAsRead, refreshConversationMessages, refreshInbox, updateUrlConversation]
  )

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`conversations-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
        },
        async (payload: { new: MessageRow }) => {
          const incoming = payload.new
          const wasNearBottom =
            incoming.conversation_id === selectedConversationIdRef.current ? isNearBottom() : false

          setMessagesByConversation((prev) => {
            const existing = prev[incoming.conversation_id] || []
            if (existing.some((m) => m.id === incoming.id)) return prev

            if (
              incoming.sender_id &&
              incoming.sender_id !== userIdRef.current &&
              incoming.conversation_id === selectedConversationIdRef.current
            ) {
              playChatSound()
            }

            return {
              ...prev,
              [incoming.conversation_id]: [...existing, incoming],
            }
          })

          await Promise.all([
            refreshBookingPanel(incoming.conversation_id),
            refreshConversationReads(incoming.conversation_id),
          ])

          if (incoming.conversation_id === selectedConversationIdRef.current) {
            await markAsRead(incoming.conversation_id)

            if (wasNearBottom) {
              requestAnimationFrame(() => {
                scrollToBottom('smooth')
              })
            }
          }

          await refreshInbox()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isNearBottom, markAsRead, playChatSound, refreshBookingPanel, refreshConversationReads, refreshInbox, scrollToBottom, userId])

  useEffect(() => {
    if (readsChannelRef.current) {
      void supabase.removeChannel(readsChannelRef.current)
      readsChannelRef.current = null
    }

    if (!userId || !selectedConversationId) return

    const channel = supabase
      .channel(`conversation-reads-${selectedConversationId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_reads',
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        async () => {
          await refreshConversationReads(selectedConversationId)
          await refreshInbox()
        }
      )
      .subscribe()

    readsChannelRef.current = channel

    return () => {
      if (readsChannelRef.current) {
        void supabase.removeChannel(readsChannelRef.current)
        readsChannelRef.current = null
      }
    }
  }, [refreshConversationReads, refreshInbox, selectedConversationId, userId])

  useEffect(() => {
    if (!userId || !selectedConversationId) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      const conversationId = selectedConversationIdRef.current
      if (!conversationId || cancelled) return

      const result = await refreshConversationMessages(conversationId, {
        playSoundOnIncoming: true,
      })

      if (result?.hadNewIncoming) {
        await markAsRead(conversationId)
        await refreshInbox()
      } else {
        await syncReadStateIfNeeded()
      }

      if (cancelled) return

      const nextDelay =
        visibilityRef.current === 'visible'
          ? MESSAGE_POLL_VISIBLE_MS
          : MESSAGE_POLL_HIDDEN_MS

      timeoutId = setTimeout(tick, nextDelay)
    }

    const initialDelay =
      visibilityRef.current === 'visible'
        ? MESSAGE_POLL_VISIBLE_MS
        : MESSAGE_POLL_HIDDEN_MS

    timeoutId = setTimeout(tick, initialDelay)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [markAsRead, refreshConversationMessages, refreshInbox, selectedConversationId, syncReadStateIfNeeded, userId])

  useEffect(() => {
    if (!userId) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      if (cancelled) return

      await refreshInbox()

      if (cancelled) return

      const nextDelay =
        visibilityRef.current === 'visible'
          ? INBOX_POLL_VISIBLE_MS
          : INBOX_POLL_HIDDEN_MS

      timeoutId = setTimeout(tick, nextDelay)
    }

    const initialDelay =
      visibilityRef.current === 'visible'
        ? INBOX_POLL_VISIBLE_MS
        : INBOX_POLL_HIDDEN_MS

    timeoutId = setTimeout(tick, initialDelay)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [refreshInbox, userId])

  useEffect(() => {
    if (!selectedConversationId) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      const conversationId = selectedConversationIdRef.current
      if (!conversationId || cancelled) return

      await Promise.all([
        refreshBookingPanel(conversationId),
        refreshConversationReads(conversationId),
      ])

      if (cancelled) return

      const nextDelay =
        visibilityRef.current === 'visible'
          ? BOOKING_POLL_VISIBLE_MS
          : BOOKING_POLL_HIDDEN_MS

      timeoutId = setTimeout(tick, nextDelay)
    }

    const initialDelay =
      visibilityRef.current === 'visible'
        ? BOOKING_POLL_VISIBLE_MS
        : BOOKING_POLL_HIDDEN_MS

    timeoutId = setTimeout(tick, initialDelay)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [refreshBookingPanel, refreshConversationReads, selectedConversationId])

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

    await Promise.all([
      refreshConversationMessages(selectedConversationId),
      markAsRead(selectedConversationId),
      refreshInbox(),
    ])
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending) {
        void sendMessage()
      }
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav userEmail={userEmail} />
        <section className="mx-auto max-w-7xl px-6 py-8">
          <p className="text-slate-400">Loading chat...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />
      <audio ref={chatAudioRef} src="/sounds/chat.mp3" preload="auto" />

      <section className="mx-auto max-w-7xl px-6 py-8">
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

        {errorText && (
          <div className="mb-4 rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-300">
            {errorText}
          </div>
        )}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 text-xl font-bold">Conversations</div>

            <div className="gm-scrollbar h-[720px] overflow-y-auto overflow-x-hidden pr-1">
              <div className="space-y-3">
                {inbox.length === 0 && (
                  <p className="text-sm text-slate-500">No conversations yet.</p>
                )}

                {inbox.map((conv) => (
                  <button
                    key={conv.conversation_id}
                    onClick={() => void handleSelectConversation(conv.conversation_id)}
                    className={`w-full min-w-0 rounded-2xl border p-4 text-left transition ${
                      conv.conversation_id === selectedConversationId
                        ? 'border-indigo-500 bg-slate-800'
                        : 'border-slate-800 bg-slate-950 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-100">
                          {conv.other_display_name}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {conv.unread && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            New
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          {formatMessageTime(conv.last_message_at || new Date().toISOString())}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 truncate text-xs text-slate-500">
                      {conv.last_message}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex h-[720px] min-w-0 flex-col">
              <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="truncate text-2xl font-bold">
                  {selectedConversation?.other_display_name || 'Select a conversation'}
                </div>
              </div>

              {selectedBooking && (
                <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="text-sm uppercase tracking-wide text-slate-400">Booking</div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(selectedBooking.status)}`}>
                      {statusLabel(selectedBooking.status)}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Game</div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {selectedBooking.game || '—'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Communication</div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {selectedBooking.communication_method || '—'}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Customer Total</div>
                      <div className="mt-1 text-sm font-semibold text-emerald-400">
                        {formatMoneyFromCents(selectedBooking.total_amount_cents)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
                ref={scrollRef}
                className="gm-scrollbar min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                {selectedMessages.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No messages yet. Start the conversation.
                  </p>
                )}

                <div className="space-y-4">
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
                          <div className="h-px flex-1 bg-slate-800" />
                          <div className="max-w-[70%] rounded-full border border-slate-700 bg-slate-800/80 px-4 py-2 text-center text-xs font-medium text-slate-300 break-words [overflow-wrap:anywhere]">
                            {msg.message}
                          </div>
                          <div className="h-px flex-1 bg-slate-800" />
                        </div>
                      )
                    }

                    return (
                      <div key={msg.id} className={`flex min-w-0 ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] min-w-0 rounded-2xl px-4 py-3 shadow-sm ${
                            mine ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words text-[15px] leading-6 [overflow-wrap:anywhere]">
                            {msg.message}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-[11px] opacity-75">
                              {formatMessageTime(msg.created_at)}
                            </div>

                            {mine && (
                              <div className="flex items-center gap-1 text-[11px] font-medium opacity-95">
                                <DeliveryTicks state={deliveryState} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_LIMIT))}
                      onKeyDown={onKeyDown}
                      rows={4}
                      className="h-24 w-full resize-none rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                      placeholder="Write your message..."
                      maxLength={MESSAGE_LIMIT}
                    />
                  </div>

                  <button
                    onClick={() => void sendMessage()}
                    disabled={sending || !selectedConversationId || !draft.trim()}
                    className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {sending ? '...' : 'Send'}
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