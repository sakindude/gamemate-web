import { test, expect, type Page, type Locator } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PROJECT_ROOT = process.cwd()

const SELLER_EMAIL =
  process.env.PW_TEST_SELLER_EMAIL ||
  'gm_test_seller@gmail.com'

const SELLER_PASSWORD =
  process.env.PW_TEST_SELLER_PASSWORD ||
  '123456789'

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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

async function loginSeller(page: Page) {
  await page.goto('/login')

  await page.getByPlaceholder('Email').fill(SELLER_EMAIL)
  await page.getByPlaceholder('Password').fill(SELLER_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(/\/(explore|sessions)/, { timeout: 15000 })
}

async function openSessions(page: Page) {
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
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
      releasable_at: releasableAtIso,
    })
    .eq('id', payoutHoldId)
    .select('*')
    .single()

  if (error || !data?.id) {
    throw new Error(`Failed to update payout hold releasable_at: ${error?.message || 'not found'}`)
  }

  return data as Record<string, any>
}

async function runPayoutRelease(admin: SupabaseClient) {
  const { data, error } = await admin.rpc('run_payout_release')

  if (error) {
    throw new Error(`run_payout_release failed: ${error.message}`)
  }

  if (data?.success === false) {
    throw new Error(data?.message || 'run_payout_release returned success=false')
  }

  return data as Record<string, any>
}

function getBuyerCardByCountdown(page: Page, countdownPattern: RegExp): Locator {
  return page
    .locator('article')
    .filter({ hasText: BUYER_NAME })
    .filter({ has: page.getByText(countdownPattern) })
    .first()
}

test.describe('sessions countdown UI seller side', () => {
  test('completed session shows payout release countdown when releasable_at is in the future', async ({
    page,
  }) => {
    runSeed('seed-flow-payout-release-completed.mjs')

    const admin = getAdminClient()
    const buyer = await findProfileByUsername(admin, BUYER_NAME)
    const seller = await findProfileByUsername(admin, SELLER_NAME)
    const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
    const payoutHold = await getPayoutHoldForBooking(admin, String(booking.id))

    const futureReleasableAtIso = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await updatePayoutHoldReleasableAt(
      admin,
      String(payoutHold.id),
      futureReleasableAtIso
    )

    await loginSeller(page)
    await openSessions(page)

    const card = getBuyerCardByCountdown(page, /^Payout releases in /i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Payout releases in /i)).toBeVisible({ timeout: 15000 })
  })

  test('completed session shows awaiting payout release when releasable_at has passed but payout is still held', async ({
    page,
  }) => {
    runSeed('seed-flow-payout-release-completed.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getBuyerCardByCountdown(page, /^Awaiting payout release$/i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Awaiting payout release$/i)).toBeVisible({ timeout: 15000 })
  })

  test('completed session shows payout released after payout release job runs', async ({
    page,
  }) => {
    runSeed('seed-flow-payout-release-completed.mjs')

    const admin = getAdminClient()
    const buyer = await findProfileByUsername(admin, BUYER_NAME)
    const seller = await findProfileByUsername(admin, SELLER_NAME)
    const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)

    await runPayoutRelease(admin)

    const payoutHold = await getPayoutHoldForBooking(admin, String(booking.id))
    expect(['released', 'paid']).toContain(String(payoutHold.status))
    expect(payoutHold.released_at).toBeTruthy()

    await loginSeller(page)
    await openSessions(page)

    const card = getBuyerCardByCountdown(page, /^Payout released$/i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Payout released$/i)).toBeVisible({ timeout: 15000 })
  })
})