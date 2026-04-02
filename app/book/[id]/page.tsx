'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../../components/TopNav'

type GenericRow = Record<string, any>

type BookedRow = {
  slot_time: string
}

type DayStatusRow = {
  slot_date: string
  open_count: number
  booked_count: number
  available_count: number
  is_closed: boolean
  is_full: boolean
}

type OpenAvailabilityRow = {
  slot_time: string
}

type DayOption = {
  value: string
  labelTop: string
  labelBottom: string
  shortStatus: string
  isClosed: boolean
  isFull: boolean
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

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

function formatMoney(amount: number) {
  return `₺${amount.toFixed(2)}`
}

function getTodayLocalDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function toDateStringLocal(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayTopLabel(date: Date, offset: number) {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

function getDayBottomLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
  })
}

function isPastHour(dateStr: string, time: string) {
  const now = new Date()
  const localNowDate = toDateStringLocal(now)
  if (dateStr < localNowDate) return true
  if (dateStr > localNowDate) return false

  const currentHour = now.getHours()
  const slotHour = Number(time.split(':')[0])
  return slotHour <= currentHour
}

function LegendChip({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-full ${className}`} />
      <span>{label}</span>
    </div>
  )
}

function formatSlotRange(slot: string) {
  const [hours, minutes] = slot.split(':').map(Number)
  const endHour = (hours + 1) % 24
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} - ${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export default function BookPage() {
  const params = useParams()
  const router = useRouter()
  const sellerId = params?.id as string

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [seller, setSeller] = useState<GenericRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  const [selectedDate, setSelectedDate] = useState(getTodayLocalDateString())
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [openSlots, setOpenSlots] = useState<string[]>([])
  const [selectedGame, setSelectedGame] = useState('')
  const [selectedCommunicationMethod, setSelectedCommunicationMethod] = useState('')
  const [tipInput, setTipInput] = useState('')
  const [dayOptions, setDayOptions] = useState<DayOption[]>([])
  const [dayOptionsLoading, setDayOptionsLoading] = useState(true)

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

      setCurrentUserId(session.user.id)

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
      setLoading(false)
    }

    void loadInitial()
  }, [router, sellerId])

  useEffect(() => {
    const loadDayOptions = async () => {
      if (!sellerId) {
        setDayOptions([])
        setDayOptionsLoading(false)
        return
      }

      setDayOptionsLoading(true)

      const startDate = getTodayLocalDateString()

      const { data, error } = await supabase.rpc('get_seller_booking_day_statuses', {
        p_seller_id: sellerId,
        p_start_date: startDate,
        p_day_count: 14,
      })

      if (error) {
        console.error('get_seller_booking_day_statuses error:', error)
        setDayOptions([])
        setDayOptionsLoading(false)
        return
      }

      const rows = (data || []) as DayStatusRow[]

      const mapped: DayOption[] = rows.map((row, index) => {
        const dateObj = new Date(`${row.slot_date}T12:00:00`)
        const isClosed = !!row.is_closed
        const isFull = !!row.is_full

        return {
          value: row.slot_date,
          labelTop: getDayTopLabel(dateObj, index),
          labelBottom: getDayBottomLabel(dateObj),
          shortStatus: isClosed ? 'Closed' : isFull ? 'Full' : 'Available',
          isClosed,
          isFull,
        }
      })

      setDayOptions(mapped)

      const stillValid = mapped.find((x) => x.value === selectedDate)
      if (!stillValid) {
        const firstUsable = mapped.find((x) => !x.isClosed && !x.isFull) || mapped[0]
        if (firstUsable) {
          setSelectedDate(firstUsable.value)
        }
      }

      setDayOptionsLoading(false)
    }

    void loadDayOptions()
  }, [sellerId, selectedDate])

  useEffect(() => {
    const loadSelectedDayData = async () => {
      if (!sellerId || !selectedDate) {
        setBookedSlots([])
        setOpenSlots([])
        return
      }

      const [bookedResult, openResult] = await Promise.all([
        supabase.rpc('get_booked_slots', {
          p_seller_id: sellerId,
          p_date: selectedDate,
        }),
        supabase
          .from('seller_date_availability_slots')
          .select('slot_time')
          .eq('seller_id', sellerId)
          .eq('slot_date', selectedDate),
      ])

      if (bookedResult.error) {
        console.error('get_booked_slots error:', bookedResult.error)
        setBookedSlots([])
      } else {
        const bookedRows = (bookedResult.data || []) as BookedRow[]
        setBookedSlots(bookedRows.map((row) => row.slot_time))
      }

      if (openResult.error) {
        console.error('seller_date_availability_slots error:', openResult.error)
        setOpenSlots([])
      } else {
        const openRows = (openResult.data || []) as OpenAvailabilityRow[]
        setOpenSlots(openRows.map((row) => row.slot_time))
      }
    }

    void loadSelectedDayData()
  }, [sellerId, selectedDate])

  useEffect(() => {
    setSelectedSlots((prev) => prev.filter((slot) => !bookedSlots.includes(slot)))
  }, [bookedSlots])

  const sellerName = useMemo(() => getSellerName(seller), [seller])
  const hourlyPrice = useMemo(() => getHourlyPrice(seller), [seller])

  const slotCount = selectedSlots.length
  const serviceAmount = useMemo(() => hourlyPrice * slotCount, [hourlyPrice, slotCount])

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
  }, [serviceAmount, tipAmount, processingFee])

  const selectedDayMeta = useMemo(() => {
    return dayOptions.find((item) => item.value === selectedDate) || null
  }, [dayOptions, selectedDate])

  const selectedSlotRanges = useMemo(() => {
    return [...selectedSlots].sort().map(formatSlotRange)
  }, [selectedSlots])

  const toggleSlot = (slot: string) => {
    if (bookedSlots.includes(slot)) return
    if (!openSlots.includes(slot)) return
    if (isPastHour(selectedDate, slot)) return

    setSelectedSlots((prev) => {
      if (prev.includes(slot)) {
        return prev.filter((item) => item !== slot)
      }
      return [...prev, slot].sort()
    })
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

    if (!seller) {
      setErrorText('Seller profile is missing.')
      return
    }

    if (!selectedDate) {
      setErrorText('Please select a date.')
      return
    }

    if (selectedDayMeta?.isClosed) {
      setErrorText('That day is closed.')
      return
    }

    if (selectedDayMeta?.isFull) {
      setErrorText('That day is fully booked.')
      return
    }

    if (selectedSlots.length === 0) {
      setErrorText('Please select at least one time slot.')
      return
    }

    if (!selectedGame) {
      setErrorText('Please select a game.')
      return
    }

    if (!selectedCommunicationMethod) {
      setErrorText('Please select a communication method.')
      return
    }

    if (hourlyPrice <= 0) {
      setErrorText('Seller hourly price is missing or invalid.')
      return
    }

    setSubmitting(true)

    const slotsPayload = selectedSlots.map((slot) => ({
      date: selectedDate,
      time: slot,
      starts_at_utc: null,
      ends_at_utc: null,
      seller_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }))

    const basePriceCents = Math.round(serviceAmount * 100)
    const tipCents = Math.round(tipAmount * 100)
    const processingFeeCents = Math.round(processingFee * 100)

    const { data, error } = await supabase.rpc('create_booking_with_hold_and_slots', {
      p_seller_id: sellerId,
      p_base_price_cents: basePriceCents,
      p_tip_cents: tipCents,
      p_processing_fee_cents: processingFeeCents,
      p_game: selectedGame,
      p_communication_method: selectedCommunicationMethod,
      p_currency: 'TRY',
      p_slots: slotsPayload,
    })

    if (error) {
      console.error('create_booking_with_hold_and_slots error:', error)
      setErrorText(error.message || 'Booking could not be created.')
      setSubmitting(false)
      return
    }

    if (!data?.success) {
      setErrorText(data?.message || 'Booking could not be created.')
      setSubmitting(false)
      return
    }

    setSuccessText('Booking created successfully.')
    setSelectedSlots([])
    setTipInput('')

    const [bookedResult, dayResult] = await Promise.all([
      supabase.rpc('get_booked_slots', {
        p_seller_id: sellerId,
        p_date: selectedDate,
      }),
      supabase.rpc('get_seller_booking_day_statuses', {
        p_seller_id: sellerId,
        p_start_date: getTodayLocalDateString(),
        p_day_count: 14,
      }),
    ])

    if (!bookedResult.error) {
      const bookedRows = (bookedResult.data || []) as BookedRow[]
      setBookedSlots(bookedRows.map((row) => row.slot_time))
    }

    if (!dayResult.error) {
      const rows = (dayResult.data || []) as DayStatusRow[]
      const mapped: DayOption[] = rows.map((row, index) => {
        const dateObj = new Date(`${row.slot_date}T12:00:00`)
        return {
          value: row.slot_date,
          labelTop: getDayTopLabel(dateObj, index),
          labelBottom: getDayBottomLabel(dateObj),
          shortStatus: row.is_closed ? 'Closed' : row.is_full ? 'Full' : 'Available',
          isClosed: !!row.is_closed,
          isFull: !!row.is_full,
        }
      })
      setDayOptions(mapped)
    }

    setSubmitting(false)

    window.setTimeout(() => {
      router.push('/sessions')
    }, 700)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white">
        <TopNav />
        <div className="mx-auto max-w-5xl px-6 py-10">
          <p className="text-slate-300">Loading booking page...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <TopNav />

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
          <h1 className="text-4xl font-bold">Book Session</h1>

          <p className="mt-3 text-slate-300">
            Booking with <span className="font-semibold text-white">{sellerName}</span>
          </p>

          <p className="mt-1 text-slate-400">
            Hourly price:{' '}
            <span className="font-semibold text-white">{formatMoney(hourlyPrice)}</span>
          </p>

          <div className="mt-8">
            <p className="mb-4 text-xl font-semibold">Select Day</p>

            {dayOptionsLoading ? (
              <p className="text-slate-400">Loading available days...</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                {dayOptions.map((day) => {
                  const isSelected = selectedDate === day.value

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => setSelectedDate(day.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-indigo-400/50 bg-indigo-600 text-white'
                          : day.isClosed
                          ? 'border-slate-700 bg-slate-800 text-slate-300'
                          : day.isFull
                          ? 'border-red-500/30 bg-red-500/15 text-red-200'
                          : 'border-emerald-400/20 bg-[#1a2742] text-white hover:bg-[#243452]'
                      }`}
                    >
                      <div className="text-base font-bold">{day.labelTop}</div>
                      <div className="mt-1 text-sm opacity-90">{day.labelBottom}</div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-80">
                        {day.shortStatus}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-4 text-sm text-slate-400">
              <LegendChip label="Available" className="bg-emerald-400" />
              <LegendChip label="Selected" className="bg-indigo-400" />
              <LegendChip label="Booked" className="bg-red-500" />
              <LegendChip label="Closed" className="bg-slate-500" />
              <LegendChip label="Past" className="bg-slate-700" />
            </div>
          </div>

          <div className="mt-8">
            <p className="mb-4 text-xl font-semibold">Select Time Slots</p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {TIME_SLOTS.map((slot) => {
                const isSelected = selectedSlots.includes(slot)
                const isBooked = bookedSlots.includes(slot)
                const isClosed = !openSlots.includes(slot)
                const isPast = isPastHour(selectedDate, slot)

                let className =
                  'rounded-2xl px-4 py-3 text-sm font-semibold transition '

                if (isPast) {
                  className += 'cursor-not-allowed bg-slate-900 text-slate-500'
                } else if (isBooked) {
                  className += 'cursor-not-allowed bg-red-600/90 text-white'
                } else if (isClosed) {
                  className += 'cursor-not-allowed bg-slate-800 text-slate-400'
                } else if (isSelected) {
                  className += 'bg-indigo-600 text-white'
                } else {
                  className += 'bg-[#1a2742] text-white ring-1 ring-emerald-400/20 hover:bg-[#243452]'
                }

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={isPast || isBooked || isClosed}
                    onClick={() => toggleSlot(slot)}
                    className={className}
                  >
                    {slot}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-4 text-sm text-slate-400">
              <LegendChip label="Available" className="bg-emerald-400" />
              <LegendChip label="Selected" className="bg-indigo-400" />
              <LegendChip label="Booked" className="bg-red-500" />
              <LegendChip label="Closed" className="bg-slate-500" />
              <LegendChip label="Past" className="bg-slate-700" />
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
            <p className="mt-3 text-sm text-slate-400">Tip goes fully to the GameMate.</p>
          </div>

          <div className="mt-10 rounded-[24px] border-2 border-red-500 bg-[#050f26] p-5">
            <div className="mb-3 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white">
              DEBUG NEW BOOK SUMMARY ACTIVE
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-indigo-300">Booking Summary</h2>
              <div className="rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-sm font-semibold text-indigo-200">
                {slotCount} hour{slotCount === 1 ? '' : 's'} selected
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#08122f] p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Date</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {selectedDate || 'No day selected'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#08122f] p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Hourly Price</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatMoney(hourlyPrice)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-[#08122f] p-4">
              <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">
                Selected Time Slots
              </div>

              {selectedSlotRanges.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedSlotRanges.map((slot) => (
                    <span
                      key={slot}
                      className="rounded-full bg-indigo-600/20 px-3 py-1.5 text-sm font-medium text-indigo-200"
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No time slots selected yet.</p>
              )}
            </div>
          </div>

          <div className="mt-10 rounded-[24px] border border-white/10 bg-[#061127] p-5">
            <div className="mb-2 text-sm text-slate-400">
              {slotCount} hour{slotCount === 1 ? '' : 's'} × {formatMoney(hourlyPrice)}
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

          <p className="mt-6 text-center text-sm text-slate-400">
            Booking will be created instantly after confirmation.
          </p>

          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirmBooking}
            className="mt-8 w-full rounded-[20px] bg-indigo-600 px-6 py-5 text-xl font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Confirming Booking...' : 'Confirm Booking'}
          </button>

          {errorText ? (
            <p className="mt-5 text-base font-medium text-red-400">{errorText}</p>
          ) : null}

          {successText ? (
            <p className="mt-5 text-base font-medium text-emerald-400">{successText}</p>
          ) : null}
        </div>
      </section>
    </main>
  )
}