'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../../components/TopNav'
import ProfileCompletionModal from '@/components/ProfileCompletionModal'
import { checkBuyerProfileCompleteness } from '@/lib/profile-completeness'

type GenericRow = Record<string, any>

type SellerAvailabilityReason =
  | 'offline'
  | 'pending_booking'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_seller_action'
  | null

type BuyerBlockingReason =
  | 'pending_booking'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_buyer_action'
  | null

type SellerBlockingSessionRow = {
  id: string
  status: string
  seller_completed_at: string | null
}

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

function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`
}

function getSellerName(row: GenericRow | null) {
  if (!row) return 'GameMate'

  return (
    row.username ||
    row.display_name ||
    row.full_name ||
    row.nickname ||
    row.name ||
    'GameMate'
  )
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

function getSellerAvailabilityCopy(reason: SellerAvailabilityReason) {
  switch (reason) {
    case 'offline':
      return {
        title: 'Currently offline',
        description:
          'This GameMate is offline right now. You can still view the profile and chat, but booking is temporarily unavailable.',
      }
    case 'pending_booking':
      return {
        title: 'Incoming booking already exists',
        description:
          'This GameMate already has a pending booking request. New bookings are blocked until that request is accepted, rejected, or times out.',
      }
    case 'ready_to_start':
      return {
        title: 'Session reserved',
        description:
          'This GameMate already has an accepted session waiting to start. New bookings are blocked until that flow is resolved.',
      }
    case 'active':
      return {
        title: 'Currently busy',
        description:
          'This GameMate is in an active session right now. You can still view the profile and chat, but booking is temporarily unavailable.',
      }
    case 'awaiting_confirmation_seller_action':
      return {
        title: 'Seller action still required',
        description:
          'This GameMate still has a session waiting for seller-side completion. New bookings stay blocked until that is finished.',
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
    default:
      return 'You already have an unfinished booking or session.'
  }
}

export default function BookPage() {
  const params = useParams()
  const router = useRouter()
  const sellerId = params?.id as string

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [seller, setSeller] = useState<GenericRow | null>(null)

  const [sellerBusy, setSellerBusy] = useState(false)
  const [sellerBusyReason, setSellerBusyReason] = useState<SellerAvailabilityReason>(null)

  const [buyerBlocked, setBuyerBlocked] = useState(false)
  const [buyerBlockingReason, setBuyerBlockingReason] = useState<BuyerBlockingReason>(null)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [showProfileCompletionModal, setShowProfileCompletionModal] = useState(false)
  const [retryAfterProfileSave, setRetryAfterProfileSave] = useState(false)

  const [selectedDuration, setSelectedDuration] = useState<number>(60)
  const [selectedGame, setSelectedGame] = useState('')
  const [selectedCommunicationMethod, setSelectedCommunicationMethod] = useState('')
  const [tipInput, setTipInput] = useState('')

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true)
      setErrorText('')
      setSuccessText('')

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError || !session?.user) {
        router.push('/login')
        return
      }

      const me = session.user.id
      setCurrentUserId(me)

      const { data: sellerData, error: sellerError } = await supabase
        .from('profiles')
        .select('*')
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

      const [
        { data: sellerPendingBookings, error: sellerPendingError },
        { data: sellerBlockingSessions, error: sellerSessionError },
        { data: buyerPendingBookings, error: buyerPendingError },
        { data: buyerBlockingSessions, error: buyerSessionError },
      ] = await Promise.all([
        supabase
          .from('booking_requests')
          .select('id')
          .eq('seller_id', sellerId)
          .eq('status', 'pending')
          .limit(1),

        supabase
          .from('sessions')
          .select('id, status, seller_completed_at')
          .eq('seller_id', sellerId)
          .or(
            [
              'status.eq.ready_to_start',
              'status.eq.active',
              'and(status.eq.awaiting_confirmation,seller_completed_at.is.null)',
            ].join(',')
          )
          .limit(1),

        supabase
          .from('booking_requests')
          .select('id')
          .eq('buyer_id', me)
          .eq('status', 'pending')
          .limit(1),

        supabase
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
          .limit(1),
      ])

      if (sellerPendingError) {
        console.error('seller pending check error:', sellerPendingError)
      }

      if (sellerSessionError) {
        console.error('seller session check error:', sellerSessionError)
      }

      if (buyerPendingError) {
        console.error('buyer pending check error:', buyerPendingError)
      }

      if (buyerSessionError) {
        console.error('buyer session check error:', buyerSessionError)
      }

      const safeSellerPendingBookings = sellerPendingBookings ?? []
      const safeSellerBlockingSessions =
        (sellerBlockingSessions ?? []) as SellerBlockingSessionRow[]

      const safeBuyerPendingBookings = buyerPendingBookings ?? []
      const safeBuyerBlockingSessions =
        (buyerBlockingSessions ?? []) as BuyerBlockingSessionRow[]

      if (!sellerData.is_online) {
        setSellerBusy(true)
        setSellerBusyReason('offline')
      } else if (safeSellerPendingBookings.length > 0) {
        setSellerBusy(true)
        setSellerBusyReason('pending_booking')
      } else if (safeSellerBlockingSessions.length > 0) {
        const sellerBlockingSession = safeSellerBlockingSessions[0]

        if (sellerBlockingSession?.status === 'ready_to_start') {
          setSellerBusy(true)
          setSellerBusyReason('ready_to_start')
        } else if (sellerBlockingSession?.status === 'active') {
          setSellerBusy(true)
          setSellerBusyReason('active')
        } else {
          setSellerBusy(true)
          setSellerBusyReason('awaiting_confirmation_seller_action')
        }
      } else {
        setSellerBusy(false)
        setSellerBusyReason(null)
      }

      if (safeBuyerPendingBookings.length > 0) {
        setBuyerBlocked(true)
        setBuyerBlockingReason('pending_booking')
      } else if (safeBuyerBlockingSessions.length > 0) {
        const buyerBlockingSession = safeBuyerBlockingSessions[0]

        if (buyerBlockingSession?.status === 'ready_to_start') {
          setBuyerBlocked(true)
          setBuyerBlockingReason('ready_to_start')
        } else if (buyerBlockingSession?.status === 'active') {
          setBuyerBlocked(true)
          setBuyerBlockingReason('active')
        } else {
          setBuyerBlocked(true)
          setBuyerBlockingReason('awaiting_confirmation_buyer_action')
        }
      } else {
        setBuyerBlocked(false)
        setBuyerBlockingReason(null)
      }

      setLoading(false)
    }

    void loadInitial()
  }, [router, sellerId])

  const sellerName = useMemo(() => getSellerName(seller), [seller])
  const hourlyPrice = useMemo(() => getHourlyPrice(seller), [seller])
  const sellerAvailabilityCopy = useMemo(
    () => getSellerAvailabilityCopy(sellerBusyReason),
    [sellerBusyReason]
  )

  const hourCount = useMemo(() => selectedDuration / 60, [selectedDuration])

  const serviceAmount = useMemo(() => {
    return hourlyPrice * hourCount
  }, [hourCount, hourlyPrice])

  const tipAmount = useMemo(() => {
    const raw = Number(tipInput || '0')
    if (Number.isNaN(raw) || raw < 0) return 0
    return raw
  }, [tipInput])

  const processingFee = useMemo(() => {
    return serviceAmount * 0.03
  }, [serviceAmount])

  const totalAmount = useMemo(() => {
    return serviceAmount + tipAmount + processingFee
  }, [processingFee, serviceAmount, tipAmount])

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
      if (sellerBusyReason === 'offline') {
        setErrorText('This user is offline right now.')
      } else if (sellerBusyReason === 'pending_booking') {
        setErrorText('This user already has a pending booking request.')
      } else if (sellerBusyReason === 'ready_to_start') {
        setErrorText('This user already has a session waiting to start.')
      } else if (sellerBusyReason === 'active') {
        setErrorText('This user is currently in an active session.')
      } else {
        setErrorText('This user still has an unfinished seller-side session flow.')
      }
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

    const basePriceCents = Math.round(serviceAmount * 100)
    const tipCents = Math.round(tipAmount * 100)
    const processingFeeCents = Math.round(processingFee * 100)

    const { data, error } = await supabase.rpc('create_booking_with_hold', {
      p_seller_id: sellerId,
      p_duration_minutes: selectedDuration,
      p_base_price_cents: basePriceCents,
      p_tip_cents: tipCents,
      p_processing_fee_cents: processingFeeCents,
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
      setErrorText(data?.message || 'Booking could not be created.')
      setSubmitting(false)
      return false
    }

    setSuccessText('Booking created successfully.')
    setTipInput('')
    setSubmitting(false)

    window.setTimeout(() => {
      router.push('/sessions')
    }, 700)

    return true
  }

  const handleConfirmBooking = async () => {
    setErrorText('')
    setSuccessText('')

    if (!currentUserId) {
      setErrorText('You must be logged in.')
      return
    }

    if (currentUserId === sellerId) {
      setErrorText('You cannot book yourself.')
      return
    }

    if (buyerBlocked) {
      setErrorText(getBuyerBlockingMessage(buyerBlockingReason))
      return
    }

    if (sellerBusy) {
      if (sellerBusyReason === 'offline') {
        setErrorText('This user is offline right now.')
      } else if (sellerBusyReason === 'pending_booking') {
        setErrorText('This user already has a pending booking request.')
      } else if (sellerBusyReason === 'ready_to_start') {
        setErrorText('This user already has a session waiting to start.')
      } else if (sellerBusyReason === 'active') {
        setErrorText('This user is currently in an active session.')
      } else {
        setErrorText('This user still has an unfinished seller-side session flow.')
      }
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
  }

  const handleProfileCompletionSaved = async () => {
    setShowProfileCompletionModal(false)

    if (!retryAfterProfileSave) {
      return
    }

    setRetryAfterProfileSave(false)
    setErrorText('')

    if (buyerBlocked) {
      setErrorText(getBuyerBlockingMessage(buyerBlockingReason))
      return
    }

    if (sellerBusy) {
      if (sellerBusyReason === 'offline') {
        setErrorText('This user is offline right now.')
      } else if (sellerBusyReason === 'pending_booking') {
        setErrorText('This user already has a pending booking request.')
      } else if (sellerBusyReason === 'ready_to_start') {
        setErrorText('This user already has a session waiting to start.')
      } else if (sellerBusyReason === 'active') {
        setErrorText('This user is currently in an active session.')
      } else {
        setErrorText('This user still has an unfinished seller-side session flow.')
      }
      return
    }

    await submitBooking()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <TopNav />
        <div className="mx-auto max-w-6xl px-6 py-10">
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
        <TopNav />

        <section className="mx-auto max-w-6xl px-6 py-10">
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

              {sellerBusy && sellerAvailabilityCopy ? (
                <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-amber-200">
                  <div className="font-semibold">{sellerAvailabilityCopy.title}</div>
                  <div className="mt-1 text-sm text-amber-100/90">
                    {sellerAvailabilityCopy.description}
                  </div>
                </div>
              ) : null}

              {buyerBlocked ? (
                <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-200">
                  <div className="font-semibold">You already have an unresolved flow</div>
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
                        onClick={() => setSelectedDuration(option.minutes)}
                        className={`rounded-2xl border px-5 py-5 text-left transition ${
                          isSelected
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
                        onClick={() => setSelectedGame(game)}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                          isSelected
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
                        onClick={() => setSelectedCommunicationMethod(method)}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                          isSelected
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

              <div className="mt-10">
                <label className="mb-3 block text-xl font-semibold">Tip (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tipInput}
                  onChange={(e) => setTipInput(e.target.value)}
                  placeholder="0"
                  className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1d2a44] px-4 py-4 text-lg text-white outline-none"
                />
                <p className="mt-3 text-sm text-slate-400">Tip goes fully to the seller.</p>
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
                      <div className="text-xs uppercase tracking-wide text-slate-400">Communication</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {selectedCommunicationMethod || 'No method selected'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-[#061127] p-5">
                    <div className="mb-2 text-sm text-slate-400">
                      {getDurationLabel(selectedDuration)} @ {formatMoney(hourlyPrice)}/hour
                    </div>

                    <div className="mb-3 flex items-center justify-between text-lg">
                      <span className="text-slate-200">Service</span>
                      <span className="font-medium text-white">{formatMoney(serviceAmount)}</span>
                    </div>

                    <div className="mb-3 flex items-center justify-between text-lg">
                      <span className="text-slate-200">Tip</span>
                      <span className="font-medium text-white">{formatMoney(tipAmount)}</span>
                    </div>

                    <div className="mb-4 flex items-center justify-between text-lg">
                      <span className="text-slate-200">Processing fee</span>
                      <span className="font-medium text-white">{formatMoney(processingFee)}</span>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <div className="flex items-center justify-between text-2xl font-bold">
                        <span>Total</span>
                        <span className="text-3xl text-emerald-400">{formatMoney(totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 text-center text-sm text-slate-400">
                    Payment is collected now and held securely until the session is settled.
                  </p>

                  {sellerBusy && sellerAvailabilityCopy ? (
                    <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-200">
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
                    disabled={submitting || sellerBusy || buyerBlocked}
                    onClick={() => void handleConfirmBooking()}
                    className="mt-5 w-full rounded-[20px] bg-indigo-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? 'Confirming Booking...'
                      : sellerBusyReason === 'offline'
                      ? 'Currently Offline'
                      : sellerBusy
                      ? 'Currently Unavailable'
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