'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

export default function LoginPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

  const safeNextPath = useMemo(() => {
    const nextParam = searchParams.get('next')

    if (!nextParam) return '/explore'
    if (!nextParam.startsWith('/')) return '/explore'
    if (nextParam.startsWith('//')) return '/explore'

    return nextParam
  }, [searchParams])

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState(detectedTimezone)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const normalizeEmail = (value: string) => value.trim().toLowerCase()

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

      if (hash.includes('type=recovery')) {
        setMode('reset')
        setMessage('Enter your new password below.')
        setMessageType('success')
      }
    }

    void checkRecoveryState()
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) return

    router.replace(safeNextPath)
  }, [authLoading, router, safeNextPath, user])

  const resetMessages = () => {
    setMessage('')
    setMessageType('')
  }

  const handleLogin = async () => {
    if (loading) return

    resetMessages()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    })

    if (error) {
      setMessage(error.message)
      setMessageType('error')
      setLoading(false)
      return
    }

    router.replace(safeNextPath)
    setLoading(false)
  }

  const handleRegister = async () => {
    if (loading) return

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

    if (!timezone.trim()) {
      setMessage('Timezone is required.')
      setMessageType('error')
      return
    }

    setLoading(true)

    try {
      const normalizedEmail = normalizeEmail(email)

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      })

      if (error) {
        setMessage(error.message)
        setMessageType('error')
        return
      }

      const userId = data.user?.id

      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          email: normalizedEmail,
          display_name: displayName.trim(),
          bio: '',
          country: null,
          timezone,
          timezone_confirmed: true,
          gender: null,
          hourly_price: null,
          is_seller: false,
          is_online: false,
          max_session_duration: 2,
          primary_games: [],
          languages: [],
          communication_methods: [],
          balance: 0,
        })
      }

      setMessage('Account created successfully. You can login now.')
      setMessageType('success')
      setMode('login')
      setPassword('')
    } catch (err: any) {
      setMessage(err?.message || 'Register failed')
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (loading) return

    resetMessages()

    if (newPassword.length < 6) {
      setMessage('Password too short')
      setMessageType('error')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setMessage('Passwords do not match')
      setMessageType('error')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setMessage(error.message)
      setMessageType('error')
      setLoading(false)
      return
    }

    setMessage('Password updated')
    setMessageType('success')
    setMode('login')
    setLoading(false)
  }

  const title =
    mode === 'login'
      ? 'Login'
      : mode === 'register'
        ? 'Create Account'
        : mode === 'forgot'
          ? 'Forgot Password'
          : 'Set New Password'

  const inputClass =
    'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

  const buttonPrimaryClass =
    'w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60'

  const buttonSecondaryClass =
    'w-full rounded-xl bg-slate-700 py-3 font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60'

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="text-lg font-semibold text-white">Checking session...</div>
          <p className="mt-2 text-sm text-slate-400">Please wait a moment.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20">
        <h1 className="text-3xl font-bold text-white">GameMate</h1>
        <p className="mt-2 text-sm text-slate-400">{title}</p>

        <div className="mt-6 space-y-4">
          {(mode === 'login' || mode === 'register') && (
            <input
              type="email"
              autoComplete={mode === 'register' ? 'email' : 'username'}
              spellCheck={false}
              style={{ colorScheme: 'dark' }}
              className={inputClass}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          {(mode === 'login' || mode === 'register') && (
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              style={{ colorScheme: 'dark' }}
              className={inputClass}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {mode === 'register' && (
            <>
              <input
                autoComplete="nickname"
                style={{ colorScheme: 'dark' }}
                className={inputClass}
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className={inputClass}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </>
          )}

          {mode === 'reset' && (
            <>
              <input
                type="password"
                autoComplete="new-password"
                style={{ colorScheme: 'dark' }}
                className={inputClass}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              <input
                type="password"
                autoComplete="new-password"
                style={{ colorScheme: 'dark' }}
                className={inputClass}
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />

              <button
                onClick={handleResetPassword}
                disabled={loading || authLoading}
                className={buttonPrimaryClass}
              >
                {loading ? 'Saving...' : 'Set New Password'}
              </button>

              <button
                onClick={() => setMode('login')}
                disabled={loading || authLoading}
                className={buttonSecondaryClass}
              >
                Back
              </button>
            </>
          )}

          {mode === 'login' && (
            <>
              <button
                onClick={handleLogin}
                disabled={loading || authLoading}
                className={buttonPrimaryClass}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>

              <button
                onClick={() => setMode('register')}
                disabled={loading || authLoading}
                className={buttonSecondaryClass}
              >
                Create Account
              </button>
            </>
          )}

          {mode === 'register' && (
            <>
              <button
                onClick={handleRegister}
                disabled={loading || authLoading}
                className={buttonPrimaryClass}
              >
                {loading ? 'Creating account...' : 'Register'}
              </button>

              <button
                onClick={() => setMode('login')}
                disabled={loading || authLoading}
                className={buttonSecondaryClass}
              >
                Back
              </button>
            </>
          )}

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${messageType === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}