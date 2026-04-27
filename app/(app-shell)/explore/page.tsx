// START_FILE
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

type Profile = {
  id: string
  display_name: string | null
  bio: string | null
  country: string | null
  gender: string | null
  hourly_price: number | null
  is_seller: boolean | null
  is_online: boolean | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
}

type RatingStatRow = {
  user_id: string
  avg_overall: number | null
  review_count: number
}

type RatingMap = Record<
  string,
  {
    avg_rating: number | null
    review_count: number
  }
>

type SortMode = 'best_rated' | 'most_reviews' | 'price_low' | 'price_high' | 'name'

type FilterChip = {
  key: string
  label: string
  onRemove: () => void
}

type FavoriteRow = {
  seller_id: string
}

type BusyState =
  | 'pending'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_seller_action'

type PendingBookingRow = {
  id: string
  seller_id: string
  status: 'pending'
}

type BlockingSessionRow = {
  id: string
  seller_id: string
  status: 'ready_to_start' | 'active' | 'awaiting_confirmation'
  seller_completed_at: string | null
}

type BusyInfo = {
  itemId: string
  status: BusyState
  priority: number
}

type BusyInfoMap = Record<string, BusyInfo>

type SummaryParts = {
  visibleItems: string[]
  hasMore: boolean
}

type SupabaseResult<T> = {
  data: T | null
  error: {
    message?: string
    details?: string
    hint?: string
    code?: string
  } | null
}

const VALID_SORTS: SortMode[] = [
  'best_rated',
  'most_reviews',
  'price_low',
  'price_high',
  'name',
]

const AUTO_REFRESH_MS = 90_000
const AUTO_REFRESH_TICK_MS = 2000
const SEARCH_DEBOUNCE_MS = 900
const FILTER_SYNC_DEBOUNCE_MS = 700
const ACTION_THROTTLE_MS = 1000
const FILTER_THROTTLE_MS = 700
const REFRESH_THROTTLE_MS = 5000
const FOCUS_REFRESH_THROTTLE_MS = 30_000
const WEIGHTED_RATING_MIN_REVIEWS = 10
const EXPLORE_REQUEST_TIMEOUT_MS = 12_000
const EXPLORE_PROFILE_LIMIT = 200

const genderMeta = (gender: string | null) => {
  switch (gender) {
    case 'male':
      return {
        label: 'Male',
        icon: IconMars,
        iconClassName: 'text-sky-300',
      }
    case 'female':
      return {
        label: 'Female',
        icon: IconVenus,
        iconClassName: 'text-pink-300',
      }
    case 'non_binary':
      return {
        label: 'Non-binary',
        icon: IconNonBinary,
        iconClassName: 'text-violet-300',
      }
    default:
      return null
  }
}

function IconGlobe({
  className = 'h-4 w-4',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.7 4 5.9 4 9s-1.5 6.3-4 9c-2.5-2.7-4-5.9-4-9s1.5-5.3 4-9Z" />
    </svg>
  )
}

function IconMars({
  className = 'h-4 w-4',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="14" r="5" />
      <path d="M13.5 10.5 20 4" />
      <path d="M15 4h5v5" />
    </svg>
  )
}

function IconVenus({
  className = 'h-4 w-4',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7" />
      <path d="M9 18h6" />
    </svg>
  )
}

function IconNonBinary({
  className = 'h-4 w-4',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="4.5" />
      <path d="M13.2 6.8 19 1" />
      <path d="M14.8 1H19v4.2" />
      <path d="M10 14.5V23" />
      <path d="M7 20h6" />
    </svg>
  )
}

function IconRefresh({
  className = 'h-4 w-4',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 0 0-14.9-3" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.9 3" />
      <path d="M20 20v-5h-5" />
    </svg>
  )
}

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function getParam(searchParams: ReturnType<typeof useSearchParams>, key: string) {
  return searchParams.get(key) || ''
}

function getInitialSort(searchParams: ReturnType<typeof useSearchParams>): SortMode {
  const sort = getParam(searchParams, 'sort')
  return VALID_SORTS.includes(sort as SortMode) ? (sort as SortMode) : 'best_rated'
}

function onlineMeta(isOnline: boolean | null) {
  if (isOnline) {
    return {
      label: 'Online',
      className: 'border-emerald-500/18 bg-emerald-500/8 text-emerald-300',
    }
  }

  return {
    label: 'Offline',
    className: 'border-slate-700/60 bg-slate-800/55 text-slate-300',
  }
}

function getBusyPriority(status: BusyState) {
  switch (status) {
    case 'pending':
      return 1
    case 'ready_to_start':
      return 2
    case 'awaiting_confirmation_seller_action':
      return 3
    case 'active':
      return 4
    default:
      return 99
  }
}

