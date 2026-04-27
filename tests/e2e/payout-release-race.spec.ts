// START_FILE: tests/e2e/payout-release-race.spec.ts
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

  if (error) throw new Error(`Failed to load booking for pair: ${error.message}`)

  const row = data?.[0]
  if (!row) throw new Error('Booking not found after seed')

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

test('payout release race only credits seller once', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const sellerBefore = await findProfileByUsername(admin, SELLER_NAME)

  const booking = await getLatestBookingForPair(admin, buyer.id, sellerBefore.id)
  const bookingId = String(booking.id)

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.released_at ?? null).toBeNull()
  expect(payoutHoldBefore.dispute_id ?? null).toBeNull()

  const expectedSellerPayoutCents = Number(payoutHoldBefore.seller_payout_cents ?? 600)
  const sellerBalanceBefore = Number(sellerBefore.balance_cents ?? 0)

  await forcePayoutHoldReleasable(admin, String(payoutHoldBefore.id))

  const releaseResults = await Promise.allSettled([
    admin.rpc('run_payout_release'),
    admin.rpc('run_payout_release'),
    admin.rpc('run_payout_release'),
    admin.rpc('run_payout_release'),
    admin.rpc('run_payout_release'),
  ])

  for (const result of releaseResults) {
    if (result.status === 'rejected') {
      throw new Error(`run_payout_release rejected: ${String(result.reason)}`)
    }

    if (result.value.error) {
      throw new Error(`run_payout_release failed: ${result.value.error.message}`)
    }

    if (result.value.data?.success === false) {
      throw new Error(result.value.data.message || 'run_payout_release returned success=false')
    }
  }

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(String(payoutHoldAfter.status)).toBe('released')
  expect(payoutHoldAfter.released_at).toBeTruthy()

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)

  expect(sellerBalanceAfter).toBe(sellerBalanceBefore + expectedSellerPayoutCents)

  const payoutRows = await getSellerPayoutWalletRows(admin, sellerBefore.id, bookingId)

  expect(payoutRows).toHaveLength(1)
  expect(Number(payoutRows[0].amount_cents)).toBe(expectedSellerPayoutCents)
})
// END_FILE