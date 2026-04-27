// START_FILE: app/(app-shell)/book/[id]/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfileCompletionModal from '@/components/ProfileCompletionModal'
import { checkBuyerProfileCompleteness } from '@/lib/profile-completeness'
import { useAuth } from '@/components/providers/AuthProvider'

type GenericRow = Record<string, any>

type EnforcementState = 'good' | 'warned' | 'restricted' | 'ban_review'

type EnforcementStateResponse = {
  success?: boolean
  user_id?: string
  active_strike_points?: number
  enforcement_state?: EnforcementState
  next_threshold?: number | null
}

type SellerAvailabilityReason =
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
  reason?: SellerAvailabilityReason | string | null
  item_id?: string | null
  message?: string
}

type BuyerBlockingReason =
  | 'pending_booking'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_buyer_action'
  | 'restricted'
  | 'ban_review'
  | null

type BuyerBlockingSessionRow = {
  id: string
  status: string
  buyer_completed_at: string | null
}

const GAMES = [
  'Apex Legends',
  'Black Desert Online',
  'Call of Duty: Warzone',
  'Counter-Strike 2',
  'Dead by Daylight',
  'Destiny 2',
  'Dota 2',
  'Final Fantasy XIV',
  'Fortnite',
  'GTA Online',
  'Guild Wars 2',
  'Warframe',
  'World of Warcraft',
]

const COMMUNICATION_METHODS = [
  'Discord',
  'Steam',
  'In-game Voice',
  'In-game Text',
  'Teamspeak',
  'Party Chat',
  'Text Only',
]

const DURATION_OPTIONS = [
  { minutes: 60, label: '1 Hour' },
  { minutes: 120, label: '2 Hours' },
  { minutes: 180, label: '3 Hours' },
]

const SUBMIT_COOLDOWN_MS = 1500
const SUCCESS_REDIRECT_DELAY_MS = 700
const BLOCKING_REFRESH_COOLDOWN_MS = 30000

function formatMoney(amount: number) {
  const safe = Number(amount || 0)
  const hasFraction = Math.abs(safe % 1) > 0.000001

  const formatted = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe)

  return `$${formatted}`
}

function getSellerName(row: GenericRow | null) {
  if (!row) return 'GameMate'

  return row.username || row.display_name || 'GameMate'
}

function getHourlyPrice(row: GenericRow | null) {
  if (!row) return 0

  const candidates = [
    row.hourly_price,
    row.hourlyRate,
    row.price_per_hour,
    row.pricePerHour,
    row.price,
    row.rate,
    row.hour_rate,
  ]

  for (const value of candidates) {
    const num = Number(value)
    if (!Number.isNaN(num) && num > 0) {
      return num
    }
  }

  return 0
}

function getDurationLabel(minutes: number) {
  const option = DURATION_OPTIONS.find((item) => item.minutes === minutes)
  return option ? option.label : `${minutes} min`
}

function normalizeSellerAvailabilityReason(reason: unknown): SellerAvailabilityReason {
  if (
    reason === 'offline' ||
    reason === 'pending_booking' ||
    reason === 'ready_to_start' ||
    reason === 'active' ||
    reason === 'awaiting_confirmation_seller_action' ||
    reason === 'restricted'
  ) {
    return reason
  }

  return null
}

function getSellerAvailabilityCopy(reason: SellerAvailabilityReason) {
  switch (reason) {
    case 'offline':
      return {
        tone: 'amber' as const,
        title: 'Currently offline',
        description:
          'This GameMate is offline right now. You can still view the profile and chat, but booking is temporarily unavailable.',
      }
    case 'pending_booking':
      return {
        tone: 'amber' as const,
        title: 'Incoming booking already exists',
        description:
          'This GameMate already has a pending booking request. New bookings are blocked until that request is accepted, rejected, or times out.',
      }
    case 'ready_to_start':
      return {
        tone: 'amber' as const,
        title: 'Session reserved',
        description:
          'This GameMate already has an accepted session waiting to start. New bookings are blocked until that flow is resolved.',
      }
    case 'active':
      return {
        tone: 'amber' as const,
        title: 'Currently busy',
        description:
          'This GameMate is in an active session right now. You can still view the profile and chat, but booking is temporarily unavailable.',
      }
    case 'awaiting_confirmation_seller_action':
      return {
        tone: 'amber' as const,
        title: 'Seller action still required',
        description:
          'This GameMate still has a session waiting for seller-side completion. New bookings stay blocked until that is finished.',
      }
    case 'restricted':
      return {
        tone: 'rose' as const,
        title: 'Seller temporarily unavailable',
        description:
          'This GameMate is currently restricted from receiving new bookings because of recent no-shows or rule violations.',
      }
    default:
      return null
  }
}

