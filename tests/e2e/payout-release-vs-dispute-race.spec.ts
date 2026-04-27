// START_FILE: tests/e2e/payout-release-vs-dispute-race.spec.ts
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BUYER_EMAIL = process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com'
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD || '123456789'
const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ROOT = process.cwd()

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing required env: ${name}`)
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

function getBuyerClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY),
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

async function loginBuyer(client: SupabaseClient) {
  const { data, error } = await client.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (error || !data.user?.id) {
    throw new Error(`Buyer login failed: ${error?.message || 'no user returned'}`)
  }

  return data.user
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

  if (error) throw new Error(`Failed to load booking for pair: ${error.message}`)

  const row = data?.[0]
  if (!row) throw new Error('Booking not found after seed')

  return row as Record<string, any>
}

async function getSessionForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('sessions')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) throw new Error(`Failed to load session for booking: ${error.message}`)

  const row = data?.[0]
  if (!row) throw new Error('Session not found for booking')

  return row as Record<string, any>
}

async function getPayoutHoldForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) throw new Error(`Failed to load payout hold: ${error.message}`)

  const row = data?.[0]
  if (!row) throw new Error('Payout hold not found for booking')

  return row as Record<string, any>
}

async function getDisputesForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('disputes')
    .select('*')
    .eq('booking_request_id', bookingId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load disputes: ${error.message}`)

  return (data || []) as Record<string, any>[]
}

