// START_FILE: app/(app-shell)/balance/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/AuthProvider'

type WalletMoneyStateRow = {
  user_id: string
  available_balance_cents: number
  locked_funds_cents: number
  visible_total_cents: number
  has_locked_funds: boolean
}

type Transaction = {
  id: string
  booking_id: string | null
  tx_type: string
  direction: 'debit' | 'credit' | 'info' | null
  amount_cents: number
  currency: string
  status: string
  note: string | null
  created_at: string
  readable_type: string
  readable_label: string
}

const TRANSACTION_LIMIT = 50

function formatMoney(cents: number | null | undefined) {
  const safe = Number(cents || 0)
  const amount = safe / 100
  const hasFraction = safe % 100 !== 0

  const formatted = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)

  return `$${formatted}`
}

function toCents(amount: string) {
  const normalized = amount.replace(',', '.').trim()
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric * 100)
}

function shortId(id: string | null) {
  if (!id) return null
  return id.slice(0, 8)
}

function humanizeType(type: string) {
  switch (type) {
    case 'reserved':
      return 'Reserved'
    case 'refund':
      return 'Refund'
    case 'payout':
      return 'Payout'
    case 'deposit':
      return 'Top Up'
    case 'other':
      return 'Other'
    default:
      return type.replaceAll('_', ' ')
  }
}

function typeBadgeClass(type: string) {
  switch (type) {
    case 'reserved':
      return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
    case 'refund':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
    case 'payout':
      return 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
    case 'deposit':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400'
  }
}

function amountColor(tx: Transaction) {
  if (tx.direction === 'credit') return 'text-emerald-400'
  if (tx.direction === 'debit') return 'text-rose-400'
  return 'text-slate-300'
}

function prefix(tx: Transaction) {
  if (tx.direction === 'credit') return '+'
  if (tx.direction === 'debit') return '-'
  return ''
}

function statusLabel(status: string) {
  const normalized = String(status || '').toLowerCase()

  switch (normalized) {
    case 'posted':
      return 'Posted'
    case 'completed':
      return 'Completed'
    case 'released':
      return 'Released'
    case 'pending':
      return 'Pending'
    case 'held':
      return 'On Hold'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'refunded':
      return 'Refunded'
    default:
      return status
  }
}

function statusPillClass(status: string) {
  const normalized = String(status || '').toLowerCase()

  if (
    normalized === 'posted' ||
    normalized === 'completed' ||
    normalized === 'released' ||
    normalized === 'refunded'
  ) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (normalized === 'pending' || normalized === 'held') {
    return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300'
  }

  if (normalized === 'failed' || normalized === 'cancelled') {
    return 'border-rose-500/20 bg-rose-500/10 text-rose-300'
  }

  return 'border-slate-500/20 bg-slate-500/10 text-slate-300'
}

