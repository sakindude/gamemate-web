// FILE START: app/profile-edit/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'
import {
  COMMUNICATION_OPTIONS,
  COUNTRY_OPTIONS,
  GAME_OPTIONS,
  LANGUAGE_OPTIONS,
} from '@/lib/options'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  country: string | null
  timezone: string | null
  timezone_confirmed: boolean | null
  gender: string | null
  hourly_price: number | null
  is_seller: boolean | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
  username_updated_at: string | null
  display_name_updated_at: string | null
}

type AvailabilityRow = {
  user_id: string
  day_of_week: number
  hour: number
}

type SlotKey = string

const DAYS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const makeKey = (day: number, hour: number) => `${day}-${hour}`
const parseHour = (time: string) => Number(time.split(':')[0])

const formatRange = (hour: number) => {
  const start = String(hour).padStart(2, '0') + ':00'
  const end = String((hour + 1) % 24).padStart(2, '0') + ':00'
  return `${start} - ${end}`
}

const getWeekdayFromDateString = (dateStr: string) => {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay()
}

function availabilityStateLabel(active: boolean, locked: boolean) {
  if (locked) return 'Reserved'
  if (active) return 'Available'
  return 'Off'
}

function SelectPanel({
  title,
  options,
  selected,
  onChange,
  search,
  setSearch,
  placeholder,
}: {
  title: string
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
  search: string
  setSearch: (value: string) => void
  placeholder: string
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((item) => item.toLowerCase().includes(q))
  }, [options, search])

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item))
    } else {
      onChange([...selected, item])
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
          {selected.length} selected
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none"
        placeholder={placeholder}
      />

      <div className="mb-3 flex max-h-20 flex-wrap gap-2 overflow-y-auto rounded-xl bg-slate-900 p-2">
        {selected.length > 0 ? (
          selected.map((item) => (
            <button
              key={`selected-${title}-${item}`}
              type="button"
              onClick={() => toggle(item)}
              className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white"
            >
              {item} ×
            </button>
          ))
        ) : (
          <span className="text-xs text-slate-500">Nothing selected yet</span>
        )}
      </div>

      <div className="h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-2">
        {filtered.length > 0 ? (
          <div className="space-y-1">
            {filtered.map((item) => {
              const checked = selected.includes(item)

              return (
                <label
                  key={`${title}-${item}`}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-200">{item}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="px-2 py-3 text-sm text-slate-500">No results</div>
        )}
      </div>
    </div>
  )
}

export default function ProfileEditPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false)
  const [gender, setGender] = useState('')
  const [hourlyPrice, setHourlyPrice] = useState('')
  const [isSeller, setIsSeller] = useState(false)

  const [languages, setLanguages] = useState<string[]>([])
  const [communicationMethods, setCommunicationMethods] = useState<string[]>([])
  const [primaryGames, setPrimaryGames] = useState<string[]>([])

  const [languageSearch, setLanguageSearch] = useState('')
  const [communicationSearch, setCommunicationSearch] = useState('')
  const [gameSearch, setGameSearch] = useState('')

  const [selectedSlots, setSelectedSlots] = useState<Set<SlotKey>>(new Set())
  const [lockedSlots, setLockedSlots] = useState<Set<SlotKey>>(new Set())
  const [selectedDay, setSelectedDay] = useState<number>(1)

  const visibleCountries = useMemo(() => COUNTRY_OPTIONS, [])
  const selectedCount = useMemo(() => selectedSlots.size, [selectedSlots])

  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const timezoneOptions = useMemo(() => {
    try {
      const values = (Intl as any).supportedValuesOf?.('timeZone')
      return Array.isArray(values) && values.length > 0 ? values : ['UTC']
    } catch {
      return ['UTC']
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.push('/login')
        return
      }

      setUserEmail(session.user.email || '')

      const today = new Date().toISOString().split('T')[0]

      const [
        { data: profileData, error: profileError },
        { data: slotsData, error: slotsError },
        { data: reservedData, error: reservedError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, username, display_name, bio, country, timezone, timezone_confirmed, gender, hourly_price, is_seller, primary_games, languages, communication_methods, username_updated_at, display_name_updated_at'
          )
          .eq('id', session.user.id)
          .single(),
        supabase
          .from('availability_slots')
          .select('user_id, day_of_week, hour')
          .eq('user_id', session.user.id),
        supabase
          .from('booking_request_slots')
          .select(`
            date,
            time,
            booking_requests!inner (
              seller_id,
              status
            )
          `)
          .eq('booking_requests.seller_id', session.user.id)
          .gte('date', today)
          .in('booking_requests.status', ['pending', 'accepted']),
      ])

      if (profileError) {
        setMessage(profileError.message)
        setMessageType('error')
        setLoading(false)
        return
      }

      const row = profileData as ProfileRow
      setProfile(row)
      setUsername(row.username || '')
      setDisplayName(row.display_name || '')
      setBio(row.bio || '')
      setCountry(row.country || '')
      setTimezone(row.timezone || browserTimezone || 'UTC')
      setTimezoneConfirmed(!!row.timezone_confirmed)
      setGender(row.gender || '')
      setHourlyPrice(row.hourly_price ? String(row.hourly_price) : '')
      setIsSeller(!!row.is_seller)
      setLanguages(row.languages || [])
      setCommunicationMethods(row.communication_methods || [])
      setPrimaryGames(row.primary_games || [])

      if (!slotsError) {
        const selected = new Set<SlotKey>()
        ;((slotsData || []) as AvailabilityRow[]).forEach((slot) => {
          selected.add(makeKey(slot.day_of_week, slot.hour))
        })
        setSelectedSlots(selected)
      }

      if (!reservedError) {
        const locked = new Set<SlotKey>()
        const rows = (reservedData || []) as any[]

        rows.forEach((slot) => {
          const dow = getWeekdayFromDateString(slot.date)
          const hour = parseHour(slot.time)
          locked.add(makeKey(dow, hour))
        })

        setLockedSlots(locked)
      }

      setLoading(false)
    }

    load()
  }, [router, browserTimezone])

  useEffect(() => {
    if (!profile) return
    if (timezone !== (profile.timezone || browserTimezone)) {
      setTimezoneConfirmed(false)
    }
  }, [timezone, profile, browserTimezone])

  const toggleSlot = (day: number, hour: number) => {
    const key = makeKey(day, hour)

    if (lockedSlots.has(key) && selectedSlots.has(key)) return

    const next = new Set(selectedSlots)

    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }

    setSelectedSlots(next)
  }

  const confirmTimezone = () => {
    setTimezoneConfirmed(true)
    setMessage('Timezone confirmed. Save profile to apply it.')
    setMessageType('success')
  }

  const handleSave = async () => {
    setMessage('')
    setMessageType('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      setMessage('Login required')
      setMessageType('error')
      return
    }

    if (!displayName.trim()) {
      setMessage('Display name is required')
      setMessageType('error')
      return
    }

    if (!username.trim()) {
      setMessage('Username is required')
      setMessageType('error')
      return
    }

    if (!country.trim()) {
      setMessage('Country is required')
      setMessageType('error')
      return
    }

    if (!timezone.trim()) {
      setMessage('Timezone is required')
      setMessageType('error')
      return
    }

    if (!timezoneConfirmed) {
      setMessage('Please confirm your timezone before saving.')
      setMessageType('error')
      return
    }

    if (!gender.trim()) {
      setMessage('Gender is required')
      setMessageType('error')
      return
    }

    if (languages.length === 0) {
      setMessage('Select at least 1 language')
      setMessageType('error')
      return
    }

    if (communicationMethods.length === 0) {
      setMessage('Select at least 1 communication method')
      setMessageType('error')
      return
    }

    if (primaryGames.length === 0) {
      setMessage('Select at least 1 game')
      setMessageType('error')
      return
    }

    if (isSeller) {
      const price = Number(hourlyPrice || 0)

      if (!price || price < 1) {
        setMessage('Minimum price is 1')
        setMessageType('error')
        return
      }

      if (price > 1000) {
        setMessage('Maximum price is 1000')
        setMessageType('error')
        return
      }
    }

    const usernameChanged = username.trim() !== (profile?.username || '').trim()
    const displayNameChanged =
      displayName.trim() !== (profile?.display_name || '').trim()

    if (usernameChanged && profile?.username_updated_at) {
      const now = new Date()
      const last = new Date(profile.username_updated_at)
      const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)

      if (diffDays < 7) {
        setMessage('Username can only be changed once every 7 days')
        setMessageType('error')
        return
      }
    }

    if (displayNameChanged && profile?.display_name_updated_at) {
      const now = new Date()
      const last = new Date(profile.display_name_updated_at)
      const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)

      if (diffDays < 7) {
        setMessage('Display name can only be changed once every 7 days')
        setMessageType('error')
        return
      }
    }

    setSaving(true)

    const payload = {
      id: session.user.id,
      email: session.user.email,
      username: username.trim(),
      display_name: displayName.trim(),
      bio: bio.trim(),
      country: country || null,
      timezone: timezone.trim(),
      timezone_confirmed: true,
      gender: gender || null,
      hourly_price: hourlyPrice ? Number(hourlyPrice) : null,
      is_seller: isSeller,
      primary_games: primaryGames,
      languages,
      communication_methods: communicationMethods,
      username_updated_at: usernameChanged
        ? new Date().toISOString()
        : profile?.username_updated_at || null,
      display_name_updated_at: displayNameChanged
        ? new Date().toISOString()
        : profile?.display_name_updated_at || null,
    }

    const { error: profileError } = await supabase.from('profiles').upsert(payload)

    if (profileError) {
      setSaving(false)
      setMessage(profileError.message)
      setMessageType('error')
      return
    }

    if (isSeller) {
      const rows = [...selectedSlots].map((key) => {
        const [day, hour] = key.split('-').map(Number)
        return {
          user_id: session.user.id,
          day_of_week: day,
          hour,
        }
      })

      const { error: deleteError } = await supabase
        .from('availability_slots')
        .delete()
        .eq('user_id', session.user.id)

      if (deleteError) {
        setSaving(false)
        setMessage(deleteError.message)
        setMessageType('error')
        return
      }

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('availability_slots')
          .insert(rows)

        if (insertError) {
          setSaving(false)
          setMessage(insertError.message)
          setMessageType('error')
          return
        }
      }
    }

    setSaving(false)
    setMessage('Profile saved successfully.')
    setMessageType('success')

    const { data: refreshed } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, bio, country, timezone, timezone_confirmed, gender, hourly_price, is_seller, primary_games, languages, communication_methods, username_updated_at, display_name_updated_at'
      )
      .eq('id', session.user.id)
      .single()

    if (refreshed) {
      setProfile(refreshed as ProfileRow)
      setTimezoneConfirmed(true)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <TopNav userEmail={userEmail} />
        <section className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-slate-400">Loading profile...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={userEmail} />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-4xl font-bold">Edit Profile</h1>

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {!timezoneConfirmed && (
          <div className="mb-6 rounded-2xl border border-amber-700 bg-amber-950 p-5 text-amber-200">
            <div className="text-base font-semibold">Timezone check required</div>

            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="font-semibold">Detected timezone:</span> {browserTimezone}
              </div>
              <div>
                <span className="font-semibold">Your selected timezone:</span> {timezone}
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-amber-100">
              Make sure this is correct. All sessions on GameMate are automatically
              adjusted to your local time, so this setting is important.
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={confirmTimezone}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
              >
                Confirm Timezone
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Username *
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                  placeholder="Unique internal username"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Can only be changed once every 7 days.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Display Name *
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                  placeholder="Public name everyone sees"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Can only be changed once every 7 days.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((item) => (
                    <option key={item.label + item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                placeholder="Tell people what kind of player you are"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Country *
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                >
                  <option value="">Select country</option>
                  {visibleCountries.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Timezone *
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-400">
                  We auto-adjust session times for everyone, but only if this is set correctly.
                </p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <SelectPanel
                title="Languages *"
                options={LANGUAGE_OPTIONS}
                selected={languages}
                onChange={setLanguages}
                search={languageSearch}
                setSearch={setLanguageSearch}
                placeholder="Search language..."
              />

              <SelectPanel
                title="Communication Methods *"
                options={COMMUNICATION_OPTIONS}
                selected={communicationMethods}
                onChange={setCommunicationMethods}
                search={communicationSearch}
                setSearch={setCommunicationSearch}
                placeholder="Search method..."
              />

              <SelectPanel
                title="Primary Games *"
                options={GAME_OPTIONS}
                selected={primaryGames}
                onChange={setPrimaryGames}
                search={gameSearch}
                setSearch={setGameSearch}
                placeholder="Search game..."
              />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSeller}
                  onChange={(e) => setIsSeller(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-semibold">I want to be a GameMate</span>
              </label>

              <p className="mt-2 text-sm text-slate-400">
                Turn this on if you want to offer paid gaming sessions.
              </p>
            </div>

            {isSeller && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">
                    Hourly Price
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={hourlyPrice}
                    onChange={(e) => setHourlyPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                    placeholder="Example: 5"
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    Price must be between 1 and 1000 USD
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="mb-4">
                    <h2 className="text-xl font-bold">Availability</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Choose which hours you want to be available as a GameMate.
                    </p>
                    <p className="mt-1 text-sm text-slate-400">Timezone: {timezone}</p>
                  </div>

                  <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm text-slate-300">
                      Total selected slots: {selectedCount}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      Red slots already have pending or accepted sessions and cannot be removed.
                    </div>
                  </div>

                  <div className="mb-6 flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        onClick={() => setSelectedDay(day.value)}
                        type="button"
                        className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                          selectedDay === day.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                    <h3 className="mb-4 text-lg font-bold">
                      {DAYS.find((d) => d.value === selectedDay)?.label}
                    </h3>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 24 }).map((_, hour) => {
                        const key = makeKey(selectedDay, hour)
                        const active = selectedSlots.has(key)
                        const locked = lockedSlots.has(key) && active

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleSlot(selectedDay, hour)}
                            className={`rounded-xl border px-4 py-3 text-left transition ${
                              locked
                                ? 'cursor-not-allowed border-red-800 bg-red-950 text-red-300'
                                : active
                                ? 'border-indigo-500 bg-indigo-600 text-white'
                                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-semibold">{formatRange(hour)}</span>
                              <span className="text-xs opacity-80 text-right">
                                {availabilityStateLabel(active, locked)}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>

              {message && (
                <p
                  className={`mt-4 text-sm ${
                    messageType === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {message}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
// FILE END: app/profile-edit/page.tsx
// APPROX LINES: 640