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

test('auto-complete flow completes awaiting_confirmation session after deadline and keeps payout held until payout release time', async () => {
  runSeed('seed-flow-auto-complete-awaiting.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const bookingBefore = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(bookingBefore.id)

  const sessionBefore = await getSessionForBooking(admin, bookingId)
  expect(['awaiting_confirmation', 'completed']).toContain(sessionBefore.status)
  expect(sessionBefore.completed_at ?? null).toBeNull()
  expect(sessionBefore.buyer_completed_at ?? null).toBeNull()
  expect(sessionBefore.seller_completed_at).toBeTruthy()
  expect(sessionBefore.auto_complete_at).toBeTruthy()

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.released_at ?? null).toBeNull()
  expect(payoutHoldBefore.releasable_at).toBeTruthy()

  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  const { data: autoCompleteResult, error: autoCompleteError } = await admin.rpc(
    'run_session_auto_complete'
  )

  if (autoCompleteError) {
    throw new Error(`run_session_auto_complete failed: ${autoCompleteError.message}`)
  }

  if (autoCompleteResult?.success === false) {
    throw new Error(autoCompleteResult.message || 'run_session_auto_complete returned success=false')
  }

  const sessionAfter = await getSessionForBooking(admin, bookingId)
  expect(sessionAfter.status).toBe('completed')
  expect(sessionAfter.completed_at).toBeTruthy()

  // canonical rule from our flow:
  // auto-complete closes the session even if one side never clicked complete.
  // seller already completed; buyer may remain null, but session itself must close.
  expect(sessionAfter.seller_completed_at).toBeTruthy()

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldAfter.status).toBe('held')
  expect(payoutHoldAfter.released_at ?? null).toBeNull()
  expect(payoutHoldAfter.releasable_at).toBeTruthy()

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)

  // auto-complete must NOT release payout yet
  expect(sellerBalanceAfter).toBe(sellerBalanceBefore)
})