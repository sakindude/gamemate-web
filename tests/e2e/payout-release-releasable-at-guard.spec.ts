// START_FILE: tests/e2e/payout-release-releasable-at-guard.spec.ts
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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

async function updatePayoutHoldReleasableAt(
  admin: SupabaseClient,
  payoutHoldId: string,
  releasableAtIso: string
) {
  const { data, error } = await admin
    .from('payout_holds')
    .update({
      status: 'held',
      releasable_at: releasableAtIso,
      released_at: null,
      dispute_id: null,
      blocked_at: null,
      blocked_reason: null,
    })
    .eq('id', payoutHoldId)
    .select('*')
    .single()

  if (error || !data?.id) {
    throw new Error(`Failed to update payout hold releasable_at: ${error?.message || 'not found'}`)
  }

  return data as Record<string, any>
}

async function getWalletTransactionsForBooking(
  admin: SupabaseClient,
  userId: string,
  bookingId: string
) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load wallet transactions for booking: ${error.message}`)
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

function findMatchingPayoutRow(
  rows: Record<string, any>[],
  bookingId: string,
  expectedSellerPayoutCents: number
) {
  return (
    rows.find((row) => {
      const rowText = extractPossibleText(row)
      const rowAmount = getNumericAmount(row)

      const bookingMatch = String(row.booking_id || '') === bookingId
      const payoutTextMatch =
        rowText.includes('payout') ||
        rowText.includes('release') ||
        rowText.includes('seller') ||
        rowText.includes('credit')

      const payoutAmountMatch = rowAmount === expectedSellerPayoutCents

      return payoutAmountMatch && (bookingMatch || payoutTextMatch)
    }) || null
  )
}

function expectSameInstant(actualValue: unknown, expectedIso: string) {
  const actual = new Date(String(actualValue))
  const expected = new Date(expectedIso)

  expect(Number.isNaN(actual.getTime())).toBe(false)
  expect(Number.isNaN(expected.getTime())).toBe(false)
  expect(actual.getTime()).toBe(expected.getTime())
}

test('payout release waits for releasable_at and releases only after the time gate passes', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const session = await getSessionForBooking(admin, bookingId)
  expect(session.status).toBe('completed')

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.dispute_id ?? null).toBeNull()
  expect(payoutHoldBefore.released_at ?? null).toBeNull()

  const expectedSellerPayoutCents =
    typeof payoutHoldBefore.seller_payout_cents === 'number'
      ? payoutHoldBefore.seller_payout_cents
      : 600

  const sellerWalletBefore = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletBefore.length).toBe(0)

  const futureReleasableAtIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const payoutHoldFuture = await updatePayoutHoldReleasableAt(
    admin,
    String(payoutHoldBefore.id),
    futureReleasableAtIso
  )

  expect(payoutHoldFuture.status).toBe('held')
  expectSameInstant(payoutHoldFuture.releasable_at, futureReleasableAtIso)
  expect(payoutHoldFuture.released_at ?? null).toBeNull()
  expect(payoutHoldFuture.dispute_id ?? null).toBeNull()

  const { data: firstReleaseResult, error: firstReleaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (firstReleaseError) {
    throw new Error(`First run_payout_release failed: ${firstReleaseError.message}`)
  }

  if (firstReleaseResult?.success === false) {
    throw new Error(firstReleaseResult.message || 'First run_payout_release returned success=false')
  }

  const payoutHoldAfterFirst = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldAfterFirst.status).toBe('held')
  expect(payoutHoldAfterFirst.released_at ?? null).toBeNull()
  expectSameInstant(payoutHoldAfterFirst.releasable_at, futureReleasableAtIso)

  const sellerWalletAfterFirst = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletAfterFirst.length).toBe(0)

  const pastReleasableAtIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const payoutHoldPast = await updatePayoutHoldReleasableAt(
    admin,
    String(payoutHoldBefore.id),
    pastReleasableAtIso
  )

  expect(payoutHoldPast.status).toBe('held')
  expectSameInstant(payoutHoldPast.releasable_at, pastReleasableAtIso)
  expect(payoutHoldPast.released_at ?? null).toBeNull()
  expect(payoutHoldPast.dispute_id ?? null).toBeNull()

  const { data: secondReleaseResult, error: secondReleaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (secondReleaseError) {
    throw new Error(`Second run_payout_release failed: ${secondReleaseError.message}`)
  }

  if (secondReleaseResult?.success === false) {
    throw new Error(secondReleaseResult.message || 'Second run_payout_release returned success=false')
  }

  const payoutHoldAfterSecond = await getPayoutHoldForBooking(admin, bookingId)
  expect(['released', 'paid']).toContain(String(payoutHoldAfterSecond.status))
  expect(payoutHoldAfterSecond.released_at).toBeTruthy()
  expectSameInstant(payoutHoldAfterSecond.releasable_at, pastReleasableAtIso)

  const sellerAfterSecond = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfterSecond = Number(sellerAfterSecond.balance_cents ?? 0)
  expect(sellerBalanceAfterSecond).toBeGreaterThanOrEqual(
    sellerBalanceBefore + expectedSellerPayoutCents
  )

  const sellerWalletAfterSecond = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletAfterSecond.length).toBeGreaterThan(0)

  const matchingPayoutRow = findMatchingPayoutRow(
    sellerWalletAfterSecond,
    bookingId,
    expectedSellerPayoutCents
  )

  expect(matchingPayoutRow).toBeTruthy()

  const matchedAmount = getNumericAmount(matchingPayoutRow || undefined)
  if (matchedAmount !== null) {
    expect(matchedAmount).toBe(expectedSellerPayoutCents)
  }
})
// END_FILE