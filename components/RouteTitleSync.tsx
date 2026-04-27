'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

type TitleRule = {
  match: (pathname: string) => boolean
  title: string
}

const TITLE_SUFFIX = ' | GameMate'

const TITLE_RULES: TitleRule[] = [
  {
    match: (pathname) => pathname === '/',
    title: 'GameMate',
  },
  {
    match: (pathname) => pathname === '/login',
    title: `Login${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/explore',
    title: `Explore${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/sessions',
    title: `Sessions${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/chat',
    title: `Chat${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/balance',
    title: `Balance${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/profile-edit',
    title: `Edit Profile${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname.startsWith('/profile/'),
    title: `Profile${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname.startsWith('/book/'),
    title: `Book Session${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/support',
    title: `Support${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/support/tickets',
    title: `Tickets${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname.startsWith('/support/tickets/'),
    title: `Ticket${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/guide',
    title: `Guide${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/rules',
    title: `Rules${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/ops',
    title: `Ops${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin',
    title: `Admin${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin/abuse',
    title: `Abuse${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin/moderation',
    title: `Moderation${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin/support-faq',
    title: `Support FAQ${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin/support/tickets',
    title: `Admin Support Tickets${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname.startsWith('/admin/support/tickets/'),
    title: `Admin Support Ticket${TITLE_SUFFIX}`,
  },
  {
    match: (pathname) => pathname === '/admin/payouts',
    title: `Payouts${TITLE_SUFFIX}`,
  },
]

function getTitleForPath(pathname: string): string {
  const matchedRule = TITLE_RULES.find((rule) => rule.match(pathname))
  return matchedRule?.title || 'GameMate'
}

export default function RouteTitleSync() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    document.title = getTitleForPath(pathname)
  }, [pathname])

  return null
}