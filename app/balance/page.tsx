// FILE START: app/balance/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TopNav from '../../components/TopNav'

type Transaction = {
  id: string
  booking_id: string | null
  tx_type: string
  direction: 'debit' | 'credit' | 'info'
  amount_cents: number
  currency: string
  status: string
  note: string | null
  created_at: string
}

function formatMoney(cents: number | null | undefined, currencySymbol = '₺') {
  const safe = Number(cents || 0)
  return `${currencySymbol}${(safe / 100).toFixed(2)}`
}

function toCents(amount: string) {
  const normalized = amount.replace(',', '.').trim()
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric * 100)
}

export default function BalancePage() {
  const router = useRouter()

  const [balanceCents, setBalanceCents] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    setMessageType('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      router.push('/login')
      return
    }

    const [{ data: summary, error: summaryError }, { data: txs, error: txError }] =
      await Promise.all([
        supabase.rpc('get_my_wallet_summary'),
        supabase.rpc('get_my_wallet_transactions', { p_limit: 100 }),
      ])

    if (summaryError) {
      setMessage(summaryError.message)
      setMessageType('error')
      setLoading(false)
      return
    }

    if (txError) {
      setMessage(txError.message)
      setMessageType('error')
      setLoading(false)
      return
    }

    setBalanceCents(Number(summary?.balance_cents || 0))
    setTransactions((txs || []) as Transaction[])
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const addBalance = async () => {
    setMessage('')
    setMessageType('')

    const finalAmountCents = toCents(amount)

    if (!finalAmountCents) {
      setMessage('Enter a valid amount greater than 0.')
      setMessageType('error')
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      setMessage('Login required.')
      setMessageType('error')
      return
    }

    const { data, error } = await supabase.rpc('gm_admin_add_balance', {
      p_user_id: session.user.id,
      p_amount_cents: finalAmountCents,
      p_note: `Manual wallet top-up: ${formatMoney(finalAmountCents)}`,
    })

    if (error || !data?.success) {
      setMessage(error?.message || data?.message || 'Could not add balance.')
      setMessageType('error')
      return
    }

    setMessage('Balance added successfully.')
    setMessageType('success')
    setAmount('')
    await load()
  }

  const humanizeType = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'Top Up'
      case 'booking_hold':
        return 'Booking Hold'
      case 'booking_refund':
        return 'Refund'
      case 'seller_payout':
        return 'Seller Payout'
      case 'platform_fee':
        return 'Platform Fee'
      case 'tip_credit':
        return 'Tip Credit'
      case 'withdrawal':
        return 'Withdrawal'
      case 'withdrawal_fee':
        return 'Withdrawal Fee'
      case 'manual_adjustment':
        return 'Manual Adjustment'
      default:
        return type
    }
  }

  const amountColor = (tx: Transaction) => {
    if (tx.direction === 'credit') return 'text-emerald-400'
    if (tx.direction === 'debit') return 'text-rose-400'
    return 'text-slate-300'
  }

  const amountPrefix = (tx: Transaction) => {
    if (tx.direction === 'credit') return '+'
    if (tx.direction === 'debit') return '-'
    return ''
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopNav />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-4xl font-bold">Balance</h1>

          <button
            onClick={() => void load()}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold hover:bg-indigo-500"
          >
            Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Current Balance</p>
          <p className="mt-2 text-4xl font-bold text-emerald-400">
            {formatMoney(balanceCents)}
          </p>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-slate-300">
              Enter amount to add
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Example: 100 or 100.50"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none sm:max-w-xs"
              />

              <button
                onClick={() => void addBalance()}
                className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
              >
                Add Balance
              </button>
            </div>
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 ${
              messageType === 'success' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {message}
          </p>
        )}

        {loading && <p className="mt-6 text-slate-400">Loading...</p>}

        <div className="mt-8 grid gap-4">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-bold">
                    {humanizeType(tx.tx_type)}
                  </div>

                  <div className="mt-1 text-sm text-slate-300">
                    {tx.note || '-'}
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {new Date(tx.created_at).toLocaleString()}
                  </div>

                  {tx.booking_id && (
                    <div className="mt-1 text-xs text-slate-500">
                      Booking ID: {tx.booking_id}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className={`text-lg font-bold ${amountColor(tx)}`}>
                    {amountPrefix(tx)}
                    {formatMoney(Number(tx.amount_cents || 0))}
                  </div>

                  <div className="mt-1 text-sm capitalize text-slate-400">
                    {tx.status}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading && transactions.length === 0 && (
            <p className="text-slate-400">No balance history yet.</p>
          )}
        </div>
      </section>
    </main>
  )
}
// FILE END: app/balance/page.tsx