'use client'

import type { ReactNode } from 'react'

type HordeProfileCardProps = {
  avatarUrl: string
  avatarLabel: string
  balanceText: string
  displayName: string
  onAvatarClick: () => void
  onWalletClick: () => void
  primaryButton?: ReactNode
  secondaryButton?: ReactNode
}

const AVATAR_FRAME_SIZE = 148
const AVATAR_INSET = 18
const AVATAR_RADIUS = 24

function WalletGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[14px] w-[14px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1H6.5A2.5 2.5 0 0 0 4 10.5v-3Z" />
      <path d="M4 10.5A2.5 2.5 0 0 1 6.5 8H20v8.5A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-6Z" />
      <path d="M16.5 13.5h3" />
    </svg>
  )
}

export function HordeProfileCard({
  avatarUrl,
  avatarLabel,
  balanceText,
  displayName,
  onAvatarClick,
  onWalletClick,
  primaryButton,
  secondaryButton,
}: HordeProfileCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-[190px] flex-col items-center">
      <button
        type="button"
        onClick={onAvatarClick}
        title={avatarLabel}
        className="group relative cursor-pointer rounded-none bg-transparent p-0 transition hover:brightness-[1.03]"
      >
        <div
          className="relative"
          style={{
            width: `${AVATAR_FRAME_SIZE}px`,
            height: `${AVATAR_FRAME_SIZE}px`,
          }}
        >
          <div
            className="absolute overflow-hidden"
            style={{
              inset: `${AVATAR_INSET}px`,
              borderRadius: `${AVATAR_RADIUS}px`,
            }}
          >
            <img
              src={avatarUrl}
              alt={avatarLabel}
              className="h-full w-full select-none object-cover"
              draggable={false}
            />
          </div>

          <img
            src="/sidebar-textures/avatar-border.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
          />
        </div>
      </button>

      <div
        className="mt-3 max-w-[190px] truncate text-center text-[18px] font-bold tracking-[0.01em] text-[#ffe8de]"
        title={displayName}
      >
        {displayName}
      </div>

      <div className="relative mt-2 w-[142px]">
        <div className="h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,118,78,0.07)_18%,rgba(255,118,78,0.13)_50%,rgba(255,118,78,0.07)_82%,transparent_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-[rgba(204,93,66,0.42)] bg-[rgba(34,10,12,0.72)]" />
      </div>

      <button
        type="button"
        onClick={onWalletClick}
        className="group mt-3 flex cursor-pointer items-center gap-2 px-2 py-1 text-center"
      >
        <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center text-[#cfa192] transition-colors group-hover:text-[#fff1e8]">
          <WalletGlyph />
        </span>

        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9f7b74] transition-colors group-hover:text-[#cfaa9d]">
          Balance
        </span>

        <span className="text-[17px] font-bold leading-none tracking-[-0.02em] text-[#f2d1c3] transition-colors group-hover:text-[#fff1e8]">
          {balanceText}
        </span>
      </button>

      {(primaryButton || secondaryButton) ? (
        <div className="mt-2 w-full">
          <div className="mx-auto flex w-full max-w-[186px] flex-col gap-[2px]">
            {primaryButton ? <div>{primaryButton}</div> : null}
            {secondaryButton ? <div>{secondaryButton}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}