'use client'

import type { ReactNode } from 'react'

type HordeFrameTone = 'primary' | 'secondary' | 'inner'

type HordeFrameProps = {
  children: ReactNode
  className?: string
  tone?: HordeFrameTone
  compact?: boolean
  showBottomGem?: boolean
  sideGems?: boolean
  corners?: boolean
}

type HordeIconPlateProps = {
  children: ReactNode
  className?: string
  active?: boolean
}

function getToneClasses(tone: HordeFrameTone) {
  switch (tone) {
    case 'primary':
      return {
        bg: 'bg-[linear-gradient(180deg,#18090b_0%,#100405_100%)]',
        innerBorder: 'border-[#d46b4d]/10',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.10),transparent_46%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.18)_50%,transparent_100%)]',
      }
    case 'secondary':
      return {
        bg: 'bg-[linear-gradient(180deg,#17080a_0%,#0f0405_100%)]',
        innerBorder: 'border-[#c85f45]/8',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.08),transparent_48%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.12)_50%,transparent_100%)]',
      }
    case 'inner':
    default:
      return {
        bg: 'bg-[linear-gradient(180deg,#241013_0%,#15080a_100%)]',
        innerBorder: 'border-[#c85f45]/7',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.06),transparent_50%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.10)_50%,transparent_100%)]',
      }
  }
}

function HordeOuterShape({
  compact = false,
}: {
  compact?: boolean
}) {
  const viewBoxHeight = compact ? 180 : 260
  const outerPath = compact
    ? 'M42 24 L60 12 L940 12 L958 24 L976 24 L988 40 L988 140 L976 156 L958 156 L940 168 L60 168 L42 156 L24 156 L12 140 L12 40 L24 24 Z'
    : 'M42 26 L58 12 L942 12 L958 26 L972 26 L988 44 L988 216 L972 234 L958 234 L942 248 L58 248 L42 234 L28 234 L12 216 L12 44 L28 26 Z'

  const innerPath = compact
    ? 'M62 28 L78 18 L922 18 L938 28 L968 28 L980 42 L980 138 L968 152 L938 152 L922 162 L78 162 L62 152 L32 152 L20 138 L20 42 L32 28 Z'
    : 'M60 28 L75 18 L925 18 L940 28 L968 28 L980 44 L980 216 L968 232 L940 232 L925 242 L75 242 L60 232 L32 232 L20 216 L20 44 L32 28 Z'

  const accentLines = compact
    ? 'M96 38 L152 38 M848 38 L904 38 M96 142 L152 142 M848 142 L904 142'
    : 'M100 40 L150 40 M850 40 L900 40 M100 220 L150 220 M850 220 L900 220'

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 1000 ${viewBoxHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="horde-frame-outer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7b3629" />
          <stop offset="0.30" stopColor="#c97856" />
          <stop offset="0.62" stopColor="#884032" />
          <stop offset="1" stopColor="#3c1514" />
        </linearGradient>

        <linearGradient id="horde-frame-inner" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a1011" />
          <stop offset="0.5" stopColor="#854031" />
          <stop offset="1" stopColor="#2a1011" />
        </linearGradient>

        <linearGradient id="horde-frame-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#18090b" />
          <stop offset="100%" stopColor="#100405" />
        </linearGradient>
      </defs>

      <path
        d={outerPath}
        fill="url(#horde-frame-fill)"
        stroke="url(#horde-frame-outer)"
        strokeWidth={compact ? '4.6' : '4.8'}
        opacity="0.94"
      />

      <path
        d={innerPath}
        fill="none"
        stroke="url(#horde-frame-inner)"
        strokeWidth="1.8"
        opacity="0.92"
      />

      <path
        d={accentLines}
        stroke="#51201b"
        strokeWidth="1.5"
        opacity="0.75"
      />
    </svg>
  )
}

