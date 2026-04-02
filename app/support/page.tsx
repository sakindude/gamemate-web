// FILE START: app/support/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

const categories = [
  'User was rude',
  'Harassment',
  'No show',
  'Payment issue',
  'Technical problem',
  'Other',
]

export default function SupportPage() {
  const [user, setUser] = useState<any>(null)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  const submit = async () => {
    if (!message.trim()) {
      setStatusMsg('Write something...')
      return
    }

    const { error } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      type: 'support',
      category,
      message,
    })

    if (error) {
      setStatusMsg(error.message)
    } else {
      setStatusMsg('Sent successfully')
      setMessage('')
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav userEmail={user?.email} />

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold mb-6">Support</h1>

        <div className="space-y-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-800"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <textarea
            placeholder="Describe your issue..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-4 rounded-xl bg-slate-800 min-h-[120px]"
          />

          <button
            onClick={submit}
            className="bg-indigo-600 px-6 py-3 rounded-xl font-semibold"
          >
            Send
          </button>

          {statusMsg && <p className="text-sm text-slate-300">{statusMsg}</p>}
        </div>
      </div>
    </main>
  )
}
// FILE END