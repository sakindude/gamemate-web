// START_FILE: app/(app-shell)/sessions/page.tsx
'use client'

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

type PendingBookingRow = {
  id: string
  buyer_id: string
  seller_id: string
  status: string
  game: string | null
  communication_method: string | null
  created_at: string
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
  duration_minutes: number | null
}

type SessionRow = {
  id: string
  booking_request_id: string
  buyer_id: string
  seller_id: string
  status: string
  duration_minutes: number | null
  started_at: string | null
  planned_end_at: string | null
  ended_at: string | null
  completed_at: string | null
  buyer_started_at: string | null
  seller_started_at: string | null
  buyer_completed_at: string | null
  seller_completed_at: string | null
  no_show_side: string | null
  auto_complete_at: string | null
  dispute_deadline_at: string | null
  created_at: string
  updated_at: string
  tip_eligible: boolean
  tip_already_given: boolean
  tip_amount_cents: number | null
  tip_expires_at: string | null
  tip_block_reason: string | null
  payout_hold_status: string | null
  payout_releasable_at: string | null
  payout_released_at: string | null
  payout_seller_payout_cents: number | null
}

type BookingInfoRow = {
  id: string
  game: string | null
  communication_method: string | null
  created_at: string
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
  duration_minutes: number | null
}

type ProfileRow = {
  id: string
  username?: string | null
  display_name?: string | null
}

type ProfileMap = Record<string, ProfileRow>

type ReviewStatus = {
  success?: boolean
  session_id?: string
  can_rate?: boolean
  has_already_rated?: boolean
  rating_target_user_id?: string | null
  rating_target_role?: 'buyer' | 'seller' | null
  block_reason?: string | null
  message?: string
}

type ReviewStatusMap = Record<string, ReviewStatus | undefined>

type PendingBookingCard = PendingBookingRow & {
  kind: 'pending_booking'
  role: 'buyer' | 'seller'
  other_user_id: string
  priority: number
  role_label: string
  action_label: string
}

type SessionCard = SessionRow & {
  kind: 'session'
  role: 'buyer' | 'seller'
  other_user_id: string
  priority: number
  role_label: string
  action_label: string
  game: string | null
  communication_method: string | null
  base_price_cents: number | null
  tip_cents: number | null
  processing_fee_cents: number | null
  platform_fee_cents: number | null
  total_amount_cents: number | null
  seller_payout_cents: number | null
}

type FeedCard = PendingBookingCard | SessionCard

type RpcJsonResult = {
  success?: boolean
  message?: string
  [key: string]: any
}

type BlockingInfo = {
  itemId: string
  itemKind: 'pending_booking' | 'session'
  status:
  | 'pending_seller'
  | 'pending_buyer'
  | 'ready_to_start'
  | 'active'
  | 'awaiting_confirmation_self_pending'
  title: string
  description: string
  buttonLabel: string
  priority: number
}

type SessionVisualTone =
  | 'pending'
  | 'ready'
  | 'active'
  | 'awaiting'
  | 'completed'
  | 'disputed'
  | 'negative'
  | 'neutral'

type SessionVisualMeta = {
  tone: SessionVisualTone
  badge: string
  rightTitle: string
  explanation: string
  helper: string
}

type ContextRowItem = {
  label: string
  value: string
  emphasis?: 'default' | 'positive' | 'warning' | 'muted'
}

type CardCountdownMeta = {
  text: string
  className: string
  tone: SessionVisualTone
  showProgress: boolean
}

type SessionsFilterKey =
  | 'all'
  | 'open'
  | 'awaiting'
  | 'completed'
  | 'disputed'

type ActionIntent =
  | 'accept'
  | 'reject'
  | 'start'
  | 'complete'
  | 'report_submit'
  | 'tip_submit'
  | 'review_submit'
  | 'chat'

type TipPreset = 100 | 200 | 500 | 1000

type ReviewCategoryKey =
  | 'punctuality'
  | 'communication'
  | 'vibe'
  | 'reliability'
  | 'skill'

type ReviewFormState = Record<ReviewCategoryKey, number>

type TipModalState = {
  session: SessionCard
  isOpening: boolean
}

type ReviewModalState = {
  session: SessionCard
  isOpening: boolean
}

type ActionTileProps = {
  label: string
  pendingLabel?: string
  onClick?: () => void
  disabled?: boolean
  variant: 'primary' | 'secondary' | 'danger' | 'tip'
  icon: ReactNode
  isPending?: boolean
}

type AutoRefreshIndicatorProps = {
  intervalMs: number
  cycleKey: number
  paused: boolean
  refreshing: boolean
  onRefresh: () => void
}

const AUTO_REFRESH_MS = 60000
const HISTORY_PAGE_SIZE = 10
const TIP_PRESETS: TipPreset[] = [100, 200, 500, 1000]
const ACTION_COOLDOWN_MS = 900
const MUTATION_REFRESH_COOLDOWN_MS = 1500
const PENDING_BOOKING_TIMEOUT_MS = 10 * 60 * 1000
const READY_TO_START_TIMEOUT_MS = 10 * 60 * 1000
const REVIEW_STATUS_BATCH_SIZE = 4
const REVIEW_STATUS_REFRESH_COOLDOWN_MS = 120000
const SESSIONS_HISTORY_LIMIT = 80

const REVIEW_CATEGORIES: Array<{ key: ReviewCategoryKey; label: string }> = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'communication', label: 'Communication' },
  { key: 'vibe', label: 'Vibe' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'skill', label: 'Skill' },
]

const DEFAULT_REVIEW_FORM: ReviewFormState = {
  punctuality: 5,
  communication: 5,
  vibe: 5,
  reliability: 5,
  skill: 5,
}

const REPORT_REASONS = [
  { value: 'didnt_show_up', label: `Didn't show up` },
  { value: 'very_late', label: 'Very late' },
  { value: 'different_from_profile', label: 'Different from profile' },
  { value: 'bad_behavior', label: 'Bad behavior' },
  { value: 'technical_problem', label: 'Technical problem' },
  { value: 'left_early', label: 'Left early' },
  { value: 'other', label: 'Other' },
]

function formatMoneyFromCents(value: number | null | undefined) {
  const safe = Number(value || 0)
  const amount = safe / 100
  const hasFraction = safe % 100 !== 0

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatPersonName(profile?: ProfileRow | null) {
  if (!profile) return 'User'
  return profile.display_name || profile.username || 'User'
}

function getInitials(profile?: ProfileRow | null) {
  const label = formatPersonName(profile).trim()
  if (!label) return 'U'

  const parts = label.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'PENDING'
    case 'ready_to_start':
      return 'READY'
    case 'active':
      return 'ACTIVE'
    case 'awaiting_confirmation':
      return 'AWAITING'
    case 'completed':
      return 'COMPLETED'
    case 'disputed':
      return 'DISPUTED'
    case 'cancelled':
      return 'CANCELLED'
    case 'rejected':
      return 'REJECTED'
    case 'no_show_buyer':
      return 'BUYER NO-SHOW'
    case 'no_show_seller':
      return 'SELLER NO-SHOW'
    default:
      return status.toUpperCase()
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'border border-amber-400/20 bg-amber-500/10 text-amber-200'
    case 'ready_to_start':
      return 'border border-sky-400/20 bg-sky-500/10 text-sky-200'
    case 'active':
      return 'border border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
    case 'awaiting_confirmation':
      return 'border border-violet-400/20 bg-violet-500/10 text-violet-200'
    case 'completed':
      return 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    case 'disputed':
      return 'border border-rose-400/20 bg-rose-500/10 text-rose-200'
    case 'rejected':
    case 'cancelled':
    case 'no_show_buyer':
    case 'no_show_seller':
      return 'border border-slate-500/20 bg-slate-500/10 text-slate-300'
    default:
      return 'border border-slate-400/20 bg-slate-500/10 text-slate-300'
  }
}

function getStateTone(status: string): SessionVisualTone {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'ready_to_start':
      return 'ready'
    case 'active':
      return 'active'
    case 'awaiting_confirmation':
      return 'awaiting'
    case 'completed':
      return 'completed'
    case 'disputed':
      return 'disputed'
    case 'rejected':
    case 'cancelled':
    case 'no_show_buyer':
    case 'no_show_seller':
      return 'negative'
    default:
      return 'neutral'
  }
}

function getToneStripClass(tone: SessionVisualTone) {
  switch (tone) {
    case 'pending':
      return 'bg-amber-300'
    case 'ready':
      return 'bg-sky-300'
    case 'active':
      return 'bg-cyan-300'
    case 'awaiting':
      return 'bg-violet-300'
    case 'completed':
      return 'bg-emerald-300'
    case 'disputed':
      return 'bg-rose-300'
    case 'negative':
      return 'bg-slate-400'
    default:
      return 'bg-slate-300'
  }
}
function getActionTintClass(tone: SessionVisualTone) {
  switch (tone) {
    case 'pending':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_55%)]'
    case 'ready':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_55%)]'
    case 'active':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_55%)]'
    case 'awaiting':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.10),transparent_55%)]'
    case 'completed':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_55%)]'
    case 'disputed':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.10),transparent_55%)]'
    case 'negative':
      return 'bg-[radial-gradient(circle_at_top_right,rgba(100,116,139,0.08),transparent_55%)]'
    default:
      return ''
  }
}

function getPendingBookingPriority(row: PendingBookingRow, myUserId: string): number {
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 1
  if (row.status === 'pending') return 2
  if (row.status === 'rejected') return 7

  return 8
}

function getPendingBookingActionLabel(row: PendingBookingRow, myUserId: string) {
  const isSeller = row.seller_id === myUserId

  if (row.status === 'pending' && isSeller) return 'You need to respond'
  if (row.status === 'pending') return 'Waiting for seller response'
  if (row.status === 'rejected') return 'Rejected'

  return 'No action'
}

