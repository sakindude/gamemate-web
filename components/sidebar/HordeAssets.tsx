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

const STAT_CHAMFER =
  'polygon(3.5% 0%,96.5% 0%,100% 18%,100% 82%,96.5% 100%,3.5% 100%,0% 82%,0% 18%)'

function getToneClasses(tone: HordeFrameTone) {
  switch (tone) {
    case 'primary':
      return {
        bg: 'bg-[linear-gradient(180deg,#18090b_0%,#100405_100%)]',
        innerBorder: 'border-[#d46b4d]/10',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.08),transparent_48%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.16)_50%,transparent_100%)]',
      }
    case 'secondary':
      return {
        bg: 'bg-[linear-gradient(180deg,#17080a_0%,#0f0405_100%)]',
        innerBorder: 'border-[#c85f45]/8',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.06),transparent_50%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.11)_50%,transparent_100%)]',
      }
    case 'inner':
    default:
      return {
        bg: 'bg-[linear-gradient(180deg,#241013_0%,#15080a_100%)]',
        innerBorder: 'border-[#c85f45]/7',
        glow: 'bg-[radial-gradient(circle_at_50%_100%,rgba(255,70,40,0.05),transparent_52%)]',
        ridge: 'bg-[linear-gradient(90deg,transparent_0%,rgba(255,106,61,0.10)_50%,transparent_100%)]',
      }
  }
}

function HordeOuterShape({
  compact = false,
}: {
  compact?: boolean
}) {
  const viewBoxHeight = compact ? 146 : 250

  const outerPath = compact
    ? 'M52 22 L68 10 L932 10 L948 22 L970 22 L988 40 L988 106 L970 124 L948 124 L932 136 L68 136 L52 124 L30 124 L12 106 L12 40 L30 22 Z'
    : 'M44 24 L60 12 L940 12 L956 24 L972 24 L988 42 L988 208 L972 226 L956 226 L940 238 L60 238 L44 226 L28 226 L12 208 L12 42 L28 24 Z'

  const innerPath = compact
    ? 'M70 26 L82 18 L918 18 L930 26 L962 26 L976 40 L976 106 L962 120 L930 120 L918 128 L82 128 L70 120 L38 120 L24 106 L24 40 L38 26 Z'
    : 'M62 28 L76 18 L924 18 L938 28 L966 28 L978 42 L978 208 L966 222 L938 222 L924 232 L76 232 L62 222 L34 222 L22 208 L22 42 L34 28 Z'

  const accentLines = compact
    ? 'M104 32 L146 32 M854 32 L896 32 M104 114 L146 114 M854 114 L896 114'
    : 'M100 38 L150 38 M850 38 L900 38 M100 212 L150 212 M850 212 L900 212'

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
          <stop offset="0%" stopColor="#160809" />
          <stop offset="100%" stopColor="#0d0405" />
        </linearGradient>
      </defs>

      <path
        d={outerPath}
        fill="url(#horde-frame-fill)"
        stroke="url(#horde-frame-outer)"
        strokeWidth={compact ? '4.1' : '4.7'}
        opacity="0.96"
      />

      <path
        d={innerPath}
        fill="none"
        stroke="url(#horde-frame-inner)"
        strokeWidth={compact ? '1.45' : '1.75'}
        opacity="0.88"
      />

      <path
        d={accentLines}
        stroke="#51201b"
        strokeWidth={compact ? '1.15' : '1.35'}
        opacity="0.64"
      />
    </svg>
  )
}

export function HordeCorner({
  position,
  small = false,
  glow = false,
}: {
  position: 'tl' | 'tr' | 'bl' | 'br'
  small?: boolean
  glow?: boolean
}) {
  const map = {
    tl: small ? 'left-1.5 top-1.5' : 'left-[6px] top-[6px]',
    tr: small ? 'right-1.5 top-1.5' : 'right-[6px] top-[6px]',
    bl: small ? 'left-1.5 bottom-1.5' : 'left-[6px] bottom-[6px]',
    br: small ? 'right-1.5 bottom-1.5' : 'right-[6px] bottom-[6px]',
  }

  return (
    <span
      className={`pointer-events-none absolute ${map[position]} ${
        small ? 'h-[10px] w-[10px]' : 'h-[12px] w-[12px]'
      } rotate-45 rounded-[2px] border border-[#874133] bg-[linear-gradient(180deg,#3a1311_0%,#21090b_100%)] ${
        glow ? 'shadow-[0_0_8px_rgba(255,95,60,0.14)]' : 'shadow-[0_0_5px_rgba(185,62,40,0.10)]'
      }`}
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
      className={`pointer-events-none absolute ${side === 'left' ? 'left-[10px]' : 'right-[10px]'} top-1/2 h-[7px] w-[7px] -translate-y-1/2 rotate-45 rounded-[1px] border border-[#7f382a] bg-[linear-gradient(180deg,#311214_0%,#1d090a_100%)]`}
      aria-hidden="true"
    />
  )
}

