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
        return
      }
    }

    checkRecoveryState()
  }, [])

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

    router.push('/explore')
    router.refresh()
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
          country: null, // 🔥 artık zorunlu değil
          timezone,
          timezone_confirmed: true,
          gender: null,
          hourly_price: null,
          is_seller: false,
          is_online: false,
          max_session_duration: 2,
          primary_games: [],
          languages: [], // 🔥 boş başlıyor
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
      return
    }

    if (newPassword !== confirmNewPassword) {
      setMessage('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Password updated')
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-3xl font-bold">GameMate</h1>
        <p className="mt-2 text-sm text-slate-400">{title}</p>

        <div className="mt-6 space-y-4">
          {(mode === 'login' || mode === 'register') && (
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          {(mode === 'login' || mode === 'register') && (
            <input
              type="password"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {mode === 'register' && (
            <>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              {/* TIMEZONE kaldı */}
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
            </>
          )}

          {mode === 'login' && (
            <>
              <button
                onClick={handleLogin}
                className="w-full bg-indigo-600 py-3 rounded-xl"
              >
                Login
              </button>

              <button
                onClick={() => setMode('register')}
                className="w-full bg-slate-700 py-3 rounded-xl"
              >
                Create Account
              </button>
            </>
          )}

          {mode === 'register' && (
            <>
              <button
                onClick={handleRegister}
                className="w-full bg-indigo-600 py-3 rounded-xl"
              >
                Register
              </button>

              <button
                onClick={() => setMode('login')}
                className="w-full bg-slate-700 py-3 rounded-xl"
              >
                Back
              </button>
            </>
          )}

          {message && (
            <p
              className={`text-sm ${
                messageType === 'error'
                  ? 'text-red-400'
                  : 'text-green-400'
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