function getBusyMeta(status: BusyState) {
  switch (status) {
    case 'pending':
      return {
        badgeLabel: 'Incoming Booking',
        badgeClassName: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
        summary: 'Has a pending booking request.',
      }
    case 'ready_to_start':
      return {
        badgeLabel: 'Reserved',
        badgeClassName: 'border-blue-500/20 bg-blue-500/8 text-blue-300',
        summary: 'Accepted session is waiting to start.',
      }
    case 'active':
      return {
        badgeLabel: 'Currently Playing',
        badgeClassName: 'border-cyan-500/20 bg-cyan-500/8 text-cyan-300',
        summary: 'Active session in progress right now.',
      }
    case 'awaiting_confirmation_seller_action':
      return {
        badgeLabel: 'Needs Completion',
        badgeClassName: 'border-purple-500/20 bg-purple-500/8 text-purple-300',
        summary: 'Session still needs seller-side completion.',
      }
    default:
      return {
        badgeLabel: 'Busy',
        badgeClassName: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
        summary: 'Temporarily unavailable for new bookings.',
      }
  }
}

function summarizeListParts(items: string[] | null | undefined, visibleCount = 3): SummaryParts {
  const cleaned = (items || []).map((item) => item.trim()).filter(Boolean)

  if (cleaned.length === 0) {
    return {
      visibleItems: [],
      hasMore: false,
    }
  }

  return {
    visibleItems: cleaned.slice(0, visibleCount),
    hasMore: cleaned.length > visibleCount,
  }
}

function getInitials(name: string | null | undefined) {
  const label = (name || 'GM').trim()
  if (!label) return 'GM'

  const parts = label.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function SaveIcon({ filled }: { filled: boolean }) {
  return <span className="text-[17px] leading-none">{filled ? '★' : '☆'}</span>
}

function FilterField({
  label,
  children,
  primary = false,
  hideLabel = false,
}: {
  label: string
  children: ReactNode
  primary?: boolean
  hideLabel?: boolean
}) {
  return (
    <div>
      {!hideLabel ? (
        <label
          className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${primary ? 'text-slate-400' : 'text-slate-500'
            }`}
        >
          {label}
        </label>
      ) : null}
      {children}
    </div>
  )
}

function FilterToggleButton({
  active,
  onClick,
  label,
  activeLabel,
  inactiveLabel,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  activeLabel?: string
  inactiveLabel?: string
  icon?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer rounded-xl border px-3.5 py-2.5 text-left transition ${active
        ? 'border-indigo-500/28 bg-indigo-500/10 text-indigo-100 shadow-[0_0_0_1px_rgba(99,102,241,0.06)]'
        : 'border-slate-700/70 bg-slate-950/72 text-slate-300 hover:border-slate-600/75 hover:bg-slate-900/85'
        }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          {icon ? <span className="text-[13px] opacity-90">{icon}</span> : null}
          <span className="truncate text-sm font-semibold">{label}</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-indigo-400/15 text-indigo-100' : 'bg-slate-800/90 text-slate-500'
            }`}
        >
          {active ? activeLabel || 'ON' : inactiveLabel || 'OFF'}
        </span>
      </span>
    </button>
  )
}

function RowSummary({
  label,
  parts,
}: {
  label: string
  parts: SummaryParts
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
      <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </div>

      <div className="min-w-0 text-[15px] leading-8 text-slate-100">
        {parts.visibleItems.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
            <span className="break-words">
              {parts.visibleItems.join(', ')}
              {parts.hasMore ? ', ...' : ''}
            </span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
    </div>
  )
}

function getWeightedRating(
  avgRating: number | null | undefined,
  reviewCount: number | null | undefined,
  globalAverage: number
) {
  const R = typeof avgRating === 'number' ? avgRating : 0
  const v = Number(reviewCount || 0)
  const m = WEIGHTED_RATING_MIN_REVIEWS
  const C = globalAverage

  if (v <= 0) return 0

  return (v / (v + m)) * R + (m / (v + m)) * C
}

async function withSupabaseTimeout<T>(
  request: PromiseLike<{ data: T | null; error: any }>,
  label: string,
  timeoutMs = EXPLORE_REQUEST_TIMEOUT_MS
): Promise<SupabaseResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<SupabaseResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        data: null,
        error: {
          message: `${label} request timed out`,
          details: `No response within ${timeoutMs}ms`,
          code: 'REQUEST_TIMEOUT',
        },
      })
    }, timeoutMs)
  })

  const requestPromise: Promise<SupabaseResult<T>> = Promise.resolve(request)
    .then((result) => ({
      data: result.data ?? null,
      error: result.error ?? null,
    }))
    .catch((error) => ({
      data: null,
      error: {
        message:
          error instanceof Error && error.message ? error.message : `${label} request failed`,
        details: error instanceof Error ? error.stack || error.message : String(error),
        code: 'REQUEST_FAILED',
      },
    }))

  const result = await Promise.race([requestPromise, timeoutPromise])

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId)
  }

  return result
}

