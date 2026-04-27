'use client'

type HordeSidebarIconKind =
  | 'explore'
  | 'sessions'
  | 'chat'
  | 'guide'
  | 'support'
  | 'rules'

const ICON_CONFIG: Record<
  HordeSidebarIconKind,
  {
    width: number
    height: number
    x: number
    y: number
    scale: number
  }
> = {
  explore: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.18,
  },
  sessions: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.0,
  },
  chat: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.0,
  },
  guide: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.04,
  },
  rules: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.06,
  },
  support: {
    width: 68,
    height: 68,
    x: 0,
    y: 0,
    scale: 1.02,
  },
}

export function HordeSidebarIcon({
  kind,
  active = false,
}: {
  kind: HordeSidebarIconKind
  active?: boolean
}) {
  const cfg = ICON_CONFIG[kind]
  const src = `/horde-icons/${kind}.png`

  return (
    <img
      src={src}
      alt={kind}
      draggable={false}
      className="pointer-events-none select-none object-contain transition duration-200"
      style={{
        width: `${cfg.width}px`,
        height: `${cfg.height}px`,
        transform: `translate(${cfg.x}px, ${cfg.y}px) scale(${cfg.scale})`,
        transformOrigin: 'center center',
        mixBlendMode: 'screen',
        opacity: active ? 1 : 0.96,
        filter: active
          ? 'brightness(1.08) contrast(1.08) saturate(1.06)'
          : 'brightness(1.02) contrast(1.03) saturate(1.02)',
      }}
    />
  )
}