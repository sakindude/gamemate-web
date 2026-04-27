// FILE START: components/StartChatButton.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

type StartChatButtonProps = {
  otherUserId: string
  label?: string
  className?: string
}

export default function StartChatButton({
  otherUserId,
  label = 'Start Chat with GameMate',
  className = '',
}: StartChatButtonProps) {
  const { user, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  const handleStartChat = async () => {
    if (!otherUserId || loading || authLoading) return

    setErrorText('')

    if (!user?.id) {
      setErrorText('You are not logged in.')
      return
    }

    if (user.id === otherUserId) {
      setErrorText('You cannot start a chat with yourself.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
        p_other_user_id: otherUserId,
      })

      if (error) {
        console.error('get_or_create_direct_conversation error:', error)
        setErrorText(error.message || 'Failed to create conversation.')
        return
      }

      if (!data) {
        setErrorText('Conversation was not created.')
        return
      }

      window.location.href = `/chat?id=${data}`
    } catch (error) {
      console.error('StartChatButton handleStartChat threw:', error)
      setErrorText('Failed to open chat.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleStartChat()}
        disabled={loading || authLoading}
        className={
          className ||
          'rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50'
        }
      >
        {authLoading ? 'Checking session...' : loading ? 'Opening chat...' : label}
      </button>

      {errorText ? <p className="text-sm text-red-400">{errorText}</p> : null}
    </div>
  )
}
// FILE END: components/StartChatButton.tsx