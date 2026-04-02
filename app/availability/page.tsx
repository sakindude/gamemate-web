'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TopNav from '../../components/TopNav'
import { supabase } from '@/lib/supabase'

type AvailabilityRow = {
  id: string
  seller_id: string
  slot_date: string
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

type BookedRow = {
  slot_time: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
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

export default function AvailabilityPage() {
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [openSlotSet, setOpenSlotSet] = useState<Set<string>>(new Set())
  const [bookedSlotSet, setBookedSlotSet] = useState<Set<string>>(new Set())
  const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatusRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const nextDays = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 14 }, (_, index) => {
      const date = addDays(today, index)
      return {
        value: toDateStringLocal(date),
        labelTop: getDayTopLabel(date, index),
        labelBottom: getDayBottomLabel(date),
      }
    })
  }, [])

  const loadDayStatuses = useCallback(async (userId: string) => {
    const dayResult = await supabase.rpc('get_seller_booking_day_statuses', {
      p_seller_id: userId,
      p_start_date: nextDays[0]?.value || toDateStringLocal(new Date()),
      p_day_count: 14,
    })

    if (dayResult.error) {
      console.error(dayResult.error)
      return
    }

    const statusMap: Record<string, DayStatusRow> = {}
    ;((dayResult.data || []) as DayStatusRow[]).forEach((row) => {
      statusMap[row.slot_date] = row
    })
    setDayStatuses(statusMap)
  }, [nextDays])

  const loadSelectedDateState = useCallback(async (userId: string, date: string) => {
    const [openResult, bookedResult] = await Promise.all([
      supabase
        .from('seller_date_availability_slots')
        .select('id, seller_id, slot_date, slot_time')
        .eq('seller_id', userId)
        .eq('slot_date', date),
      supabase.rpc('get_booked_slots', {
        p_seller_id: userId,
        p_date: date,
      }),
    ])

    if (openResult.error) {
      console.error(openResult.error)
      setMessage(openResult.error.message || 'Could not load availability.')
      setMessageType('error')
      return
    }

    if (bookedResult.error) {
      console.error(bookedResult.error)
      setMessage(bookedResult.error.message || 'Could not load booked slots.')
      setMessageType('error')
      return
    }

    const openRows = (openResult.data || []) as AvailabilityRow[]
    const bookedRows = (bookedResult.data || []) as BookedRow[]

    setOpenSlotSet(new Set(openRows.map((row) => row.slot_time)))
    setBookedSlotSet(new Set(bookedRows.map((row) => row.slot_time)))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    setMessageType('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setMessage('You must be logged in.')
      setMessageType('error')
      setLoading(false)
      return
    }

    const userId = user.id
    setMyUserId(userId)

    const defaultDate = selectedDate || nextDays[0]?.value || ''
    if (!selectedDate && defaultDate) {
      setSelectedDate(defaultDate)
    }

    await Promise.all([
      loadDayStatuses(userId),
      loadSelectedDateState(userId, defaultDate),
    ])

    setLoading(false)
  }, [nextDays, selectedDate, loadDayStatuses, loadSelectedDateState])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!myUserId || !selectedDate) return
    void loadSelectedDateState(myUserId, selectedDate)
  }, [myUserId, selectedDate, loadSelectedDateState])

  const toggleSlot = (time: string) => {
    if (!selectedDate) return
    if (isPastHour(selectedDate, time)) return
    if (bookedSlotSet.has(time)) return

    const next = new Set(openSlotSet)

    if (next.has(time)) {
      next.delete(time)
    } else {
      next.add(time)
    }

    setOpenSlotSet(next)
  }

  const saveSelectedDay = async () => {
    if (!myUserId || !selectedDate) return

    setSaving(true)
    setMessage('')
    setMessageType('')

    const desiredTimes = HOURS.filter(
      (time) => openSlotSet.has(time) || bookedSlotSet.has(time)
    )

    const { error: deleteError } = await supabase
      .from('seller_date_availability_slots')
      .delete()
      .eq('seller_id', myUserId)
      .eq('slot_date', selectedDate)

    if (deleteError) {
      console.error(deleteError)
      setMessage(deleteError.message || 'Could not save availability.')
      setMessageType('error')
      setSaving(false)
      return
    }

    if (desiredTimes.length > 0) {
      const insertRows = desiredTimes.map((time) => ({
        seller_id: myUserId,
        slot_date: selectedDate,
        slot_time: time,
      }))

      const { error: insertError } = await supabase
        .from('seller_date_availability_slots')
        .insert(insertRows)

      if (insertError) {
        console.error(insertError)
        setMessage(insertError.message || 'Could not save availability.')
        setMessageType('error')
        setSaving(false)
        return
      }
    }

    setMessage('Availability saved.')
    setMessageType('success')
    setSaving(false)

    await Promise.all([
      loadDayStatuses(myUserId),
      loadSelectedDateState(myUserId, selectedDate),
    ])
  }

  const currentDayStatus = dayStatuses[selectedDate]
  const selectedDayOpenTimes = HOURS.filter((time) => openSlotSet.has(time))

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <TopNav />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Availability</h1>
            <p className="mt-3 text-lg text-slate-400">
              Open the exact dates and hours you want to work. Booked hours stay locked.
            </p>
          </div>

          <button
            type="button"
            onClick={saveSelectedDay}
            disabled={saving || !selectedDate}
            className="rounded-2xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Selected Day'}
          </button>
        </div>

        {message ? (
          <p className={`mb-5 text-base font-medium ${messageType === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {message}
          </p>
        ) : null}

        <div className="mb-8">
          <p className="mb-4 text-xl font-semibold">Select Day</p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {nextDays.map((day) => {
              const status = dayStatuses[day.value]
              const isSelected = selectedDate === day.value
              const isClosed = status?.is_closed ?? true
              const isFull = status?.is_full ?? false

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => setSelectedDate(day.value)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    isSelected
                      ? 'border-indigo-400/50 bg-indigo-600 text-white'
                      : isClosed
                      ? 'border-slate-700 bg-slate-800 text-slate-300'
                      : isFull
                      ? 'border-red-500/30 bg-red-500/15 text-red-200'
                      : 'border-emerald-400/20 bg-[#1a2742] text-white hover:bg-[#243452]'
                  }`}
                >
                  <div className="text-base font-bold">{day.labelTop}</div>
                  <div className="mt-1 text-sm opacity-90">{day.labelBottom}</div>
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-80">
                    {isClosed ? 'Closed' : isFull ? 'Full' : 'Open'}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-4 text-sm text-slate-400">
            <LegendChip label="Open" className="bg-emerald-400" />
            <LegendChip label="Closed" className="bg-slate-500" />
            <LegendChip label="Full" className="bg-red-500" />
            <LegendChip label="Selected" className="bg-indigo-400" />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-2xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">24 Hour Availability</h2>
              <p className="mt-2 text-slate-400">
                Pick the hours you want to work on {selectedDate || 'the selected day'}.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#061127] px-4 py-3 text-sm text-slate-300">
              Open slots this day:{' '}
              <span className="font-bold text-white">{selectedDayOpenTimes.length}</span>
              {currentDayStatus ? (
                <>
                  {' '}• Booked:{' '}
                  <span className="font-bold text-white">{currentDayStatus.booked_count}</span>
                </>
              ) : null}
            </div>
          </div>

          {loading ? (
            <p className="text-slate-300">Loading availability...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {HOURS.map((time) => {
                  const isOpen = openSlotSet.has(time)
                  const isBooked = bookedSlotSet.has(time)
                  const isPast = selectedDate ? isPastHour(selectedDate, time) : false

                  let className =
                    'rounded-2xl px-4 py-3 text-sm font-semibold transition '

                  if (isPast) {
                    className += 'cursor-not-allowed bg-slate-900 text-slate-500'
                  } else if (isBooked) {
                    className += 'cursor-not-allowed bg-red-600/90 text-white'
                  } else if (isOpen) {
                    className += 'bg-indigo-600 text-white'
                  } else {
                    className += 'bg-[#1a2742] text-slate-300 hover:bg-[#243452]'
                  }

                  return (
                    <button
                      key={time}
                      type="button"
                      disabled={isPast || isBooked}
                      onClick={() => toggleSlot(time)}
                      className={className}
                    >
                      {time}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-4 text-sm text-slate-400">
                <LegendChip label="Open" className="bg-indigo-400" />
                <LegendChip label="Booked / Locked" className="bg-red-500" />
                <LegendChip label="Closed" className="bg-slate-500" />
                <LegendChip label="Past" className="bg-slate-700" />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}