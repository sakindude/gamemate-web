// FILE START: app/chat/[id]/page.tsx
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ChatConversationRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  useEffect(() => {
    if (id) {
      router.replace(`/chat?id=${id}`)
    } else {
      router.replace('/chat')
    }
  }, [id, router])

  return null
}
// FILE END: app/chat/[id]/page.tsx