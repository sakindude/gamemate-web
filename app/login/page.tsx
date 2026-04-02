// FILE START: app/login/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState(detectedTimezone)
  const [languages, setLanguages] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const countryOptions = useMemo(
    () => [
      'Argentina',
      'Australia',
      'Austria',
      'Belgium',
      'Brazil',
      'Bulgaria',
      'Canada',
      'Chile',
      'China',
      'Colombia',
      'Croatia',
      'Czech Republic',
      'Denmark',
      'Egypt',
      'Finland',
      'France',
      'Germany',
      'Greece',
      'Hungary',
      'India',
      'Indonesia',
      'Ireland',
      'Italy',
      'Japan',
      'Mexico',
      'Netherlands',
      'New Zealand',
      'Norway',
      'Poland',
      'Portugal',
      'Romania',
      'Saudi Arabia',
      'Serbia',
      'Singapore',
      'South Africa',
      'South Korea',
      'Spain',
      'Sweden',
      'Switzerland',
      'Thailand',
      'Turkey',
      'Ukraine',
      'United Arab Emirates',
      'United Kingdom',
      'United States',
      'Vietnam',
    ],
    []
  )

  const languageOptions = useMemo(
    () => [
      'English',
      'Turkish',
      'German',
      'French',
      'Spanish',
      'Italian',
      'Portuguese',
      'Russian',
      'Arabic',
      'Japanese',
      'Korean',
      'Chinese',
    ],
    []
  )

  const timezoneOptions = useMemo(() => {
    try {
      const values = (Intl as any).supportedValuesOf?.('timeZone')
      return Array.isArray(values) && values.length > 0 ? values : ['UTC']
    } catch {
      return ['UTC']
    }
  }, [])

  useEffect(() => {
    const checkRecoveryState = async () => {
      const hash = window.location.hash || ''
      const isRecoveryLink = hash.includes('type=recovery')

      if (isRecoveryLink) {
        setMode('reset')
        setMessage('Enter your new password below.')
        setMessageType('success')
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session && hash.includes('access_token')) {
        setMode('reset')
        setMessage('Enter your new password below.')
        setMessageType('success')
      }
    }

    checkRecoveryState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setMessage('Enter your new password below.')
        setMessageType('success')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const toggleLanguage = (lang: string) => {
    if (languages.includes(lang)) {
      setLanguages(languages.filter((x) => x !== lang))
    } else {
      setLanguages([...languages, lang])
    }
  }

  const resetMessages = () => {
    setMessage('')
    setMessageType('')
  }

  const handleLogin = async () => {
    resetMessages()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setMessage(error.message)
        setMessageType('error')
        setLoading(false)
        return
      }

      setLoading(false)
      router.push('/explore')
      router.refresh()
    } catch (err: any) {
      setLoading(false)
      setMessage(err?.message || 'Login failed')
      setMessageType('error')
    }
  }

  const handleForgotPassword = async () => {
    resetMessages()

    if (!email.trim()) {
      setMessage('Please enter your email first.')
      setMessageType('error')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      })

      setLoading(false)

      if (error) {
        setMessage(error.message)
        setMessageType('error')
        return
      }

      setMessage('Password reset email sent. Check your inbox.')
      setMessageType('success')
    } catch (err: any) {
      setLoading(false)
      setMessage(err?.message || 'Could not send reset email')
      setMessageType('error')
    }
  }

  const handleResetPassword = async () => {
    resetMessages()

    if (!newPassword.trim() || newPassword.length < 6) {
      setMessage('New password must be at least 6 characters.')
      setMessageType('error')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setMessage('Passwords do not match.')
      setMessageType('error')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      setLoading(false)

      if (error) {
        setMessage(error.message)
        setMessageType('error')
        return
      }

      setMessage('Password updated successfully. You can login now.')
      setMessageType('success')
      setMode('login')
      setPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      window.history.replaceState({}, document.title, '/login')
    } catch (err: any) {
      setLoading(false)
      setMessage(err?.message || 'Password update failed')
      setMessageType('error')
    }
  }

  const handleRegister = async () => {
    resetMessages()

    if (!email.trim()) {
      setMessage('Email is required.')
      setMessageType('error')
      return
    }

    if (!password.trim() || password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      setMessageType('error')
      return
    }

    if (!displayName.trim()) {
      setMessage('Display name is required.')
      setMessageType('error')
      return
    }

    if (!country.trim()) {
      setMessage('Country is required.')
      setMessageType('error')
      return
    }

    if (!timezone.trim()) {
      setMessage('Timezone is required.')
      setMessageType('error')
      return
    }

    if (languages.length === 0) {
      setMessage('Select at least 1 language.')
      setMessageType('error')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) {
        setLoading(false)
        setMessage(error.message)
        setMessageType('error')
        return
      }

      const userId = data.user?.id

      if (userId) {
        const usernameBase = email.trim().split('@')[0]

        await supabase.from('profiles').upsert({
          id: userId,
          email: email.trim(),
          username: usernameBase,
          display_name: displayName.trim(),
          bio: '',
          country,
          timezone,
          timezone_confirmed: true,
          gender: null,
          hourly_price: null,
          is_seller: false,
          primary_games: [],
          languages,
          communication_methods: [],
          balance: 0,
        })
      }

      setLoading(false)
      setMessage('Account created successfully. You can login now.')
      setMessageType('success')
      setMode('login')
    } catch (err: any) {
      setLoading(false)
      setMessage(err?.message || 'Register failed')
      setMessageType('error')
    }
  }

  const title =
    mode === 'login'
      ? 'Login'
      : mode === 'register'
      ? 'Create Account'
      : mode === 'forgot'
      ? 'Forgot Password'
      : 'Set New Password'

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-3xl font-bold">GameMate</h1>
        <p className="mt-2 text-sm text-slate-400">{title}</p>

        <div className="mt-6 space-y-4">
          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          {(mode === 'login' || mode === 'register') && (
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {mode === 'reset' && (
            <>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                placeholder="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                placeholder="Confirm New Password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </>
          )}

          {mode === 'register' && (
            <>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
              >
                <option value="">Select country</option>
                {countryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Timezone
                </div>
                <div className="mb-2 text-sm text-slate-300">
                  Detected timezone: <span className="font-semibold">{detectedTimezone}</span>
                </div>

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
                  We auto-detect your timezone, but you can correct it if needed.
                </p>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-300">
                  Languages
                </div>
                <div className="flex flex-wrap gap-2">
                  {languageOptions.map((lang) => {
                    const active = languages.includes(lang)

                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={`rounded-full px-4 py-2 text-sm font-medium ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        {lang}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {mode === 'login' && (
            <>
              <button
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Login'}
              </button>

              <button
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  resetMessages()
                  setTimezone(detectedTimezone)
                  setMode('register')
                }}
                disabled={loading}
              >
                Create Account
              </button>

              <button
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  resetMessages()
                  setMode('forgot')
                }}
                disabled={loading}
              >
                Forgot Password?
              </button>
            </>
          )}

          {mode === 'register' && (
            <>
              <button
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Register'}
              </button>

              <button
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  resetMessages()
                  setMode('login')
                }}
                disabled={loading}
              >
                Back to Login
              </button>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <button
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Send Reset Email'}
              </button>

              <button
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  resetMessages()
                  setMode('login')
                }}
                disabled={loading}
              >
                Back to Login
              </button>
            </>
          )}

          {mode === 'reset' && (
            <>
              <button
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
                onClick={handleResetPassword}
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Update Password'}
              </button>

              <button
                className="w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700 disabled:opacity-50"
                onClick={() => {
                  resetMessages()
                  setMode('login')
                }}
                disabled={loading}
              >
                Back to Login
              </button>
            </>
          )}

          {message && (
            <p
              className={`text-sm ${
                messageType === 'success' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
// FILE END: app/login/page.tsx