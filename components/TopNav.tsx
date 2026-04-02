'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

type TopNavProps = {
  userEmail?: string
}

type InboxRow = {
  conversation_id: string
  other_user_id: string
  other_display_name: string
  last_message: string
  last_message_at: string | null
  unread: boolean
}

function formatLocalClock(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function NavLink({
  href,
  active,
  label,
  badgeCount,
}: {
  href: string
  active: boolean
  label: string
  badgeCount?: number
}) {
  return (
    <Link
      href={href}
      className={`relative rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
      }`}
    >
      <span>{label}</span>
      {!!badgeCount && badgeCount > 0 && (
        <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  )
}

export default function TopNav({ userEmail = '' }: TopNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)

  const [balanceDisplay, setBalanceDisplay] = useState<number>(0)
  const [displayName, setDisplayName] = useState<string>('')
  const [localTime, setLocalTime] = useState<string>(formatLocalClock(new Date()))
  const [profileReady, setProfileReady] = useState(false)

  const [sessionsBadge, setSessionsBadge] = useState<number>(0)
  const [chatBadge, setChatBadge] = useState<number>(0)
  const [supportBadge, setSupportBadge] = useState<number>(0)

  const mountedRef = useRef(true)
  const loadingRef = useRef(false)
  const bootingRef = useRef(false)
  const bootDoneRef = useRef(false)

  const audioArmedRef = useRef(false)
  const audioUnlockTriedRef = useRef(false)

  const prevChatBadgeRef = useRef(0)
  const prevSessionsBadgeRef = useRef(0)

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const lastChatSoundAtRef = useRef(0)
  const lastSessionSoundAtRef = useRef(0)

  const sessionAudioRef = useRef<HTMLAudioElement | null>(null)
  const chatAudioRef = useRef<HTMLAudioElement | null>(null)

  const unlockAudioElement = useCallback(async (audio: HTMLAudioElement | null) => {
    if (!audio) return false

    try {
      const originalMuted = audio.muted
      const originalVolume = audio.volume
      const originalCurrentTime = audio.currentTime

      audio.muted = true
      audio.volume = 0

      try {
        await audio.play()
      } catch {}

      audio.pause()
      audio.currentTime = originalCurrentTime
      audio.muted = originalMuted
      audio.volume = originalVolume

      return true
    } catch {
      return false
    }
  }, [])

  const armAudio = useCallback(async () => {
    if (audioArmedRef.current) return
    if (audioUnlockTriedRef.current) return

    audioUnlockTriedRef.current = true

    const [chatOk, sessionOk] = await Promise.all([
      unlockAudioElement(chatAudioRef.current),
      unlockAudioElement(sessionAudioRef.current),
    ])

    if (chatOk || sessionOk) {
      audioArmedRef.current = true
      try {
        window.localStorage.setItem('gm_audio_armed', '1')
      } catch {}
    }
  }, [unlockAudioElement])

  const playSafe = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio || !audioArmedRef.current) return

    try {
      audio.pause()
      audio.currentTime = 0
      void audio.play().catch(() => {})
    } catch {}
  }, [])

  const playChatNotify = useCallback(() => {
    const now = Date.now()
    if (now - lastChatSoundAtRef.current < 2500) return
    lastChatSoundAtRef.current = now
    playSafe(chatAudioRef.current)
  }, [playSafe])

  const playSessionNotify = useCallback(() => {
    const now = Date.now()
    if (now - lastSessionSoundAtRef.current < 2500) return
    lastSessionSoundAtRef.current = now
    playSafe(sessionAudioRef.current)
  }, [playSafe])

  const loadUnreadInboxCount = useCallback(async () => {
    const primary = await supabase.rpc('get_my_chat_inbox')

    if (!primary.error && Array.isArray(primary.data)) {
      const rows = primary.data as InboxRow[]
      return rows.filter((row) => row.unread).length
    }

    const fallback = await supabase.rpc('get_my_conversation_inbox')

    if (!fallback.error && Array.isArray(fallback.data)) {
      const rows = fallback.data as InboxRow[]
      return rows.filter((row) => row.unread).length
    }

    return 0
  }, [])

  const loadUserMeta = useCallback(async () => {
    if (!userId) {
      setBalanceDisplay(0)
      setDisplayName('')
      setProfileReady(true)
      setSessionsBadge(0)
      setChatBadge(0)
      setSupportBadge(0)
      return
    }

    if (loadingRef.current) return
    loadingRef.current = true

    try {
      const [
        profileResult,
        buyerPendingResult,
        sellerPendingResult,
        supportResult,
        unreadChatCount,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('booking_requests')
          .select('id')
          .eq('buyer_id', userId)
          .eq('status', 'awaiting_buyer_confirmation'),
        supabase
          .from('booking_requests')
          .select('id')
          .eq('seller_id', userId)
          .eq('status', 'pending'),
        supabase
          .from('support_tickets')
          .select('id')
          .or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
          .eq('status', 'open'),
        loadUnreadInboxCount(),
      ])

      if (!mountedRef.current) return

      const profile = profileResult.data

      const balanceCents = Number(profile?.balance_cents ?? 0)
      const fallbackBalance = Number(profile?.balance ?? profile?.balance_amount ?? 0)

      const normalizedBalance =
        Number.isFinite(balanceCents) && balanceCents !== 0
          ? balanceCents / 100
          : Number.isFinite(fallbackBalance)
          ? fallbackBalance
          : 0

      setBalanceDisplay(normalizedBalance)

      setDisplayName(
        profile?.display_name ||
          profile?.username ||
          userEmail ||
          ''
      )

      setProfileReady(true)

      const nextSessionsBadge =
        (buyerPendingResult.data?.length || 0) + (sellerPendingResult.data?.length || 0)

      const nextChatBadge = unreadChatCount
      const nextSupportBadge = supportResult.data?.length || 0

      if (nextSessionsBadge > prevSessionsBadgeRef.current && pathname !== '/sessions') {
        playSessionNotify()
      }

      if (nextChatBadge > prevChatBadgeRef.current && !pathname.startsWith('/chat')) {
        playChatNotify()
      }

      prevSessionsBadgeRef.current = nextSessionsBadge
      prevChatBadgeRef.current = nextChatBadge

      setSessionsBadge(nextSessionsBadge)
      setChatBadge(nextChatBadge)
      setSupportBadge(nextSupportBadge)
    } catch (error) {
      console.error('TopNav loadUserMeta error:', error)
    } finally {
      loadingRef.current = false
    }
  }, [userId, userEmail, pathname, loadUnreadInboxCount, playChatNotify, playSessionNotify])

  const bootAuth = useCallback(async () => {
    if (bootingRef.current) return
    if (bootDoneRef.current) return

    bootingRef.current = true

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mountedRef.current) return
      setUserId(session?.user?.id || null)
      bootDoneRef.current = true
    } catch (error) {
      console.error('TopNav bootAuth error:', error)
    } finally {
      bootingRef.current = false
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    try {
      if (window.localStorage.getItem('gm_audio_armed') === '1') {
        audioArmedRef.current = true
      }
    } catch {}

    void bootAuth()

    const onAnyInteraction = () => {
      void armAudio()
    }

    window.addEventListener('pointerdown', onAnyInteraction)
    window.addEventListener('keydown', onAnyInteraction)
    window.addEventListener('mousedown', onAnyInteraction)

    const clockTimer = window.setInterval(() => {
      setLocalTime(formatLocalClock(new Date()))
    }, 30000)

    return () => {
      mountedRef.current = false
      window.removeEventListener('pointerdown', onAnyInteraction)
      window.removeEventListener('keydown', onAnyInteraction)
      window.removeEventListener('mousedown', onAnyInteraction)
      window.clearInterval(clockTimer)
    }
  }, [armAudio, bootAuth])

  useEffect(() => {
    if (!userId) return
    void loadUserMeta()
  }, [loadUserMeta, userId])

  useEffect(() => {
    if (!userId) return

    const badgePollTimer = window.setInterval(() => {
      void loadUserMeta()
    }, 3000)

    return () => {
      window.clearInterval(badgePollTimer)
    }
  }, [loadUserMeta, userId])

  useEffect(() => {
    const handleFocus = () => {
      if (userId) {
        void loadUserMeta()
      }
    }

    const handleVisible = () => {
      if (document.visibilityState === 'visible' && userId) {
        void loadUserMeta()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [loadUserMeta, userId])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null
      setUserId((prev) => (prev === nextUserId ? prev : nextUserId))
      if (nextUserId) {
        bootDoneRef.current = true
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    if (realtimeChannelRef.current) {
      void supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    const channel = supabase
      .channel(`global-nav-events-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
        },
        async (payload: any) => {
          const msg = payload?.new

          if (!msg) return
          if (msg.sender_id === userId) return
          if (pathname.startsWith('/chat')) return

          const membership = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', userId)
            .maybeSingle()

          if (membership.error || !membership.data) return

          playChatNotify()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_requests',
        },
        (payload: any) => {
          const row = payload?.new
          if (!row) return
          if (pathname === '/sessions') return

          const isSellerPending =
            row.seller_id === userId && row.status === 'pending'

          if (isSellerPending) {
            playSessionNotify()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'booking_requests',
        },
        (payload: any) => {
          const row = payload?.new
          const oldRow = payload?.old
          if (!row) return
          if (pathname === '/sessions') return

          const becameBuyerActionNeeded =
            row.buyer_id === userId &&
            oldRow?.status !== 'awaiting_buyer_confirmation' &&
            row.status === 'awaiting_buyer_confirmation'

          if (becameBuyerActionNeeded) {
            playSessionNotify()
          }
        }
      )
      .subscribe()

    realtimeChannelRef.current = channel

    return () => {
      if (realtimeChannelRef.current) {
        void supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [userId, pathname, playChatNotify, playSessionNotify])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isSessionsActive = pathname === '/sessions'
  const isChatActive = pathname.startsWith('/chat')
  const isAvailabilityActive = pathname === '/availability'
  const isGuideActive = pathname === '/guide'
  const isRulesActive = pathname === '/rules'

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <audio ref={sessionAudioRef} preload="auto">
        <source src="/sounds/session.mp3" type="audio/mpeg" />
      </audio>

      <audio ref={chatAudioRef} preload="auto">
        <source src="/sounds/chat.mp3" type="audio/mpeg" />
      </audio>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-2">
          <Link href="/explore" className="text-2xl font-bold tracking-tight text-white">
            GameMate
          </Link>

          <div className="hidden gap-2 lg:flex">
            <NavLink href="/explore" active={pathname === '/explore'} label="Explore" />
            <NavLink href="/sessions" active={isSessionsActive} label="Sessions" badgeCount={sessionsBadge} />
            <NavLink href="/chat" active={isChatActive} label="Chat" badgeCount={chatBadge} />
            <NavLink href="/availability" active={isAvailabilityActive} label="Availability" />
            <NavLink href="/guide" active={isGuideActive} label="Guide" />
            <NavLink href="/rules" active={isRulesActive} label="Rules" />
            <NavLink href="/profile-edit" active={pathname === '/profile-edit'} label="Profile" />
            <NavLink href="/support" active={pathname === '/support'} label="Support" badgeCount={supportBadge} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 md:block">
            Local time: <span className="font-bold text-slate-100">{localTime}</span>
          </div>

          <button
            onClick={() => router.push('/balance')}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-slate-700"
            title="Open balance"
          >
            ₺{balanceDisplay.toFixed(2)}
          </button>

          <div className="w-[180px] rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">
            <span className="block truncate">
              {profileReady ? displayName || 'Account' : 'Loading...'}
            </span>
          </div>

          <button
            onClick={logout}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl gap-2 px-6 pb-4 lg:hidden">
        <NavLink href="/explore" active={pathname === '/explore'} label="Explore" />
        <NavLink href="/sessions" active={isSessionsActive} label="Sessions" badgeCount={sessionsBadge} />
        <NavLink href="/chat" active={isChatActive} label="Chat" badgeCount={chatBadge} />
        <NavLink href="/availability" active={isAvailabilityActive} label="Availability" />
        <NavLink href="/guide" active={isGuideActive} label="Guide" />
        <NavLink href="/rules" active={isRulesActive} label="Rules" />
        <NavLink href="/profile-edit" active={pathname === '/profile-edit'} label="Profile" />
        <NavLink href="/support" active={pathname === '/support'} label="Support" badgeCount={supportBadge} />
      </div>
    </header>
  )
}