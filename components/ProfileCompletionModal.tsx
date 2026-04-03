'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import {
  COMMUNICATION_OPTIONS,
  COUNTRY_OPTIONS,
  GAME_OPTIONS,
  LANGUAGE_OPTIONS,
} from '@/lib/options'

type ProfileCompletionModalProps = {
  isOpen: boolean
  onClose: () => void
  userId: string | null
  onSaved?: () => void
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

function CompactChips({
  options,
  selected,
  onToggle,
}: {
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        maxHeight: '120px',
        overflowY: 'auto',
        border: '1px solid #334155',
        background: '#020617',
        borderRadius: '12px',
        padding: '10px',
      }}
    >
      {options.map((item) => {
        const active = selected.includes(item)

        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            style={{
              borderRadius: '999px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              background: active ? '#4f46e5' : '#1e293b',
              color: 'white',
            }}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}

export default function ProfileCompletionModal({
  isOpen,
  onClose,
  userId,
  onSaved,
}: ProfileCompletionModalProps) {
  const [mounted, setMounted] = useState(false)

  const [country, setCountry] = useState('')
  const [gender, setGender] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [communicationMethods, setCommunicationMethods] = useState<string[]>([])
  const [primaryGames, setPrimaryGames] = useState<string[]>([])

  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const sortedCountries = useMemo(() => COUNTRY_OPTIONS, [])
  const canRender = mounted && isOpen && !!userId

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !userId) return

    const loadProfile = async () => {
      setLoadingProfile(true)
      setMessage('')
      setMessageType('')

      const { data, error } = await supabase
        .from('profiles')
        .select('country, gender, languages, communication_methods, primary_games')
        .eq('id', userId)
        .single()

      if (error) {
        setMessage(error.message || 'Could not load profile.')
        setMessageType('error')
        setLoadingProfile(false)
        return
      }

      setCountry(data?.country || '')
      setGender(data?.gender || '')
      setLanguages(data?.languages || [])
      setCommunicationMethods(data?.communication_methods || [])
      setPrimaryGames(data?.primary_games || [])
      setLoadingProfile(false)
    }

    void loadProfile()
  }, [isOpen, userId])

  const toggleArrayValue = (
    value: string,
    setItems: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setItems((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    )
  }

  const handleSave = async () => {
    if (!userId || saving) return

    setMessage('')
    setMessageType('')

    if (!country.trim()) {
      setMessage('Country is required.')
      setMessageType('error')
      return
    }

    if (!gender.trim()) {
      setMessage('Gender is required.')
      setMessageType('error')
      return
    }

    if (languages.length === 0) {
      setMessage('Select at least 1 language.')
      setMessageType('error')
      return
    }

    if (communicationMethods.length === 0) {
      setMessage('Select at least 1 communication method.')
      setMessageType('error')
      return
    }

    if (primaryGames.length === 0) {
      setMessage('Select at least 1 game.')
      setMessageType('error')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        country,
        gender,
        languages,
        communication_methods: communicationMethods,
        primary_games: primaryGames,
      })
      .eq('id', userId)

    if (error) {
      setSaving(false)
      setMessage(error.message || 'Could not save profile.')
      setMessageType('error')
      return
    }

    setSaving(false)
    onSaved?.()
  }

  if (!canRender) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
      }}
    >
      <div
        onClick={() => {
          if (!saving) onClose()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(92vw, 520px)',
          maxHeight: '86vh',
          overflow: 'hidden',
          borderRadius: '18px',
          border: '1px solid #334155',
          background: '#0f172a',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          zIndex: 2147483648,
        }}
      >
        <div
          style={{
            borderBottom: '1px solid #1e293b',
            padding: '16px 18px',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'white',
            }}
          >
            Complete profile
          </div>

          <div
            style={{
              marginTop: '4px',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            Required before booking.
          </div>
        </div>

        <div
          style={{
            maxHeight: 'calc(86vh - 132px)',
            overflowY: 'auto',
            padding: '16px 18px',
            display: 'grid',
            gap: '14px',
          }}
        >
          {loadingProfile ? (
            <p style={{ color: '#cbd5e1', fontSize: '14px' }}>Loading...</p>
          ) : (
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  Country *
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: 'white',
                    padding: '10px 12px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                >
                  <option value="">Select country</option>
                  {sortedCountries.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: 'white',
                    padding: '10px 12px',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  Languages *
                </label>
                <CompactChips
                  options={LANGUAGE_OPTIONS}
                  selected={languages}
                  onToggle={(value) => toggleArrayValue(value, setLanguages)}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  Communication *
                </label>
                <CompactChips
                  options={COMMUNICATION_OPTIONS}
                  selected={communicationMethods}
                  onToggle={(value) =>
                    toggleArrayValue(value, setCommunicationMethods)
                  }
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                  }}
                >
                  Games *
                </label>
                <CompactChips
                  options={GAME_OPTIONS}
                  selected={primaryGames}
                  onToggle={(value) => toggleArrayValue(value, setPrimaryGames)}
                />
              </div>

              {message && (
                <p
                  style={{
                    fontSize: '14px',
                    color: messageType === 'success' ? '#4ade80' : '#f87171',
                  }}
                >
                  {message}
                </p>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            borderTop: '1px solid #1e293b',
            padding: '16px 18px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose()
            }}
            disabled={saving}
            style={{
              width: '100%',
              borderRadius: '12px',
              background: '#334155',
              color: 'white',
              padding: '12px 14px',
              fontSize: '14px',
              fontWeight: 600,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loadingProfile}
            style={{
              width: '100%',
              borderRadius: '12px',
              background: '#4f46e5',
              color: 'white',
              padding: '12px 14px',
              fontSize: '14px',
              fontWeight: 600,
              border: 'none',
              cursor: saving || loadingProfile ? 'not-allowed' : 'pointer',
              opacity: saving || loadingProfile ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}