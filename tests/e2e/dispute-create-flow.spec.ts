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
  await expect(page).toHaveURL(/\/(explore|sessions)/, { timeout: 15000 })
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

  return (data?.[0] as Record<string, any> | undefined) || null
}

async function getWalletTransactionsForUser(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load wallet_transactions: ${error.message}`)
  }

  return (data || []) as Record<string, any>[]
}

async function submitDisputeFromBuyer(page: Page, sellerName: string) {
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')

  const targetCard = page
    .locator('article')
    .filter({ hasText: sellerName })
    .first()

  await expect(targetCard).toBeVisible({ timeout: 15000 })

  const reportButton = targetCard.getByRole('button', { name: /^Report$/i }).first()
  await expect(reportButton).toBeVisible({ timeout: 15000 })
  await expect(reportButton).toBeEnabled({ timeout: 15000 })

  await reportButton.click()

  const modal = page.locator('.fixed.inset-0').first()
  await expect(modal).toBeVisible({ timeout: 15000 })

  await expect(
    modal.getByRole('heading', { name: /^Report Problem$/i })
  ).toBeVisible({ timeout: 15000 })

  const select = modal.locator('select').first()
  if (await select.count()) {
    const optionCount = await select.locator('option').count()
    if (optionCount > 1) {
      await select.selectOption({ index: 1 })
    } else {
      await select.selectOption({ index: 0 })
    }
  }

  const textarea = modal.locator('textarea').first()
  if (await textarea.count()) {
    await textarea.fill('E2E dispute test: issue reported during awaiting confirmation.')
  }

  const submitButton = modal.getByRole('button', { name: /submit report/i }).first()
  await expect(submitButton).toBeVisible({ timeout: 15000 })
  await expect(submitButton).toBeEnabled({ timeout: 15000 })
  await submitButton.click()

  await expect(page.getByText(/Report submitted\. Dispute opened\./i)).toBeVisible({
    timeout: 15000,
  })
}

test('dispute flow opens dispute, switches session to disputed, and blocks payout', async ({
  browser,
}) => {
  runSeed('seed-flow-dispute-awaiting-confirmation.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const bookingBefore = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(bookingBefore.id)

  expect(bookingBefore.status).toBe('accepted')

  const sessionBefore = await getSessionForBooking(admin, bookingId)
  expect(sessionBefore.status).toBe('awaiting_confirmation')

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore.status).toBe('held')
  expect(payoutHoldBefore.dispute_id ?? null).toBeNull()

  const sellerBalanceBefore = Number(seller.balance_cents ?? 0)
  const sellerWalletBefore = await getWalletTransactionsForUser(admin, seller.id)
  const sellerWalletCountBefore = sellerWalletBefore.length

  const buyerContext = await browser.newContext()
  const buyerPage = await buyerContext.newPage()

  await login(buyerPage, BUYER_EMAIL, BUYER_PASSWORD)
  await submitDisputeFromBuyer(buyerPage, SELLER_NAME)

  await buyerPage.waitForTimeout(1500)
  await buyerPage.reload()
  await buyerPage.waitForLoadState('networkidle')

  const sessionAfter = await getSessionForBooking(admin, bookingId)
  expect(sessionAfter.status).toBe('disputed')

  const disputeAfter = await getLatestDisputeForSession(admin, String(sessionAfter.id))
  expect(disputeAfter).toBeTruthy()
  expect(disputeAfter?.status).toBe('open')
  expect(String(disputeAfter?.booking_request_id || '')).toBe(bookingId)
  expect(String(disputeAfter?.session_id || '')).toBe(String(sessionAfter.id))

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldAfter.status).toBe('disputed')
  expect(String(payoutHoldAfter.dispute_id || '')).toBe(String(disputeAfter?.id || ''))

  const sellerAfter = await findProfileByUsername(admin, SELLER_NAME)
  const sellerBalanceAfter = Number(sellerAfter.balance_cents ?? 0)
  expect(sellerBalanceAfter).toBe(sellerBalanceBefore)

  const sellerWalletAfter = await getWalletTransactionsForUser(admin, seller.id)
  expect(sellerWalletAfter.length).toBe(sellerWalletCountBefore)

  const buyerDisputedCard = buyerPage
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .first()

  await expect(buyerDisputedCard).toBeVisible({ timeout: 15000 })
  await expect(
    buyerDisputedCard.locator('.inline-flex').filter({ hasText: /DISPUTED|Disputed/ })
  ).toBeVisible({ timeout: 15000 })
  await expect(buyerDisputedCard.getByRole('button', { name: /^Report$/i })).toHaveCount(0)

  const sellerContext = await browser.newContext()
  const sellerPage = await sellerContext.newPage()

  await login(sellerPage, SELLER_EMAIL, SELLER_PASSWORD)
  await sellerPage.goto('/sessions')
  await expect(sellerPage).toHaveURL(/\/sessions/, { timeout: 15000 })
  await sellerPage.waitForLoadState('networkidle')

  const sellerDisputedCard = sellerPage
    .locator('article')
    .filter({ hasText: BUYER_NAME })
    .first()

  await expect(sellerDisputedCard).toBeVisible({ timeout: 15000 })
  await expect(
    sellerDisputedCard.locator('.inline-flex').filter({ hasText: /DISPUTED|Disputed/ })
  ).toBeVisible({ timeout: 15000 })

  await buyerContext.close()
  await sellerContext.close()
})