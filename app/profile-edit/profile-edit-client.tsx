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
  is_online: boolean | null
  max_session_duration: number | null
  primary_games: string[] | null
  languages: string[] | null
  communication_methods: string[] | null
  username_updated_at: string | null
  display_name_updated_at: string | null
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const MAX_SESSION_DURATION_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
  { value: 4, label: '4 hours' },
]

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

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false)
  const [gender, setGender] = useState('')
  const [hourlyPrice, setHourlyPrice] = useState('')
  const [isSeller, setIsSeller] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [maxSessionDuration, setMaxSessionDuration] = useState('2')

  const [languages, setLanguages] = useState<string[]>([])
  const [communicationMethods, setCommunicationMethods] = useState<string[]>([])
  const [primaryGames, setPrimaryGames] = useState<string[]>([])

  const [languageSearch, setLanguageSearch] = useState('')
  const [communicationSearch, setCommunicationSearch] = useState('')
  const [gameSearch, setGameSearch] = useState('')

  const [showOnboarding, setShowOnboarding] = useState(false)

  const visibleCountries = useMemo(() => COUNTRY_OPTIONS, [])

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

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, country, timezone, timezone_confirmed, gender, hourly_price, is_seller, is_online, max_session_duration, primary_games, languages, communication_methods, username_updated_at, display_name_updated_at'
        )
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        setMessage(profileError.message)
        setMessageType('error')
        setLoading(false)
        return
      }

      const row = profileData as ProfileRow
      setProfile(row)
      setDisplayName(row.display_name || '')
      setBio(row.bio || '')
      setCountry(row.country || '')
      setTimezone(row.timezone || browserTimezone || 'UTC')
      setTimezoneConfirmed(!!row.timezone_confirmed)
      setGender(row.gender || '')
      setHourlyPrice(row.hourly_price ? String(row.hourly_price) : '')
      setIsSeller(!!row.is_seller)
      setIsOnline(!!row.is_online)
      setMaxSessionDuration(String(row.max_session_duration ?? 2))
      setLanguages(row.languages || [])
      setCommunicationMethods(row.communication_methods || [])
      setPrimaryGames(row.primary_games || [])

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

  useEffect(() => {
    if (!isSeller && isOnline) {
      setIsOnline(false)
    }
  }, [isSeller, isOnline])

  useEffect(() => {
    if (!showOnboarding) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showOnboarding])

  const confirmTimezone = () => {
    setTimezoneConfirmed(true)
    setMessage('Timezone confirmed. Save profile to apply it.')
    setMessageType('success')
  }

  const handleSellerToggle = (checked: boolean) => {
    if (checked && !isSeller) {
      setShowOnboarding(true)
      return
    }

    setIsSeller(checked)
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

      const duration = Number(maxSessionDuration || 0)

      if (!duration || duration < 1 || duration > 4) {
        setMessage('Maximum session duration must be between 1 and 4 hours')
        setMessageType('error')
        return
      }
    }

    const displayNameChanged =
      displayName.trim() !== (profile?.display_name || '').trim()

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
      display_name: displayName.trim(),
      bio: bio.trim(),
      country: country || null,
      timezone: timezone.trim(),
      timezone_confirmed: true,
      gender: gender || null,
      hourly_price: isSeller && hourlyPrice ? Number(hourlyPrice) : null,
      is_seller: isSeller,
      is_online: isSeller ? isOnline : false,
      max_session_duration: isSeller ? Number(maxSessionDuration) : null,
      primary_games: primaryGames,
      languages,
      communication_methods: communicationMethods,
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

    setSaving(false)
    setMessage('Profile saved successfully.')
    setMessageType('success')

    const { data: refreshed } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, bio, country, timezone, timezone_confirmed, gender, hourly_price, is_seller, is_online, max_session_duration, primary_games, languages, communication_methods, username_updated_at, display_name_updated_at'
      )
      .eq('id', session.user.id)
      .single()

    if (refreshed) {
      setProfile(refreshed as ProfileRow)
      setTimezoneConfirmed(true)
      setIsOnline(!!refreshed.is_online)
      setMaxSessionDuration(String(refreshed.max_session_duration ?? 2))
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
    <>
      {showOnboarding && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483647,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '20px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
              padding: '24px',
              color: 'white',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              Become a GameMate
            </h2>

            <div style={{ marginTop: '16px', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.7 }}>
              <p>Before continuing, make sure you understand:</p>

              <ul style={{ marginTop: '12px', paddingLeft: '20px' }}>
                <li>You may receive paid session requests through the platform.</li>
                <li>Payments and session handling must stay on-platform.</li>
                <li>Your profile information should be accurate and honest.</li>
                <li>You should read the guide and rules before going live.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  background: '#334155',
                  color: 'white',
                  padding: '10px 16px',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSeller(true)
                  setShowOnboarding(false)
                }}
                style={{
                  width: '100%',
                  borderRadius: '12px',
                  background: '#4f46e5',
                  color: 'white',
                  padding: '10px 16px',
                  fontWeight: 600,
                }}
              >
                Accept & Continue
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="grid gap-6 md:grid-cols-2">
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
                    Gender
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
                    Country
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
                  title="Languages"
                  options={LANGUAGE_OPTIONS}
                  selected={languages}
                  onChange={setLanguages}
                  search={languageSearch}
                  setSearch={setLanguageSearch}
                  placeholder="Search language..."
                />

                <SelectPanel
                  title="Communication Methods"
                  options={COMMUNICATION_OPTIONS}
                  selected={communicationMethods}
                  onChange={setCommunicationMethods}
                  search={communicationSearch}
                  setSearch={setCommunicationSearch}
                  placeholder="Search method..."
                />

                <SelectPanel
                  title="Primary Games"
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
                    onChange={(e) => handleSellerToggle(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="font-semibold">I want to be a GameMate</span>
                </label>

                <p className="mt-2 text-sm text-slate-400">
                  Turn this on if you want to offer paid gaming sessions.
                </p>
              </div>

              {isSeller && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="grid gap-6 md:grid-cols-2">
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

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        Maximum Session Duration
                      </label>
                      <select
                        value={maxSessionDuration}
                        onChange={(e) => setMaxSessionDuration(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                      >
                        {MAX_SESSION_DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-400">
                        This will limit the maximum duration buyers can request later.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-semibold text-slate-200">
                      GameMate setup
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Your online/offline presence will be controlled from the top navigation.
                      Seller mode and online status are separate. You can be a GameMate but stay
                      offline until you want to appear in Explore.
                    </p>
                  </div>
                </div>
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
    </>
  )
}