export default function ExploreClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const didMountRef = useRef(false)
  const loadInFlightRef = useRef(false)
  const actionThrottleRef = useRef<Map<string, number>>(new Map())
  const filterThrottleRef = useRef<Map<string, number>>(new Map())
  const lastFocusRefreshAtRef = useRef(0)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [ratings, setRatings] = useState<RatingMap>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [autoRefreshProgress, setAutoRefreshProgress] = useState(0)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<string[]>([])
  const [favoriteBusyMap, setFavoriteBusyMap] = useState<Record<string, boolean>>({})
  const [busyInfoMap, setBusyInfoMap] = useState<BusyInfoMap>({})

  const [searchInput, setSearchInput] = useState(() => getParam(searchParams, 'q'))
  const [searchText, setSearchText] = useState(() => getParam(searchParams, 'q'))
  const [selectedGender, setSelectedGender] = useState(
    () => getParam(searchParams, 'gender') || 'all'
  )
  const [selectedGame, setSelectedGame] = useState(() => getParam(searchParams, 'game') || 'all')
  const [selectedLanguage, setSelectedLanguage] = useState(
    () => getParam(searchParams, 'lang') || 'all'
  )
  const [selectedCommunication, setSelectedCommunication] = useState(
    () => getParam(searchParams, 'comm') || 'all'
  )
  const [selectedCountry, setSelectedCountry] = useState(
    () => getParam(searchParams, 'country') || 'all'
  )
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => getParam(searchParams, 'favorites') === '1'
  )
  const [onlineOnly, setOnlineOnly] = useState(() => {
    const param = getParam(searchParams, 'online')
    return param === '' ? true : param === '1'
  })
  const [sortMode, setSortMode] = useState<SortMode>(() => getInitialSort(searchParams))

  const canTriggerAction = useCallback((key: string, delay = ACTION_THROTTLE_MS) => {
    const now = Date.now()
    const last = actionThrottleRef.current.get(key) || 0

    if (now - last < delay) {
      return false
    }

    actionThrottleRef.current.set(key, now)
    return true
  }, [])

  const canTriggerFilter = useCallback((key: string, delay = FILTER_THROTTLE_MS) => {
    const now = Date.now()
    const last = filterThrottleRef.current.get(key) || 0

    if (now - last < delay) {
      return false
    }

    filterThrottleRef.current.set(key, now)
    return true
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchText(searchInput)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [searchInput])

  const loadExploreData = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (authLoading) return

      if (!user) {
        router.replace('/login')
        return
      }

      if (loadInFlightRef.current) return
      loadInFlightRef.current = true

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setLoadError('')

      try {
        setCurrentUserId(user.id)

        const profileResult = await withSupabaseTimeout(
          supabase
            .from('profiles')
            .select(
              'id, display_name, bio, country, gender, hourly_price, is_seller, is_online, primary_games, languages, communication_methods'
            )
            .eq('is_seller', true)
            .order('display_name', { ascending: true })
            .limit(EXPLORE_PROFILE_LIMIT),
          'explore profiles'
        )

        let hadAnyError = false

        const sellerRows = ((profileResult.data || []) as Profile[]).filter(Boolean)
        const sellerIds = sellerRows.map((row) => row.id)

        if (profileResult.error) {
          hadAnyError = true
          console.error('explore profiles load error:', profileResult.error)

          if (mode === 'initial') {
            setProfiles([])
          }
        } else {
          setProfiles(sellerRows)
        }

        const [ratingResult, favoriteResult] = await Promise.all([
          sellerIds.length > 0
            ? withSupabaseTimeout(
              supabase
                .from('profile_review_summary')
                .select('user_id, avg_overall, review_count')
                .in('user_id', sellerIds),
              'explore ratings'
            )
            : Promise.resolve({
              data: [],
              error: null,
            } as SupabaseResult<RatingStatRow[]>),

          withSupabaseTimeout(
            supabase.from('favorite_sellers').select('seller_id').eq('user_id', user.id),
            'explore favorites'
          ),
        ])

        if (ratingResult.error) {
          hadAnyError = true
          console.error('explore ratings load error:', ratingResult.error)
          setRatings({})
        } else {
          const ratingMap: RatingMap = {}
            ; ((ratingResult.data || []) as RatingStatRow[]).forEach((row) => {
              ratingMap[row.user_id] = {
                avg_rating:
                  row.avg_overall === null || row.avg_overall === undefined
                    ? null
                    : Number(row.avg_overall),
                review_count: Number(row.review_count || 0),
              }
            })
          setRatings(ratingMap)
        }

        if (favoriteResult.error) {
          hadAnyError = true
          console.error('explore favorites load error:', favoriteResult.error)
          setFavoriteSellerIds([])
        } else {
          setFavoriteSellerIds(((favoriteResult.data || []) as FavoriteRow[]).map((row) => row.seller_id))
        }

        const busySellerIds = sellerRows.filter((row) => row.is_online).map((row) => row.id)
        const nextBusyMap: BusyInfoMap = {}

        if (busySellerIds.length > 0) {
          const [pendingBookingResult, blockingSessionResult] = await Promise.all([
            withSupabaseTimeout(
              supabase
                .from('booking_requests')
                .select('id, seller_id, status')
                .in('seller_id', busySellerIds)
                .eq('status', 'pending'),
              'pending booking busy'
            ),
            withSupabaseTimeout(
              supabase
                .from('sessions')
                .select('id, seller_id, status, seller_completed_at')
                .in('seller_id', busySellerIds)
                .or(
                  [
                    'status.eq.ready_to_start',
                    'status.eq.active',
                    'and(status.eq.awaiting_confirmation,seller_completed_at.is.null)',
                  ].join(',')
                ),
              'blocking session busy'
            ),
          ])

          if (pendingBookingResult.error) {
            hadAnyError = true
            console.error('pending booking busy load error:', pendingBookingResult.error)
          } else {
            ; ((pendingBookingResult.data || []) as PendingBookingRow[]).forEach((row) => {
              const priority = getBusyPriority('pending')
              const existing = nextBusyMap[row.seller_id]

              if (!existing || priority < existing.priority) {
                nextBusyMap[row.seller_id] = {
                  itemId: row.id,
                  status: 'pending',
                  priority,
                }
              }
            })
          }

          if (blockingSessionResult.error) {
            hadAnyError = true
            console.error('blocking session busy load error:', blockingSessionResult.error)
          } else {
            ; ((blockingSessionResult.data || []) as BlockingSessionRow[]).forEach((row) => {
              let mappedStatus: BusyState = 'active'

              if (row.status === 'ready_to_start') {
                mappedStatus = 'ready_to_start'
              } else if (row.status === 'active') {
                mappedStatus = 'active'
              } else {
                mappedStatus = 'awaiting_confirmation_seller_action'
              }

              const priority = getBusyPriority(mappedStatus)
              const existing = nextBusyMap[row.seller_id]

              if (!existing || priority < existing.priority) {
                nextBusyMap[row.seller_id] = {
                  itemId: row.id,
                  status: mappedStatus,
                  priority,
                }
              }
            })
          }
        }

        setBusyInfoMap(nextBusyMap)
        setLastUpdatedAt(new Date())
        setAutoRefreshProgress(0)

        if (hadAnyError) {
          setLoadError(
            'Marketplace data is temporarily unavailable or partial. Please try refresh again.'
          )
        }
      } catch (error) {
        console.error('loadExploreData threw:', error)
        setProfiles([])
        setRatings({})
        setFavoriteSellerIds([])
        setBusyInfoMap({})
        setLoadError('Marketplace could not be loaded right now. Please try again shortly.')
      } finally {
        loadInFlightRef.current = false
        setLoading(false)
        setRefreshing(false)
      }
    },
    [authLoading, router, user]
  )

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace('/login')
      return
    }

    void loadExploreData('initial')
  }, [authLoading, loadExploreData, router, user])

  useEffect(() => {
    if (loading) return

    const step = (AUTO_REFRESH_TICK_MS / AUTO_REFRESH_MS) * 100

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (loadInFlightRef.current) return

      setAutoRefreshProgress((prev) => {
        const next = prev + step

        if (next >= 100) {
          void loadExploreData('refresh')
          return 0
        }

        return next
      })
    }, AUTO_REFRESH_TICK_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadExploreData, loading])

  useEffect(() => {
    if (!user) return

    const refreshOnFocusOrVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (loadInFlightRef.current) return

      const now = Date.now()
      if (now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return

      lastFocusRefreshAtRef.current = now
      void loadExploreData('refresh')
    }

    window.addEventListener('focus', refreshOnFocusOrVisible)
    document.addEventListener('visibilitychange', refreshOnFocusOrVisible)

    return () => {
      window.removeEventListener('focus', refreshOnFocusOrVisible)
      document.removeEventListener('visibilitychange', refreshOnFocusOrVisible)
    }
  }, [loadExploreData, user])

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()

      if (searchText.trim()) params.set('q', searchText.trim())
      if (selectedGender !== 'all') params.set('gender', selectedGender)
      if (selectedGame !== 'all') params.set('game', selectedGame)
      if (selectedLanguage !== 'all') params.set('lang', selectedLanguage)
      if (selectedCommunication !== 'all') params.set('comm', selectedCommunication)
      if (selectedCountry !== 'all') params.set('country', selectedCountry)
      if (favoritesOnly) params.set('favorites', '1')
      if (onlineOnly) params.set('online', '1')
      if (sortMode !== 'best_rated') params.set('sort', sortMode)

      const nextQuery = params.toString()
      const currentQuery = searchParams.toString()

      if (nextQuery !== currentQuery) {
        router.replace(nextQuery ? `/explore?${nextQuery}` : '/explore', {
          scroll: false,
        })
      }
    }, FILTER_SYNC_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    searchText,
    selectedGender,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    onlineOnly,
    sortMode,
    router,
    searchParams,
  ])

  const allGames = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ; (profile.primary_games || []).forEach((game) => {
        const clean = game.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allLanguages = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ; (profile.languages || []).forEach((lang) => {
        const clean = lang.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allCommunicationMethods = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      ; (profile.communication_methods || []).forEach((method) => {
        const clean = method.trim()
        if (clean) set.add(clean)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const allCountries = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((profile) => {
      const clean = profile.country?.trim()
      if (clean) set.add(clean)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const globalAverageRating = useMemo(() => {
    const values = Object.values(ratings)
      .filter((item) => item.avg_rating !== null && item.review_count > 0)
      .map((item) => Number(item.avg_rating))

    if (values.length === 0) return 0

    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [ratings])

  const filteredProfiles = useMemo(() => {
    const query = normalizeText(searchText)

    const next = [...profiles].filter((profile) => {
      const profileName = normalizeText(profile.display_name)
      const profileBio = normalizeText(profile.bio)
      const profileCountry = normalizeText(profile.country)
      const profileGender = normalizeText(profile.gender)
      const games = (profile.primary_games || []).map(normalizeText)
      const languages = (profile.languages || []).map(normalizeText)
      const communicationMethods = (profile.communication_methods || []).map(normalizeText)
      const isFavorite = favoriteSellerIds.includes(profile.id)

      const matchesSearch =
        !query ||
        profileName.includes(query) ||
        profileBio.includes(query) ||
        profileCountry.includes(query) ||
        profileGender.includes(query) ||
        games.some((game) => game.includes(query)) ||
        languages.some((lang) => lang.includes(query)) ||
        communicationMethods.some((method) => method.includes(query))

      if (!matchesSearch) return false

      if (selectedGender !== 'all' && profileGender !== normalizeText(selectedGender)) {
        return false
      }

      if (selectedGame !== 'all' && !games.includes(normalizeText(selectedGame))) {
        return false
      }

      if (selectedLanguage !== 'all' && !languages.includes(normalizeText(selectedLanguage))) {
        return false
      }

      if (
        selectedCommunication !== 'all' &&
        !communicationMethods.includes(normalizeText(selectedCommunication))
      ) {
        return false
      }

      if (selectedCountry !== 'all' && profileCountry !== normalizeText(selectedCountry)) {
        return false
      }

      if (favoritesOnly && !isFavorite) {
        return false
      }

      if (onlineOnly && !profile.is_online) {
        return false
      }

      return true
    })

    const compareWithinBucket = (a: Profile, b: Profile) => {
      const ratingA = ratings[a.id]?.avg_rating ?? null
      const ratingB = ratings[b.id]?.avg_rating ?? null
      const reviewsA = ratings[a.id]?.review_count ?? 0
      const reviewsB = ratings[b.id]?.review_count ?? 0
      const weightedA = getWeightedRating(ratingA, reviewsA, globalAverageRating)
      const weightedB = getWeightedRating(ratingB, reviewsB, globalAverageRating)
      const priceA = Number(a.hourly_price ?? 0)
      const priceB = Number(b.hourly_price ?? 0)
      const nameA = a.display_name || ''
      const nameB = b.display_name || ''

      switch (sortMode) {
        case 'best_rated':
          if (weightedB !== weightedA) return weightedB - weightedA
          if (reviewsB !== reviewsA) return reviewsB - reviewsA
          return nameA.localeCompare(nameB)

        case 'most_reviews':
          if (reviewsB !== reviewsA) return reviewsB - reviewsA
          if (weightedB !== weightedA) return weightedB - weightedA
          return nameA.localeCompare(nameB)

        case 'price_low':
          if (priceA !== priceB) return priceA - priceB
          if (weightedB !== weightedA) return weightedB - weightedA
          return nameA.localeCompare(nameB)

        case 'price_high':
          if (priceB !== priceA) return priceB - priceA
          if (weightedB !== weightedA) return weightedB - weightedA
          return nameA.localeCompare(nameB)

        case 'name':
          return nameA.localeCompare(nameB)

        default:
          return 0
      }
    }

    const getAvailabilityBucket = (profile: Profile) => {
      const isSelf = profile.id === currentUserId
      if (isSelf) return 0
      if (profile.is_online && !busyInfoMap[profile.id]) return 1
      if (profile.is_online && busyInfoMap[profile.id]) return 2
      return 3
    }

    next.sort((a, b) => {
      const bucketA = getAvailabilityBucket(a)
      const bucketB = getAvailabilityBucket(b)

      if (bucketA !== bucketB) {
        return bucketA - bucketB
      }

      if (bucketA === 2) {
        const busyPriorityA = busyInfoMap[a.id]?.priority ?? 99
        const busyPriorityB = busyInfoMap[b.id]?.priority ?? 99

        if (busyPriorityA !== busyPriorityB) {
          return busyPriorityA - busyPriorityB
        }
      }

      return compareWithinBucket(a, b)
    })

    const selfIndex = next.findIndex((profile) => profile.id === currentUserId)
    if (selfIndex > 0) {
      const [selfProfile] = next.splice(selfIndex, 1)
      next.unshift(selfProfile)
    }

    return next
  }, [
    profiles,
    ratings,
    favoriteSellerIds,
    searchText,
    selectedGender,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    onlineOnly,
    sortMode,
    currentUserId,
    busyInfoMap,
    globalAverageRating,
  ])

  const clearFilters = () => {
    setSearchInput('')
    setSearchText('')
    setSelectedGender('all')
    setSelectedGame('all')
    setSelectedLanguage('all')
    setSelectedCommunication('all')
    setSelectedCountry('all')
    setFavoritesOnly(false)
    setOnlineOnly(true)
    setSortMode('best_rated')
  }

  const toggleFavorite = async (sellerId: string) => {
    if (!currentUserId) return
    if (favoriteBusyMap[sellerId]) return
    if (!canTriggerAction(`favorite-${sellerId}`)) return

    const isFavorite = favoriteSellerIds.includes(sellerId)

    setFavoriteBusyMap((prev) => ({ ...prev, [sellerId]: true }))

    if (isFavorite) {
      setFavoriteSellerIds((prev) => prev.filter((id) => id !== sellerId))
    } else {
      setFavoriteSellerIds((prev) => (prev.includes(sellerId) ? prev : [...prev, sellerId]))
    }

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from('favorite_sellers')
          .delete()
          .eq('user_id', currentUserId)
          .eq('seller_id', sellerId)

        if (error) throw error
      } else {
        const { error } = await supabase.from('favorite_sellers').insert({
          user_id: currentUserId,
          seller_id: sellerId,
        })

        if (error) throw error
      }
    } catch (error) {
      console.error('favorite toggle error:', error)

      if (isFavorite) {
        setFavoriteSellerIds((prev) => (prev.includes(sellerId) ? prev : [...prev, sellerId]))
      } else {
        setFavoriteSellerIds((prev) => prev.filter((id) => id !== sellerId))
      }
    } finally {
      setFavoriteBusyMap((prev) => {
        const next = { ...prev }
        delete next[sellerId]
        return next
      })
    }
  }

  const chips = useMemo<FilterChip[]>(() => {
    const next: FilterChip[] = []

    if (searchText.trim()) {
      next.push({
        key: 'q',
        label: `Search: ${searchText.trim()}`,
        onRemove: () => {
          setSearchInput('')
          setSearchText('')
        },
      })
    }

    if (selectedGender !== 'all') {
      next.push({
        key: 'gender',
        label: `Gender: ${selectedGender === 'non_binary'
          ? 'Non-binary'
          : selectedGender.charAt(0).toUpperCase() + selectedGender.slice(1)
          }`,
        onRemove: () => setSelectedGender('all'),
      })
    }

    if (selectedGame !== 'all') {
      next.push({
        key: 'game',
        label: `Game: ${selectedGame}`,
        onRemove: () => setSelectedGame('all'),
      })
    }

    if (selectedLanguage !== 'all') {
      next.push({
        key: 'lang',
        label: `Language: ${selectedLanguage}`,
        onRemove: () => setSelectedLanguage('all'),
      })
    }

    if (selectedCommunication !== 'all') {
      next.push({
        key: 'comm',
        label: `Voice: ${selectedCommunication}`,
        onRemove: () => setSelectedCommunication('all'),
      })
    }

    if (selectedCountry !== 'all') {
      next.push({
        key: 'country',
        label: `Country: ${selectedCountry}`,
        onRemove: () => setSelectedCountry('all'),
      })
    }

    if (favoritesOnly) {
      next.push({
        key: 'favorites',
        label: 'Favorites Only',
        onRemove: () => setFavoritesOnly(false),
      })
    }

    if (onlineOnly) {
      next.push({
        key: 'online',
        label: 'Online Only',
        onRemove: () => setOnlineOnly(false),
      })
    }

    return next
  }, [
    searchText,
    selectedGender,
    selectedGame,
    selectedLanguage,
    selectedCommunication,
    selectedCountry,
    favoritesOnly,
    onlineOnly,
  ])

  const hasActiveFilters = chips.length > 0

  const visibleMarketplaceProfiles = useMemo(() => {
    return filteredProfiles.filter((profile) => profile.id !== currentUserId)
  }, [filteredProfiles, currentUserId])

  const availableNowCount = useMemo(() => {
    return visibleMarketplaceProfiles.filter(
      (profile) => profile.is_online && !busyInfoMap[profile.id]
    ).length
  }, [busyInfoMap, visibleMarketplaceProfiles])

  const busyNowCount = useMemo(() => {
    return visibleMarketplaceProfiles.filter(
      (profile) => profile.is_online && !!busyInfoMap[profile.id]
    ).length
  }, [busyInfoMap, visibleMarketplaceProfiles])

  const marketplaceSummaryText = useMemo(() => {
    if (loading) return 'Loading marketplace...'

    if (
      loadError &&
      availableNowCount === 0 &&
      busyNowCount === 0 &&
      visibleMarketplaceProfiles.length === 0
    ) {
      return 'Marketplace temporarily unavailable'
    }

    if (availableNowCount === 0 && busyNowCount === 0) {
      return 'No live sellers match these filters'
    }

    if (busyNowCount === 0) {
      return `${availableNowCount} available now`
    }

    if (availableNowCount === 0) {
      return `${busyNowCount} busy now`
    }

    return `${availableNowCount} available now • ${busyNowCount} busy now`
  }, [availableNowCount, busyNowCount, loadError, loading, visibleMarketplaceProfiles.length])

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1320px] px-8 py-8">
          <p className="text-slate-400">Checking session...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1320px] px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight text-white">Explore GameMates</h1>

            <p className="mt-2 flex items-center gap-2 text-base text-slate-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
              <span className="font-bold text-white">
                {visibleMarketplaceProfiles.filter((profile) => profile.is_online).length}
              </span>
              <span>online now</span>
              <span className="text-slate-600">•</span>
              <span className="font-bold text-white">{availableNowCount}</span>
              <span className="text-slate-300">available to play</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-500">
              Last updated:{' '}
              <span className="font-semibold text-slate-200">
                {lastUpdatedAt
                  ? lastUpdatedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })
                  : '--:--:--'}
              </span>
            </div>

            <button
              onClick={() => {
                if (!canTriggerAction('manual-refresh', REFRESH_THROTTLE_MS)) return
                void loadExploreData('refresh')
              }}
              disabled={refreshing || loading}
              className="relative cursor-pointer overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/85 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800/90 disabled:opacity-60"
              title="Auto refreshes every 60 seconds"
            >
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-emerald-500/20 transition-[height] duration-100"
                style={{ height: `${autoRefreshProgress}%` }}
              />

              <span className="relative z-10 inline-flex items-center gap-2">
                <IconRefresh className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            {loadError}
          </div>
        ) : null}

        <div className="mb-5 rounded-[26px] border border-slate-800/85 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(9,16,32,0.95))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,2.55fr)_220px_170px_170px]">
            <FilterField label="Search" primary hideLabel>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, bio, game, country, language..."
                className="w-full rounded-xl border border-slate-700/75 bg-slate-950/95 px-5 py-3.5 text-base text-white outline-none placeholder:text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition focus:border-indigo-500/35 focus:bg-slate-950"
              />
            </FilterField>

            <FilterField label="Sort" primary hideLabel>
              <select
                value={sortMode}
                onChange={(e) => {
                  const nextValue = e.target.value as SortMode
                  if (!canTriggerFilter('sort')) return
                  setSortMode(nextValue)
                }}
                className="w-full cursor-pointer rounded-xl border border-slate-700/70 bg-slate-950/82 px-4 py-3.5 text-sm text-white outline-none transition focus:border-slate-500/70"
              >
                <option value="best_rated">Best Rated</option>
                <option value="most_reviews">Most Reviews</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="name">Name</option>
              </select>
            </FilterField>

            <FilterField label="Favorites" primary hideLabel>
              <FilterToggleButton
                active={favoritesOnly}
                onClick={() => {
                  if (!canTriggerFilter('favorites')) return
                  setFavoritesOnly((prev) => !prev)
                }}
                label="Favorites"
                activeLabel="ON"
                inactiveLabel="OFF"
                icon="★"
              />
            </FilterField>

            <FilterField label="Online" primary hideLabel>
              <FilterToggleButton
                active={onlineOnly}
                onClick={() => {
                  if (!canTriggerFilter('online')) return
                  setOnlineOnly((prev) => !prev)
                }}
                label="Online"
                activeLabel="ON"
                inactiveLabel="OFF"
                icon="●"
              />
            </FilterField>
          </div>

          <div className="mt-4 grid gap-3.5 border-t border-white/5 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <FilterField label="Gender" hideLabel>
              <select
                value={selectedGender}
                onChange={(e) => {
                  if (!canTriggerFilter('gender')) return
                  setSelectedGender(e.target.value)
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/62 px-4 py-3 text-sm text-white outline-none transition hover:border-slate-600/70 focus:border-slate-500/70"
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
              </select>
            </FilterField>

            <FilterField label="Country" hideLabel>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  if (!canTriggerFilter('country')) return
                  setSelectedCountry(e.target.value)
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/62 px-4 py-3 text-sm text-white outline-none transition hover:border-slate-600/70 focus:border-slate-500/70"
              >
                <option value="all">All Countries</option>
                {allCountries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Game" hideLabel>
              <select
                value={selectedGame}
                onChange={(e) => {
                  if (!canTriggerFilter('game')) return
                  setSelectedGame(e.target.value)
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/62 px-4 py-3 text-sm text-white outline-none transition hover:border-slate-600/70 focus:border-slate-500/70"
              >
                <option value="all">All Games</option>
                {allGames.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Language" hideLabel>
              <select
                value={selectedLanguage}
                onChange={(e) => {
                  if (!canTriggerFilter('language')) return
                  setSelectedLanguage(e.target.value)
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/62 px-4 py-3 text-sm text-white outline-none transition hover:border-slate-600/70 focus:border-slate-500/70"
              >
                <option value="all">All Languages</option>
                {allLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Communication" hideLabel>
              <select
                value={selectedCommunication}
                onChange={(e) => {
                  if (!canTriggerFilter('communication')) return
                  setSelectedCommunication(e.target.value)
                }}
                className="w-full cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/62 px-4 py-3 text-sm text-white outline-none transition hover:border-slate-600/70 focus:border-slate-500/70"
              >
                <option value="all">All Methods</option>
                {allCommunicationMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        </div>

        <div className="mb-7 flex items-center justify-between gap-4 rounded-[18px] border border-slate-800/80 bg-slate-900/60 px-5 py-2.5">
          <div className="flex flex-wrap gap-2">
            {chips.length > 0 ? (
              chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onRemove}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700/65 bg-slate-950/60 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                  title="Remove filter"
                >
                  <span>{chip.label}</span>
                  <span className="text-slate-500">×</span>
                </button>
              ))
            ) : (
              <span className="text-sm text-slate-500">No active filters</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-sm font-semibold text-slate-300">{marketplaceSummaryText}</div>

            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="cursor-pointer rounded-lg bg-slate-800/75 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700/90 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        {loading && <p className="mt-6 text-slate-400">Loading...</p>}

        {!loading && loadError && filteredProfiles.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/55 px-5 py-4 text-slate-300">
            Could not load marketplace data right now. Try the refresh button in a few seconds.
          </div>
        )}

        {!loading && !loadError && filteredProfiles.length === 0 && (
          <p className="mt-6 text-slate-400">No GameMates found with the current filters.</p>
        )}

        <div className="flex flex-col gap-5">
          {filteredProfiles.map((p) => {
            const gender = genderMeta(p.gender)
            const rating = ratings[p.id]
            const isFavorite = favoriteSellerIds.includes(p.id)
            const favoriteBusy = !!favoriteBusyMap[p.id]
            const online = onlineMeta(p.is_online)
            const isSelf = p.id === currentUserId
            const busyInfo = busyInfoMap[p.id]
            const busyMeta = busyInfo ? getBusyMeta(busyInfo.status) : null

            const gamesParts = summarizeListParts(p.primary_games, 3)
            const languageParts = summarizeListParts(p.languages, 3)
            const displayName = p.display_name || 'Unknown GameMate'
            const isBusy = !!busyMeta

            return (
              <div
                key={p.id}
                className="overflow-hidden rounded-[28px] border border-slate-800/95 bg-[linear-gradient(180deg,rgba(11,19,38,0.97),rgba(9,16,32,0.97))] shadow-[0_16px_38px_rgba(0,0,0,0.20)] transition duration-200"
              >
                <div className="grid gap-6 px-6 py-6 xl:grid-cols-[148px_minmax(0,1.9fr)_360px] xl:items-start">
                  <div className="flex h-full flex-col items-center justify-start gap-3.5">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="flex h-[108px] w-[108px] items-center justify-center rounded-[24px] border border-slate-700/80 bg-slate-800/75 text-[31px] font-bold tracking-[0.08em] text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        {getInitials(displayName)}
                      </div>

                      <div className="inline-flex min-h-[46px] w-[112px] items-center justify-center rounded-[16px] border border-indigo-500/30 bg-[linear-gradient(180deg,rgba(79,70,229,0.32),rgba(67,56,202,0.2))] px-3 text-[18px] font-bold text-white shadow-[0_10px_24px_rgba(67,56,202,0.22)]">
                        ${p.hourly_price ?? 0}/h
                      </div>

                      <div className="flex w-[112px] flex-col items-center gap-2">
                        <span
                          className={`inline-flex min-h-[32px] w-full items-center justify-center rounded-lg border px-3 text-[12px] font-semibold ${online.className}`}
                        >
                          {online.label}
                        </span>

                        {busyMeta ? (
                          <span
                            className={`inline-flex min-h-[32px] w-full items-center justify-center rounded-lg border px-3 text-center text-[12px] font-semibold ${busyMeta.badgeClassName}`}
                          >
                            {busyMeta.badgeLabel}
                          </span>
                        ) : null}

                        <button
                          onClick={() => {
                            if (!canTriggerAction(`profile-${p.id}`)) return
                            router.push(`/profile/${p.id}`)
                          }}
                          className="inline-flex min-h-[42px] w-full cursor-pointer items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="truncate text-[27px] font-bold leading-tight text-white">
                            {displayName}
                          </div>

                          {gender ? (
                            <span className="inline-flex shrink-0 items-center">
                              <gender.icon className={`h-[30px] w-[30px] ${gender.iconClassName}`} />
                            </span>
                          ) : null}

                          {!isSelf ? (
                            <button
                              type="button"
                              onClick={() => void toggleFavorite(p.id)}
                              disabled={favoriteBusy}
                              className={`inline-flex h-10 w-10 cursor-pointer shrink-0 items-center justify-center rounded-full border transition ${isFavorite
                                ? 'border-amber-400/28 bg-amber-500/14 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.06)]'
                                : 'border-slate-700/65 bg-slate-800/52 text-slate-400 hover:border-slate-600/80 hover:bg-slate-800/78 hover:text-white'
                                } disabled:opacity-50`}
                              title={isFavorite ? 'Remove favorite' : 'Save favorite'}
                            >
                              <SaveIcon filled={isFavorite} />
                            </button>
                          ) : null}

                          {isSelf ? (
                            <span className="rounded-full border border-indigo-500/25 bg-indigo-500/12 px-2.5 py-1 text-[10px] font-semibold text-indigo-300">
                              You
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                          <span className="font-semibold text-amber-300">
                            ★{' '}
                            {rating?.avg_rating === null || rating?.avg_rating === undefined
                              ? 'New'
                              : rating.avg_rating.toFixed(1)}
                          </span>
                          <span className="text-slate-500">
                            ({rating?.review_count ?? 0} review
                            {(rating?.review_count ?? 0) === 1 ? '' : 's'})
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                          {p.country ? (
                            <span className="inline-flex items-center gap-1.5">
                              <IconGlobe className="h-4 w-4 text-slate-500" />
                              <span>{p.country}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      <RowSummary label="Language" parts={languageParts} />
                      <RowSummary label="Games" parts={gamesParts} />
                    </div>
                  </div>

                  <div className="flex h-full flex-col items-start justify-start xl:items-stretch">
                    <div
                      className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${isBusy
                        ? 'border-amber-500/12 bg-amber-500/[0.032]'
                        : 'border-white/5 bg-white/[0.018]'
                        }`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        Availability
                      </div>
                      <div
                        className={`mt-1.5 text-[15px] font-semibold ${isBusy ? 'text-amber-300' : 'text-slate-100'
                          }`}
                      >
                        {isBusy
                          ? busyMeta.badgeLabel
                          : p.is_online
                            ? 'Available now'
                            : 'Currently offline'}
                      </div>
                      <div className="mt-1.5 text-sm leading-6 text-slate-400">
                        {isBusy
                          ? busyMeta.summary
                          : p.is_online
                            ? 'Online and ready to respond.'
                            : 'You can still open the profile and review details.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
// END_FILE