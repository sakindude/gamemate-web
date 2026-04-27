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
      auth: { autoRefreshToken: false, persistSession: false },
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

async function findProfile(admin: SupabaseClient, username: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, balance_cents')
    .eq('username', username)
    .single()

  if (error || !data) throw new Error('Profile not found')
  return data
}

async function getBooking(admin: SupabaseClient, buyerId: string, sellerId: string) {
  const { data } = await admin
    .from('booking_requests')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(1)

  return data![0]
}

async function getPayoutHold(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  return data![0]
}

async function getWalletRows(admin: SupabaseClient, userId: string, bookingId: string) {
  const { data } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('booking_id', bookingId)

  return data || []
}

test('payout release is idempotent and does not double-credit seller on rerun', async () => {
  runSeed('seed-flow-payout-release-completed.mjs')

  const admin = getAdminClient()

  const buyer = await findProfile(admin, BUYER_NAME)
  const seller = await findProfile(admin, SELLER_NAME)

  const booking = await getBooking(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const payoutHold = await getPayoutHold(admin, bookingId)

  // CRITICAL FIX:
  // Seed zaten release etmiş olabilir → sadece released mı diye bak
  expect(['held', 'released']).toContain(String(payoutHold.status))

  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)

  // 1. run
  await admin.rpc('run_payout_release')

  const sellerAfterFirst = await findProfile(admin, SELLER_NAME)
  const balanceAfterFirst = Number(sellerAfterFirst.balance_cents ?? 0)

  // 2. run (idempotency check)
  await admin.rpc('run_payout_release')

  const sellerAfterSecond = await findProfile(admin, SELLER_NAME)
  const balanceAfterSecond = Number(sellerAfterSecond.balance_cents ?? 0)

  // CRITICAL ASSERT:
  // ikinci run para eklememeli
  expect(balanceAfterSecond).toBe(balanceAfterFirst)

  const walletRows = await getWalletRows(admin, seller.id, bookingId)

  // sadece 1 payout kaydı olmalı
  const payoutRows = walletRows.filter((r) =>
    String(r.tx_type || '').includes('payout')
  )

  expect(payoutRows.length).toBe(1)
})