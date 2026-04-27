// START_FILE: app/(app-shell)/profile/[id]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'
import StartChatButton from '@/components/StartChatButton'

type Profile = {
  id: string
  display_name: string | null
  bio: string | null
  country: string | null
  timezone: string | null
  gender: string | null
  hourly_price: number | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
  is_online: boolean | null
}

type ProfileReviewSummary = {
  user_id: string
  review_count: number
  avg_punctuality: number | null
  avg_communication: number | null
  avg_vibe: number | null
  avg_reliability: number | null
  avg_skill: number | null
  avg_overall: number | null
  updated_at: string
}

type ProfileRecentReview = {
  id: string
  session_id: string
  user_id: string
  reviewer_user_id: string
  reviewer_role: 'buyer' | 'seller' | 'unknown'
  punctuality: number
  communication: number
  vibe: number
  reliability: number
  skill: number
  overall_score: number
  comment: string | null
  created_at: string
  reviewer_display_name: string | null
  reviewer_username: string | null
}

type FavoriteRow = {
  seller_id: string
}

type SellerBlockingReason =
  | 'offline'
  | 'pending_booking'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_seller_action'
  | 'restricted'
  | null

type SellerAvailabilityResponse = {
  success?: boolean
  is_bookable?: boolean
  reason?: string | null
  item_id?: string | null
  message?: string
}

type EnforcementState = 'good' | 'warned' | 'restricted' | 'ban_review'

type EnforcementStateResponse = {
  success?: boolean
  user_id?: string
  active_strike_points?: number
  enforcement_state?: EnforcementState
  next_threshold?: number | null
}

const REVIEW_STAT_ITEMS = [
  { key: 'avg_punctuality', label: 'Punctuality' },
  { key: 'avg_communication', label: 'Communication' },
  { key: 'avg_vibe', label: 'Vibe' },
  { key: 'avg_reliability', label: 'Reliability' },
  { key: 'avg_skill', label: 'Skill' },
] as const

