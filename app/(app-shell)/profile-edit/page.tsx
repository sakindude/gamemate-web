// START_FILE: app/(app-shell)/profile-edit/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

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

type FormSnapshot = {
  displayName: string
  bio: string
  country: string
  timezone: string
  timezoneConfirmed: boolean
  gender: string
  hourlyPrice: string
  isSeller: boolean
  isOnline: boolean
  maxSessionDuration: string
  languages: string[]
  communicationMethods: string[]
  primaryGames: string[]
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
  { value: 5, label: '5 hours' },
  { value: 6, label: '6 hours' },
]

function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>

      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
      ) : null}
    </div>
  )
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
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((item) => item.toLowerCase().includes(q))
  }, [options, search])

  const summaryText = useMemo(() => {
    if (selected.length === 0) return 'Nothing selected yet'
    if (selected.length <= 3) return selected.join(', ')
    return `${selected.slice(0, 3).join(', ')} +${selected.length - 3} more`
  }, [selected])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item))
    } else {
      onChange([...selected, item])
    }
  }

  const closeModal = () => {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full cursor-pointer rounded-2xl border border-slate-800/80 bg-slate-950/75 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:border-slate-700 hover:bg-slate-950/90"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300">
            {selected.length} selected
          </div>
        </div>

        <div className="min-h-[48px] rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-3">
          <p
            className={`text-sm leading-6 ${
              selected.length > 0 ? 'text-slate-200' : 'text-slate-500'
            }`}
          >
            {summaryText}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">Search and manage your selections</p>
          <span className="text-sm font-semibold text-indigo-300">Edit</span>
        </div>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 p-6">
          <div className="flex max-h-[calc(100vh-48px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[26px] border border-slate-700 bg-[#0b1220] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="border-b border-white/8 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Search, select, and update your preferred options.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-4 w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                placeholder={placeholder}
              />

              <div className="mb-4 rounded-xl border border-slate-800/80 bg-slate-900/75 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Selected
                </div>

                <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                  {selected.length > 0 ? (
                    selected.map((item) => (
                      <button
                        key={`selected-${title}-${item}`}
                        type="button"
                        onClick={() => toggle(item)}
                        className="cursor-pointer rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-indigo-500"
                      >
                        {item} ×
                      </button>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">Nothing selected yet</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-900/72 p-2">
                {filtered.length > 0 ? (
                  <div className="max-h-[360px] space-y-1 overflow-y-auto">
                    {filtered.map((item) => {
                      const checked = selected.includes(item)

                      return (
                        <label
                          key={`${title}-${item}`}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-slate-800/80"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(item)}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-slate-100">{item}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-2 py-3 text-sm text-slate-500">No results</div>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-slate-400">
                  {selected.length} item{selected.length === 1 ? '' : 's'} selected
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function getAvatarInitials(displayName: string, email: string) {
  const label = displayName.trim() || email.trim() || 'GM'
  const parts = label.split(/\s+/).filter(Boolean)

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
}

function createFormSnapshot({
  displayName,
  bio,
  country,
  timezone,
  timezoneConfirmed,
  gender,
  hourlyPrice,
  isSeller,
  isOnline,
  maxSessionDuration,
  languages,
  communicationMethods,
  primaryGames,
}: {
  displayName: string
  bio: string
  country: string
  timezone: string
  timezoneConfirmed: boolean
  gender: string
  hourlyPrice: string
  isSeller: boolean
  isOnline: boolean
  maxSessionDuration: string
  languages: string[]
  communicationMethods: string[]
  primaryGames: string[]
}): FormSnapshot {
  return {
    displayName: displayName.trim(),
    bio: bio.trim(),
    country: country || '',
    timezone: timezone.trim(),
    timezoneConfirmed,
    gender: gender || 'prefer_not_to_say',
    hourlyPrice: hourlyPrice || '',
    isSeller,
    isOnline: isSeller ? isOnline : false,
    maxSessionDuration: maxSessionDuration || '2',
    languages: [...languages],
    communicationMethods: [...communicationMethods],
    primaryGames: [...primaryGames],
  }
}

function buildProfileSnapshotFromRow(row: ProfileRow, browserTimezone: string) {
  const nextDisplayName = row.display_name || ''
  const nextBio = row.bio || ''
  const nextCountry = row.country || ''
  const nextTimezone = row.timezone || browserTimezone || 'UTC'
  const nextTimezoneConfirmed = !!row.timezone_confirmed
  const nextGender = row.gender || 'prefer_not_to_say'
  const nextHourlyPrice = row.hourly_price ? String(row.hourly_price) : ''
  const nextIsSeller = !!row.is_seller
  const nextIsOnline = !!row.is_online
  const nextMaxSessionDuration = String(row.max_session_duration ?? 2)
  const nextLanguages = row.languages || []
  const nextCommunicationMethods = row.communication_methods || []
  const nextPrimaryGames = row.primary_games || []

  return {
    nextDisplayName,
    nextBio,
    nextCountry,
    nextTimezone,
    nextTimezoneConfirmed,
    nextGender,
    nextHourlyPrice,
    nextIsSeller,
    nextIsOnline,
    nextMaxSessionDuration,
    nextLanguages,
    nextCommunicationMethods,
    nextPrimaryGames,
    snapshot: createFormSnapshot({
      displayName: nextDisplayName,
      bio: nextBio,
      country: nextCountry,
      timezone: nextTimezone,
      timezoneConfirmed: nextTimezoneConfirmed,
      gender: nextGender,
      hourlyPrice: nextHourlyPrice,
      isSeller: nextIsSeller,
      isOnline: nextIsSeller ? nextIsOnline : false,
      maxSessionDuration: nextMaxSessionDuration,
      languages: nextLanguages,
      communicationMethods: nextCommunicationMethods,
      primaryGames: nextPrimaryGames,
    }),
  }
}

export default function ProfileEditPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false)
  const [gender, setGender] = useState('prefer_not_to_say')
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
  const [savedSnapshot, setSavedSnapshot] = useState<FormSnapshot | null>(null)

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

  const avatarInitials = useMemo(() => {
    return getAvatarInitials(displayName, userEmail)
  }, [displayName, userEmail])

  const currentSnapshot = useMemo(() => {
    return createFormSnapshot({
      displayName,
      bio,
      country,
      timezone,
      timezoneConfirmed,
      gender,
      hourlyPrice,
      isSeller,
      isOnline,
      maxSessionDuration,
      languages,
      communicationMethods,
      primaryGames,
    })
  }, [
    displayName,
    bio,
    country,
    timezone,
    timezoneConfirmed,
    gender,
    hourlyPrice,
    isSeller,
    isOnline,
    maxSessionDuration,
    languages,
    communicationMethods,
    primaryGames,
  ])

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false
    return JSON.stringify(currentSnapshot) !== JSON.stringify(savedSnapshot)
  }, [currentSnapshot, savedSnapshot])

  const showSaveBar = isDirty || saving || saveState === 'success' || messageType === 'error'

  const saveBarTitle = useMemo(() => {
    if (messageType === 'error') return 'Could not save changes'
    if (saveState === 'saving') return 'Saving changes...'
    if (saveState === 'success') return 'Saved just now'
    if (isDirty) return 'Unsaved changes'
    return 'All changes saved'
  }, [isDirty, messageType, saveState])

  const saveBarDescription = useMemo(() => {
    if (messageType === 'error' && message) return message
    if (saveState === 'saving') return 'Updating your profile now.'
    if (saveState === 'success') return 'Your profile has been updated.'
    if (isDirty) return 'You changed this page. Save when you are ready.'
    return ''
  }, [isDirty, message, messageType, saveState])

  const saveButtonLabel = useMemo(() => {
    if (saveState === 'saving') return 'Saving...'
    if (saveState === 'success' && !isDirty) return 'Saved'
    return 'Save Changes'
  }, [isDirty, saveState])

  useEffect(() => {
    if (authLoading) return

    if (!user?.id) {
      router.replace('/login')
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setMessage('')
      setMessageType('')
      setUserEmail(user.email || '')

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, country, timezone, timezone_confirmed, gender, hourly_price, is_seller, is_online, max_session_duration, primary_games, languages, communication_methods, username_updated_at, display_name_updated_at'
        )
        .eq('id', user.id)
        .single()

      if (cancelled) return

      if (profileError) {
        setMessage(profileError.message)
        setMessageType('error')
        setLoading(false)
        return
      }

      const row = profileData as ProfileRow
      const next = buildProfileSnapshotFromRow(row, browserTimezone)

      setProfile(row)
      setDisplayName(next.nextDisplayName)
      setBio(next.nextBio)
      setCountry(next.nextCountry)
      setTimezone(next.nextTimezone)
      setTimezoneConfirmed(next.nextTimezoneConfirmed)
      setGender(next.nextGender)
      setHourlyPrice(next.nextHourlyPrice)
      setIsSeller(next.nextIsSeller)
      setIsOnline(next.nextIsOnline)
      setMaxSessionDuration(next.nextMaxSessionDuration)
      setLanguages(next.nextLanguages)
      setCommunicationMethods(next.nextCommunicationMethods)
      setPrimaryGames(next.nextPrimaryGames)
      setSavedSnapshot(next.snapshot)
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [authLoading, browserTimezone, router, user])

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
    setSaveState('saving')

    if (!user?.id) {
      setSaveState('idle')
      setMessage('Login required')
      setMessageType('error')
      return
    }

    if (!displayName.trim()) {
      setSaveState('idle')
      setMessage('Display name is required')
      setMessageType('error')
      return
    }

    if (!timezone.trim()) {
      setSaveState('idle')
      setMessage('Timezone is required')
      setMessageType('error')
      return
    }

    if (!timezoneConfirmed) {
      setSaveState('idle')
      setMessage('Please confirm your timezone before saving.')
      setMessageType('error')
      return
    }

    if (isSeller) {
      const price = Number(hourlyPrice || 0)

      if (!price || price < 2) {
        setSaveState('idle')
        setMessage('Minimum price is 2')
        setMessageType('error')
        return
      }

      if (price > 200) {
        setSaveState('idle')
        setMessage('Maximum price is 200')
        setMessageType('error')
        return
      }

      const duration = Number(maxSessionDuration || 0)

      if (!duration || duration < 1 || duration > 6) {
        setSaveState('idle')
        setMessage('Maximum session duration must be between 1 and 6 hours')
        setMessageType('error')
        return
      }
    }

    const displayNameChanged = displayName.trim() !== (profile?.display_name || '').trim()

    if (displayNameChanged && profile?.display_name_updated_at) {
      const now = new Date()
      const last = new Date(profile.display_name_updated_at)
      const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)

      if (diffDays < 7) {
        setSaveState('idle')
        setMessage('Display name can only be changed once every 7 days')
        setMessageType('error')
        return
      }
    }

    setSaving(true)

    const payload = {
      id: user.id,
      email: user.email,
      display_name: displayName.trim(),
      bio: bio.trim(),
      country: country || null,
      timezone: timezone.trim(),
      timezone_confirmed: true,
      gender: gender || 'prefer_not_to_say',
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
      setSaveState('idle')
      setMessage(profileError.message)
      setMessageType('error')
      return
    }

    const nextProfile: ProfileRow = {
      id: user.id,
      username: profile?.username || null,
      display_name: payload.display_name,
      bio: payload.bio,
      country: payload.country,
      timezone: payload.timezone,
      timezone_confirmed: true,
      gender: payload.gender,
      hourly_price: payload.hourly_price,
      is_seller: payload.is_seller,
      is_online: payload.is_online,
      max_session_duration: payload.max_session_duration,
      primary_games: payload.primary_games,
      languages: payload.languages,
      communication_methods: payload.communication_methods,
      username_updated_at: profile?.username_updated_at || null,
      display_name_updated_at: payload.display_name_updated_at,
    }

    setProfile(nextProfile)
    setSaving(false)
    setSaveState('success')
    setMessage('Profile saved successfully.')
    setMessageType('success')
    setSavedSnapshot(currentSnapshot)

    window.setTimeout(() => {
      setSaveState('idle')
    }, 2000)
  }

  if (authLoading || loading) {
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Become a GameMate</h2>

            <div
              style={{
                marginTop: '16px',
                color: '#cbd5e1',
                fontSize: '0.95rem',
                lineHeight: 1.7,
              }}
            >
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
                  cursor: 'pointer',
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
                  cursor: 'pointer',
                }}
              >
                Accept & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-slate-950 text-white">
        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold">Edit Profile</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Set up how you appear across GameMate and prepare your marketplace listing.
            </p>
            {userEmail ? <p className="mt-2 text-sm text-slate-500">{userEmail}</p> : null}
          </div>

          <section className="mb-8 rounded-[28px] border border-slate-800/80 bg-slate-900/85 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.20)]">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[24px] border border-slate-700/80 bg-slate-950/90 text-2xl font-bold tracking-[0.08em] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  {avatarInitials}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-xl font-bold text-white">
                    {displayName.trim() || 'Your profile'}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-400">
                    {userEmail || 'No email found'}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    This is the profile and marketplace listing you are editing.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-xl border border-slate-700/80 bg-slate-800/70 px-4 py-2.5 text-sm font-semibold text-slate-300 opacity-70"
                  title="Avatar upload will be enabled after backend/storage support is added."
                >
                  Upload Avatar
                </button>

                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-500 opacity-70"
                  title="Avatar removal will be enabled after backend/storage support is added."
                >
                  Remove
                </button>
              </div>
            </div>
          </section>

          {!timezoneConfirmed && (
            <div className="mb-8 rounded-2xl border border-amber-700/70 bg-amber-950/60 p-5 text-amber-200">
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
                Make sure this is correct. All sessions on GameMate are automatically adjusted to
                your local time, so this setting is important.
              </p>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={confirmTimezone}
                  className="cursor-pointer rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                >
                  Confirm Timezone
                </button>
              </div>
            </div>
          )}

          <div className="space-y-8">
            <section className="rounded-[28px] border border-slate-800/80 bg-slate-900/85 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.20)]">
              <SectionHeader
                title="Basic Info"
                description="Core details people see first on your profile."
              />

              <div className="grid gap-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">
                      Display Name *
                    </label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
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
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
                    >
                      {GENDER_OPTIONS.map((item) => (
                        <option key={item.label + item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="min-h-32 w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
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
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
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
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
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
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-800/80 bg-slate-900/85 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.20)]">
              <SectionHeader
                title="Your Marketplace Profile"
                description="Details buyers use to understand your play style and setup."
              />

              <div className="grid gap-4 xl:grid-cols-3">
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
            </section>

            <section className="rounded-[28px] border border-slate-800/80 bg-slate-900/85 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.20)]">
              <SectionHeader
                title="GameMate Setup"
                description="Choose whether you appear as a seller and define the basics for paid sessions."
              />

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/75 p-5">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSeller}
                    onChange={(e) => handleSellerToggle(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block font-semibold text-white">I want to be a GameMate</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-400">
                      Turn this on to offer paid gaming sessions and appear as a seller in the
                      marketplace.
                    </span>
                  </span>
                </label>
              </div>

              {isSeller ? (
                <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/75 p-5">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        Hourly Price
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={hourlyPrice}
                        onPaste={(e) => e.preventDefault()}
                        onChange={(e) => {
                          let val = e.target.value
                          val = val.replace(/[^0-9]/g, '')

                          if (val === '') {
                            setHourlyPrice('')
                            return
                          }

                          let num = Number(val)

                          if (num < 2) num = 2
                          if (num > 200) num = 200

                          setHourlyPrice(String(num))
                        }}
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
                        placeholder="Example: 20"
                      />
                      <p className="mt-2 text-xs text-slate-400">Between $2 and $200</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        Maximum Session Duration
                      </label>
                      <select
                        value={maxSessionDuration}
                        onChange={(e) => setMaxSessionDuration(e.target.value)}
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 px-4 py-3 text-white outline-none"
                      >
                        {MAX_SESSION_DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-400">
                        This limits the maximum duration buyers can request.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
                    <div className="text-sm font-semibold text-slate-200">GameMate setup</div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Your online/offline presence is controlled from the top navigation. Seller
                      mode and online status are separate, so you can stay offline until you want
                      to appear in Explore.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5">
                  <p className="text-sm leading-6 text-slate-400">
                    Seller-only fields such as hourly price and maximum session duration appear
                    here after you turn on GameMate mode.
                  </p>
                </div>
              )}
            </section>
          </div>
        </section>

        {showSaveBar ? (
          <div className="fixed right-4 top-4 z-[130] w-[calc(100vw-32px)] sm:w-[440px]">
            <div className="rounded-[22px] border border-white/10 bg-slate-950/92 px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.38)] backdrop-blur">
              <div className="flex flex-col gap-4">
                <div className="min-w-0">
                  <div
                    className={`text-base font-semibold ${
                      messageType === 'error'
                        ? 'text-red-300'
                        : saveState === 'success'
                          ? 'text-emerald-300'
                          : 'text-slate-100'
                    }`}
                  >
                    {saveBarTitle}
                  </div>

                  {saveBarDescription ? (
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      {saveBarDescription}
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-start">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="cursor-pointer rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {saveButtonLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  )
}
// END_FILE