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

async function setSellerEligibilityStatus(
  admin: SupabaseClient,
  sellerId: string,
  status: 'not_started' | 'pending_review' | 'approved' | 'rejected',
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

test('payout release blocks completed payout when seller is not approved', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const eligibilityUpdate = await setSellerEligibilityStatus(
    admin,
    seller.id,
    'not_started',
    'E2E payout blocked: seller not approved'
  )

  expect(eligibilityUpdate.success).toBe(true)
  expect(eligibilityUpdate.payout_eligibility_status).toBe('not_started')

  const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const session = await getSessionForBooking(admin, bookingId)
  expect(session.status).toBe('completed')

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.dispute_id ?? null).toBeNull()
  expect(payoutHoldBefore.released_at ?? null).toBeNull()
  expect(payoutHoldBefore.blocked_at ?? null).toBeNull()
  expect(payoutHoldBefore.blocked_reason ?? null).toBeNull()

  const sellerWalletBefore = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletBefore.length).toBe(0)

  const { data: releaseResult, error: releaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (releaseError) {
    throw new Error(`run_payout_release failed: ${releaseError.message}`)
  }

  if (releaseResult?.success === false) {
    throw new Error(releaseResult.message || 'run_payout_release returned success=false')
  }

  expect(Number(releaseResult?.released_count ?? 0)).toBe(0)
  expect(Number(releaseResult?.blocked_unverified_count ?? 0)).toBeGreaterThanOrEqual(1)

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldAfter.status).toBe('blocked_unverified_seller')
  expect(payoutHoldAfter.dispute_id ?? null).toBeNull()
  expect(payoutHoldAfter.released_at ?? null).toBeNull()
  expect(payoutHoldAfter.blocked_at).toBeTruthy()
  expect(payoutHoldAfter.blocked_reason).toBe('seller_not_approved')

  const sellerWalletAfter = await getWalletTransactionsForBooking(admin, seller.id, bookingId)
  expect(sellerWalletAfter.length).toBe(0)
})