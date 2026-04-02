// FILE START: app/seller/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SellerRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/sessions?view=gamemate')
  }, [router])

  return null
}
// FILE END: app/seller/page.tsx