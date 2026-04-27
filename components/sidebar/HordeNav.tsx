'use client'

import Link from 'next/link'
import { HordeSidebarIcon } from './HordeIconAssets'

type NavItem = {
  label: string
  href?: string
  active?: boolean
  badgeCount?: number
  icon: 'explore' | 'sessions' | 'chat' | 'guide' | 'support' | 'rules'
}

function RowSeparator({
  stronger = false,
}: {
  stronger?: boolean
}) {
  return (
    <div className="pointer-events-none absolute bottom-0 left-[16px] right-[16px]">
      <div
        className={`h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,118,78,${
          stronger ? '0.14' : '0.09'
        })_14%,rgba(255,118,78,${
          stronger ? '0.18' : '0.11'
        })_50%,rgba(255,118,78,${
          stronger ? '0.14' : '0.09'
        })_86%,transparent_100%)]`}
      />
    </div>
  )
}

function IconStage({
  children,
  active = false,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <div
      className={`relative flex h-[48px] w-[52px] shrink-0 items-center justify-center overflow-visible ${
        active ? 'opacity-100' : 'opacity-[0.84]'
      }`}
    >
      {active ? (
        <span className="pointer-events-none absolute inset-0 rounded-[12px] bg-[radial-gradient(circle,rgba(255,96,56,0.05)_0%,rgba(255,96,56,0.02)_52%,transparent_78%)]" />
      ) : null}
      {children}
    </div>
  )
}

function NavRow({
  label,
  icon,
  href,
  badgeCount,
  active = false,
}: {
  label: string
  icon: NavItem['icon']
  href?: string
  badgeCount?: number
  active?: boolean
}) {
  return (
    <Link href={href || '#'} className="block">
      <div className="group relative min-h-[68px] px-[14px] py-[6px]">
        {active ? (
          <>
            <span className="pointer-events-none absolute inset-y-[8px] left-[12px] right-[12px] bg-[linear-gradient(90deg,rgba(112,34,24,0.16)_0%,rgba(58,18,18,0.06)_34%,rgba(20,8,10,0.00)_100%)]" />
            <span className="pointer-events-none absolute inset-y-[12px] left-[12px] w-[3px] rounded-r bg-[linear-gradient(180deg,#ff9a70_0%,#993523_100%)] opacity-80" />
            <span className="pointer-events-none absolute inset-y-[8px] left-[12px] right-[12px] bg-[radial-gradient(circle_at_16%_50%,rgba(255,96,56,0.05),transparent_30%)]" />
          </>
        ) : null}

        <div className="relative z-10 flex min-w-0 items-center gap-3">
          <IconStage active={active}>
            <HordeSidebarIcon kind={icon} active={active} />
          </IconStage>

          <div className="min-w-0 flex-1">
            <div
              className={`truncate ${
                active
                  ? 'text-[15px] font-bold tracking-[0.01em] text-[#fff1e8]'
                  : 'text-[15px] font-medium tracking-[0.005em] text-[#ead0c7] transition-colors group-hover:text-[#fff1e8]'
              }`}
            >
              {label}
            </div>
          </div>

          {!!badgeCount && badgeCount > 0 ? (
            <span className="inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </div>

        <RowSeparator stronger={active} />
      </div>
    </Link>
  )
}

export function HordeNavItem({ item }: { item: NavItem }) {
  return (
    <NavRow
      label={item.label}
      icon={item.icon}
      href={item.href}
      badgeCount={item.badgeCount}
      active={!!item.active}
    />
  )
}