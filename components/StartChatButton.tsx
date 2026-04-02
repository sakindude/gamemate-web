// FILE START: components/StartChatButton.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  const handleStartChat = async () => {
    if (!otherUserId || loading) return

    setLoading(true)
    setErrorText('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      setLoading(false)
      setErrorText('You are not logged in.')
      return
    }

    if (session.user.id === otherUserId) {
      setLoading(false)
      setErrorText('You cannot start a chat with yourself.')
      return
    }

    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other_user_id: otherUserId,
    })

    setLoading(false)

    if (error) {
      console.error('get_or_create_direct_conversation error:', error)
      setErrorText(error.message || 'Failed to create conversation.')
      return
    }

    if (!data) {
      setErrorText('Conversation was not created.')
      return
    }

    if (typeof window !== 'undefined') {
      window.location.href = `/chat?id=${data}`
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleStartChat}
        disabled={loading}
        className={
          className ||
          'rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50'
        }
      >
        {loading ? 'Opening chat...' : label}
      </button>

      {errorText && <p className="text-sm text-red-400">{errorText}</p>}
    </div>
  )
}
// FILE END: components/StartChatButton.tsx