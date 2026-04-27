import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ROOT = process.cwd()

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

function getAdminClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

function runSeed(scriptName: string) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName)
  execFileSync('node', ['--env-file=.env.local', scriptPath], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  })
}

async function findProfileByUsername(admin: SupabaseClient, username: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, balance_cents')
    .eq('username', username)
    .single()

  if (error || !data?.id) {
    throw new Error(
      `Could not find profile by username "${username}": ${error?.message || 'not found'}`
    )
  }

  return data as { id: string; username: string; balance_cents: number | null }
}

async function getLatestBookingForPair(
  admin: SupabaseClient,
  buyerId: string,
  sellerId: string
) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to load booking for pair: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('Booking not found after seed')
  }

  return row as Record<string, any>
}

async function getSessionForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('sessions')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) {
    throw new Error(`Failed to load session for booking: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('Session not found for booking')
  }

  return row as Record<string, any>
}

async function getPayoutHoldForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) {
    throw new Error(`Failed to load payout hold: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('Payout hold not found for booking')
  }

  return row as Record<string, any>
}

async function getWalletTransactionsForUser(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load wallet_transactions: ${error.message}`)
  }

  return (data || []) as Record<string, any>[]
}

function getNumericAmount(row: Record<string, any> | undefined) {
  if (!row) return null

  const candidates = [
    row.amount_cents,
    row.delta_cents,
    row.net_amount_cents,
    row.value_cents,
    row.credit_cents,
  ]

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }

  return null
}

function extractPossibleText(row: Record<string, any> | undefined) {
  if (!row) return ''

  const pieces = [
    row.tx_type,
    row.type,
    row.kind,
    row.category,
    row.reason_code,
    row.description,
    row.note,
    row.reference_type,
    row.status,
    row.direction,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())

  return pieces.join(' | ')
}

test('buyer no-show flow closes session without refunding buyer', async () => {
  runSeed('seed-flow-no-show-buyer.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const bookingBefore = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(bookingBefore.id)

  const sessionBefore = await getSessionForBooking(admin, bookingId)
  expect(sessionBefore.status).toBe('ready_to_start')
  expect(sessionBefore.buyer_started_at ?? null).toBeNull()
  expect(sessionBefore.seller_started_at).toBeTruthy()

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.refunded_at ?? null).toBeNull()
  expect(payoutHoldBefore.released_at ?? null).toBeNull()

  const buyerBalanceBefore = Number(buyer.balance_cents ?? 0)
  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  const buyerWalletBefore = await getWalletTransactionsForUser(admin, buyer.id)
  const buyerWalletCountBefore = buyerWalletBefore.length

  const sellerWalletBefore = await getWalletTransactionsForUser(admin, seller.id)
  const sellerWalletCountBefore = sellerWalletBefore.length

  const { data: noShowResult, error: noShowError } = await admin.rpc(
    'mark_session_no_show',
    {
      p_session_id: String(sessionBefore.id),
      p_no_show_side: 'buyer',
    }
  )

  if (noShowError) {
    throw new Error(`mark_session_no_show failed: ${noShowError.message}`)
  }

  if (noShowResult?.success === false) {
    throw new Error(noShowResult.message || 'mark_session_no_show returned success=false')
  }

  const sessionAfter = await getSessionForBooking(admin, bookingId)
  expect(['no_show_buyer', 'cancelled']).toContain(String(sessionAfter.status))
  expect(String(sessionAfter.no_show_side || '')).toBe('buyer')

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(['forfeited', 'held', 'closed']).toContain(String(payoutHoldAfter.status))
  expect(payoutHoldAfter.refunded_at ?? null).toBeNull()

  const buyerAfter = await findProfileByUsername(admin, BUYER_NAME)
  const buyerBalanceAfter = Number(buyerAfter.balance_cents ?? 0)

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)

  // canonical truth: buyer no-show => no refund
  expect(buyerBalanceAfter).toBe(buyerBalanceBefore)

  // no-show marking itself should not silently pay seller here
  expect(sellerBalanceAfter).toBe(sellerBalanceBefore)

  const buyerWalletAfter = await getWalletTransactionsForUser(admin, buyer.id)
  expect(buyerWalletAfter.length).toBe(buyerWalletCountBefore)

  const buyerNewRows = buyerWalletAfter.slice(0, buyerWalletAfter.length - buyerWalletCountBefore)
  const suspiciousBuyerRefundRow = buyerNewRows.find((row) => {
    const rowText = extractPossibleText(row)
    const rowAmount = getNumericAmount(row)
    return (
      String(row.booking_id || '') === bookingId &&
      (rowText.includes('refund') || rowText.includes('booking_refund')) &&
      typeof rowAmount === 'number' &&
      rowAmount > 0
    )
  })
  expect(suspiciousBuyerRefundRow ?? null).toBeNull()

  const sellerWalletAfter = await getWalletTransactionsForUser(admin, seller.id)
  expect(sellerWalletAfter.length).toBe(sellerWalletCountBefore)
})