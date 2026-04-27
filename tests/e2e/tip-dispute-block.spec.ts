import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BUYER_EMAIL =
  process.env.PW_TEST_BUYER_EMAIL ||
  process.env.PW_TEST_EMAIL ||
  'gm_test_buyer@gmail.com'

const BUYER_PASSWORD =
  process.env.PW_TEST_BUYER_PASSWORD ||
  process.env.PW_TEST_PASSWORD ||
  '123456789'

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

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/explore/, { timeout: 15000 })
}

async function findProfileByUsername(admin: SupabaseClient, username: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single()

  if (error || !data?.id) {
    throw new Error(
      `Could not find profile by username "${username}": ${error?.message || 'not found'}`
    )
  }

  return data as { id: string; username: string }
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

async function getLatestDisputeForSession(admin: SupabaseClient, sessionId: string) {
  const { data, error } = await admin
    .from('disputes')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to load dispute for session: ${error.message}`)
  }

  const row = data?.[0]
  if (!row) {
    throw new Error('Dispute not found for session')
  }

  return row as Record<string, any>
}

async function getTipViewForSession(admin: SupabaseClient, sessionId: string) {
  const { data, error } = await admin
    .from('sessions_with_tip')
    .select(
      'id, status, tip_eligible, tip_already_given, tip_amount_cents, tip_expires_at, tip_block_reason'
    )
    .eq('id', sessionId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to load sessions_with_tip row: ${error?.message || 'not found'}`)
  }

  return data as Record<string, any>
}

test('open dispute hides tip CTA and shows blocked state', async ({ page }) => {
  runSeed('seed-dispute-create-flow.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const session = await getSessionForBooking(admin, bookingId)
  expect(session.status).toBe('disputed')

  const dispute = await getLatestDisputeForSession(admin, String(session.id))
  expect(dispute.status).toBe('open')

  const sessionWithTip = await getTipViewForSession(admin, String(session.id))
  expect(sessionWithTip.tip_eligible).toBe(false)
  expect(sessionWithTip.tip_already_given).toBe(false)
  expect(sessionWithTip.tip_block_reason).toBe('not_completed')

  await login(page, BUYER_EMAIL, BUYER_PASSWORD)
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: /your sessions/i })).toBeVisible({
    timeout: 15000,
  })

  const disputedCard = page
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .filter({ hasText: /dispute open/i })
    .first()

  await expect(disputedCard).toBeVisible({ timeout: 15000 })
  await expect(disputedCard.getByRole('button', { name: /^tip$/i })).toHaveCount(0)
})