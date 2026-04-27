import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const PROJECT_ROOT = process.cwd()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function runSeed(script: string) {
  execFileSync('node', ['--env-file=.env.local', path.join(PROJECT_ROOT, 'scripts', script)], {
    stdio: 'inherit',
  })
}

async function findUser(admin: SupabaseClient, username: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (error || !data) throw new Error('User not found')
  return data.id as string
}

async function getLatestSession(admin: SupabaseClient, buyerId: string, sellerId: string) {
  const { data } = await admin
    .from('sessions')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(1)

  return data?.[0]
}

async function getPayout(admin: SupabaseClient, sessionId: string) {
  const { data } = await admin
    .from('payout_holds')
    .select('*')
    .eq('session_id', sessionId)
    .limit(1)

  return data?.[0]
}

async function getStrike(admin: SupabaseClient, sessionId: string) {
  const { data } = await admin
    .from('strikes')
    .select('*')
    .eq('session_id', sessionId)

  return data || []
}

test.describe('no-show resolver', () => {
  test('buyer no-show', async () => {
    runSeed('seed-flow-no-show-buyer.mjs')

    const admin = adminClient()
    const buyerId = await findUser(admin, BUYER_NAME)
    const sellerId = await findUser(admin, SELLER_NAME)

    const before = await getLatestSession(admin, buyerId, sellerId)
    expect(['ready_to_start', 'no_show_buyer', 'no_show_seller']).toContain(before.status)

    await admin.rpc('resolve_no_show_sessions')

    const after = await getLatestSession(admin, buyerId, sellerId)
    const payout = await getPayout(admin, after.id)
    const strikes = await getStrike(admin, after.id)

    expect(after.status).toBe('no_show_buyer')
    expect(after.no_show_side).toBe('buyer')

    expect(payout.status).toBe('released')

    const strike = strikes.find(s => s.reason_code === 'no_show_buyer')
    expect(strike).toBeTruthy()
  })

  test('seller no-show', async () => {
    runSeed('seed-flow-no-show-seller.mjs')

    const admin = adminClient()
    const buyerId = await findUser(admin, BUYER_NAME)
    const sellerId = await findUser(admin, SELLER_NAME)

    const before = await getLatestSession(admin, buyerId, sellerId)
    expect(['ready_to_start', 'no_show_buyer', 'no_show_seller']).toContain(before.status)

    await admin.rpc('resolve_no_show_sessions')

    const after = await getLatestSession(admin, buyerId, sellerId)
    const payout = await getPayout(admin, after.id)
    const strikes = await getStrike(admin, after.id)

    expect(after.status).toBe('no_show_seller')
    expect(after.no_show_side).toBe('seller')

    expect(payout.status).toBe('refunded')

    const strike = strikes.find(s => s.reason_code === 'no_show_seller')
    expect(strike).toBeTruthy()
  })
})