import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'
const ADMIN_USER_ID = 'b222a027-c0e8-4c81-b02b-6d9222c4cc88'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ROOT = process.cwd()

const PARTIAL_REFUND_CENTS = 200

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

async function getDisputeForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('disputes')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) {
    throw new Error(`Failed to load dispute for booking: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('Dispute not found for booking')
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

async function getLatestResolutionEvent(admin: SupabaseClient, sessionId: string) {
  const { data } = await admin
    .from('session_events')
    .select('*')
    .eq('session_id', sessionId)
    .eq('event_type', 'dispute_resolved_partial')
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0] || null
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

test('dispute resolve partial refunds buyer partially and pays seller the remainder', async () => {
  runSeed('seed-flow-dispute-resolve-partial.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const bookingBefore = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(bookingBefore.id)

  const sessionBefore = await getSessionForBooking(admin, bookingId)
  expect(sessionBefore.status).toBe('disputed')

  const disputeBefore = await getDisputeForBooking(admin, bookingId)
  expect(String(disputeBefore.status)).toBe('open')

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(String(payoutHoldBefore.status)).toBe('disputed')

  const buyerBalanceBefore = Number(buyer.balance_cents ?? 0)
  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  const sellerPayoutBefore =
    typeof payoutHoldBefore.seller_payout_cents === 'number'
      ? payoutHoldBefore.seller_payout_cents
      : typeof bookingBefore.seller_payout_cents === 'number'
      ? bookingBefore.seller_payout_cents
      : 600

  const expectedBuyerRefund = PARTIAL_REFUND_CENTS
  const expectedSellerPayout = sellerPayoutBefore - PARTIAL_REFUND_CENTS

  expect(expectedSellerPayout).toBeGreaterThanOrEqual(0)

  const buyerWalletBefore = await getWalletTransactionsForUser(admin, buyer.id)
  const buyerWalletCountBefore = buyerWalletBefore.length

  const sellerWalletBefore = await getWalletTransactionsForUser(admin, seller.id)
  const sellerWalletCountBefore = sellerWalletBefore.length

  const { data: resolveResult, error: resolveError } = await admin.rpc(
    'resolve_dispute',
    {
      p_dispute_id: String(disputeBefore.id),
      p_resolution: 'partial',
      p_refund_amount_cents: PARTIAL_REFUND_CENTS,
      p_resolved_by_user_id: ADMIN_USER_ID,
      p_resolution_note: 'E2E partial resolution',
    }
  )

  if (resolveError) {
    throw new Error(`resolve_dispute failed: ${resolveError.message}`)
  }

  if (resolveResult?.success === false) {
    throw new Error(resolveResult.message || 'resolve_dispute returned success=false')
  }

  const disputeAfter = await getDisputeForBooking(admin, bookingId)
  expect(String(disputeAfter.status)).toBe('resolved_partial')
  expect(String(disputeAfter.resolved_by_user_id)).toBe(ADMIN_USER_ID)
  expect(disputeAfter.resolved_at).toBeTruthy()
  expect(Number(disputeAfter.refund_amount_cents ?? -1)).toBe(expectedBuyerRefund)
  expect(Number(disputeAfter.seller_amount_cents ?? -1)).toBe(expectedSellerPayout)
  expect(String(disputeAfter.resolution_note ?? '')).toBe('E2E partial resolution')

  const sessionAfter = await getSessionForBooking(admin, bookingId)
  expect(String(sessionAfter.status)).toBe('completed')

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(String(payoutHoldAfter.status)).toBe('partial_refund')

  const buyerAfter = await findProfileByUsername(admin, BUYER_NAME)
  const buyerBalanceAfter = Number(buyerAfter.balance_cents ?? 0)
  expect(buyerBalanceAfter).toBe(buyerBalanceBefore + expectedBuyerRefund)

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)
  expect(sellerBalanceAfter).toBe(sellerBalanceBefore + expectedSellerPayout)

  const buyerWalletAfter = await getWalletTransactionsForUser(admin, buyer.id)
  expect(buyerWalletAfter.length).toBeGreaterThan(buyerWalletCountBefore)

  const buyerNewRows = buyerWalletAfter.slice(0, buyerWalletAfter.length - buyerWalletCountBefore)
  expect(buyerNewRows.length).toBeGreaterThan(0)

  const matchingRefundRow =
    buyerNewRows.find((row) => {
      const rowText = extractPossibleText(row)
      const rowAmount = getNumericAmount(row)

      const bookingMatch = String(row.booking_id || '') === bookingId
      const refundTextMatch =
        rowText.includes('refund') ||
        rowText.includes('booking_refund') ||
        rowText.includes('partial') ||
        rowText.includes('dispute')

      const refundAmountMatch = rowAmount === expectedBuyerRefund

      return refundAmountMatch && (bookingMatch || refundTextMatch)
    }) || buyerNewRows[0]

  expect(matchingRefundRow).toBeTruthy()

  const matchedRefundAmount = getNumericAmount(matchingRefundRow)
  if (matchedRefundAmount !== null) {
    expect(matchedRefundAmount).toBe(expectedBuyerRefund)
  }

  const sellerWalletAfter = await getWalletTransactionsForUser(admin, seller.id)
  expect(sellerWalletAfter.length).toBeGreaterThan(sellerWalletCountBefore)

  const sellerNewRows = sellerWalletAfter.slice(0, sellerWalletAfter.length - sellerWalletCountBefore)
  expect(sellerNewRows.length).toBeGreaterThan(0)

  const matchingPayoutRow =
    sellerNewRows.find((row) => {
      const rowText = extractPossibleText(row)
      const rowAmount = getNumericAmount(row)

      const bookingMatch = String(row.booking_id || '') === bookingId
      const payoutTextMatch =
        rowText.includes('seller_payout') ||
        rowText.includes('payout') ||
        rowText.includes('partial') ||
        rowText.includes('dispute')

      const payoutAmountMatch = rowAmount === expectedSellerPayout

      return payoutAmountMatch && (bookingMatch || payoutTextMatch)
    }) || sellerNewRows[0]

  expect(matchingPayoutRow).toBeTruthy()

  const matchedPayoutAmount = getNumericAmount(matchingPayoutRow)
  if (matchedPayoutAmount !== null) {
    expect(matchedPayoutAmount).toBe(expectedSellerPayout)
  }

  const event = await getLatestResolutionEvent(admin, String(sessionBefore.id))
  expect(event).toBeTruthy()
})