function getSessionPriority(row: SessionRow, myUserId: string): number {
  const isBuyer = row.buyer_id === myUserId
  const isSeller = row.seller_id === myUserId

  if (row.status === 'ready_to_start') {
    if ((isBuyer && !row.buyer_started_at) || (isSeller && !row.seller_started_at)) return 3
    return 4
  }

  if (row.status === 'active') {
    if ((isBuyer && !row.buyer_completed_at) || (isSeller && !row.seller_completed_at)) return 5
    return 6
  }

  if (row.status === 'awaiting_confirmation') {
    if ((isBuyer && !row.buyer_completed_at) || (isSeller && !row.seller_completed_at)) return 5
    return 6
  }

  if (row.status === 'completed') {
    if (row.tip_eligible) return 7
    if (row.tip_already_given) return 8
    return 8
  }

  if (row.status === 'disputed') return 9
  if (row.status === 'cancelled' || row.status.startsWith('no_show')) return 10

  return 11
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDuration(minutes?: number | null) {
  if (!minutes) return '-'
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

function getRemainingLabel(plannedEndAt?: string | null) {
  if (!plannedEndAt) return '-'

  const diffMs = new Date(plannedEndAt).getTime() - Date.now()

  if (diffMs <= 0) return 'Time ended'

  const totalMinutes = Math.ceil(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

function getTargetTimeMs(value?: string | null) {
  if (!value) return null

  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function formatCountdownShort(diffMs: number) {
  const safeDiffMs = Math.max(0, diffMs)
  const totalMinutes = Math.max(1, Math.ceil(safeDiffMs / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
  }

  return `${totalMinutes}m`
}

function getCountdownClass(tone: SessionVisualTone) {
  switch (tone) {
    case 'pending':
      return 'border border-amber-400/20 bg-amber-500/10 text-amber-200'
    case 'ready':
      return 'border border-sky-400/20 bg-sky-500/10 text-sky-200'
    case 'active':
      return 'border border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
    case 'awaiting':
      return 'border border-violet-400/20 bg-violet-500/10 text-violet-200'
    case 'completed':
      return 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    default:
      return 'border border-slate-400/20 bg-slate-500/10 text-slate-300'
  }
}

function getCreatedAtPlusMs(createdAt: string, plusMs: number) {
  const createdAtMs = getTargetTimeMs(createdAt)
  if (createdAtMs === null) return null
  return createdAtMs + plusMs
}

function getCardCountdownMeta(row: FeedCard, nowMs: number): CardCountdownMeta | null {
  if (row.kind === 'pending_booking' && row.status === 'pending') {
    const expiresAtMs = getCreatedAtPlusMs(row.created_at, PENDING_BOOKING_TIMEOUT_MS)
    if (expiresAtMs === null) return null

    if (expiresAtMs <= nowMs) {
      return {
        text: 'Expired — awaiting system update',
        className: getCountdownClass('pending'),
        tone: 'pending',
        showProgress: true,
      }
    }

    return {
      text: `Request expires in ${formatCountdownShort(expiresAtMs - nowMs)}`,
      className: getCountdownClass('pending'),
      tone: 'pending',
      showProgress: true,
    }
  }

  if (row.kind !== 'session') return null

  if (row.status === 'ready_to_start') {
    const expiresAtMs = getCreatedAtPlusMs(row.created_at, READY_TO_START_TIMEOUT_MS)
    if (expiresAtMs === null) return null

    const selfStarted = row.role === 'buyer' ? !!row.buyer_started_at : !!row.seller_started_at
    const otherStarted = row.role === 'buyer' ? !!row.seller_started_at : !!row.buyer_started_at

    if (expiresAtMs <= nowMs) {
      return {
        text: 'Start window expired — awaiting system update',
        className: getCountdownClass('ready'),
        tone: 'ready',
        showProgress: true,
      }
    }

    if (selfStarted && !otherStarted) {
      return {
        text: `Waiting for the other player • ${formatCountdownShort(expiresAtMs - nowMs)} left`,
        className: getCountdownClass('ready'),
        tone: 'ready',
        showProgress: true,
      }
    }

    return {
      text: `Start window ends in ${formatCountdownShort(expiresAtMs - nowMs)}`,
      className: getCountdownClass('ready'),
      tone: 'ready',
      showProgress: true,
    }
  }

  if (row.status === 'active') {
    const plannedEndAtMs = getTargetTimeMs(row.planned_end_at)
    if (plannedEndAtMs === null) return null

    if (plannedEndAtMs <= nowMs) {
      return {
        text: 'Booked time ended',
        className: getCountdownClass('active'),
        tone: 'active',
        showProgress: true,
      }
    }

    return {
      text: `Booked time left: ${formatCountdownShort(plannedEndAtMs - nowMs)}`,
      className: getCountdownClass('active'),
      tone: 'active',
      showProgress: true,
    }
  }

  if (row.status === 'awaiting_confirmation') {
    const autoCompleteAtMs = getTargetTimeMs(row.auto_complete_at)
    if (autoCompleteAtMs === null) return null

    if (autoCompleteAtMs <= nowMs) {
      return {
        text: 'Awaiting system auto-complete',
        className: getCountdownClass('awaiting'),
        tone: 'awaiting',
        showProgress: false,
      }
    }

    return {
      text: `Auto-completes in ${formatCountdownShort(autoCompleteAtMs - nowMs)}`,
      className: getCountdownClass('awaiting'),
      tone: 'awaiting',
      showProgress: false,
    }
  }

  if (row.status === 'completed' && row.role === 'seller') {
    if (
      row.payout_hold_status === 'disputed' ||
      row.payout_hold_status === 'refunded' ||
      row.payout_hold_status === 'partial_refund'
    ) {
      return null
    }

    if (row.payout_hold_status === 'released' || row.payout_released_at) {
      return {
        text: 'Payout released',
        className: getCountdownClass('completed'),
        tone: 'completed',
        showProgress: false,
      }
    }

    const payoutReleasableAtMs = getTargetTimeMs(row.payout_releasable_at)

    if (payoutReleasableAtMs === null) return null

    if (payoutReleasableAtMs <= nowMs) {
      return {
        text: 'Awaiting payout release',
        className: getCountdownClass('completed'),
        tone: 'completed',
        showProgress: false,
      }
    }

    return {
      text: `Payout releases in ${formatCountdownShort(payoutReleasableAtMs - nowMs)}`,
      className: getCountdownClass('completed'),
      tone: 'completed',
      showProgress: false,
    }
  }

  if (row.status === 'completed' && row.role === 'buyer') {
    const disputeDeadlineAtMs = getTargetTimeMs(row.dispute_deadline_at)
    if (disputeDeadlineAtMs === null) return null

    if (disputeDeadlineAtMs <= nowMs) {
      return {
        text: 'Dispute window ended',
        className: getCountdownClass('completed'),
        tone: 'completed',
        showProgress: false,
      }
    }

    return {
      text: `Dispute window ends in ${formatCountdownShort(disputeDeadlineAtMs - nowMs)}`,
      className: getCountdownClass('completed'),
      tone: 'completed',
      showProgress: false,
    }
  }

  return null
}
function getCardSortTime(row: FeedCard) {
  const updated = 'updated_at' in row ? row.updated_at : null
  const raw = updated || row.created_at
  return new Date(raw).getTime()
}

function isHistoryCard(card: FeedCard) {
  if (card.kind === 'pending_booking') return card.status === 'rejected'

  return ['completed', 'disputed', 'cancelled', 'no_show_buyer', 'no_show_seller'].includes(
    card.status
  )
}

function matchesSessionsFilter(card: FeedCard, filter: SessionsFilterKey) {
  if (filter === 'all') return true

  if (filter === 'open') {
    if (card.kind === 'pending_booking') return card.status === 'pending'
    return card.status === 'ready_to_start' || card.status === 'active'
  }

  if (filter === 'awaiting') {
    return card.kind === 'session' && card.status === 'awaiting_confirmation'
  }

  if (filter === 'completed') {
    return card.kind === 'session' && card.status === 'completed'
  }

  if (filter === 'disputed') {
    return card.kind === 'session' && card.status === 'disputed'
  }

  return true
}

function getContextValueClass(emphasis: ContextRowItem['emphasis'] = 'default') {
  switch (emphasis) {
    case 'positive':
      return 'text-emerald-200'
    case 'warning':
      return 'text-violet-200'
    case 'muted':
      return 'text-slate-300'
    default:
      return 'text-white'
  }
}

function getTipBlockMessage(reason: string | null, row: SessionCard) {
  if (row.tip_already_given) {
    return `Tip sent • ${formatMoneyFromCents(row.tip_amount_cents)}`
  }

  switch (reason) {
    case 'window_expired':
      return 'Tip window closed'
    case 'buyer_favor_blocked':
      return 'Tipping blocked after buyer-favor dispute'
    case 'dispute_open':
      return 'Tip blocked while dispute is open'
    case 'not_completed':
      return 'Tip becomes available after full completion'
    case 'not_allowed_for_status':
      return 'Tipping is not available for this outcome'
    case 'already_tipped':
      return `Tip sent • ${formatMoneyFromCents(row.tip_amount_cents)}`
    default:
      return 'Tip unavailable'
  }
}

function formatTipExpiresAt(value: string | null) {
  if (!value) return null
  return `Tip window closes ${formatDateTime(value)}`
}

function getReviewBlockMessage(status?: ReviewStatus | null) {
  switch (status?.block_reason) {
    case 'already_rated':
      return 'Already rated'
    case 'session_not_completed':
      return 'Review available after completion'
    case 'disputed_session':
      return 'Review blocked for disputed sessions'
    default:
      return 'Review unavailable'
  }
}

function getMoneyStateTitle(row: FeedCard) {
  if (row.kind === 'pending_booking') {
    if (row.status === 'rejected') {
      return row.role === 'buyer' ? 'Refund path applied' : 'No payout released'
    }

    return row.role === 'buyer' ? 'Payment reserved' : 'Customer payment reserved'
  }

  switch (row.status) {
    case 'ready_to_start':
      return row.role === 'buyer' ? 'Payment still reserved' : 'Payout not released yet'
    case 'active':
      return row.role === 'buyer'
        ? 'Payment remains reserved'
        : 'Payout is not released during live session'
    case 'awaiting_confirmation':
      return row.role === 'buyer'
        ? 'Payment still on hold'
        : 'Payout still waiting for final completion'
    case 'completed':
      return row.role === 'buyer' ? 'Payment completed' : 'Payout pending release'
    case 'disputed':
      return 'Funds on hold during dispute'
    case 'cancelled':
    case 'rejected':
    case 'no_show_buyer':
    case 'no_show_seller':
      return row.role === 'buyer' ? 'Refund path applied' : 'No payout released'
    default:
      return row.role === 'buyer' ? 'Payment state' : 'Payout state'
  }
}

function getMoneyStateDescription(row: FeedCard) {
  if (row.kind === 'pending_booking') {
    if (row.status === 'rejected') {
      if (row.role === 'buyer') {
        return 'This request was rejected. Reserved money returns through the refund path.'
      }

      return 'This request was rejected. No seller payout is released for this outcome.'
    }

    if (row.role === 'buyer') {
      return 'Your payment is reserved while this booking request waits for a seller response.'
    }

    return 'The buyer payment is reserved, but nothing is paid out until the session flow is completed.'
  }

  switch (row.status) {
    case 'ready_to_start':
      if (row.role === 'buyer') {
        return 'Your payment is still reserved. It does not finalize just because the session exists.'
      }

      return 'The booking exists, but seller payout cannot release before the session completes and clears the dispute window.'
    case 'active':
      if (row.role === 'buyer') {
        return 'Your payment is still reserved while the session is live.'
      }

      return 'The session is live. Seller payout is still waiting until the session outcome is finalized.'
    case 'awaiting_confirmation':
      if (row.role === 'buyer') {
        return 'Your payment is still reserved until both sides finish confirmation or the auto-complete path resolves it.'
      }

      return 'Seller payout still cannot release until the session fully resolves from awaiting confirmation.'
    case 'completed':
      if (row.role === 'buyer') {
        return 'Your payment is complete. A dispute can still affect the money outcome until the dispute window closes.'
      }

      return 'The session is completed. Seller payout normally waits until the dispute window passes.'
    case 'disputed':
      return 'Funds are paused during dispute review. Normal payout or refund flow does not continue until the dispute is resolved.'
    case 'cancelled':
    case 'rejected':
      if (row.role === 'buyer') {
        return 'This flow ended without normal completion. Buyer refund handling applies instead of payout.'
      }

      return 'This flow ended without normal completion, so seller payout does not release.'
    case 'no_show_buyer':
      if (row.role === 'buyer') {
        return 'This session was recorded as a buyer no-show. Refund is not expected from this outcome.'
      }

      return 'This session was recorded as a buyer no-show. Seller payout may be preserved by the final resolution path.'
    case 'no_show_seller':
      if (row.role === 'buyer') {
        return 'This session was recorded as a seller no-show. Buyer refund handling applies for this outcome.'
      }

      return 'This session was recorded as a seller no-show. Seller payout is not released for this outcome.'
    default:
      return row.role === 'buyer'
        ? 'Review this card to understand the current payment state.'
        : 'Review this card to understand the current payout state.'
  }
}

function buildContextRows(row: FeedCard): ContextRowItem[] {
  const rows: ContextRowItem[] = [
    {
      label: 'Communication',
      value: row.communication_method || 'Not specified',
      emphasis: 'muted',
    },
    {
      label: 'Duration',
      value: formatDuration(row.duration_minutes),
      emphasis: 'muted',
    },
  ]

  if (row.role === 'buyer') {
    rows.push({
      label: 'You paid',
      value: formatMoneyFromCents(row.total_amount_cents),
      emphasis: 'default',
    })
  } else {
    rows.push({
      label: 'Customer total',
      value: formatMoneyFromCents(row.total_amount_cents),
      emphasis: 'default',
    })
  }

  if (row.kind === 'session' && row.role === 'seller') {
    rows.push({
      label: 'Your payout',
      value: formatMoneyFromCents(row.seller_payout_cents),
      emphasis: 'positive',
    })
  }

  if (row.kind === 'session' && row.tip_already_given) {
    rows.push({
      label: 'Tip sent',
      value: formatMoneyFromCents(row.tip_amount_cents),
      emphasis: 'positive',
    })
  }

  return rows
}

function buildTimelineRows(row: FeedCard): ContextRowItem[] {
  const rows: ContextRowItem[] = [
    {
      label: 'Updated',
      value: formatDateTime(('updated_at' in row ? row.updated_at : null) || row.created_at),
      emphasis: 'muted',
    },
  ]

  if (row.kind === 'pending_booking') {
    rows.push({
      label: 'Requested',
      value: formatDateTime(row.created_at),
      emphasis: 'muted',
    })
    return rows
  }

  if (row.status === 'ready_to_start') {
    rows.push({
      label: 'Your start',
      value:
        row.role === 'buyer'
          ? formatDateTime(row.buyer_started_at)
          : formatDateTime(row.seller_started_at),
      emphasis: 'muted',
    })
    rows.push({
      label: 'Other side start',
      value:
        row.role === 'buyer'
          ? formatDateTime(row.seller_started_at)
          : formatDateTime(row.buyer_started_at),
      emphasis: 'muted',
    })
    return rows
  }

  if (row.status === 'active') {
    rows.push({
      label: 'Session started',
      value: formatDateTime(row.started_at),
      emphasis: 'muted',
    })
    rows.push({
      label: 'Planned end',
      value: formatDateTime(row.planned_end_at),
      emphasis: 'warning',
    })
    return rows
  }

  if (row.status === 'awaiting_confirmation') {
    rows.push({
      label: 'Completed by you',
      value:
        row.role === 'buyer'
          ? formatDateTime(row.buyer_completed_at)
          : formatDateTime(row.seller_completed_at),
      emphasis: 'muted',
    })
    rows.push({
      label: 'Deadline',
      value: formatDateTime(row.auto_complete_at),
      emphasis: 'warning',
    })
    return rows
  }

  if (row.status === 'completed') {
    rows.push({
      label: 'Completed',
      value: formatDateTime(row.completed_at),
      emphasis: 'positive',
    })
    rows.push({
      label: 'Dispute deadline',
      value: formatDateTime(row.dispute_deadline_at),
      emphasis: 'warning',
    })

    if (row.role === 'buyer' && row.tip_expires_at && !row.tip_already_given) {
      rows.push({
        label: 'Tip window',
        value: formatDateTime(row.tip_expires_at),
        emphasis: 'warning',
      })
    }

    return rows
  }

  if (row.status === 'disputed') {
    rows.push({
      label: 'Session started',
      value: formatDateTime(row.started_at),
      emphasis: 'muted',
    })
    rows.push({
      label: 'Review status',
      value: 'Under review',
      emphasis: 'warning',
    })
    return rows
  }

  return rows
}
function getCountdownProgressPercent(row: FeedCard, nowMs: number) {
  if (row.kind === 'pending_booking' && row.status === 'pending') {
    const startedAtMs = getTargetTimeMs(row.created_at)
    if (startedAtMs === null) return null

    const totalMs = PENDING_BOOKING_TIMEOUT_MS
    const elapsedMs = Math.min(Math.max(nowMs - startedAtMs, 0), totalMs)

    return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))
  }

  if (row.kind === 'session' && row.status === 'ready_to_start') {
    const startedAtMs = getTargetTimeMs(row.created_at)
    if (startedAtMs === null) return null

    const endAtMs = startedAtMs + READY_TO_START_TIMEOUT_MS
    const totalMs = READY_TO_START_TIMEOUT_MS
    const elapsedMs = Math.min(Math.max(nowMs - startedAtMs, 0), totalMs)

    if (endAtMs <= nowMs) return 100
    return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))
  }

  if (row.kind === 'session' && row.status === 'active') {
    const startedAtMs = getTargetTimeMs(row.started_at)
    const endAtMs = getTargetTimeMs(row.planned_end_at)

    if (startedAtMs === null || endAtMs === null || endAtMs <= startedAtMs) return null

    const totalMs = endAtMs - startedAtMs
    const elapsedMs = Math.min(Math.max(nowMs - startedAtMs, 0), totalMs)

    return Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))
  }

  return null
}