function CornerGem({
  position,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br'
}) {
  const map = {
    tl: 'left-[6px] top-[6px]',
    tr: 'right-[6px] top-[6px]',
    bl: 'left-[6px] bottom-[6px]',
    br: 'right-[6px] bottom-[6px]',
  }

  return (
    <span
      className={`pointer-events-none absolute ${map[position]} h-[12px] w-[12px] rotate-45 rounded-[2px] border border-[#874133] bg-[linear-gradient(180deg,#3a1311_0%,#21090b_100%)] shadow-[0_0_8px_rgba(255,95,60,0.14)]`}
      aria-hidden="true"
    >
      <span className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-[#c75d42] bg-[linear-gradient(180deg,#ff9a72_0%,#7b2418_100%)] opacity-90" />
    </span>
  )
}

function SideGem({
  side,
}: {
  side: 'left' | 'right'
}) {
  return (
    <span
      className={`pointer-events-none absolute ${side === 'left' ? 'left-[10px]' : 'right-[10px]'} top-1/2 h-[8px] w-[8px] -translate-y-1/2 rotate-45 rounded-[2px] border border-[#7f382a] bg-[linear-gradient(180deg,#311214_0%,#1d090a_100%)]`}
      aria-hidden="true"
    />
  )
}

function BottomGem() {
  return (
    <span
      className="pointer-events-none absolute left-1/2 bottom-[-5px] h-[10px] w-[10px] -translate-x-1/2 rotate-45 rounded-[2px] border border-[#b7654b] bg-[linear-gradient(180deg,#4a1715_0%,#2a0d0d_100%)] shadow-[0_0_8px_rgba(255,90,60,0.18)]"
      aria-hidden="true"
    >
      <span className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-[#ffb084] bg-[linear-gradient(180deg,#ff9d75_0%,#7b2418_100%)]" />
    </span>
  )
}

export function HordeFrame({
  children,
  className = '',
  tone = 'primary',
  compact = false,
  showBottomGem = false,
  sideGems = false,
  corners = true,
}: HordeFrameProps) {
  const toneClasses = getToneClasses(tone)

  return (
    <div className={`relative overflow-visible rounded-[20px] ${className}`}>
      <HordeOuterShape compact={compact} />

      {showBottomGem ? <BottomGem /> : null}
      {sideGems ? (
        <>
          <SideGem side="left" />
          <SideGem side="right" />
        </>
      ) : null}

      <div className={`relative z-10 ${compact ? 'px-[12px] py-[10px]' : 'px-[12px] py-[12px]'}`}>
        <div
          className={`relative overflow-hidden rounded-[14px] ${toneClasses.bg} ${
            compact ? 'px-4 py-2.5' : 'p-3'
          } shadow-[inset_0_1px_0_rgba(255,155,120,0.04),inset_0_-10px_20px_rgba(0,0,0,0.20)]`}
        >
          <span className={`pointer-events-none absolute inset-[1px] rounded-[13px] border ${toneClasses.innerBorder}`} />
          <span className={`pointer-events-none absolute left-5 right-5 top-0 h-px ${toneClasses.ridge}`} />
          <span className={`pointer-events-none absolute inset-0 ${toneClasses.glow}`} />

          {corners ? (
            <>
              <CornerGem position="tl" />
              <CornerGem position="tr" />
              <CornerGem position="bl" />
              <CornerGem position="br" />
            </>
          ) : null}

          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function HordePanelFrame({
  children,
  className = '',
  corners = true,
}: HordeFrameProps) {
  return (
    <HordeFrame
      className={className}
      tone="primary"
      compact={false}
      showBottomGem={false}
      sideGems={false}
      corners={corners}
    >
      {children}
    </HordeFrame>
  )
}

export function HordeStatFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <HordeFrame
      className={className}
      tone="secondary"
      compact
      showBottomGem={false}
      sideGems
      corners={false}
    >
      {children}
    </HordeFrame>
  )
}

export function HordeSwitchFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <HordeFrame
      className={className}
      tone="primary"
      compact
      showBottomGem
      sideGems
      corners={false}
    >
      {children}
    </HordeFrame>
  )
}

export function HordePlate({
  children,
  className = '',
  active = false,
}: {
  children: ReactNode
  className?: string
  active?: boolean
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border ${
        active
          ? 'border-[#a24a37] bg-[linear-gradient(90deg,#6c2117_0%,#321012_100%)] text-[#fff1ea] shadow-[inset_0_1px_0_rgba(255,188,155,0.08),0_0_0_1px_rgba(164,74,55,0.18),0_0_18px_rgba(175,55,30,0.18)]'
          : 'border-[#4a1d18] bg-[linear-gradient(180deg,#1d0b0f_0%,#130708_100%)] text-[#d6b7b0] shadow-[inset_0_1px_0_rgba(255,150,120,0.03)]'
      } ${className}`}
    >
      {active ? (
        <>
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[linear-gradient(180deg,#ff9467_0%,#9d3725_100%)] shadow-[0_0_10px_rgba(255,125,86,0.30)]" />
          <span className="pointer-events-none absolute inset-[1px] rounded-[16px] border border-[#d97559]/16" />
        </>
      ) : (
        <span className="pointer-events-none absolute inset-[1px] rounded-[16px] border border-[#6a2d24]/8" />
      )}

      <div className="relative z-10">{children}</div>
    </div>
  )
}

export function HordeButtonPlate({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={`relative overflow-hidden rounded-[16px] border border-[#5d2821] bg-[linear-gradient(180deg,#281013_0%,#17080a_100%)] px-4 py-3 text-sm font-semibold text-[#f5e6e0] shadow-[inset_0_1px_0_rgba(255,120,80,0.04)] transition hover:bg-[linear-gradient(180deg,#311316_0%,#1e0a0d_100%)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-[1px] rounded-[14px] border border-[#7a352b]/8" />
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export function HordeIconPlate({
  children,
  className = '',
  active = false,
}: HordeIconPlateProps) {
  return (
    <div
      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border ${
        active
          ? 'border-[#a24a37] bg-[linear-gradient(180deg,#4f1814_0%,#240b0d_100%)] text-[#ff9e74] shadow-[0_0_10px_rgba(255,110,70,0.16)]'
          : 'border-[#4c1d18] bg-[linear-gradient(180deg,#221012_0%,#14090b_100%)] text-[#b48d86]'
      } ${className}`}
    >
      <span className="pointer-events-none absolute inset-[1px] rounded-[10px] border border-[#7a352b]/10" />
      <span className="relative z-10">{children}</span>
    </div>
  )
}

export function HordeDivider() {
  return (
    <div className="relative my-3">
      <div className="h-px bg-[linear-gradient(90deg,transparent_0%,rgba(192,85,58,0.18)_18%,rgba(92,28,22,0.78)_50%,rgba(192,85,58,0.18)_82%,transparent_100%)]" />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-[#8b4435] bg-[linear-gradient(180deg,#5c1a15_0%,#2a0d0d_100%)] shadow-[0_0_8px_rgba(210,90,55,0.16)]" />
    </div>
  )
}