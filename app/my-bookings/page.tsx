// FILE START: app/my-bookings/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MyBookingsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/sessions?view=player')
  }, [router])

  return null
}
// FILE END: app/my-bookings/page.tsx