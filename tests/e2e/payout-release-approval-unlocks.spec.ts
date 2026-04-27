import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ROOT = process.cwd()

type EligibilityStatus = 'not_started' | 'pending_review' | 'approved' | 'rejected'

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

async function setSellerEligibilityStatus(
  admin: SupabaseClient,
  sellerId: string,
  status: EligibilityStatus,
  note: string
) {
  const { data, error } = await admin.rpc('gm_admin_set_seller_payout_eligibility', {
    p_user_id: sellerId,
    p_status: status,
    p_note: note,
  })

  if (error) {
    throw new Error(`Failed to update seller payout eligibility: ${error.message}`)
  }

  if (data?.success === false) {
    throw new Error(data?.message || 'Eligibility update returned success=false')
  }

  return data as {
    success: boolean
    user_id: string
    payout_eligibility_status: string
    note?: string | null
  }
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

test('blocked payout releases after seller is approved and payout release runs again', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const session = await getSessionForBooking(admin, bookingId)
  expect(session.status).toBe('completed')

  const payoutHoldInitial = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldInitial.status).toBe('held')
  expect(payoutHoldInitial.dispute_id ?? null).toBeNull()
  expect(payoutHoldInitial.released_at ?? null).toBeNull()

  const expectedSellerPayoutCents =
    typeof payoutHoldInitial.seller_payout_cents === 'number'
      ? payoutHoldInitial.seller_payout_cents
      : 600

  const initialSellerWalletRows = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(initialSellerWalletRows.length).toBe(0)

  const unapprovedResult = await setSellerEligibilityStatus(
    admin,
    seller.id,
    'not_started',
    'E2E payout unlock step 1: force seller unapproved'
  )

  expect(unapprovedResult.success).toBe(true)
  expect(unapprovedResult.payout_eligibility_status).toBe('not_started')

  const { data: firstReleaseResult, error: firstReleaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (firstReleaseError) {
    throw new Error(`First run_payout_release failed: ${firstReleaseError.message}`)
  }

  if (firstReleaseResult?.success === false) {
    throw new Error(firstReleaseResult.message || 'First run_payout_release returned success=false')
  }

  const payoutHoldBlocked = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBlocked.status).toBe('blocked_unverified_seller')
  expect(payoutHoldBlocked.dispute_id ?? null).toBeNull()
  expect(payoutHoldBlocked.released_at ?? null).toBeNull()
  expect(payoutHoldBlocked.blocked_at).toBeTruthy()
  expect(payoutHoldBlocked.blocked_reason).toBe('seller_not_approved')

  const sellerWalletAfterBlocked = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletAfterBlocked.length).toBe(0)

  const approvedResult = await setSellerEligibilityStatus(
    admin,
    seller.id,
    'approved',
    'E2E payout unlock step 2: approve seller and retry payout release'
  )

  expect(approvedResult.success).toBe(true)
  expect(approvedResult.payout_eligibility_status).toBe('approved')

  const { data: secondReleaseResult, error: secondReleaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (secondReleaseError) {
    throw new Error(`Second run_payout_release failed: ${secondReleaseError.message}`)
  }

  if (secondReleaseResult?.success === false) {
    throw new Error(secondReleaseResult.message || 'Second run_payout_release returned success=false')
  }

  const payoutHoldReleased = await getPayoutHoldForBooking(admin, bookingId)
  expect(['released', 'paid']).toContain(String(payoutHoldReleased.status))
  expect(payoutHoldReleased.dispute_id ?? null).toBeNull()
  expect(payoutHoldReleased.released_at).toBeTruthy()

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)
  expect(sellerBalanceAfter).toBe(sellerBalanceBefore + expectedSellerPayoutCents)

  const sellerWalletAfterRelease = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletAfterRelease.length).toBeGreaterThan(0)

  const matchingPayoutRow =
    sellerWalletAfterRelease.find((row) => {
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
    }) || sellerWalletAfterRelease[0]

  expect(matchingPayoutRow).toBeTruthy()

  const matchedAmount = getNumericAmount(matchingPayoutRow)
  if (matchedAmount !== null) {
    expect(matchedAmount).toBe(expectedSellerPayoutCents)
  }
})