function getCountdownProgressBarClass(tone: SessionVisualTone) {
  switch (tone) {
    case 'pending':
      return 'bg-amber-300'
    case 'ready':
      return 'bg-sky-300'
    case 'active':
      return 'bg-cyan-300'
    default:
      return 'bg-white'
  }
}

function applyStartSessionOptimistic(
  rows: SessionRow[],
  sessionId: string,
  myUserId: string | null,
  result?: RpcJsonResult | null
) {
  if (!myUserId) return rows

  return rows.map((row) => {
    if (row.id !== sessionId) return row

    const nowIso = new Date().toISOString()
    const next = { ...row }

    if (myUserId === row.buyer_id && !next.buyer_started_at) next.buyer_started_at = nowIso
    if (myUserId === row.seller_id && !next.seller_started_at) next.seller_started_at = nowIso

    if (result?.buyer_started_at !== undefined) next.buyer_started_at = result.buyer_started_at
    if (result?.seller_started_at !== undefined) next.seller_started_at = result.seller_started_at
    if (result?.started_at !== undefined) next.started_at = result.started_at
    if (result?.planned_end_at !== undefined) next.planned_end_at = result.planned_end_at

    if (result?.status) {
      next.status = result.status
    } else if (next.buyer_started_at && next.seller_started_at) {
      next.status = 'active'
      next.started_at = next.started_at || nowIso
    }

    next.updated_at = nowIso
    return next
  })
}

function applyCompleteSessionOptimistic(
  rows: SessionRow[],
  sessionId: string,
  myUserId: string | null,
  result?: RpcJsonResult | null
) {
  if (!myUserId) return rows

  return rows.map((row) => {
    if (row.id !== sessionId) return row

    const nowIso = new Date().toISOString()
    const next = { ...row }

    if (myUserId === row.buyer_id && !next.buyer_completed_at) next.buyer_completed_at = nowIso
    if (myUserId === row.seller_id && !next.seller_completed_at) next.seller_completed_at = nowIso

    if (result?.buyer_completed_at !== undefined)
      next.buyer_completed_at = result.buyer_completed_at
    if (result?.seller_completed_at !== undefined)
      next.seller_completed_at = result.seller_completed_at
    if (result?.completed_at !== undefined) next.completed_at = result.completed_at
    if (result?.auto_complete_at !== undefined) next.auto_complete_at = result.auto_complete_at
    if (result?.dispute_deadline_at !== undefined)
      next.dispute_deadline_at = result.dispute_deadline_at

    if (result?.status) {
      next.status = result.status
    } else if (next.buyer_completed_at && next.seller_completed_at) {
      next.status = 'completed'
      next.completed_at = next.completed_at || nowIso
    } else {
      next.status = 'awaiting_confirmation'
      next.auto_complete_at = next.auto_complete_at || nowIso
    }

    next.updated_at = nowIso
    return next
  })
}

function getPendingBlockingMeta(
  row: PendingBookingRow,
  myUserId: string | null
): BlockingInfo | null {
  if (!myUserId || row.status !== 'pending') return null

  if (row.seller_id === myUserId) {
    return {
      itemId: row.id,
      itemKind: 'pending_booking',
      status: 'pending_seller',
      title: 'You have an incoming booking waiting',
      description: 'Accept or reject this request before taking another booking.',
      buttonLabel: 'Open incoming request',
      priority: 1,
    }
  }

  if (row.buyer_id === myUserId) {
    return {
      itemId: row.id,
      itemKind: 'pending_booking',
      status: 'pending_buyer',
      title: 'Your pending booking is still open',
      description:
        'This request is still waiting on seller response, so another booking flow is blocked for now.',
      buttonLabel: 'Open pending booking',
      priority: 2,
    }
  }

  return null
}