export default function BalancePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const loadInFlightRef = useRef(false)

  const [availableBalanceCents, setAvailableBalanceCents] = useState(0)
  const [lockedFundsCents, setLockedFundsCents] = useState(0)
  const [visibleTotalCents, setVisibleTotalCents] = useState(0)
  const [hasLockedFunds, setHasLockedFunds] = useState(false)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [addingBalance, setAddingBalance] = useState(false)
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!user) return
      if (loadInFlightRef.current) return

      loadInFlightRef.current = true

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setMessage('')
      setMessageType('')

      try {
        const [{ data: moneyState, error: moneyStateError }, { data: txs, error: txError }] =
          await Promise.all([
            supabase
              .from('wallet_user_money_state')
              .select(
                'user_id, available_balance_cents, locked_funds_cents, visible_total_cents, has_locked_funds'
              )
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('wallet_transactions_readable')
              .select(
                'id, booking_id, tx_type, direction, amount_cents, currency, status, note, created_at, readable_type, readable_label'
              )
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(TRANSACTION_LIMIT),
          ])

        if (moneyStateError) {
          setMessage(moneyStateError.message)
          setMessageType('error')
          return
        }

        if (txError) {
          setMessage(txError.message)
          setMessageType('error')
          return
        }

        const stateRow = (moneyState || null) as WalletMoneyStateRow | null

        setAvailableBalanceCents(Number(stateRow?.available_balance_cents || 0))
        setLockedFundsCents(Number(stateRow?.locked_funds_cents || 0))
        setVisibleTotalCents(Number(stateRow?.visible_total_cents || 0))
        setHasLockedFunds(Boolean(stateRow?.has_locked_funds))
        setTransactions((txs || []) as Transaction[])
      } finally {
        loadInFlightRef.current = false
        setLoading(false)
        setRefreshing(false)
      }
    },
    [user]
  )

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace('/login')
      return
    }

    void load('initial')
  }, [authLoading, load, router, user])

  const addBalance = async () => {
    if (addingBalance) return

    setMessage('')
    setMessageType('')

    const finalAmountCents = toCents(amount)

    if (!finalAmountCents) {
      setMessage('Enter a valid amount.')
      setMessageType('error')
      return
    }

    if (!user) {
      setMessage('Login required.')
      setMessageType('error')
      return
    }

    setAddingBalance(true)

    try {
      const { data, error } = await supabase.rpc('gm_admin_add_balance', {
        p_user_id: user.id,
        p_amount_cents: finalAmountCents,
        p_note: `Top-up: ${formatMoney(finalAmountCents)}`,
      })

      if (error || !data?.success) {
        setMessage(error?.message || data?.message || 'Failed.')
        setMessageType('error')
        return
      }

      setMessage('Balance added.')
      setMessageType('success')
      setAmount('')
      await load('refresh')
    } finally {
      setAddingBalance(false)
    }
  }

  const lockedFundsMessage = useMemo(() => {
    if (!hasLockedFunds) {
      return 'You do not have any locked funds right now.'
    }

    return 'Locked funds usually come from active bookings or payout holds. They become available automatically after the related flow is resolved.'
  }, [hasLockedFunds])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        Checking session...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Balance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              See what is available now, what is still locked, and how money moved through your
              account.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load('refresh')}
            disabled={loading || refreshing}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Available Now</p>
            <p className="mt-2 text-4xl font-bold text-emerald-400">
              {formatMoney(availableBalanceCents)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This is the amount you can currently use right away.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Locked</p>
            <p className="mt-2 text-4xl font-bold text-yellow-400">
              {formatMoney(lockedFundsCents)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Funds temporarily reserved by an active booking or payout hold.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Total Balance</p>
            <p className="mt-2 text-4xl font-bold text-white">
              {formatMoney(visibleTotalCents)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Your available balance plus funds that are still locked.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-white">About locked funds</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{lockedFundsMessage}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-white">Add balance</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Add funds to this account in USD.</p>

            <div className="mt-4 flex gap-3">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
                disabled={addingBalance}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => void addBalance()}
                disabled={addingBalance}
                className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingBalance ? 'Adding...' : 'Add Balance'}
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              messageType === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {message}
          </div>
        )}

        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-300">Balance Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Newest transactions appear first.</p>
          </div>

          {loading && <p className="text-slate-400">Loading balance activity...</p>}

          {!loading && transactions.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
              <div className="text-base font-semibold text-white">No balance activity yet</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Once money moves through your account, it will appear here.
              </p>
            </div>
          )}

          {!loading && transactions.length > 0 && (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-medium ${typeBadgeClass(
                            tx.readable_type
                          )}`}
                        >
                          {humanizeType(tx.readable_type)}
                        </span>

                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-medium ${statusPillClass(
                            tx.status
                          )}`}
                        >
                          {statusLabel(tx.status)}
                        </span>

                        {tx.booking_id && (
                          <span className="text-xs text-slate-500">
                            Booking #{shortId(tx.booking_id)}
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-medium text-slate-200">
                        {tx.readable_label || tx.note || 'Transaction'}
                      </div>

                      <div className="text-sm text-slate-400">
                        {new Date(tx.created_at).toLocaleString()}
                      </div>

                      {tx.note && tx.note !== tx.readable_label ? (
                        <div className="text-xs text-slate-500">{tx.note}</div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div className={`text-lg font-bold ${amountColor(tx)}`}>
                        {prefix(tx)}
                        {formatMoney(tx.amount_cents)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
// END_FILE