function BottomGem() {
  return (
    <span
      className="pointer-events-none absolute left-1/2 bottom-[-4px] h-[9px] w-[9px] -translate-x-1/2 rotate-45 rounded-[2px] border border-[#b7654b] bg-[linear-gradient(180deg,#4a1715_0%,#2a0d0d_100%)] shadow-[0_0_7px_rgba(255,90,60,0.14)]"
      aria-hidden="true"
    >
      <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-[#ffb084] bg-[linear-gradient(180deg,#ff9d75_0%,#7b2418_100%)]" />
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

      <div className={`relative z-10 ${compact ? 'px-[9px] py-[7px]' : 'px-[10px] py-[10px]'}`}>
        <div
          className={`relative overflow-hidden rounded-[13px] ${toneClasses.bg} ${
            compact ? 'px-4 py-2' : 'p-3'
          } shadow-[inset_0_1px_0_rgba(255,155,120,0.04),inset_0_-8px_18px_rgba(0,0,0,0.18)]`}
        >
          <span
            className={`pointer-events-none absolute inset-[1px] rounded-[12px] border ${toneClasses.innerBorder}`}
          />
          <span className={`pointer-events-none absolute left-5 right-5 top-0 h-px ${toneClasses.ridge}`} />
          <span className={`pointer-events-none absolute inset-0 ${toneClasses.glow}`} />

          {corners ? (
            <>
              <HordeCorner position="tl" glow />
              <HordeCorner position="tr" glow />
              <HordeCorner position="bl" glow />
              <HordeCorner position="br" glow />
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
    <div
      className={`relative overflow-visible rounded-[22px] border border-[#4a1b17] bg-[linear-gradient(180deg,#130607_0%,#0d0405_100%)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[22px] shadow-[0_0_16px_rgba(180,50,25,0.16)]" />
      <div className="pointer-events-none absolute inset-[2px] rounded-[20px] border border-[#6a2c23] bg-[linear-gradient(180deg,#19090b_0%,#100405_100%)] shadow-[inset_0_1px_0_rgba(255,160,120,0.05),inset_0_-8px_18px_rgba(0,0,0,0.42)]" />
      <span className="pointer-events-none absolute left-10 right-10 top-[2px] h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,140,100,0.28)_50%,transparent_100%)]" />
      <span className="pointer-events-none absolute left-10 right-10 bottom-[2px] h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,140,100,0.14)_50%,transparent_100%)]" />
      <span className="pointer-events-none absolute left-0 top-12 bottom-12 w-px bg-[linear-gradient(180deg,transparent_0%,rgba(255,120,80,0.14)_50%,transparent_100%)]" />
      <span className="pointer-events-none absolute right-0 top-12 bottom-12 w-px bg-[linear-gradient(180deg,transparent_0%,rgba(255,120,80,0.14)_50%,transparent_100%)]" />

      {corners ? (
        <>
          <HordeCorner position="tl" glow />
          <HordeCorner position="tr" glow />
          <HordeCorner position="bl" glow />
          <HordeCorner position="br" glow />
        </>
      ) : null}

      <div className="relative z-10">{children}</div>
    </div>
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
    <div className={`relative overflow-hidden ${className}`} style={{ clipPath: STAT_CHAMFER }}>
      <span
        className="pointer-events-none absolute inset-0 border border-[#6e2f24] bg-[linear-gradient(180deg,rgba(25,9,11,0.72)_0%,rgba(12,5,7,0.82)_100%)] backdrop-blur-[1px]"
        style={{ clipPath: STAT_CHAMFER }}
      />
      <span
        className="pointer-events-none absolute inset-[1px] border border-[#cf6b4d]/10"
        style={{ clipPath: STAT_CHAMFER }}
      />
      <span className="pointer-events-none absolute left-6 right-6 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,122,82,0.09)_50%,transparent_100%)]" />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,92,58,0.03),transparent_36%)]" />
      <div className="relative z-10 px-4 py-[10px]">{children}</div>
    </div>
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

export function HordeCrest({
  className = 'h-10 w-10',
}: {
  className?: string
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="horde-crest-red"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ff9a72" />
          <stop offset="0.45" stopColor="#cf4a31" />
          <stop offset="1" stopColor="#4d1713" />
        </linearGradient>
        <linearGradient
          id="horde-crest-dark"
          x1="32"
          y1="0"
          x2="32"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2a0f10" />
          <stop offset="1" stopColor="#120607" />
        </linearGradient>
      </defs>

      <path
        d="M32 4l8 8 12 2-8 10 2 12-14 24-14-24 2-12-8-10 12-2 8-8Z"
        fill="url(#horde-crest-dark)"
        stroke="#6e2a20"
        strokeWidth="2"
      />
      <path
        d="M32 14l6 6 8 1-6 7 1 8-9 16-9-16 1-8-6-7 8-1 6-6Z"
        fill="url(#horde-crest-red)"
        opacity="0.96"
      />
      <path d="M23 22l9 10 9-10-5 2-4 5-4-5-5-2Z" fill="#170607" />
      <path d="M29 33l3 12 3-12-3-4-3 4Z" fill="#180708" />
    </svg>
  )
}