function getSessionBlockingMeta(
  row: SessionRow,
  myUserId: string | null
): BlockingInfo | null {
  if (!myUserId) return null

  const isBuyer = row.buyer_id === myUserId
  const selfCompleted = isBuyer ? !!row.buyer_completed_at : !!row.seller_completed_at

  if (row.status === 'ready_to_start') {
    return {
      itemId: row.id,
      itemKind: 'session',
      status: 'ready_to_start',
      title: 'You have a session waiting to start',
      description:
        'This session exists already, but it is not live yet because both sides have not started.',
      buttonLabel: 'Open ready session',
      priority: 3,
    }
  }

  if (row.status === 'active' && !selfCompleted) {
    return {
      itemId: row.id,
      itemKind: 'session',
      status: 'active',
      title: 'You are currently in a live session',
      description: 'Finish this session or report a problem before taking another booking.',
      buttonLabel: 'Open active session',
      priority: 4,
    }
  }

  if (row.status === 'awaiting_confirmation' && !selfCompleted) {
    return {
      itemId: row.id,
      itemKind: 'session',
      status: 'awaiting_confirmation_self_pending',
      title: 'Your confirmation is still needed',
      description:
        'This session is no longer live, but it is still waiting for your completion.',
      buttonLabel: 'Open pending confirmation',
      priority: 5,
    }
  }

  return null
}

function getBlockingBannerClass(status: BlockingInfo['status']) {
  switch (status) {
    case 'pending_seller':
    case 'pending_buyer':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-100'
    case 'ready_to_start':
      return 'border-sky-400/20 bg-sky-500/10 text-sky-100'
    case 'active':
      return 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
    case 'awaiting_confirmation_self_pending':
      return 'border-violet-400/20 bg-violet-500/10 text-violet-100'
    default:
      return 'border-white/10 bg-[#08122f] text-slate-200'
  }
}
function getPendingVisualMeta(row: PendingBookingCard): SessionVisualMeta {
  if (row.status === 'rejected') {
    return {
      tone: 'negative',
      badge: 'REJECTED',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper:
        row.role === 'buyer'
          ? 'Reserved money returns through the refund path.'
          : 'No seller payout is released for a rejected request.',
    }
  }

  if (row.role === 'seller') {
    return {
      tone: 'pending',
      badge: 'PENDING',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper: 'Accept or reject this request before taking another booking.',
    }
  }

  return {
    tone: 'pending',
    badge: 'PENDING',
    rightTitle: getMoneyStateTitle(row),
    explanation: getMoneyStateDescription(row),
    helper:
      'If the seller rejects or the request expires, the reserved money returns to your balance.',
  }
}

function getSessionVisualMeta(row: SessionCard, myUserIdValue: string): SessionVisualMeta {
  const isBuyer = row.buyer_id === myUserIdValue
  const iStarted = isBuyer ? !!row.buyer_started_at : !!row.seller_started_at
  const iCompleted = isBuyer ? !!row.buyer_completed_at : !!row.seller_completed_at

  if (row.status === 'ready_to_start') {
    return {
      tone: 'ready',
      badge: 'READY',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper: !iStarted
        ? 'Press Start Session when you are ready. The money state does not finalize until the session flow resolves.'
        : 'You are ready, but the other side has not started yet. Money state still remains unresolved.',
    }
  }

  if (row.status === 'active') {
    return {
      tone: 'active',
      badge: 'ACTIVE',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper: !iCompleted
        ? 'Complete when you are done, or report a problem if something went wrong.'
        : 'You completed your side, but the final money outcome still waits for the remaining session flow.',
    }
  }

  if (row.status === 'awaiting_confirmation') {
    return {
      tone: 'awaiting',
      badge: 'AWAITING',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper: !iCompleted
        ? 'Your confirmation is still needed before the session can fully resolve.'
        : 'You completed the session. The final money outcome still waits for the other side or auto-complete.',
    }
  }

  if (row.status === 'completed') {
    if (row.tip_already_given) {
      return {
        tone: 'completed',
        badge: 'COMPLETED',
        rightTitle: getMoneyStateTitle(row),
        explanation: `Tip sent • ${formatMoneyFromCents(row.tip_amount_cents)}`,
        helper:
          row.role === 'buyer'
            ? 'Your payment is complete and your post-session tip was sent successfully.'
            : 'Session money is complete. Any separate tip was processed outside normal payout flow.',
      }
    }

    return {
      tone: 'completed',
      badge: 'COMPLETED',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper:
        row.role === 'buyer'
          ? formatTipExpiresAt(row.tip_expires_at) ||
          'You can optionally send a post-session tip from your wallet.'
          : 'Payout normally waits until the dispute window passes without a dispute.',
    }
  }

  if (row.status === 'disputed') {
    return {
      tone: 'disputed',
      badge: 'DISPUTED',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper: 'Normal payout or refund flow is paused until the review is complete.',
    }
  }

  if (
    row.status === 'cancelled' ||
    row.status === 'no_show_buyer' ||
    row.status === 'no_show_seller'
  ) {
    return {
      tone: 'negative',
      badge: 'RECORDED',
      rightTitle: getMoneyStateTitle(row),
      explanation: getMoneyStateDescription(row),
      helper:
        'Review this outcome carefully. This session did not close through the normal completion flow.',
    }
  }

  return {
    tone: 'neutral',
    badge: 'INFO',
    rightTitle: getMoneyStateTitle(row),
    explanation: getMoneyStateDescription(row),
    helper: 'Review the details below.',
  }
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  )
}

function IconTip() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M17 7.5c0-1.9-2.24-3.5-5-3.5s-5 1.6-5 3.5 2.24 3.5 5 3.5 5 1.6 5 3.5-2.24 3.5-5 3.5-5-1.6-5-3.5" />
    </svg>
  )
}

function IconStar() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M12 2.8l2.78 5.63 6.22.9-4.5 4.38 1.06 6.19L12 17.02 6.44 19.9l1.06-6.19L3 9.33l6.22-.9L12 2.8z" />
    </svg>
  )
}
function ActionTile({
  label,
  pendingLabel,
  onClick,
  disabled,
  variant,
  icon,
  isPending,
}: ActionTileProps) {
  const classes =
    variant === 'primary'
      ? 'bg-emerald-500 text-[#04111f] hover:bg-emerald-400'
      : variant === 'danger'
        ? 'bg-rose-500 text-[#08111f] hover:bg-rose-400'
        : variant === 'tip'
          ? 'bg-amber-400 text-[#08111f] hover:bg-amber-300'
          : 'bg-[#4f87f5] text-[#04111f] hover:bg-[#6a9afb]'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick?.()}
      className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`flex h-15 w-15 items-center justify-center rounded-[16px] transition-colors duration-150 ${classes} ${isPending ? 'animate-pulse' : ''}`}
      >
        {icon}
      </span>
      <span className="text-center text-[13px] font-semibold text-slate-300 transition-colors duration-150 group-hover:text-white">
        {isPending ? pendingLabel || `${label}...` : label}
      </span>
    </button>
  )
}