function getBuyerBlockingMessage(reason: BuyerBlockingReason) {
  switch (reason) {
    case 'pending_booking':
      return 'You already have a pending booking request.'
    case 'ready_to_start':
      return 'You already have a session waiting to start.'
    case 'active':
      return 'You already have an active session.'
    case 'awaiting_confirmation_buyer_action':
      return 'You still need to complete your current session before creating a new booking.'
    case 'restricted':
      return 'Your account is currently restricted from creating new bookings.'
    case 'ban_review':
      return 'Your account is currently under ban review and cannot create new bookings.'
    default:
      return 'You already have an unfinished booking or session.'
  }
}

function getEnforcementCardMeta(state: EnforcementState) {
  switch (state) {
    case 'warned':
      return {
        badge: 'Warning',
        wrapClass: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
        title: 'Your account has an active warning',
        description:
          'You can still book right now, but repeated no-shows or rule violations may lead to restrictions.',
      }
    case 'restricted':
      return {
        badge: 'Restricted',
        wrapClass: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
        title: 'Booking is temporarily restricted',
        description:
          'Your account is currently restricted from creating new bookings because of recent no-shows or rule violations.',
      }
    case 'ban_review':
      return {
        badge: 'Ban Review',
        wrapClass: 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-200',
        title: 'Your account is under ban review',
        description:
          'Your account has reached a serious enforcement threshold and booking is currently disabled.',
      }
    default:
      return {
        badge: 'Good Standing',
        wrapClass: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
        title: 'Your account is in good standing',
        description: 'You do not currently have an active booking restriction.',
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

  if (state === 'warned') {
    return `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Next threshold at ${nextThreshold}.`
  }

  if (state === 'restricted') {
    return `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Next threshold at ${nextThreshold}.`
  }

  return `${activeStrikePoints} active strike point${activeStrikePoints === 1 ? '' : 's'}. Highest threshold reached.`
}

function getFriendlyBookingRpcError(data: GenericRow | null | undefined) {
  const message = String(data?.message || '').trim()
  const buyerState = String(data?.enforcement_state || '').trim() as EnforcementState | ''
  const sellerState = String(data?.seller_enforcement_state || '').trim() as EnforcementState | ''

  if (buyerState === 'restricted') {
    return 'Your account is currently restricted from creating new bookings. Check your profile for your current strike status.'
  }

  if (buyerState === 'ban_review') {
    return 'Your account is currently under ban review and cannot create new bookings.'
  }

  if (sellerState === 'restricted') {
    return 'This seller is temporarily unavailable because of recent no-shows or rule violations.'
  }

  if (sellerState === 'ban_review') {
    return 'This seller is temporarily unavailable while their account is under review.'
  }

  if (message === 'Your account is currently restricted from creating new bookings.') {
    return 'Your account is currently restricted from creating new bookings. Check your profile for your current strike status.'
  }

  if (message === 'Seller is currently unavailable.') {
    return 'This seller is temporarily unavailable right now.'
  }

  return message || 'Booking could not be created.'
}

export default function BookPage() {
  const params = useParams()
  const router = useRouter()
  const sellerId = params?.id as string

  const { user, loading: authLoading } = useAuth()

  const submitLockRef = useRef(false)
  const lastSubmitAtRef = useRef(0)
  const redirectStartedRef = useRef(false)
  const blockingRefreshInFlightRef = useRef(false)
  const lastBlockingRefreshAtRef = useRef(0)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [seller, setSeller] = useState<GenericRow | null>(null)

  const [sellerBusy, setSellerBusy] = useState(false)
  const [sellerBusyReason, setSellerBusyReason] = useState<SellerAvailabilityReason>(null)

  const [buyerBlocked, setBuyerBlocked] = useState(false)
  const [buyerBlockingReason, setBuyerBlockingReason] = useState<BuyerBlockingReason>(null)
  const [buyerEnforcement, setBuyerEnforcement] = useState<EnforcementStateResponse | null>(null)

  const [loading, setLoading] = useState(true)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false)
  const [retryAfterProfileSave, setRetryAfterProfileSave] = useState(false)

  const [selectedDuration, setSelectedDuration] = useState<number>(60)
  const [selectedGame, setSelectedGame] = useState('')
  const [selectedCommunicationMethod, setSelectedCommunicationMethod] = useState('')

  const loadBuyerEnforcement = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_user_enforcement_state', {
        p_user_id: userId,
      })

      if (error) {
        console.error('buyer enforcement state load error:', error)
        setBuyerEnforcement(null)
        return null
      }

      const next = (data || null) as EnforcementStateResponse | null
      setBuyerEnforcement(next)
      return next
    } catch (error) {
      console.error('buyer enforcement state threw:', error)
      setBuyerEnforcement(null)
      return null
    }
  }, [])

  const refreshBlockingState = useCallback(
    async (
      me: string,
      sellerProfile: GenericRow | null,
      options?: {
        force?: boolean
        showChecking?: boolean
      }
    ) => {
      const now = Date.now()

      if (
        !options?.force &&
        now - lastBlockingRefreshAtRef.current < BLOCKING_REFRESH_COOLDOWN_MS
      ) {
        return {
          nextSellerBusy: sellerBusy,
          nextSellerBusyReason: sellerBusyReason,
          nextBuyerBlocked: buyerBlocked,
          nextBuyerBlockingReason: buyerBlockingReason,
        }
      }

      if (blockingRefreshInFlightRef.current) {
        return {
          nextSellerBusy: sellerBusy,
          nextSellerBusyReason: sellerBusyReason,
          nextBuyerBlocked: buyerBlocked,
          nextBuyerBlockingReason: buyerBlockingReason,
        }
      }

      blockingRefreshInFlightRef.current = true
      if (options?.showChecking) setCheckingAvailability(true)

      let nextSellerBusy = false
      let nextSellerBusyReason: SellerAvailabilityReason = null

      let nextBuyerBlocked = false
      let nextBuyerBlockingReason: BuyerBlockingReason = null

      try {
        const buyerEnforcementState = await loadBuyerEnforcement(me)
        const buyerEnforcementStateValue =
          (buyerEnforcementState?.enforcement_state || 'good') as EnforcementState

        if (buyerEnforcementStateValue === 'restricted') {
          nextBuyerBlocked = true
          nextBuyerBlockingReason = 'restricted'
        } else if (buyerEnforcementStateValue === 'ban_review') {
          nextBuyerBlocked = true
          nextBuyerBlockingReason = 'ban_review'
        }

        if (!nextBuyerBlocked) {
          const { data: buyerPendingBookings, error: buyerPendingError } = await supabase
            .from('booking_requests')
            .select('id')
            .eq('buyer_id', me)
            .eq('status', 'pending')
            .limit(1)

          if (buyerPendingError) {
            console.error('buyer pending check error:', buyerPendingError)
          } else if ((buyerPendingBookings || []).length > 0) {
            nextBuyerBlocked = true
            nextBuyerBlockingReason = 'pending_booking'
          }
        }

        if (!nextBuyerBlocked) {
          const { data: buyerBlockingSessions, error: buyerSessionError } = await supabase
            .from('sessions')
            .select('id, status, buyer_completed_at')
            .eq('buyer_id', me)
            .or(
              [
                'status.eq.ready_to_start',
                'status.eq.active',
                'and(status.eq.awaiting_confirmation,buyer_completed_at.is.null)',
              ].join(',')
            )
            .limit(1)

          if (buyerSessionError) {
            console.error('buyer session check error:', buyerSessionError)
          } else {
            const safeBuyerBlockingSessions = (buyerBlockingSessions ?? []) as BuyerBlockingSessionRow[]

            if (safeBuyerBlockingSessions.length > 0) {
              const buyerBlockingSession = safeBuyerBlockingSessions[0]

              if (buyerBlockingSession?.status === 'ready_to_start') {
                nextBuyerBlocked = true
                nextBuyerBlockingReason = 'ready_to_start'
              } else if (buyerBlockingSession?.status === 'active') {
                nextBuyerBlocked = true
                nextBuyerBlockingReason = 'active'
              } else {
                nextBuyerBlocked = true
                nextBuyerBlockingReason = 'awaiting_confirmation_buyer_action'
              }
            }
          }
        }

        if (!sellerProfile?.is_online) {
          nextSellerBusy = true
          nextSellerBusyReason = 'offline'
        } else {
          const { data: sellerAvailabilityData, error: sellerAvailabilityError } =
            await supabase.rpc('get_seller_booking_availability', {
              p_seller_id: sellerId,
            })

          if (sellerAvailabilityError) {
            console.error('seller availability check error:', sellerAvailabilityError)
          } else {
            const availability = (sellerAvailabilityData || null) as SellerAvailabilityResponse | null

            if (availability?.is_bookable === false) {
              const reason = normalizeSellerAvailabilityReason(availability.reason)

              if (reason) {
                nextSellerBusy = true
                nextSellerBusyReason = reason
              }
            }
          }
        }

        setSellerBusy(nextSellerBusy)
        setSellerBusyReason(nextSellerBusyReason)
        setBuyerBlocked(nextBuyerBlocked)
        setBuyerBlockingReason(nextBuyerBlockingReason)
        lastBlockingRefreshAtRef.current = Date.now()

        return {
          nextSellerBusy,
          nextSellerBusyReason,
          nextBuyerBlocked,
          nextBuyerBlockingReason,
        }
      } finally {
        blockingRefreshInFlightRef.current = false
        setCheckingAvailability(false)
      }
    },
    [
      buyerBlocked,
      buyerBlockingReason,
      loadBuyerEnforcement,
      sellerBusy,
      sellerBusyReason,
      sellerId,
    ]
  )

  useEffect(() => {
    const loadInitial = async () => {
      if (authLoading) return

      setLoading(true)
      setErrorText('')
      setSuccessText('')

      if (!user?.id) {
        router.push('/login')
        return
      }

      const me = user.id
      setCurrentUserId(me)

      const { data: sellerData, error: sellerError } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, hourly_price, is_online'
        )
        .eq('id', sellerId)
        .maybeSingle()

      if (sellerError) {
        console.error('seller load error:', sellerError)
        setErrorText(sellerError.message || 'Seller profile could not be loaded.')
        setLoading(false)
        return
      }

      if (!sellerData) {
        setErrorText('Seller profile could not be loaded.')
        setLoading(false)
        return
      }

      setSeller(sellerData)

      if (!sellerData.is_online) {
        setSellerBusy(true)
        setSellerBusyReason('offline')
      }

      setLoading(false)

      void refreshBlockingState(me, sellerData, {
        force: true,
        showChecking: false,
      })
    }

    void loadInitial()
  }, [authLoading, refreshBlockingState, router, sellerId, user])

  const sellerName = useMemo(() => getSellerName(seller), [seller])
  const hourlyPrice = useMemo(() => getHourlyPrice(seller), [seller])
  const sellerAvailabilityCopy = useMemo(
    () => getSellerAvailabilityCopy(sellerBusyReason),
    [sellerBusyReason]
  )

  const buyerEnforcementMeta = useMemo(() => {
    const state = (buyerEnforcement?.enforcement_state || 'good') as EnforcementState
    return getEnforcementCardMeta(state)
  }, [buyerEnforcement])

  const buyerEnforcementSummary = useMemo(() => {
    if (!buyerEnforcement) return null

    return getEnforcementSummary(
      (buyerEnforcement.enforcement_state || 'good') as EnforcementState,
      Number(buyerEnforcement.active_strike_points || 0),
      buyerEnforcement.next_threshold ?? null
    )
  }, [buyerEnforcement])

  const hourCount = useMemo(() => selectedDuration / 60, [selectedDuration])

  const sessionPrice = useMemo(() => {
    return hourlyPrice * hourCount
  }, [hourCount, hourlyPrice])

  const submitBooking = async () => {
    if (!currentUserId) {
      setErrorText('You must be logged in.')
      return false
    }

    if (currentUserId === sellerId) {
      setErrorText('You cannot book yourself.')
      return false
    }

    if (!seller) {
      setErrorText('Seller profile is missing.')
      return false
    }

    if (buyerBlocked) {
      setErrorText(getBuyerBlockingMessage(buyerBlockingReason))
      return false
    }

    if (sellerBusy) {
      setErrorText(sellerAvailabilityCopy?.description || 'This seller is temporarily unavailable.')
      return false
    }

    if (!selectedGame) {
      setErrorText('Please select a game.')
      return false
    }

    if (!selectedCommunicationMethod) {
      setErrorText('Please select a communication method.')
      return false
    }

    if (hourlyPrice <= 0) {
      setErrorText('Seller hourly price is missing or invalid.')
      return false
    }

    if (![60, 120, 180].includes(selectedDuration)) {
      setErrorText('Please select a valid duration.')
      return false
    }

    setSubmitting(true)

    const basePriceCents = Math.round(sessionPrice * 100)

    const { data, error } = await supabase.rpc('create_booking_with_hold', {
      p_seller_id: sellerId,
      p_duration_minutes: selectedDuration,
      p_base_price_cents: basePriceCents,
      p_tip_cents: 0,
      p_processing_fee_cents: 0,
      p_game: selectedGame,
      p_communication_method: selectedCommunicationMethod,
      p_currency: 'USD',
    })

    if (error) {
      console.error('create_booking_with_hold error:', error)
      setErrorText(error.message || 'Booking could not be created.')
      setSubmitting(false)
      return false
    }

    if (!data?.success) {
      setErrorText(getFriendlyBookingRpcError(data))
      await refreshBlockingState(currentUserId, seller, {
        force: true,
        showChecking: false,
      })
      setSubmitting(false)
      return false
    }

    setSuccessText('Booking created successfully.')
    setSubmitting(false)

    if (!redirectStartedRef.current) {
      redirectStartedRef.current = true

      window.setTimeout(() => {
        router.push('/sessions')
      }, SUCCESS_REDIRECT_DELAY_MS)
    }

    return true
  }

  const handleConfirmBooking = async () => {
    setErrorText('')
    setSuccessText('')

    const now = Date.now()

    if (submitLockRef.current) {
      return
    }

    if (now - lastSubmitAtRef.current < SUBMIT_COOLDOWN_MS) {
      return
    }

    submitLockRef.current = true
    lastSubmitAtRef.current = now

    try {
      if (!currentUserId) {
        setErrorText('You must be logged in.')
        return
      }

      if (currentUserId === sellerId) {
        setErrorText('You cannot book yourself.')
        return
      }

      const { data: latestSeller, error: latestSellerError } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, hourly_price, is_online'
        )
        .eq('id', sellerId)
        .maybeSingle()

      if (latestSellerError) {
        console.error('latest seller check error:', latestSellerError)
        setErrorText(latestSellerError.message || 'Seller state could not be refreshed.')
        return
      }

      if (!latestSeller) {
        setErrorText('Seller profile could not be loaded.')
        return
      }

      setSeller(latestSeller)

      const freshState = await refreshBlockingState(currentUserId, latestSeller, {
        force: true,
        showChecking: true,
      })

      if (freshState.nextBuyerBlocked) {
        setErrorText(getBuyerBlockingMessage(freshState.nextBuyerBlockingReason))
        return
      }

      if (freshState.nextSellerBusy) {
        setErrorText(
          getSellerAvailabilityCopy(freshState.nextSellerBusyReason)?.description ||
          'This seller is temporarily unavailable.'
        )
        return
      }

      const { data: buyerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('country, gender, languages, communication_methods, primary_games')
        .eq('id', currentUserId)
        .single()

      if (profileError) {
        console.error('buyer profile check error:', profileError)
        setErrorText(profileError.message || 'Your profile could not be checked.')
        return
      }

      const completeness = checkBuyerProfileCompleteness(buyerProfile)

      if (!completeness.ok) {
        setRetryAfterProfileSave(true)
        setShowProfileCompletionModal(true)
        setErrorText(
          'Please complete your profile before booking. Country, gender, languages, communication methods, and primary games are required.'
        )
        return
      }

      await submitBooking()
    } finally {
      window.setTimeout(() => {
        submitLockRef.current = false
      }, SUBMIT_COOLDOWN_MS)
    }
  }

  const handleProfileCompletionSaved = async () => {
    setShowProfileCompletionModal(false)

    if (!retryAfterProfileSave) {
      return
    }

    setRetryAfterProfileSave(false)
    setErrorText('')

    window.setTimeout(() => {
      void handleConfirmBooking()
    }, SUBMIT_COOLDOWN_MS)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <div className="mx-auto max-w-[1160px] px-8 py-8">
          <p className="text-slate-300">Loading booking page...</p>
        </div>
      </main>
    )
  }

  return (
    <>
      <ProfileCompletionModal
        isOpen={showProfileCompletionModal}
        onClose={() => {
          setShowProfileCompletionModal(false)
          setRetryAfterProfileSave(false)
        }}
        userId={currentUserId}
        onSaved={() => {
          void handleProfileCompletionSaved()
        }}
      />

      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
              <h1 className="text-4xl font-bold">Book Session</h1>

              <p className="mt-3 text-slate-300">
                Booking with <span className="font-semibold text-white">{sellerName}</span>
              </p>

              <p className="mt-1 text-slate-400">
                Hourly price:{' '}
                <span className="font-semibold text-white">{formatMoney(hourlyPrice)}</span>
              </p>

              {checkingAvailability ? (
                <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sky-200">
                  <div className="font-semibold">Checking latest booking status...</div>
                  <div className="mt-1 text-sm opacity-95">
                    We are checking seller and buyer state before continuing.
                  </div>
                </div>
              ) : null}

              {buyerEnforcement ? (
                <div className={`mt-5 rounded-2xl border p-4 ${buyerEnforcementMeta.wrapClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{buyerEnforcementMeta.title}</div>
                      <div className="mt-1 text-sm opacity-95">
                        {buyerEnforcementMeta.description}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide opacity-80">
                        Strike points
                      </div>
                      <div className="mt-1 text-lg font-bold">
                        {Number(buyerEnforcement.active_strike_points || 0)}
                      </div>
                    </div>
                  </div>

                  {buyerEnforcementSummary ? (
                    <div className="mt-3 text-sm opacity-95">{buyerEnforcementSummary}</div>
                  ) : null}
                </div>
              ) : null}

              {sellerBusy && sellerAvailabilityCopy ? (
                <div
                  className={`mt-5 rounded-2xl border p-4 ${sellerAvailabilityCopy.tone === 'rose'
                      ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                    }`}
                >
                  <div className="font-semibold">{sellerAvailabilityCopy.title}</div>
                  <div className="mt-1 text-sm opacity-95">{sellerAvailabilityCopy.description}</div>
                </div>
              ) : null}

              {buyerBlocked ? (
                <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-200">
                  <div className="font-semibold">Booking is currently blocked</div>
                  <div className="mt-1 text-sm text-rose-100/90">
                    {getBuyerBlockingMessage(buyerBlockingReason)}
                  </div>
                </div>
              ) : null}

              <div className="mt-10">
                <p className="mb-4 text-xl font-semibold">Select Duration</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {DURATION_OPTIONS.map((option) => {
                    const isSelected = selectedDuration === option.minutes

                    return (
                      <button
                        key={option.minutes}
                        type="button"
                        disabled={submitting}
                        onClick={() => setSelectedDuration(option.minutes)}
                        className={`rounded-2xl border px-5 py-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected
                            ? 'border-indigo-400/50 bg-indigo-600 text-white'
                            : 'border-white/10 bg-[#1a2742] text-white hover:bg-[#243452]'
                          }`}
                      >
                        <div className="text-xl font-bold">{option.label}</div>
                        <div className="mt-2 text-sm opacity-90">
                          {formatMoney((hourlyPrice * option.minutes) / 60)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-10">
                <p className="mb-4 text-xl font-semibold">Select Game</p>
                <div className="flex flex-wrap gap-3">
                  {GAMES.map((game) => {
                    const isSelected = selectedGame === game

                    return (
                      <button
                        key={game}
                        type="button"
                        disabled={submitting}
                        onClick={() => setSelectedGame(game)}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-[#1a2742] text-white hover:bg-[#243452]'
                          }`}
                      >
                        {game}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-10">
                <p className="mb-4 text-xl font-semibold">Select Communication Method</p>
                <div className="flex flex-wrap gap-3">
                  {COMMUNICATION_METHODS.map((method) => {
                    const isSelected = selectedCommunicationMethod === method

                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={submitting}
                        onClick={() => setSelectedCommunicationMethod(method)}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-[#1a2742] text-white hover:bg-[#243452]'
                          }`}
                      >
                        {method}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <aside className="min-w-0">
              <div className="lg:sticky lg:top-24">
                <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-5 shadow-2xl">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold text-indigo-300">Booking Summary</h2>
                    <div className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-sm font-semibold text-indigo-200">
                      {getDurationLabel(selectedDuration)}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-[#050f26] p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Seller</div>
                      <div className="mt-2 text-base font-semibold text-white">{sellerName}</div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#050f26] p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Duration</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {getDurationLabel(selectedDuration)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#050f26] p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Game</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {selectedGame || 'No game selected'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#050f26] p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Communication
                      </div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {selectedCommunicationMethod || 'No method selected'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-[#061127] p-5">
                    <div className="mb-2 text-sm text-slate-400">
                      {getDurationLabel(selectedDuration)} @ {formatMoney(hourlyPrice)}/hour
                    </div>

                    <div className="flex items-center justify-between text-2xl font-bold">
                      <span>Price</span>
                      <span className="text-3xl text-emerald-400">{formatMoney(sessionPrice)}</span>
                    </div>
                  </div>

                  <p className="mt-5 text-center text-sm text-slate-400">
                    Payment is collected now and held securely until the session is settled.
                  </p>

                  {sellerBusy && sellerAvailabilityCopy ? (
                    <div
                      className={`mt-5 rounded-2xl border p-4 text-sm ${sellerAvailabilityCopy.tone === 'rose'
                          ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
                          : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                        }`}
                    >
                      {sellerAvailabilityCopy.description}
                    </div>
                  ) : null}

                  {buyerBlocked ? (
                    <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                      {getBuyerBlockingMessage(buyerBlockingReason)}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={submitting || checkingAvailability || sellerBusy || buyerBlocked}
                    onClick={() => void handleConfirmBooking()}
                    className="mt-5 w-full rounded-[20px] bg-indigo-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? 'Confirming Booking...'
                      : checkingAvailability
                        ? 'Checking Availability...'
                        : sellerBusyReason === 'offline'
                          ? 'Currently Offline'
                          : sellerBusyReason === 'restricted'
                            ? 'Seller Unavailable'
                            : sellerBusy
                              ? 'Currently Unavailable'
                              : buyerBlockingReason === 'restricted'
                                ? 'Booking Restricted'
                                : buyerBlockingReason === 'ban_review'
                                  ? 'Under Review'
                                  : buyerBlocked
                                    ? 'Resolve Current Flow First'
                                    : 'Confirm Booking'}
                  </button>

                  {errorText ? (
                    <p className="mt-5 text-base font-medium text-red-400">{errorText}</p>
                  ) : null}

                  {successText ? (
                    <p className="mt-5 text-base font-medium text-emerald-400">{successText}</p>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </>
  )
}
// END_FILE