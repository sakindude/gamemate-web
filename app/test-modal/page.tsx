'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProfileCompletionModal from '@/components/ProfileCompletionModal'

export default function TestModalPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setUserId(session?.user?.id || null)
    }

    getUser()
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <button
        onClick={() => setOpen(true)}
        className="bg-indigo-600 px-6 py-3 rounded-xl"
      >
        OPEN TEST MODAL
      </button>

      <ProfileCompletionModal
        isOpen={open}
        onClose={() => setOpen(false)}
        userId={userId}
        onSaved={() => {
          console.log('Saved')
        }}
      />
    </main>
  )
}