function IconMars({ className = 'h-4 w-4' }: { className?: string }) {
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

function IconVenus({ className = 'h-4 w-4' }: { className?: string }) {
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

function IconNonBinary({ className = 'h-4 w-4' }: { className?: string }) {
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

function getRatingTheme(rating: number | null) {
  if (rating === null) {
    return {
      text: 'text-slate-300',
      bar: 'bg-slate-600',
      glow: 'shadow-none',
      label: 'New',
    }
  }

  if (rating >= 4.75) {
    return {
      text: 'text-emerald-300',
      bar: 'bg-emerald-500',
      glow: 'shadow-[0_0_24px_rgba(16,185,129,0.38)]',
      label: 'Elite',
    }
  }

  if (rating >= 4.2) {
    return {
      text: 'text-lime-300',
      bar: 'bg-lime-500',
      glow: 'shadow-[0_0_22px_rgba(132,204,22,0.32)]',
      label: 'Strong',
    }
  }

  if (rating >= 3.5) {
    return {
      text: 'text-amber-300',
      bar: 'bg-amber-500',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.30)]',
      label: 'Mixed',
    }
  }

  if (rating >= 2.5) {
    return {
      text: 'text-orange-300',
      bar: 'bg-orange-500',
      glow: 'shadow-[0_0_18px_rgba(249,115,22,0.28)]',
      label: 'Risky',
    }
  }

  return {
    text: 'text-rose-300',
    bar: 'bg-rose-500',
    glow: 'shadow-[0_0_20px_rgba(244,63,94,0.30)]',
    label: 'Bad',
  }
}

function getReviewDisplayName(review: ProfileRecentReview) {
  return review.reviewer_display_name || review.reviewer_username || 'Unknown user'
}

function getReviewerRoleLabel(role: ProfileRecentReview['reviewer_role']) {
  if (role === 'buyer') return 'Buyer'
  if (role === 'seller') return 'Seller'
  return 'User'
}

function getSellerBlockingMeta(reason: SellerBlockingReason) {
  switch (reason) {
    case 'offline':
      return {
        badge: 'Offline',
        badgeClass: 'border border-slate-700 bg-slate-800 text-slate-200',
        title: 'Booking unavailable right now',
        description:
          'This seller is offline. You can still view the profile or start a chat, but booking is currently disabled.',
      }
    case 'pending_booking':
      return {
        badge: 'Pending Request',
        badgeClass: 'border border-amber-400/30 bg-amber-500/20 text-amber-300',
        title: 'Seller already has a pending booking',
        description:
          'This seller is already handling another booking request. They need to accept or reject it before taking a new one.',
      }
    case 'ready_to_start':
      return {
        badge: 'Ready to Start',
        badgeClass: 'border border-blue-400/30 bg-blue-500/20 text-blue-300',
        title: 'Seller is preparing for another session',
        description:
          'This seller already has a session waiting to start. Booking is blocked until that flow is resolved.',
      }
    case 'active':
      return {
        badge: 'In Session',
        badgeClass: 'border border-cyan-400/30 bg-cyan-500/20 text-cyan-300',
        title: 'Seller is currently in a live session',
        description:
          'This seller is busy right now. You can still chat, but you cannot open a new booking flow yet.',
      }
    case 'awaiting_confirmation_seller_action':
      return {
        badge: 'Needs Completion',
        badgeClass: 'border border-purple-400/30 bg-purple-500/20 text-purple-300',
        title: 'Seller still has an unfinished session flow',
        description:
          'This seller has a session waiting for their completion-side action. Booking stays blocked until they resolve it.',
      }
    case 'restricted':
      return {
        badge: 'Restricted',
        badgeClass: 'border border-rose-400/30 bg-rose-500/20 text-rose-300',
        title: 'Seller is temporarily unavailable',
        description: 'This seller is currently restricted from receiving new bookings.',
      }
    default:
      return null
  }
}

function getEnforcementMeta(state: EnforcementState) {
  switch (state) {
    case 'warned':
      return {
        badge: 'Warning',
        badgeClass: 'border border-amber-400/30 bg-amber-500/20 text-amber-300',
        title: 'Account warning active',
        description:
          'You have active strike points. Repeated no-shows or other abuse can lead to restrictions.',
      }
    case 'restricted':
      return {
        badge: 'Restricted',
        badgeClass: 'border border-rose-400/30 bg-rose-500/20 text-rose-300',
        title: 'Booking restricted',
        description:
          'Your account is currently restricted from creating or receiving new bookings.',
      }
    case 'ban_review':
      return {
        badge: 'Ban Review',
        badgeClass: 'border border-fuchsia-400/30 bg-fuchsia-500/20 text-fuchsia-300',
        title: 'Account under ban review',
        description:
          'Your account has reached a serious enforcement threshold and is under review.',
      }
    default:
      return {
        badge: 'Good Standing',
        badgeClass: 'border border-emerald-400/30 bg-emerald-500/20 text-emerald-300',
        title: 'Account in good standing',
        description:
          'You currently have no active enforcement restrictions on your account.',
      }
  }
}

function getEnforcementSummary(
  state: EnforcementState,
  activeStrikePoints: number,
  nextThreshold: number | null
) {
  if (state === 'good') {
    return activeStrikePoints > 0
      ? `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Next threshold at ${nextThreshold}.`
      : `No active restriction. Next threshold at ${nextThreshold}.`
  }

  if (state === 'warned' || state === 'restricted') {
    return `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Next threshold at ${nextThreshold}.`
  }

  return `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Highest threshold reached.`
}

function RatingPower({
  rating,
  reviewCount,
  isSelf,
}: {
  rating: number | null
  reviewCount: number
  isSelf: boolean
}) {
  const safeRating = rating ?? 0
  const percent = Math.max(0, Math.min((safeRating / 5) * 100, 100))
  const theme = getRatingTheme(rating)

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-slate-200">Overall Reputation</div>
        <div className={`text-lg font-bold ${theme.text}`}>
          {rating === null ? 'No ratings yet' : `${safeRating.toFixed(2)} / 5`}
        </div>
      </div>

      <div className="h-4 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.bar} ${theme.glow}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className={theme.text}>{theme.label}</span>
        <span className="text-slate-400">
          {reviewCount} review{reviewCount === 1 ? '' : 's'}
        </span>
      </div>

      {reviewCount === 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {isSelf
            ? 'This is your public rating view. Detailed review breakdown will appear after your first completed review.'
            : 'Detailed review breakdown will appear after the first completed review.'}
        </p>
      ) : null}
    </div>
  )
}

