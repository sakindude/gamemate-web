// START_FILE: components/AppSidebar.tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'
import { HordeNavItem } from '@/components/sidebar/HordeNav'
import { HordeProfileCard } from '@/components/sidebar/HordeProfileCard'

type ProfileRow = {
  id: string
  display_name?: string | null
  username?: string | null
  is_seller?: boolean | null
  is_online?: boolean | null
  balance_cents?: number | null
  balance?: number | null
}

type InboxRow = {
  conversation_id: string
  other_user_id: string
  other_display_name: string
  last_message: string
  last_message_at: string | null
  unread: boolean
}

type NavItem = {
  label: string
  href?: string
  active?: boolean
  disabled?: boolean
  badgeCount?: number
  icon: 'explore' | 'sessions' | 'chat' | 'guide' | 'support' | 'rules'
}

type AvatarPreset = {
  id: string
  label: string
  imageUrl: string
}

type CountRequestResult = {
  count: number | null
  error: {
    message?: string
  } | null
}

type BadgeLoadOptions = {
  force?: boolean
  includeChat?: boolean
}

const LOCAL_AVATAR_KEY = 'gm_mock_sidebar_avatar_v2'
const BADGE_REFRESH_MS = 180_000
const FOCUS_REFRESH_THROTTLE_MS = 45_000
const CHAT_BADGE_INITIAL_DELAY_MS = 8000

const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'arcane-knight',
    label: 'Arcane Knight',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=ArcaneKnight&backgroundType=gradientLinear&backgroundColor=1e293b,312e81,0f172a&radius=24&scale=95',
  },
  {
    id: 'forest-fairy',
    label: 'Forest Fairy',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer/svg?seed=ForestFairy&backgroundType=gradientLinear&backgroundColor=064e3b,14532d,0f172a&radius=24&scale=95',
  },
  {
    id: 'shadow-rogue',
    label: 'Shadow Rogue',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=ShadowRogue&backgroundType=gradientLinear&backgroundColor=111827,1f2937,0f172a&radius=24&scale=95',
  },
  {
    id: 'royal-mage',
    label: 'Royal Mage',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer/svg?seed=RoyalMage&backgroundType=gradientLinear&backgroundColor=4c1d95,312e81,0f172a&radius=24&scale=95',
  },
  {
    id: 'ember-huntress',
    label: 'Ember Huntress',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer/svg?seed=EmberHuntress&backgroundType=gradientLinear&backgroundColor=7c2d12,9a3412,0f172a&radius=24&scale=95',
  },
  {
    id: 'moon-priestess',
    label: 'Moon Priestess',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer/svg?seed=MoonPriestess&backgroundType=gradientLinear&backgroundColor=0f172a,1e3a8a,334155&radius=24&scale=95',
  },
  {
    id: 'iron-guardian',
    label: 'Iron Guardian',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=IronGuardian&backgroundType=gradientLinear&backgroundColor=1f2937,334155,0f172a&radius=24&scale=95',
  },
  {
    id: 'violet-ranger',
    label: 'Violet Ranger',
    imageUrl:
      'https://api.dicebear.com/9.x/adventurer/svg?seed=VioletRanger&backgroundType=gradientLinear&backgroundColor=581c87,7e22ce,0f172a&radius=24&scale=95',
  },
]

function formatLocalClock(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatMoney(value: number | null | undefined) {
  const safe = Number(value || 0)
  const hasFraction = Math.abs(safe % 1) > 0.000001

  const formatted = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe)

  return `$${formatted}`
}

function SignalGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[14px] w-[14px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2.2" />
      <path d="M5.8 12a6.2 6.2 0 0 1 12.4 0" />
      <path d="M3 12a9 9 0 0 1 18 0" />
    </svg>
  )
}

function EditGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[14px] w-[14px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
    </svg>
  )
}

function LogoutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[14px] w-[14px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function CompactLocalTimeCard({ time }: { time: string }) {
  return (
    <div className="mx-auto flex w-[126px] flex-col items-center text-center">
      <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#9f7b74]">
        LOCAL TIME
      </div>
      <div className="mt-1 text-[30px] font-bold leading-none tracking-[-0.03em] text-[#f7e2d8]">
        {time}
      </div>
    </div>
  )
}

function SidebarUtilityRow({
  label,
  onClick,
  icon,
  accent = false,
}: {
  label: string
  onClick: () => void
  icon: 'online' | 'edit' | 'logout'
  accent?: boolean
}) {
  const iconNode =
    icon === 'online' ? <SignalGlyph /> : icon === 'edit' ? <EditGlyph /> : <LogoutGlyph />

  return (
    <button
      type="button"
      onClick={onClick}
      className="group mx-auto flex w-[176px] cursor-pointer items-center justify-center gap-2.5 px-1 py-[6px] text-center"
    >
      <span
        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center ${
          accent ? 'text-[#75d8a1]' : 'text-[#ddb3a4]'
        } transition-colors group-hover:text-[#fff1e8]`}
      >
        {iconNode}
      </span>

      <span
        className={`text-[14px] font-medium leading-none ${
          accent ? 'text-[#e9fff0]' : 'text-[#f0d6cc]'
        } transition-colors group-hover:text-[#fff1e8]`}
      >
        {label}
      </span>
    </button>
  )
}

async function getExactCount(label: string, request: PromiseLike<CountRequestResult>) {
  try {
    const { count, error } = await Promise.resolve(request)

    if (error) {
      console.error(`AppSidebar ${label} count error:`, error.message || error)
      return 0
    }

    return Number(count || 0)
  } catch (error) {
    console.error(`AppSidebar ${label} count threw:`, error)
    return 0
  }
}

export default function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const userId = user?.id ?? null
  const isChatRoute = pathname.startsWith('/chat')

  const [profileReady, setProfileReady] = useState(false)
  const [displayName, setDisplayName] = useState('Account')
  const [balanceDisplay, setBalanceDisplay] = useState(0)
  const [localTime, setLocalTime] = useState(formatLocalClock(new Date()))
  const [isSeller, setIsSeller] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [onlineBusy, setOnlineBusy] = useState(false)

  const [sessionsBadge, setSessionsBadge] = useState(0)
  const [chatBadge, setChatBadge] = useState(0)
  const [supportBadge, setSupportBadge] = useState(0)

  const [selectedAvatarId, setSelectedAvatarId] = useState(AVATAR_PRESETS[0].id)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)

  const mountedRef = useRef(true)
  const profileLoadingRef = useRef(false)
  const badgeLoadingRef = useRef(false)
  const lastBadgeLoadAtRef = useRef(0)
  const lastChatBadgeLoadAtRef = useRef(0)
  const avatarPickerRef = useRef<HTMLDivElement | null>(null)

  const selectedAvatar =
    AVATAR_PRESETS.find((avatar) => avatar.id === selectedAvatarId) ?? AVATAR_PRESETS[0]

  const loadUnreadInboxCount = useCallback(async () => {
    if (isChatRoute) return chatBadge

    try {
      const primary = await supabase.rpc('get_my_conversation_inbox')

      if (!primary.error && Array.isArray(primary.data)) {
        const rows = primary.data as InboxRow[]
        lastChatBadgeLoadAtRef.current = Date.now()
        return rows.filter((row) => row.unread).length
      }

      if (primary.error) {
        console.error('AppSidebar get_my_conversation_inbox error:', primary.error)
      }

      return chatBadge
    } catch (error) {
      console.error('AppSidebar loadUnreadInboxCount threw:', error)
      return chatBadge
    }
  }, [chatBadge, isChatRoute])

  const resetSidebarState = useCallback(() => {
    setProfileReady(true)
    setDisplayName('Account')
    setBalanceDisplay(0)
    setIsSeller(false)
    setIsOnline(false)
    setSessionsBadge(0)
    setChatBadge(0)
    setSupportBadge(0)
    lastBadgeLoadAtRef.current = 0
    lastChatBadgeLoadAtRef.current = 0
  }, [])

  const loadProfile = useCallback(async () => {
    if (!userId) {
      resetSidebarState()
      return
    }

    if (profileLoadingRef.current) return
    profileLoadingRef.current = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, is_seller, is_online, balance_cents, balance')
        .eq('id', userId)
        .maybeSingle()

      if (!mountedRef.current) return

      if (error) {
        console.error('AppSidebar loadProfile error:', error)
        setProfileReady(true)
        return
      }

      const profile = data as ProfileRow | null

      const balanceCents = Number(profile?.balance_cents ?? 0)
      const fallbackBalance = Number(profile?.balance ?? 0)

      const normalizedBalance =
        Number.isFinite(balanceCents) && balanceCents !== 0
          ? balanceCents / 100
          : Number.isFinite(fallbackBalance)
            ? fallbackBalance
            : 0

      setBalanceDisplay(normalizedBalance)
      setDisplayName(profile?.display_name || profile?.username || 'Account')
      setIsSeller(!!profile?.is_seller)
      setIsOnline(!!profile?.is_online)
      setProfileReady(true)
    } catch (error) {
      console.error('AppSidebar loadProfile threw:', error)
      if (!mountedRef.current) return
      setProfileReady(true)
    } finally {
      profileLoadingRef.current = false
    }
  }, [resetSidebarState, userId])

  const loadBadges = useCallback(
    async (options?: BadgeLoadOptions) => {
      if (!userId) {
        setSessionsBadge(0)
        setChatBadge(0)
        setSupportBadge(0)
        return
      }

      const force = options?.force === true
      const includeChat = options?.includeChat === true
      const now = Date.now()

      if (!force && now - lastBadgeLoadAtRef.current < BADGE_REFRESH_MS) {
        return
      }

      if (badgeLoadingRef.current) return
      badgeLoadingRef.current = true

      try {
        const [buyerAwaitingCount, sellerPendingCount, supportOpenCount] = await Promise.all([
          getExactCount(
            'buyer awaiting confirmation',
            supabase
              .from('booking_requests')
              .select('id', { count: 'exact', head: true })
              .eq('buyer_id', userId)
              .eq('status', 'awaiting_buyer_confirmation')
          ),
          getExactCount(
            'seller pending',
            supabase
              .from('booking_requests')
              .select('id', { count: 'exact', head: true })
              .eq('seller_id', userId)
              .eq('status', 'pending')
          ),
          getExactCount(
            'support open',
            supabase
              .from('support_tickets')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('status', 'open')
          ),
        ])

        let unreadChatCount = chatBadge

        const chatBadgeAllowed =
          includeChat &&
          !isChatRoute &&
          now - lastChatBadgeLoadAtRef.current >= BADGE_REFRESH_MS

        if (chatBadgeAllowed) {
          unreadChatCount = await loadUnreadInboxCount()
        }

        if (!mountedRef.current) return

        setSessionsBadge(buyerAwaitingCount + sellerPendingCount)
        setSupportBadge(supportOpenCount)

        if (chatBadgeAllowed) {
          setChatBadge(unreadChatCount)
        }

        lastBadgeLoadAtRef.current = Date.now()
      } catch (error) {
        console.error('AppSidebar loadBadges threw:', error)
      } finally {
        badgeLoadingRef.current = false
      }
    },
    [chatBadge, isChatRoute, loadUnreadInboxCount, userId]
  )

  useEffect(() => {
    mountedRef.current = true

    const clockTimer = window.setInterval(() => {
      setLocalTime(formatLocalClock(new Date()))
    }, 30_000)

    return () => {
      mountedRef.current = false
      window.clearInterval(clockTimer)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedAvatarId = window.localStorage.getItem(LOCAL_AVATAR_KEY)
    if (savedAvatarId && AVATAR_PRESETS.some((avatar) => avatar.id === savedAvatarId)) {
      setSelectedAvatarId(savedAvatarId)
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!avatarPickerOpen) return
      if (!avatarPickerRef.current) return
      if (avatarPickerRef.current.contains(event.target as Node)) return
      setAvatarPickerOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [avatarPickerOpen])

  useEffect(() => {
    if (authLoading) {
      setProfileReady(false)
      return
    }

    if (!userId) {
      resetSidebarState()
      return
    }

    void loadProfile()
    void loadBadges({ force: true, includeChat: false })
  }, [authLoading, loadBadges, loadProfile, resetSidebarState, userId])

  useEffect(() => {
    if (!userId || isChatRoute) return

    const timeoutId = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      void loadBadges({ force: false, includeChat: true })
    }, CHAT_BADGE_INITIAL_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isChatRoute, loadBadges, userId])

  useEffect(() => {
    if (!userId) return

    const badgePollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadBadges({ force: false, includeChat: !isChatRoute })
    }, BADGE_REFRESH_MS)

    return () => {
      window.clearInterval(badgePollTimer)
    }
  }, [isChatRoute, loadBadges, userId])

  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (!userId) return
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastBadgeLoadAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return

      void loadBadges({ force: false, includeChat: !isChatRoute })
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [isChatRoute, loadBadges, userId])

  const toggleOnline = async () => {
    if (!userId || !isSeller || onlineBusy) return

    const nextValue = !isOnline
    const previousValue = isOnline

    setOnlineBusy(true)
    setIsOnline(nextValue)

    const { error } = await supabase.from('profiles').update({ is_online: nextValue }).eq('id', userId)

    if (error) {
      console.error('AppSidebar toggleOnline error:', error)
      setIsOnline(previousValue)
    }

    setOnlineBusy(false)
  }

  const logout = async () => {
    if (userId && isSeller && isOnline) {
      try {
        await supabase.from('profiles').update({ is_online: false }).eq('id', userId)
      } catch (error) {
        console.error('AppSidebar logout offline update error:', error)
      }
    }

    await supabase.auth.signOut()
    resetSidebarState()
    router.push('/login')
  }

  const handleAvatarSelect = (avatarId: string) => {
    setSelectedAvatarId(avatarId)
    setAvatarPickerOpen(false)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_AVATAR_KEY, avatarId)
    }
  }

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        label: 'Explore',
        href: '/explore',
        active: pathname.startsWith('/explore'),
        icon: 'explore',
      },
      {
        label: 'Sessions',
        href: '/sessions',
        active: pathname.startsWith('/sessions'),
        badgeCount: sessionsBadge,
        icon: 'sessions',
      },
      {
        label: 'Chat',
        href: '/chat',
        active: pathname.startsWith('/chat'),
        badgeCount: chatBadge,
        icon: 'chat',
      },
      {
        label: 'Guide',
        href: '/guide',
        active: pathname.startsWith('/guide'),
        icon: 'guide',
      },
      {
        label: 'Rules',
        href: '/rules',
        active: pathname.startsWith('/rules'),
        icon: 'rules',
      },
      {
        label: 'Support',
        href: '/support',
        active: pathname.startsWith('/support'),
        badgeCount: supportBadge,
        icon: 'support',
      },
    ],
    [chatBadge, pathname, sessionsBadge, supportBadge]
  )

  const profileHref = '/profile-edit'

  return (
    <aside className="relative h-[100dvh] w-[248px] shrink-0 overflow-hidden bg-[#090304]">
      <img
        src="/sidebar-textures/sidebar-bg.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute left-0 top-0 h-[952px] w-[248px] select-none opacity-[0.52]"
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,3,4,0.12)_0%,rgba(8,3,4,0.20)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,90,60,0.04),transparent_34%)]" />

      <div className="relative z-10 flex h-full min-w-0 flex-col overflow-hidden overflow-x-hidden">
        <div className="px-4 pb-0 pt-[46px]">
          <CompactLocalTimeCard time={localTime} />
        </div>

        <div className="px-4 pt-5">
          <div ref={avatarPickerRef} className="relative">
            <HordeProfileCard
              avatarUrl={selectedAvatar.imageUrl}
              avatarLabel={selectedAvatar.label}
              balanceText={formatMoney(balanceDisplay)}
              displayName={profileReady ? displayName : 'Loading...'}
              onAvatarClick={() => setAvatarPickerOpen((prev) => !prev)}
              onWalletClick={() => router.push('/balance')}
              primaryButton={
                isSeller ? (
                  <SidebarUtilityRow
                    label={onlineBusy ? 'Saving...' : isOnline ? 'Online' : 'Offline'}
                    onClick={() => void toggleOnline()}
                    icon="online"
                    accent={isOnline}
                  />
                ) : null
              }
              secondaryButton={
                <>
                  <SidebarUtilityRow
                    label="Edit Profile"
                    onClick={() => router.push(profileHref)}
                    icon="edit"
                  />
                  <SidebarUtilityRow label="Logout" onClick={() => void logout()} icon="logout" />
                </>
              }
            />

            {avatarPickerOpen ? (
              <div className="absolute left-1/2 top-[158px] z-50 w-[214px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-2xl border border-[#4a1e19] bg-[linear-gradient(180deg,#231013_0%,#17090c_100%)] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
                <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#a17d74]">
                  Choose avatar
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {AVATAR_PRESETS.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => handleAvatarSelect(avatar.id)}
                      className={`min-w-0 overflow-hidden rounded-2xl border transition ${
                        selectedAvatarId === avatar.id
                          ? 'border-[#d46646]/70 bg-white/10 ring-1 ring-[#d46646]/35'
                          : 'border-[#4a1e19] bg-white/5 hover:bg-white/10'
                      }`}
                      title={avatar.label}
                    >
                      <div className="aspect-square w-full overflow-hidden bg-slate-900">
                        <img
                          src={avatar.imageUrl}
                          alt={avatar.label}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <div className="truncate px-2 py-2 text-center text-[11px] font-semibold text-[#edd7cf]">
                        {avatar.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 px-4 pb-8 pt-7">
          <div className="mx-auto max-w-[188px]">
            {navItems.map((item) => (
              <HordeNavItem key={item.label} item={item} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
// END_FILE