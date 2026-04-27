'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'

export default function AppShellGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    if (!user) {
      const next =
        pathname && pathname !== '/login'
          ? `?next=${encodeURIComponent(pathname)}`
          : ''

      router.replace(`/login${next}`)
    }
  }, [loading, pathname, router, user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Checking session...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Redirecting...
      </div>
    )
  }

  return <>{children}</>
}