function AutoRefreshIndicator({
  intervalMs,
  cycleKey,
  paused,
  refreshing,
  onRefresh,
}: AutoRefreshIndicatorProps) {
  const totalSeconds = Math.max(1, Math.ceil(intervalMs / 1000))
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds)

  useEffect(() => {
    if (paused) {
      setSecondsLeft(totalSeconds)
      return
    }

    setSecondsLeft(totalSeconds)

    let timeoutId: number | null = null
    let cancelled = false
    const startedAt = Date.now()

    const tick = () => {
      if (cancelled) return

      const elapsed = Date.now() - startedAt
      const remainingMs = Math.max(0, intervalMs - elapsed)
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))

      setSecondsLeft(remainingSeconds)

      if (remainingMs <= 0) {
        void onRefresh()
        return
      }

      timeoutId = window.setTimeout(tick, 1000)
    }

    timeoutId = window.setTimeout(tick, 1000)

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [cycleKey, intervalMs, onRefresh, paused, totalSeconds])

  const progress = paused
    ? 0
    : Math.min(100, Math.max(0, ((totalSeconds - secondsLeft) / totalSeconds) * 100))

  return (
    <div className="w-[190px] rounded-2xl border border-white/10 bg-[#09142f]/95 px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="text-[11px] font-semibold text-slate-300">
        {refreshing
          ? 'Refreshing now...'
          : paused
            ? 'Auto refresh paused'
            : `Next refresh in ${secondsLeft}s`}
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export default function SessionsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [pendingBookings, setPendingBookings] = useState<PendingBookingRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [bookingInfoMap, setBookingInfoMap] = useState<Record<string, BookingInfoRow>>({})
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [reviewStatusMap, setReviewStatusMap] = useState<ReviewStatusMap>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshCycleKey, setRefreshCycleKey] = useState(0)
  const [actionLocks, setActionLocks] = useState<Record<string, ActionIntent | undefined>>({})
  const [lastActionAt, setLastActionAt] = useState<Record<string, number>>({})
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE)
  const [activeFilter, setActiveFilter] = useState<SessionsFilterKey>('all')
  const [lastMutationAt, setLastMutationAt] = useState(0)

  const [reportTargetSessionId, setReportTargetSessionId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value)
  const [reportDescription, setReportDescription] = useState('')

  const [tipModal, setTipModal] = useState<TipModalState | null>(null)
  const [tipAmountCents, setTipAmountCents] = useState<TipPreset>(200)

  const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(null)
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(DEFAULT_REVIEW_FORM)
  const [reviewComment, setReviewComment] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())

  const lastReviewStatusRefreshAtRef = useRef(0)

  const hasAnyPendingAction = useMemo(
    () => Object.values(actionLocks).some(Boolean),
    [actionLocks]
  )

  const refreshPaused = useMemo(
    () => loading || hasAnyPendingAction || !!reportTargetSessionId || !!tipModal || !!reviewModal,
    [hasAnyPendingAction, loading, reportTargetSessionId, reviewModal, tipModal]
  )

  const isActionPending = useCallback(
    (itemId: string, action: ActionIntent) => actionLocks[itemId] === action,
    [actionLocks]
  )

  const isAnyCardActionPending = useCallback(
    (itemId: string) => !!actionLocks[itemId],
    [actionLocks]
  )

  const releaseAction = useCallback((itemId: string) => {
    setActionLocks((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }, [])

  const tryAcquireAction = useCallback(
    (itemId: string, action: ActionIntent) => {
      const now = Date.now()

      if (actionLocks[itemId]) return false
      if (lastActionAt[itemId] && now - lastActionAt[itemId] < ACTION_COOLDOWN_MS) return false

      setLastActionAt((prev) => ({ ...prev, [itemId]: now }))
      setActionLocks((prev) => ({ ...prev, [itemId]: action }))
      return true
    },
    [actionLocks, lastActionAt]
  )
  useEffect(() => {
    if (!reportTargetSessionId && !tipModal && !reviewModal) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [reportTargetSessionId, reviewModal, tipModal])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const runAction = useCallback(
    async (action: () => Promise<any>, successMessage: string) => {
      setErrorText('')
      setSuccessText('')

      const result = await action()

      if (result?.error) {
        console.error(result.error)
        setErrorText(result.error.message || 'Action failed.')
        return { ok: false, data: null as RpcJsonResult | null }
      }

      if (result?.data && typeof result.data === 'object' && result.data.success === false) {
        setErrorText(result.data.message || 'Action failed.')
        return { ok: false, data: result.data as RpcJsonResult }
      }

      setSuccessText(successMessage)
      return { ok: true, data: (result?.data ?? null) as RpcJsonResult | null }
    },
    []
  )

  const loadReviewStatuses = useCallback(
    async (sessionRows: SessionRow[], force = false) => {
      const completedSessionIds = sessionRows
        .filter((row) => row.status === 'completed')
        .map((row) => row.id)

      if (completedSessionIds.length === 0) {
        setReviewStatusMap({})
        lastReviewStatusRefreshAtRef.current = Date.now()
        return
      }

      if (
        !force &&
        Date.now() - lastReviewStatusRefreshAtRef.current < REVIEW_STATUS_REFRESH_COOLDOWN_MS
      ) {
        setReviewStatusMap((prev) => {
          const next: ReviewStatusMap = {}
          for (const sessionId of completedSessionIds) {
            if (prev[sessionId]) {
              next[sessionId] = prev[sessionId]
            }
          }
          return next
        })
        return
      }

      const nextReviewStatusMap: ReviewStatusMap = {}

      for (let i = 0; i < completedSessionIds.length; i += REVIEW_STATUS_BATCH_SIZE) {
        const batch = completedSessionIds.slice(i, i + REVIEW_STATUS_BATCH_SIZE)

        const reviewStatusResults = await Promise.all(
          batch.map(async (sessionId) => {
            const { data, error } = await supabase.rpc('get_session_review_status', {
              p_session_id: sessionId,
            })

            if (error) {
              console.error('review status load error:', sessionId, error)
              return [sessionId, undefined] as const
            }

            return [sessionId, (data || undefined) as ReviewStatus | undefined] as const
          })
        )

        for (const [sessionId, status] of reviewStatusResults) {
          nextReviewStatusMap[sessionId] = status
        }
      }

      setReviewStatusMap(nextReviewStatusMap)
      lastReviewStatusRefreshAtRef.current = Date.now()
    },
    []
  )

  const loadAll = useCallback(
    async (options?: {
      silent?: boolean
      preserveMessages?: boolean
      forceReviewStatus?: boolean
    }) => {
      const silent = options?.silent === true
      const preserveMessages = options?.preserveMessages === true

      if (authLoading) return false

      if (!silent) setLoading(true)

      if (!preserveMessages) {
        setErrorText('')
        setSuccessText('')
      }

      if (!user?.id) {
        setErrorText('You must be logged in.')
        if (!silent) setLoading(false)
        return false
      }

      const userId = user.id
      setMyUserId(userId)

      const [
        { data: pendingData, error: pendingError },
        { data: sessionData, error: sessionsError },
      ] = await Promise.all([
        supabase
          .from('booking_requests')
          .select(`
            id,
            buyer_id,
            seller_id,
            status,
            game,
            communication_method,
            created_at,
            base_price_cents,
            tip_cents,
            processing_fee_cents,
            platform_fee_cents,
            total_amount_cents,
            seller_payout_cents,
            duration_minutes
          `)
          .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
          .in('status', ['pending', 'rejected'])
          .order('created_at', { ascending: false }),

        supabase
          .from('sessions_with_tip')
          .select(`
            id,
            booking_request_id,
            buyer_id,
            seller_id,
            status,
            duration_minutes,
            started_at,
            planned_end_at,
            ended_at,
            completed_at,
            buyer_started_at,
            seller_started_at,
            buyer_completed_at,
            seller_completed_at,
            no_show_side,
            auto_complete_at,
            dispute_deadline_at,
            created_at,
            updated_at,
            tip_eligible,
            tip_already_given,
            tip_amount_cents,
            tip_expires_at,
            tip_block_reason,
            payout_hold_status,
            payout_releasable_at,
            payout_released_at,
            payout_seller_payout_cents
          `)
          .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
          .order('updated_at', { ascending: false })
          .limit(SESSIONS_HISTORY_LIMIT),
      ])

      if (pendingError) {
        console.error('pending bookings load error:', pendingError)
        setErrorText(pendingError.message || 'Failed to load pending bookings.')
        if (!silent) setLoading(false)
        return false
      }

      if (sessionsError) {
        console.error('sessions load error:', sessionsError)
        setErrorText(sessionsError.message || 'Failed to load sessions.')
        if (!silent) setLoading(false)
        return false
      }

      const pendingRows = (pendingData || []) as PendingBookingRow[]
      const sessionRows = (sessionData || []) as SessionRow[]

      setPendingBookings(pendingRows)
      setSessions(sessionRows)

      const sessionBookingIds = sessionRows.map((row) => row.booking_request_id)
      const allBookingIds = Array.from(
        new Set([...pendingRows.map((row) => row.id), ...sessionBookingIds])
      )
      if (allBookingIds.length > 0) {
        const { data: bookingInfoData, error: bookingInfoError } = await supabase
          .from('booking_requests')
          .select(`
            id,
            game,
            communication_method,
            created_at,
            base_price_cents,
            tip_cents,
            processing_fee_cents,
            platform_fee_cents,
            total_amount_cents,
            seller_payout_cents,
            duration_minutes
          `)
          .in('id', allBookingIds)

        if (bookingInfoError) {
          console.error('booking info load error:', bookingInfoError)
          setBookingInfoMap({})
        } else {
          const nextBookingInfoMap: Record<string, BookingInfoRow> = {}
          for (const row of (bookingInfoData || []) as BookingInfoRow[]) {
            nextBookingInfoMap[row.id] = row
          }
          setBookingInfoMap(nextBookingInfoMap)
        }
      } else {
        setBookingInfoMap({})
      }

      const otherUserIds = Array.from(
        new Set(
          [
            ...pendingRows.map((row) => (row.buyer_id === userId ? row.seller_id : row.buyer_id)),
            ...sessionRows.map((row) => (row.buyer_id === userId ? row.seller_id : row.buyer_id)),
          ].filter(Boolean)
        )
      )

      if (otherUserIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', otherUserIds)

        if (profileError) {
          console.error('profiles load error:', profileError)
          setProfiles({})
        } else {
          const nextMap: ProfileMap = {}
          for (const row of profileData || []) {
            nextMap[row.id] = row as ProfileRow
          }
          setProfiles(nextMap)
        }
      } else {
        setProfiles({})
      }

      await loadReviewStatuses(sessionRows, options?.forceReviewStatus === true)

      if (!silent) setLoading(false)
      return true
    },
    [authLoading, loadReviewStatuses, user]
  )

  useEffect(() => {
    if (authLoading) return

    if (!user?.id) {
      setLoading(false)
      setErrorText('You must be logged in.')
      return
    }

    void loadAll({ forceReviewStatus: true })
  }, [authLoading, loadAll, user])

  const refresh = useCallback(
    async (options?: { silent?: boolean; preserveMessages?: boolean; force?: boolean }) => {
      if (!options?.force && Date.now() - lastMutationAt < MUTATION_REFRESH_COOLDOWN_MS) {
        return true
      }

      if (hasAnyPendingAction) {
        return true
      }

      setRefreshing(true)

      const ok = await loadAll({
        silent: options?.silent ?? true,
        preserveMessages: options?.preserveMessages ?? true,
        forceReviewStatus: options?.force === true,
      })

      setRefreshing(false)
      setRefreshCycleKey((prev) => prev + 1)

      return ok
    },
    [hasAnyPendingAction, lastMutationAt, loadAll]
  )

  const handleAutoRefresh = useCallback(() => {
    void refresh({ silent: true, preserveMessages: true, force: true })
  }, [refresh])

  const cards = useMemo(() => {
    if (!myUserId) return []

    const pendingCards: PendingBookingCard[] = pendingBookings.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id

      return {
        ...row,
        kind: 'pending_booking',
        role,
        other_user_id: otherUserId,
        priority: getPendingBookingPriority(row, myUserId),
        role_label: role === 'buyer' ? 'Your booking request' : 'Incoming booking request',
        action_label: getPendingBookingActionLabel(row, myUserId),
      }
    })

    const sessionCards: SessionCard[] = sessions.map((row) => {
      const role = row.buyer_id === myUserId ? 'buyer' : 'seller'
      const otherUserId = role === 'buyer' ? row.seller_id : row.buyer_id
      const bookingInfo = bookingInfoMap[row.booking_request_id]

      return {
        ...row,
        kind: 'session',
        role,
        other_user_id: otherUserId,
        priority: getSessionPriority(row, myUserId),
        role_label:
          role === 'buyer' ? 'Your session with your GameMate' : 'Session booked with you',
        action_label: '',
        game: bookingInfo?.game || null,
        communication_method: bookingInfo?.communication_method || null,
        base_price_cents: bookingInfo?.base_price_cents || 0,
        tip_cents: bookingInfo?.tip_cents || 0,
        processing_fee_cents: bookingInfo?.processing_fee_cents || 0,
        platform_fee_cents: bookingInfo?.platform_fee_cents || 0,
        total_amount_cents: bookingInfo?.total_amount_cents || 0,
        seller_payout_cents: bookingInfo?.seller_payout_cents || 0,
      }
    })

    const merged: FeedCard[] = [...pendingCards, ...sessionCards]

    return merged.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return getCardSortTime(b) - getCardSortTime(a)
    })
  }, [bookingInfoMap, myUserId, pendingBookings, sessions])
  const blockingItems = useMemo(() => {
    if (!myUserId) return []

    const pendingBlocking = pendingBookings
      .map((row) => getPendingBlockingMeta(row, myUserId))
      .filter(Boolean) as BlockingInfo[]

    const sessionBlocking = sessions
      .map((row) => getSessionBlockingMeta(row, myUserId))
      .filter(Boolean) as BlockingInfo[]

    return [...pendingBlocking, ...sessionBlocking].sort((a, b) => a.priority - b.priority)
  }, [myUserId, pendingBookings, sessions])

  const primaryBlockingItem = blockingItems[0] || null

  const filteredCards = useMemo(() => {
    return cards.filter((card) => matchesSessionsFilter(card, activeFilter))
  }, [activeFilter, cards])

  const filterTabs = useMemo(() => {
    const counts = {
      all: cards.length,
      open: cards.filter((card) => matchesSessionsFilter(card, 'open')).length,
      awaiting: cards.filter((card) => matchesSessionsFilter(card, 'awaiting')).length,
      completed: cards.filter((card) => matchesSessionsFilter(card, 'completed')).length,
      disputed: cards.filter((card) => matchesSessionsFilter(card, 'disputed')).length,
    }

    return [
      { key: 'all' as const, label: 'All Sessions', count: counts.all },
      { key: 'open' as const, label: 'Open', count: counts.open },
      { key: 'awaiting' as const, label: 'Awaiting', count: counts.awaiting },
      { key: 'completed' as const, label: 'Completed', count: counts.completed },
      { key: 'disputed' as const, label: 'Disputed', count: counts.disputed },
    ]
  }, [cards])

  const historyCount = useMemo(() => {
    return filteredCards.filter((card) => isHistoryCard(card)).length
  }, [filteredCards])

  const visibleCards = useMemo(() => {
    let historySeen = 0

    return filteredCards.filter((card) => {
      const history = isHistoryCard(card)

      if (!history) return true

      historySeen += 1
      return historySeen <= historyVisibleCount
    })
  }, [filteredCards, historyVisibleCount])

  const hasMoreHistory = historyCount > historyVisibleCount

  const tipTargetSession = tipModal?.session || null
  const reviewTargetSession = reviewModal?.session || null

  const reviewTargetProfile = useMemo(() => {
    if (!reviewTargetSession) return null
    return profiles[reviewTargetSession.other_user_id] || null
  }, [profiles, reviewTargetSession])

  const handleAccept = async (bookingId: string) => {
    if (!tryAcquireAction(bookingId, 'accept')) return

    try {
      const result = await runAction(
        async () =>
          supabase.rpc('advance_booking_request_states', {
            p_request_id: bookingId,
            p_action: 'accept',
          }),
        'Booking accepted.'
      )

      if (result.ok) {
        setLastMutationAt(Date.now())
        await refresh({ silent: true, preserveMessages: true })
      }
    } finally {
      releaseAction(bookingId)
    }
  }

  const handleReject = async (bookingId: string) => {
    if (!tryAcquireAction(bookingId, 'reject')) return

    try {
      const result = await runAction(
        async () =>
          supabase.rpc('update_booking_request_status_with_refund', {
            p_request_id: bookingId,
            p_status: 'rejected',
          }),
        'Booking rejected and refund processed.'
      )

      if (result.ok) {
        setLastMutationAt(Date.now())
        await refresh({ silent: true, preserveMessages: true })
      }
    } finally {
      releaseAction(bookingId)
    }
  }

  const handleStartSession = async (sessionId: string) => {
    if (!tryAcquireAction(sessionId, 'start')) return

    try {
      const currentRow = sessions.find((row) => row.id === sessionId)

      if (!currentRow) {
        setErrorText('Session not found.')
        return
      }

      if (currentRow.status !== 'ready_to_start') {
        setErrorText('This session is no longer ready to start.')
        return
      }

      const iStarted =
        myUserId === currentRow.buyer_id
          ? !!currentRow.buyer_started_at
          : !!currentRow.seller_started_at

      if (iStarted) {
        setErrorText('You have already pressed Start for this session.')
        return
      }

      const result = await runAction(
        async () =>
          supabase.rpc('start_session', {
            p_session_id: sessionId,
          }),
        'Start requested.'
      )

      if (result.ok) {
        setLastMutationAt(Date.now())
        setSessions((prev) =>
          applyStartSessionOptimistic(prev, sessionId, myUserId, result.data)
        )
        void refresh({ silent: true, preserveMessages: true })
      }
    } finally {
      releaseAction(sessionId)
    }
  }

  const handleCompleteSession = async (sessionId: string) => {
    if (!tryAcquireAction(sessionId, 'complete')) return

    try {
      const currentRow = sessions.find((row) => row.id === sessionId)

      if (!currentRow) {
        setErrorText('Session not found.')
        return
      }

      if (!['active', 'awaiting_confirmation'].includes(currentRow.status)) {
        setErrorText('This session can no longer be completed from its current state.')
        return
      }

      const iCompleted =
        myUserId === currentRow.buyer_id
          ? !!currentRow.buyer_completed_at
          : !!currentRow.seller_completed_at

      if (iCompleted) {
        setErrorText('You have already completed your side of this session.')
        return
      }

      const result = await runAction(
        async () =>
          supabase.rpc('complete_session', {
            p_session_id: sessionId,
          }),
        'Complete clicked.'
      )

      if (result.ok) {
        setLastMutationAt(Date.now())
        setSessions((prev) =>
          applyCompleteSessionOptimistic(prev, sessionId, myUserId, result.data)
        )
        void refresh({ silent: true, preserveMessages: true })
      }
    } finally {
      releaseAction(sessionId)
    }
  }

  const handleStartChat = async (itemId: string, otherUserId: string) => {
    if (!tryAcquireAction(itemId, 'chat')) return

    try {
      setErrorText('')
      setSuccessText('')

      const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
        p_other_user_id: otherUserId,
      })

      if (error) {
        console.error(error)
        setErrorText(error.message || 'Could not start chat.')
        return
      }

      if (!data) {
        setErrorText('Could not start chat.')
        return
      }

      window.location.href = '/chat'
    } finally {
      releaseAction(itemId)
    }
  }
  const scrollToCard = (itemKind: 'pending_booking' | 'session', itemId: string) => {
    const element = document.getElementById(`card-${itemKind}-${itemId}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openReportModal = (sessionId: string) => {
    setReportTargetSessionId(sessionId)
    setReportReason(REPORT_REASONS[0].value)
    setReportDescription('')
    setErrorText('')
    setSuccessText('')
  }

  const closeReportModal = () => {
    if (isActionPending(reportTargetSessionId || '', 'report_submit')) return
    setReportTargetSessionId(null)
    setReportReason(REPORT_REASONS[0].value)
    setReportDescription('')
  }

  const handleSubmitReport = async () => {
    if (!reportTargetSessionId) return
    if (!tryAcquireAction(reportTargetSessionId, 'report_submit')) return

    setErrorText('')
    setSuccessText('')

    try {
      const currentRow = sessions.find((row) => row.id === reportTargetSessionId)

      if (!currentRow) {
        setErrorText('Session not found.')
        return
      }

      if (
        ['disputed', 'cancelled', 'completed', 'no_show_buyer', 'no_show_seller'].includes(
          currentRow.status
        )
      ) {
        setErrorText('This session can no longer be reported from its current state.')
        return
      }

      const { data, error } = await supabase.rpc('create_session_dispute', {
        p_session_id: reportTargetSessionId,
        p_reason_code: reportReason,
        p_description: reportDescription.trim() || null,
      })

      if (error) {
        console.error(error)
        setErrorText(error.message || 'Could not create dispute.')
        return
      }

      if (data && typeof data === 'object' && data.success === false) {
        setErrorText(data.message || 'Could not create dispute.')
        return
      }

      setLastMutationAt(Date.now())
      setSessions((prev) =>
        prev.map((row) =>
          row.id === reportTargetSessionId
            ? {
              ...row,
              status: 'disputed',
              updated_at: new Date().toISOString(),
              tip_eligible: false,
              tip_block_reason: 'dispute_open',
            }
            : row
        )
      )

      setReviewStatusMap((prev) => ({
        ...prev,
        [reportTargetSessionId]: {
          ...(prev[reportTargetSessionId] || {}),
          can_rate: false,
          block_reason: 'disputed_session',
        },
      }))

      setSuccessText('Report submitted. Dispute opened.')
      setReportTargetSessionId(null)
      setReportReason(REPORT_REASONS[0].value)
      setReportDescription('')
      void refresh({ silent: true, preserveMessages: true, force: true })
    } finally {
      releaseAction(reportTargetSessionId)
    }
  }

  const openTipModal = (session: SessionCard) => {
    setErrorText('')
    setSuccessText('')
    setTipAmountCents(200)
    setTipModal({
      session,
      isOpening: true,
    })

    window.setTimeout(() => {
      setTipModal((prev) => {
        if (!prev || prev.session.id !== session.id) return prev
        return {
          ...prev,
          isOpening: false,
        }
      })
    }, 120)
  }

  const closeTipModal = () => {
    if (isActionPending(tipModal?.session.id || '', 'tip_submit')) return
    setTipModal(null)
    setTipAmountCents(200)
  }

  const handleSubmitTip = async () => {
    if (!tipTargetSession) return
    if (!tryAcquireAction(tipTargetSession.id, 'tip_submit')) return

    setErrorText('')
    setSuccessText('')

    try {
      const freshRow = sessions.find((row) => row.id === tipTargetSession.id)

      if (!freshRow) {
        setErrorText('Session not found.')
        return
      }

      if (freshRow.status !== 'completed') {
        setErrorText('Tipping is only available after session completion.')
        return
      }

      if (!freshRow.tip_eligible || freshRow.tip_already_given) {
        setErrorText(getTipBlockMessage(freshRow.tip_block_reason, tipTargetSession))
        return
      }

      const { data, error } = await supabase.rpc('create_tip', {
        p_booking_id: tipTargetSession.booking_request_id,
        p_amount_cents: tipAmountCents,
      })

      if (error) {
        console.error(error)
        setErrorText(error.message || 'Could not send tip.')
        return
      }

      if (data && typeof data === 'object' && data.success === false) {
        setErrorText(data.message || 'Could not send tip.')
        return
      }

      setLastMutationAt(Date.now())
      setSessions((prev) =>
        prev.map((row) =>
          row.id === tipTargetSession.id
            ? {
              ...row,
              tip_eligible: false,
              tip_already_given: true,
              tip_amount_cents: tipAmountCents,
              tip_block_reason: 'already_tipped',
              updated_at: new Date().toISOString(),
            }
            : row
        )
      )

      setSuccessText(`Tip sent • ${formatMoneyFromCents(tipAmountCents)}`)
      setTipModal(null)
      setTipAmountCents(200)
      void refresh({ silent: true, preserveMessages: true, force: true })
    } finally {
      releaseAction(tipTargetSession.id)
    }
  }

  const openReviewModal = (session: SessionCard) => {
    setErrorText('')
    setSuccessText('')
    setReviewForm(DEFAULT_REVIEW_FORM)
    setReviewComment('')
    setReviewModal({
      session,
      isOpening: true,
    })

    window.setTimeout(() => {
      setReviewModal((prev) => {
        if (!prev || prev.session.id !== session.id) return prev
        return {
          ...prev,
          isOpening: false,
        }
      })
    }, 120)
  }

  const closeReviewModal = () => {
    if (isActionPending(reviewModal?.session.id || '', 'review_submit')) return
    setReviewModal(null)
    setReviewForm(DEFAULT_REVIEW_FORM)
    setReviewComment('')
  }

  const handleReviewScoreChange = (key: ReviewCategoryKey, value: number) => {
    setReviewForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSubmitReview = async () => {
    if (!reviewTargetSession) return
    if (!tryAcquireAction(reviewTargetSession.id, 'review_submit')) return

    setErrorText('')
    setSuccessText('')

    try {
      const reviewStatus = reviewStatusMap[reviewTargetSession.id]

      if (!reviewStatus?.can_rate) {
        setErrorText(getReviewBlockMessage(reviewStatus))
        return
      }

      const { data, error } = await supabase.rpc('create_session_review', {
        p_session_id: reviewTargetSession.id,
        p_punctuality: reviewForm.punctuality,
        p_communication: reviewForm.communication,
        p_vibe: reviewForm.vibe,
        p_reliability: reviewForm.reliability,
        p_skill: reviewForm.skill,
        p_comment: reviewComment.trim() || null,
      })

      if (error) {
        console.error(error)
        setErrorText(error.message || 'Could not submit review.')
        return
      }

      if (data && typeof data === 'object' && data.success === false) {
        setErrorText(data.message || 'Could not submit review.')
        return
      }

      setLastMutationAt(Date.now())
      setReviewStatusMap((prev) => ({
        ...prev,
        [reviewTargetSession.id]: {
          ...(prev[reviewTargetSession.id] || {}),
          success: true,
          session_id: reviewTargetSession.id,
          can_rate: false,
          has_already_rated: true,
          rating_target_user_id:
            prev[reviewTargetSession.id]?.rating_target_user_id ||
            reviewTargetSession.other_user_id,
          rating_target_role:
            prev[reviewTargetSession.id]?.rating_target_role ||
            (reviewTargetSession.role === 'buyer' ? 'seller' : 'buyer'),
          block_reason: 'already_rated',
        },
      }))

      setSuccessText('Review submitted.')
      setReviewModal(null)
      setReviewForm(DEFAULT_REVIEW_FORM)
      setReviewComment('')
      void refresh({ silent: true, preserveMessages: true, force: true })
    } finally {
      releaseAction(reviewTargetSession.id)
    }
  }

  return (
    <>
      {reportTargetSessionId ? (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-[720px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-white">Report Problem</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Open a dispute for this session. Review will be needed before the case can
                resolve.
              </p>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Reason
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                disabled={isActionPending(reportTargetSessionId, 'report_submit')}
                className="w-full rounded-2xl border border-white/10 bg-[#061127] px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {REPORT_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Description
              </label>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                rows={5}
                placeholder="Write what happened..."
                disabled={isActionPending(reportTargetSessionId, 'report_submit')}
                className="w-full resize-y rounded-2xl border border-white/10 bg-[#061127] px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeReportModal}
                disabled={isActionPending(reportTargetSessionId, 'report_submit')}
                className="rounded-2xl bg-[#24314f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#324163] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleSubmitReport()}
                disabled={isActionPending(reportTargetSessionId, 'report_submit')}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActionPending(reportTargetSessionId, 'report_submit')
                  ? 'Submitting...'
                  : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tipModal ? (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-[620px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#08122f] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-white">
                {tipModal.isOpening ? 'Preparing Tip' : 'Send Tip'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {tipModal.isOpening
                  ? 'Loading session details. Please wait a moment.'
                  : 'Send an optional post-session tip from your wallet balance. This goes 100% to the seller.'}
              </p>
            </div>

            <div className="mb-5 rounded-2xl border border-white/10 bg-[#061127] p-4">
              <div className="text-sm font-semibold text-slate-300">Selected session</div>
              <div className="mt-2 text-base text-white">
                {tipModal.session.game || 'Game Session'}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {tipModal.isOpening
                  ? 'Please wait...'
                  : formatTipExpiresAt(tipModal.session.tip_expires_at) || 'Tip window available'}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-3 block text-sm font-semibold text-slate-300">
                Choose amount
              </label>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {TIP_PRESETS.map((amount) => {
                  const selected = tipAmountCents === amount

                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTipAmountCents(amount)}
                      disabled={
                        tipModal.isOpening || isActionPending(tipModal.session.id, 'tip_submit')
                      }
                      className={`rounded-2xl border px-4 py-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${selected
                        ? 'border-amber-300 bg-amber-400 text-[#08111f]'
                        : 'border-white/10 bg-[#0b1530] text-white hover:bg-[#132044]'
                        }`}
                    >
                      {formatMoneyFromCents(amount)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
              <div>
                <div className="text-sm text-slate-400">You will send</div>
                <div className="text-2xl font-bold text-white">
                  {formatMoneyFromCents(tipAmountCents)}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={closeTipModal}
                  disabled={tipModal.isOpening || isActionPending(tipModal.session.id, 'tip_submit')}
                  className="rounded-2xl bg-[#24314f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#324163] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void handleSubmitTip()}
                  disabled={tipModal.isOpening || isActionPending(tipModal.session.id, 'tip_submit')}
                  className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-[#08111f] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {tipModal.isOpening
                    ? 'Loading...'
                    : isActionPending(tipModal.session.id, 'tip_submit')
                      ? 'Sending...'
                      : `Send ${formatMoneyFromCents(tipAmountCents)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reviewModal ? (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-4 sm:p-6">
          <div className="max-h-[calc(100vh-40px)] w-full max-w-[560px] overflow-y-auto rounded-[24px] border border-white/10 bg-[#08122f] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:p-5">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                {reviewModal.isOpening ? 'Preparing Review' : 'Leave Review'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {reviewModal.isOpening ? (
                  'Loading session details. Please wait a moment.'
                ) : (
                  <>
                    Rate your completed session with{' '}
                    <span className="font-semibold text-white">
                      {formatPersonName(reviewTargetProfile)}
                    </span>
                    .
                  </>
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {REVIEW_CATEGORIES.map((item) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-white/10 bg-[#061127] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200">{item.label}</div>
                    <div className="text-xs font-semibold text-emerald-300">
                      {reviewForm[item.key]}/5
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const selected = reviewForm[item.key] === value

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleReviewScoreChange(item.key, value)}
                          disabled={
                            reviewModal.isOpening ||
                            isActionPending(reviewModal.session.id, 'review_submit')
                          }
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-60 ${selected
                            ? 'border-amber-300 bg-amber-400 text-[#08111f]'
                            : 'border-white/10 bg-[#0b1530] text-slate-200 hover:bg-[#132044] hover:text-white'
                            }`}
                          aria-label={`${item.label} ${value}`}
                        >
                          <IconStar />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Comment (optional)
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                placeholder="Write a short review..."
                disabled={
                  reviewModal.isOpening || isActionPending(reviewModal.session.id, 'review_submit')
                }
                className="w-full resize-y rounded-2xl border border-white/10 bg-[#061127] px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={
                  reviewModal.isOpening || isActionPending(reviewModal.session.id, 'review_submit')
                }
                className="rounded-2xl bg-[#24314f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#324163] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleSubmitReview()}
                disabled={
                  reviewModal.isOpening || isActionPending(reviewModal.session.id, 'review_submit')
                }
                className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-[#04111f] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewModal.isOpening
                  ? 'Loading...'
                  : isActionPending(reviewModal.session.id, 'review_submit')
                    ? 'Submitting...'
                    : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="min-h-screen bg-[#020617] text-white">
        <section className="mx-auto max-w-[1160px] px-8 py-8">
          <div className="relative mb-6 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(6,11,26,0.98))] px-6 py-6 pb-20 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:pb-16">
            <div className="flex flex-col gap-5">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                    Sessions
                  </span>
                  <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200">
                    Real session flow
                  </span>
                </div>

                <h1 className="text-[34px] font-bold tracking-tight text-white md:text-[42px]">
                  Your Sessions
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
                  Track every booking and session clearly from ready to start, to live play, to
                  confirmation, completion, review, and money outcome.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveFilter(tab.key)
                      setHistoryVisibleCount(HISTORY_PAGE_SIZE)
                    }}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${activeFilter === tab.key
                      ? 'border-white/10 bg-white text-[#08122f]'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${activeFilter === tab.key
                        ? 'bg-[#dbe4ff] text-[#08122f]'
                        : 'bg-white/10 text-slate-300'
                        }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute bottom-5 right-5">
              <AutoRefreshIndicator
                intervalMs={AUTO_REFRESH_MS}
                cycleKey={refreshCycleKey}
                paused={refreshPaused}
                refreshing={refreshing}
                onRefresh={handleAutoRefresh}
              />
            </div>
          </div>

          {errorText ? <p className="mb-4 text-sm font-medium text-red-400">{errorText}</p> : null}
          {successText ? (
            <p className="mb-4 text-sm font-medium text-emerald-400">{successText}</p>
          ) : null}

          {!loading ? (
            primaryBlockingItem ? (
              <div
                className={`mb-5 rounded-[24px] border px-5 py-4 ${getBlockingBannerClass(
                  primaryBlockingItem.status
                )}`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-lg font-bold md:text-xl">
                      {primaryBlockingItem.title}
                    </div>
                    <div className="mt-1 text-sm leading-6">
                      {primaryBlockingItem.description}
                    </div>
                    {blockingItems.length > 1 ? (
                      <div className="mt-2 text-xs opacity-90">
                        You also have {blockingItems.length - 1} more blocking item
                        {blockingItems.length - 1 === 1 ? '' : 's'}.
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      scrollToCard(primaryBlockingItem.itemKind, primaryBlockingItem.itemId)
                    }
                    className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    {primaryBlockingItem.buttonLabel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-5 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-emerald-100">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-lg font-bold md:text-xl">You are available</div>
                    <div className="mt-1 text-sm leading-6">
                      No unresolved booking or session is blocking you right now.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push('/explore')}
                    className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Go to Explore
                  </button>
                </div>
              </div>
            )
          ) : null}

          {loading ? (
            <p className="text-slate-300">Loading sessions...</p>
          ) : visibleCards.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-[#08122f] p-7 text-slate-300">
              No sessions found for this filter.
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {visibleCards.map((row) => {
                  const otherProfile = profiles[row.other_user_id]
                  const personName = formatPersonName(otherProfile)
                  const initials = getInitials(otherProfile)
                  const busy = isAnyCardActionPending(row.id)
                  const isSession = row.kind === 'session'
                  const reviewStatus =
                    row.kind === 'session' ? reviewStatusMap[row.id] : undefined

                  const iStarted =
                    isSession &&
                    (row.role === 'buyer' ? !!row.buyer_started_at : !!row.seller_started_at)

                  const iCompleted =
                    isSession &&
                    (row.role === 'buyer'
                      ? !!row.buyer_completed_at
                      : !!row.seller_completed_at)

                  const canReport =
                    row.kind === 'session' &&
                    ![
                      'disputed',
                      'cancelled',
                      'completed',
                      'no_show_buyer',
                      'no_show_seller',
                    ].includes(row.status)

                  const canStartChat =
                    row.kind === 'pending_booking'
                      ? row.status === 'pending'
                      : row.status === 'active' || row.status === 'awaiting_confirmation'

                  const canOpenTip =
                    row.kind === 'session' &&
                    row.status === 'completed' &&
                    row.tip_eligible &&
                    row.role === 'buyer'

                  const canOpenReview =
                    row.kind === 'session' &&
                    row.role === 'buyer' &&
                    row.status === 'completed' &&
                    reviewStatus?.can_rate === true

                  const showRatedTile =
                    row.kind === 'session' &&
                    row.role === 'buyer' &&
                    row.status === 'completed' &&
                    reviewStatus?.has_already_rated === true

                  const visualMeta = isSession
                    ? getSessionVisualMeta(row, myUserId || '')
                    : getPendingVisualMeta(row)

                  const tone = getStateTone(row.status)
                  const toneStripClass = getToneStripClass(tone)
                  const actionTintClass = getActionTintClass(tone)
                  const contextRows = buildContextRows(row)
                  const timelineRows = buildTimelineRows(row)
                  const countdownMeta = getCardCountdownMeta(row, clockNow)
                  const countdownProgressPercent =
                    countdownMeta?.showProgress ? getCountdownProgressPercent(row, clockNow) : null

                  return (
                    <article
                      key={`${row.kind}-${row.id}`}
                      id={`card-${row.kind}-${row.id}`}
                      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#060f25] shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                    >
                      <div className={`absolute left-0 top-0 h-full w-[4px] ${toneStripClass}`} />

                      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="px-6 py-6">
                          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-5">
                            <div className="flex items-start justify-center pt-1">
                              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[18px] border border-white/10 bg-[#09142f] text-[17px] font-bold tracking-[0.16em] text-slate-300">
                                {initials}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="truncate text-[30px] font-bold leading-tight text-white">
                                    {row.game || 'Game Session'}
                                  </div>

                                  <div className="mt-2 text-[16px] text-slate-400">
                                    Session with{' '}
                                    <span className="font-semibold text-slate-200">
                                      {personName}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`inline-flex rounded-full px-6 py-2 text-[12px] font-bold tracking-[0.12em]
${statusBadgeClass(
                                    row.status
                                  )}`}
                                >
                                  {statusLabel(row.status)}
                                  <span className="sr-only">{row.status}</span>
                                </span>
                              </div>

                              {countdownMeta ? (
                                <div className="mt-4 max-w-[340px]">
                                  <div
                                    className={`inline-flex items-center rounded-full px-4 py-2 text-[12px] font-bold tracking-[0.04em] ${countdownMeta.className}`}
                                  >
                                    {countdownMeta.text}
                                  </div>

                                  {countdownMeta.showProgress && countdownProgressPercent !== null ? (
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className={`h-full rounded-full transition-[width] duration-1000 ${getCountdownProgressBarClass(countdownMeta.tone)}`}
                                        style={{ width: `${countdownProgressPercent}%` }}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
                                {contextRows.map((item) => (
                                  <div key={`${row.id}-${item.label}`} className="text-[15px]">
                                    <span className="font-semibold text-slate-400">
                                      {item.label}
                                    </span>{' '}
                                    <span
                                      className={`font-semibold ${getContextValueClass(
                                        item.emphasis
                                      )}`}
                                    >
                                      {item.value}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/10 pt-5 text-[14px]">
                                {timelineRows.map((item) => (
                                  <div
                                    key={`${row.id}-${item.label}-${item.value}`}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="text-slate-500">{item.label}</span>
                                    <span className={`${getContextValueClass(item.emphasis)}`}>
                                      {item.value}
                                    </span>
                                  </div>
                                ))}

                                {row.kind === 'session' && row.status === 'active' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-500">Booked time left</span>
                                    <span className="text-violet-200">
                                      {getRemainingLabel(row.planned_end_at)}
                                    </span>
                                  </div>
                                ) : null}

                                {row.kind === 'session' &&
                                  row.status === 'completed' &&
                                  reviewStatus &&
                                  !reviewStatus.can_rate &&
                                  !reviewStatus.has_already_rated &&
                                  reviewStatus.block_reason ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-500">Review</span>
                                    <span className="text-slate-300">
                                      {getReviewBlockMessage(reviewStatus)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`border-t border-white/10 px-6 py-6 xl:border-l xl:border-t-0 xl:border-white/10 ${actionTintClass}`}
                        >
                          <div className="flex h-full flex-col justify-between">
                            <div className="text-right">
                              <div className="text-[32px] font-bold leading-tight text-white">
                                {visualMeta.rightTitle}
                              </div>

                              <div className="mt-4 text-[16px] font-semibold leading-7 text-slate-100">
                                {visualMeta.explanation}
                              </div>

                              <div className="mt-3 text-[15px] leading-7 text-slate-400">
                                {visualMeta.helper}
                              </div>
                            </div>

                            <div className="mt-8 flex flex-wrap items-start justify-center gap-4">
                              {row.kind === 'pending_booking' &&
                                row.role === 'seller' &&
                                row.status === 'pending' ? (
                                <>
                                  <ActionTile
                                    label="Accept"
                                    pendingLabel="Accepting..."
                                    variant="primary"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'accept')}
                                    onClick={() => void handleAccept(row.id)}
                                    icon={<IconCheck />}
                                  />
                                  <ActionTile
                                    label="Chat"
                                    pendingLabel="Opening..."
                                    variant="secondary"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'chat')}
                                    onClick={() => void handleStartChat(row.id, row.other_user_id)}
                                    icon={<IconChat />}
                                  />
                                  <ActionTile
                                    label="Reject"
                                    pendingLabel="Rejecting..."
                                    variant="danger"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'reject')}
                                    onClick={() => void handleReject(row.id)}
                                    icon={<IconAlert />}
                                  />
                                </>
                              ) : null}

                              {row.kind === 'pending_booking' &&
                                row.role === 'buyer' &&
                                row.status === 'pending' ? (
                                <ActionTile
                                  label="Chat"
                                  pendingLabel="Opening..."
                                  variant="secondary"
                                  disabled={busy}
                                  isPending={isActionPending(row.id, 'chat')}
                                  onClick={() => void handleStartChat(row.id, row.other_user_id)}
                                  icon={<IconChat />}
                                />
                              ) : null}

                              {row.kind === 'session' &&
                                row.status === 'ready_to_start' &&
                                !iStarted ? (
                                <>
                                  <ActionTile
                                    label="Start"
                                    pendingLabel="Starting..."
                                    variant="primary"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'start')}
                                    onClick={() => void handleStartSession(row.id)}
                                    icon={<IconCheck />}
                                  />
                                  <ActionTile
                                    label="Chat"
                                    pendingLabel="Opening..."
                                    variant="secondary"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'chat')}
                                    onClick={() => void handleStartChat(row.id, row.other_user_id)}
                                    icon={<IconChat />}
                                  />
                                  {canReport ? (
                                    <ActionTile
                                      label="Report"
                                      variant="danger"
                                      disabled={busy}
                                      onClick={() => openReportModal(row.id)}
                                      icon={<IconAlert />}
                                    />
                                  ) : null}
                                </>
                              ) : null}

                              {row.kind === 'session' &&
                                (row.status === 'active' || row.status === 'awaiting_confirmation') &&
                                !iCompleted ? (
                                <>
                                  <ActionTile
                                    label={
                                      row.status === 'awaiting_confirmation'
                                        ? 'Confirm'
                                        : 'Complete'
                                    }
                                    pendingLabel={
                                      row.status === 'awaiting_confirmation'
                                        ? 'Confirming...'
                                        : 'Completing...'
                                    }
                                    variant="primary"
                                    disabled={busy}
                                    isPending={isActionPending(row.id, 'complete')}
                                    onClick={() => void handleCompleteSession(row.id)}
                                    icon={<IconCheck />}
                                  />
                                  {canStartChat ? (
                                    <ActionTile
                                      label="Chat"
                                      pendingLabel="Opening..."
                                      variant="secondary"
                                      disabled={busy}
                                      isPending={isActionPending(row.id, 'chat')}
                                      onClick={() =>
                                        void handleStartChat(row.id, row.other_user_id)
                                      }
                                      icon={<IconChat />}
                                    />
                                  ) : null}
                                  {canReport ? (
                                    <ActionTile
                                      label="Report"
                                      variant="danger"
                                      disabled={busy}
                                      onClick={() => openReportModal(row.id)}
                                      icon={<IconAlert />}
                                    />
                                  ) : null}
                                </>
                              ) : null}

                              {row.kind === 'session' && row.status === 'completed' ? (
                                <>
                                  {canOpenTip ? (
                                    <ActionTile
                                      label="Tip"
                                      variant="tip"
                                      disabled={busy}
                                      onClick={() => openTipModal(row)}
                                      icon={<IconTip />}
                                    />
                                  ) : null}

                                  {row.tip_already_given ? (
                                    <ActionTile
                                      label="Tipped"
                                      variant="tip"
                                      disabled
                                      icon={<IconTip />}
                                    />
                                  ) : null}

                                  {canOpenReview ? (
                                    <ActionTile
                                      label="Rate"
                                      pendingLabel="Opening..."
                                      variant="primary"
                                      disabled={busy}
                                      onClick={() => openReviewModal(row)}
                                      icon={<IconStar />}
                                    />
                                  ) : null}

                                  {showRatedTile ? (
                                    <ActionTile
                                      label="Rated"
                                      variant="primary"
                                      disabled
                                      icon={<IconStar />}
                                    />
                                  ) : null}
                                </>
                              ) : null}

                              {row.kind === 'session' &&
                                (row.status === 'disputed' ||
                                  row.status === 'cancelled' ||
                                  row.status === 'no_show_buyer' ||
                                  row.status === 'no_show_seller') ? (
                                <>
                                  {canStartChat ? (
                                    <ActionTile
                                      label="Chat"
                                      pendingLabel="Opening..."
                                      variant="secondary"
                                      disabled={busy}
                                      isPending={isActionPending(row.id, 'chat')}
                                      onClick={() => void handleStartChat(row.id, row.other_user_id)}
                                      icon={<IconChat />}
                                    />
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              {hasMoreHistory ? (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setHistoryVisibleCount((prev) => prev + HISTORY_PAGE_SIZE)}
                    className="rounded-2xl bg-[#24314f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#324163]"
                  >
                    Show Older
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </>
  )
}