async function getSellerPayoutWalletRows(
  admin: SupabaseClient,
  sellerId: string,
  bookingId: string
) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', sellerId)
    .eq('booking_id', bookingId)
    .eq('tx_type', 'seller_payout')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load seller payout wallet rows: ${error.message}`)
  }

  return data || []
}

async function forcePayoutHoldReleasable(admin: SupabaseClient, payoutHoldId: string) {
  const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('payout_holds')
    .update({
      status: 'held',
      releasable_at: pastIso,
      released_at: null,
      dispute_id: null,
      blocked_at: null,
      blocked_reason: null,
    })
    .eq('id', payoutHoldId)
    .select('*')
    .single()

  if (error || !data?.id) {
    throw new Error(`Failed to force payout hold releasable: ${error?.message || 'not found'}`)
  }

  return data as Record<string, any>
}

test('payout release and dispute create race has only one financial winner', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()
  const buyerClient = getBuyerClient()

  await loginBuyer(buyerClient)

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const sellerBefore = await findProfileByUsername(admin, SELLER_NAME)

  const booking = await getLatestBookingForPair(admin, buyer.id, sellerBefore.id)
  const bookingId = String(booking.id)

  const session = await getSessionForBooking(admin, bookingId)
  expect(String(session.status)).toBe('completed')

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(String(payoutHoldBefore.status)).toBe('held')
  expect(payoutHoldBefore.released_at ?? null).toBeNull()
  expect(payoutHoldBefore.dispute_id ?? null).toBeNull()

  const expectedSellerPayoutCents = Number(payoutHoldBefore.seller_payout_cents ?? 600)
  const sellerBalanceBefore = Number(sellerBefore.balance_cents ?? 0)

  await forcePayoutHoldReleasable(admin, String(payoutHoldBefore.id))

  const [releaseResult, disputeResult] = await Promise.allSettled([
    admin.rpc('run_payout_release'),
    buyerClient.rpc('create_session_dispute', {
      p_session_id: String(session.id),
      p_reason_code: 'session_issue',
      p_description: 'E2E payout release vs dispute create race',
    }),
  ])

  if (releaseResult.status === 'rejected') {
    throw new Error(`run_payout_release rejected: ${String(releaseResult.reason)}`)
  }

  if (releaseResult.value.error) {
    throw new Error(`run_payout_release failed: ${releaseResult.value.error.message}`)
  }

  if (releaseResult.value.data?.success === false) {
    throw new Error(releaseResult.value.data.message || 'run_payout_release returned success=false')
  }

  if (disputeResult.status === 'rejected') {
    throw new Error(`create_session_dispute rejected: ${String(disputeResult.reason)}`)
  }

  if (disputeResult.value.error) {
    const allowedErrorText = String(disputeResult.value.error.message || '').toLowerCase()

    if (
      !allowedErrorText.includes('released') &&
      !allowedErrorText.includes('payout') &&
      !allowedErrorText.includes('dispute') &&
      !allowedErrorText.includes('session')
    ) {
      throw new Error(`Unexpected create_session_dispute error: ${disputeResult.value.error.message}`)
    }
  }

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  const disputesAfter = await getDisputesForBooking(admin, bookingId)
  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerPayoutRows = await getSellerPayoutWalletRows(admin, sellerBefore.id, bookingId)

  const openDisputes = disputesAfter.filter((row) =>
    ['open', 'under_review'].includes(String(row.status))
  )

  const payoutReleased =
    String(payoutHoldAfter.status) === 'released' || Boolean(payoutHoldAfter.released_at)

  const payoutDisputed =
    String(payoutHoldAfter.status) === 'disputed' || Boolean(payoutHoldAfter.dispute_id)

  expect(!(payoutReleased && payoutDisputed)).toBe(true)

  if (payoutReleased) {
    expect(String(payoutHoldAfter.status)).toBe('released')
    expect(payoutHoldAfter.released_at).toBeTruthy()
    expect(payoutHoldAfter.dispute_id ?? null).toBeNull()

    expect(sellerPayoutRows).toHaveLength(1)
    expect(Number(sellerPayoutRows[0].amount_cents)).toBe(expectedSellerPayoutCents)

    expect(Number(sellerAfter.balance_cents ?? 0)).toBe(
      sellerBalanceBefore + expectedSellerPayoutCents
    )

    const linkedOpenDispute = openDisputes.find(
      (row) => String(row.payout_hold_id || '') === String(payoutHoldAfter.id)
    )

    expect(linkedOpenDispute).toBeFalsy()
  } else if (payoutDisputed) {
    expect(String(payoutHoldAfter.status)).toBe('disputed')
    expect(payoutHoldAfter.dispute_id).toBeTruthy()

    expect(sellerPayoutRows).toHaveLength(0)
    expect(Number(sellerAfter.balance_cents ?? 0)).toBe(sellerBalanceBefore)

    const linkedDispute = disputesAfter.find(
      (row) => String(row.id) === String(payoutHoldAfter.dispute_id)
    )

    expect(linkedDispute).toBeTruthy()
    expect(['open', 'under_review']).toContain(String(linkedDispute?.status))
  } else {
    throw new Error(
      `Race ended with neither release nor dispute. payout_hold status=${String(
        payoutHoldAfter.status
      )}, dispute_id=${String(payoutHoldAfter.dispute_id || '-')}`
    )
  }

  const { data: secondReleaseResult, error: secondReleaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (secondReleaseError) {
    throw new Error(`Second run_payout_release failed: ${secondReleaseError.message}`)
  }

  if (secondReleaseResult?.success === false) {
    throw new Error(secondReleaseResult.message || 'Second run_payout_release returned success=false')
  }

  const payoutHoldFinal = await getPayoutHoldForBooking(admin, bookingId)
  const sellerFinal = await findProfileByUsername(admin, SELLER_NAME)
  const sellerPayoutRowsFinal = await getSellerPayoutWalletRows(admin, sellerBefore.id, bookingId)

  expect(!(String(payoutHoldFinal.status) === 'released' && payoutHoldFinal.dispute_id)).toBe(true)
  expect(sellerPayoutRowsFinal.length).toBeLessThanOrEqual(1)

  if (String(payoutHoldAfter.status) === 'disputed') {
    expect(String(payoutHoldFinal.status)).toBe('disputed')
    expect(sellerPayoutRowsFinal).toHaveLength(0)
    expect(Number(sellerFinal.balance_cents ?? 0)).toBe(sellerBalanceBefore)
  }

  if (String(payoutHoldAfter.status) === 'released') {
    expect(String(payoutHoldFinal.status)).toBe('released')
    expect(sellerPayoutRowsFinal).toHaveLength(1)
    expect(Number(sellerFinal.balance_cents ?? 0)).toBe(
      sellerBalanceBefore + expectedSellerPayoutCents
    )
  }
})
// END_FILE