function StatBar({ label, value }: { label: string; value: number | null }) {
  const safe = value ?? 0
  const percent = Math.max(0, Math.min((safe / 5) * 100, 100))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="text-sm font-bold text-slate-300">
          {value === null ? '-' : safe.toFixed(2)}
        </span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function ExpandableTagSection({
  title,
  items,
  collapsedCount,
  emptyText,
}: {
  title: string
  items: string[] | null | undefined
  collapsedCount: number
  emptyText: string
}) {
  const [expanded, setExpanded] = useState(false)

  const normalizedItems = useMemo(() => {
    return (items || []).map((item) => item.trim()).filter(Boolean)
  }, [items])

  const visibleItems = expanded ? normalizedItems : normalizedItems.slice(0, collapsedCount)
  const hiddenCount = Math.max(normalizedItems.length - collapsedCount, 0)
  const canExpand = normalizedItems.length > collapsedCount

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>

        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-sm font-semibold text-indigo-300 transition hover:text-indigo-200"
          >
            {expanded ? 'Show less' : `Show all${hiddenCount > 0 ? ` (${hiddenCount} more)` : ''}`}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {normalizedItems.length > 0 ? (
          <>
            {visibleItems.map((item) => (
              <span
                key={`${title}-${item}`}
                className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200"
              >
                {item}
              </span>
            ))}

            {!expanded && hiddenCount > 0 ? (
              <span className="rounded-full border border-slate-700/80 bg-slate-900 px-3 py-1 text-sm font-semibold text-slate-400">
                +{hiddenCount} more
              </span>
            ) : null}
          </>
        ) : (
          <p className="text-slate-400">{emptyText}</p>
        )}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const id = params.id as string
  const currentUserId = user?.id ?? ''

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingSecondary, setLoadingSecondary] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [reviewSummary, setReviewSummary] = useState<ProfileReviewSummary | null>(null)
  const [reviews, setReviews] = useState<ProfileRecentReview[]>([])
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<string[]>([])
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [sellerBlockingReason, setSellerBlockingReason] = useState<SellerBlockingReason>(null)
  const [enforcementState, setEnforcementState] = useState<EnforcementStateResponse | null>(null)

  const mountedRef = useRef(true)

  const loadProfile = useCallback(async () => {
    if (authLoading) return

    if (!currentUserId) {
      router.replace('/login')
      return
    }

    setLoadingProfile(true)
    setProfileError('')

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, bio, country, timezone, gender, hourly_price, primary_games, languages, communication_methods, is_online'
        )
        .eq('id', id)
        .single()

      if (!mountedRef.current) return

      if (error) {
        console.error('profile load error:', error)
        setProfile(null)
        setProfileError(error.message || 'Profile not found.')
        return
      }

      setProfile(data as Profile)
    } catch (error) {
      console.error('profile load threw:', error)
      if (!mountedRef.current) return
      setProfile(null)
      setProfileError('Profile is temporarily unavailable.')
    } finally {
      if (mountedRef.current) {
        setLoadingProfile(false)
      }
    }
  }, [authLoading, currentUserId, id, router])

  const loadReviews = useCallback(async () => {
    try {
      const [summaryResult, reviewsResult] = await Promise.all([
        supabase
          .from('profile_review_summary')
          .select(
            'user_id, review_count, avg_punctuality, avg_communication, avg_vibe, avg_reliability, avg_skill, avg_overall, updated_at'
          )
          .eq('user_id', id)
          .maybeSingle(),
        supabase
          .from('profile_recent_reviews')
          .select(
            'id, session_id, user_id, reviewer_user_id, reviewer_role, punctuality, communication, vibe, reliability, skill, overall_score, comment, created_at, reviewer_display_name, reviewer_username'
          )
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      if (!mountedRef.current) return

      if (summaryResult.error) {
        console.error('review summary load error:', summaryResult.error)
        setReviewSummary(null)
      } else {
        setReviewSummary((summaryResult.data || null) as ProfileReviewSummary | null)
      }

      if (reviewsResult.error) {
        console.error('recent reviews load error:', reviewsResult.error)
        setReviews([])
      } else {
        setReviews((reviewsResult.data || []) as ProfileRecentReview[])
      }
    } catch (error) {
      console.error('reviews load threw:', error)
      if (!mountedRef.current) return
      setReviewSummary(null)
      setReviews([])
    }
  }, [id])

  const loadFavorites = useCallback(async () => {
    if (!currentUserId) return

    try {
      const { data, error } = await supabase
        .from('favorite_sellers')
        .select('seller_id')
        .eq('user_id', currentUserId)

      if (!mountedRef.current) return

      if (error) {
        console.error('favorite sellers load error:', error)
        setFavoriteSellerIds([])
        return
      }

      setFavoriteSellerIds(((data || []) as FavoriteRow[]).map((row) => row.seller_id))
    } catch (error) {
      console.error('favorite sellers load threw:', error)
      if (!mountedRef.current) return
      setFavoriteSellerIds([])
    }
  }, [currentUserId])

  const loadEnforcement = useCallback(async () => {
    if (!currentUserId || currentUserId !== id) {
      setEnforcementState(null)
      return
    }

    try {
      const { data, error } = await supabase.rpc('get_user_enforcement_state', {
        p_user_id: id,
      })

      if (!mountedRef.current) return

      if (error) {
        console.error('enforcement state load error:', error)
        setEnforcementState(null)
        return
      }

      setEnforcementState((data || null) as EnforcementStateResponse | null)
    } catch (error) {
      console.error('enforcement state load threw:', error)
      if (!mountedRef.current) return
      setEnforcementState(null)
    }
  }, [currentUserId, id])

  const loadAvailability = useCallback(
    async (loadedProfile: Profile | null) => {
      if (!currentUserId || currentUserId === id) {
        setSellerBlockingReason(null)
        return
      }

      try {
        const { data, error } = await supabase.rpc('get_seller_booking_availability', {
          p_seller_id: id,
        })

        if (!mountedRef.current) return

        let nextReason: SellerBlockingReason = null

        if (error) {
          console.error('seller availability load error:', error)

          if (loadedProfile?.is_online === false) {
            nextReason = 'offline'
          }
        } else {
          const availability = (data || null) as SellerAvailabilityResponse | null
          const reason = availability?.reason

          if (
            availability &&
            availability.is_bookable === false &&
            (reason === 'offline' ||
              reason === 'pending_booking' ||
              reason === 'ready_to_start' ||
              reason === 'active' ||
              reason === 'awaiting_confirmation_seller_action' ||
              reason === 'restricted')
          ) {
            nextReason = reason
          }
        }

        setSellerBlockingReason(nextReason)
      } catch (error) {
        console.error('seller availability load threw:', error)
        if (!mountedRef.current) return

        if (loadedProfile?.is_online === false) {
          setSellerBlockingReason('offline')
        }
      }
    },
    [currentUserId, id]
  )

  const loadSecondary = useCallback(async () => {
    if (authLoading || !currentUserId) return

    setLoadingSecondary(true)

    try {
      const currentProfile = profile

      await Promise.all([
        loadReviews(),
        loadFavorites(),
        loadEnforcement(),
        loadAvailability(currentProfile),
      ])
    } finally {
      if (mountedRef.current) {
        setLoadingSecondary(false)
      }
    }
  }, [
    authLoading,
    currentUserId,
    loadAvailability,
    loadEnforcement,
    loadFavorites,
    loadReviews,
    profile,
  ])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (!profile) return
    void loadSecondary()
  }, [loadSecondary, profile])

  const toggleFavorite = async () => {
    if (!currentUserId || !profile || favoriteBusy || profile.id === currentUserId) return

    const isFavorite = favoriteSellerIds.includes(profile.id)
    setFavoriteBusy(true)

    if (isFavorite) {
      setFavoriteSellerIds((prev) => prev.filter((sellerId) => sellerId !== profile.id))

      const { error } = await supabase
        .from('favorite_sellers')
        .delete()
        .eq('user_id', currentUserId)
        .eq('seller_id', profile.id)

      if (error) {
        console.error('favorite delete error:', error)
        setFavoriteSellerIds((prev) => Array.from(new Set([...prev, profile.id])))
      }
    } else {
      setFavoriteSellerIds((prev) => Array.from(new Set([...prev, profile.id])))

      const { error } = await supabase.from('favorite_sellers').insert({
        user_id: currentUserId,
        seller_id: profile.id,
      })

      if (error) {
        console.error('favorite insert error:', error)
        setFavoriteSellerIds((prev) => prev.filter((sellerId) => sellerId !== profile.id))
      }
    }

    setFavoriteBusy(false)
  }

  const gender = useMemo(() => genderMeta(profile?.gender || null), [profile?.gender])

  const hasReviewDetailStats =
    !!reviewSummary &&
    reviewSummary.review_count > 0 &&
    (reviewSummary.avg_punctuality !== null ||
      reviewSummary.avg_communication !== null ||
      reviewSummary.avg_vibe !== null ||
      reviewSummary.avg_reliability !== null ||
      reviewSummary.avg_skill !== null)

  const isFavorite = !!profile && favoriteSellerIds.includes(profile.id)
  const isSelf = !!profile && profile.id === currentUserId

  const sellerBlockingMeta = useMemo(() => {
    if (!profile || !currentUserId || profile.id === currentUserId) return null
    return getSellerBlockingMeta(sellerBlockingReason)
  }, [currentUserId, profile, sellerBlockingReason])

  const bookingDisabled = !!sellerBlockingMeta

  const enforcementMeta = useMemo(() => {
    const state = enforcementState?.enforcement_state || 'good'
    return getEnforcementMeta(state)
  }, [enforcementState])

  const enforcementSummaryText = useMemo(() => {
    if (!enforcementState) return null

    return getEnforcementSummary(
      enforcementState.enforcement_state || 'good',
      Number(enforcementState.active_strike_points || 0),
      enforcementState.next_threshold ?? null
    )
  }, [enforcementState])

  if (authLoading || loadingProfile) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-400">
            {authLoading ? 'Checking session...' : 'Loading profile...'}
          </p>
        </section>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-rose-400">{profileError || 'Profile not found.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1160px] px-8 py-8">
        <button
          onClick={() => router.push('/explore')}
          className="mb-6 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
        >
          ← Back to Explore
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-3">
                {!isSelf ? (
                  <button
                    onClick={() => void toggleFavorite()}
                    disabled={favoriteBusy}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg font-bold transition ${
                      isFavorite
                        ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    } disabled:opacity-50`}
                    title={isFavorite ? 'Remove favorite' : 'Save favorite'}
                  >
                    {favoriteBusy ? '…' : isFavorite ? '★' : '☆'}
                  </button>
                ) : null}

                <h1 className="truncate text-3xl font-bold">
                  {profile.display_name || 'Unknown GameMate'}
                </h1>

                {gender ? (
                  <span className="inline-flex shrink-0 items-center">
                    <gender.icon className={`h-[20px] w-[20px] ${gender.iconClassName}`} />
                  </span>
                ) : null}

                {isSelf ? (
                  <span className="rounded-full border border-indigo-500/25 bg-indigo-500/12 px-2.5 py-1 text-[10px] font-semibold text-indigo-300">
                    You
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {profile.country ? (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-200">
                    {profile.country}
                  </span>
                ) : null}

                <span
                  className={`rounded-full border px-3 py-1 text-sm ${
                    profile.is_online
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {profile.is_online ? 'Online' : 'Offline'}
                </span>

                {loadingSecondary ? (
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-400">
                    Updating details...
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-start">
              <div className="rounded-full bg-indigo-600 px-5 py-3 text-[21px] font-bold leading-none text-white">
                ${profile.hourly_price ?? 0}/hour
              </div>
            </div>
          </div>

          {isSelf && enforcementState ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${enforcementMeta.badgeClass}`}
                    >
                      {enforcementMeta.badge}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-white">{enforcementMeta.title}</h2>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {enforcementMeta.description}
                  </p>

                  {enforcementSummaryText ? (
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {enforcementSummaryText}
                    </p>
                  ) : null}
                </div>

                <div className="grid min-w-[220px] gap-3 sm:text-right">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Active strike points
                    </div>
                    <div className="mt-1 text-2xl font-bold text-white">
                      {Number(enforcementState.active_strike_points || 0)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Next threshold
                    </div>
                    <div className="mt-1 text-base font-semibold text-slate-200">
                      {enforcementState.next_threshold === null
                        ? 'Highest threshold reached'
                        : `${enforcementState.next_threshold} points`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <RatingPower
            rating={reviewSummary?.avg_overall ?? null}
            reviewCount={reviewSummary?.review_count ?? 0}
            isSelf={isSelf}
          />

          {hasReviewDetailStats ? (
            <div className="mt-6">
              <h2 className="mb-4 text-xl font-bold">Review Breakdown</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {REVIEW_STAT_ITEMS.map((item) => (
                  <StatBar
                    key={item.key}
                    label={item.label}
                    value={reviewSummary?.[item.key] as number | null}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {profile.bio ? (
            <div className="mt-6">
              <h2 className="mb-2 text-lg font-semibold">Bio</h2>
              <p className="text-slate-300">{profile.bio}</p>
            </div>
          ) : null}

          <ExpandableTagSection
            title="Languages"
            items={profile.languages}
            collapsedCount={4}
            emptyText="No languages added."
          />

          <ExpandableTagSection
            title="Games"
            items={profile.primary_games}
            collapsedCount={6}
            emptyText="No games added."
          />

          <ExpandableTagSection
            title="Communication"
            items={profile.communication_methods}
            collapsedCount={3}
            emptyText="No communication methods added."
          />

          {sellerBlockingMeta ? (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${sellerBlockingMeta.badgeClass}`}
                    >
                      {sellerBlockingMeta.badge}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-white">{sellerBlockingMeta.title}</h2>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {sellerBlockingMeta.description}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex gap-3">
            {isSelf ? (
              <button
                onClick={() => router.push('/profile-edit')}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold transition hover:bg-indigo-500"
              >
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  onClick={() => router.push(`/book/${profile.id}`)}
                  disabled={bookingDisabled}
                  className={`flex-1 rounded-xl px-4 py-3 font-semibold transition ${
                    bookingDisabled
                      ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {bookingDisabled ? 'Booking Unavailable' : 'Book Session'}
                </button>

                <div className="flex-1">
                  <StartChatButton
                    otherUserId={profile.id}
                    label="Start Chat"
                    className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-white hover:bg-slate-700"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-bold">Recent Reviews</h2>

          {reviews.length === 0 ? <p className="text-slate-400">No reviews yet.</p> : null}

          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-200">{getReviewDisplayName(review)}</div>
                  <div className="text-sm font-bold text-amber-300">
                    {Number(review.overall_score).toFixed(2)}/5
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{getReviewerRoleLabel(review.reviewer_role)}</span>
                  <span>•</span>
                  <span>{new Date(review.created_at).toLocaleDateString()}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>Punctuality {review.punctuality}/5</span>
                  <span>•</span>
                  <span>Communication {review.communication}/5</span>
                  <span>•</span>
                  <span>Vibe {review.vibe}/5</span>
                  <span>•</span>
                  <span>Reliability {review.reliability}/5</span>
                  <span>•</span>
                  <span>Skill {review.skill}/5</span>
                </div>

                {review.comment ? (
                  <p className="mt-3 text-sm leading-6 text-slate-300">{review.comment}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
// END_FILE