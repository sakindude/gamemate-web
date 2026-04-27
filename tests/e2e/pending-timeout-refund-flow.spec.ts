import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BUYER_EMAIL =
  process.env.PW_TEST_EMAIL ||
  process.env.PW_TEST_BUYER_EMAIL ||
  'gm_test_buyer@gmail.com'

const BUYER_PASSWORD =
  process.env.PW_TEST_PASSWORD ||
  process.env.PW_TEST_BUYER_PASSWORD ||
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

  await Promise.race([
    page.waitForURL(/\/explore/, { timeout: 15000 }),
    page.waitForURL(/\/sessions/, { timeout: 15000 }),
  ])
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

async function getPayoutHoldForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)

  if (error) {
    throw new Error(`Failed to load payout hold: ${error.message}`)
  }

  return (data || [])[0] as Record<string, any> | undefined
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

test('pending timeout refund flow expires pending booking and refunds buyer in DB', async ({ browser }) => {
  runSeed('seed-flow-timeout-pending.mjs')

  const admin = getAdminClient()

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const bookingBefore = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(bookingBefore.id)

  expect(bookingBefore.status).toBe('pending')

  const buyerBalanceBefore = Number(buyer.balance_cents ?? 0)
  const expectedRefundCents =
    typeof bookingBefore.total_amount_cents === 'number'
      ? bookingBefore.total_amount_cents
      : null

  const buyerWalletBefore = await getWalletTransactionsForUser(admin, buyer.id)
  const buyerWalletCountBefore = buyerWalletBefore.length

  const payoutHoldBefore = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldBefore).toBeTruthy()
  expect(String(payoutHoldBefore?.status || '')).toBe('held')

  const { data: expireResult, error: expireError } = await admin.rpc(
    'process_expired_pending_bookings'
  )

  if (expireError) {
    throw new Error(`process_expired_pending_bookings failed: ${expireError.message}`)
  }

  if (expireResult?.success === false) {
    throw new Error(expireResult.message || 'process_expired_pending_bookings returned success=false')
  }

  const bookingAfter = await getLatestBookingForPair(admin, buyer.id, seller.id)
  expect(String(bookingAfter.id)).toBe(bookingId)
  expect(['expired', 'rejected']).toContain(String(bookingAfter.status))

  const buyerAfter = await findProfileByUsername(admin, BUYER_NAME)
  const buyerBalanceAfter = Number(buyerAfter.balance_cents ?? 0)

  if (expectedRefundCents !== null) {
    expect(buyerBalanceAfter).toBe(buyerBalanceBefore + expectedRefundCents)
  } else {
    expect(buyerBalanceAfter).toBeGreaterThan(buyerBalanceBefore)
  }

  const buyerWalletAfter = await getWalletTransactionsForUser(admin, buyer.id)
  const buyerWalletCountAfter = buyerWalletAfter.length

  expect(buyerWalletCountAfter).toBeGreaterThan(buyerWalletCountBefore)

  const newRows = buyerWalletAfter.slice(0, buyerWalletCountAfter - buyerWalletCountBefore)
  expect(newRows.length).toBeGreaterThan(0)

  const matchingRefundRow =
    newRows.find((row) => {
      const rowText = extractPossibleText(row)
      const rowAmount = getNumericAmount(row)

      const bookingMatch = String(row.booking_id || '') === bookingId
      const refundTextMatch =
        rowText.includes('refund') ||
        rowText.includes('expired') ||
        rowText.includes('timeout') ||
        rowText.includes('booking_refund') ||
        rowText.includes('credit')

      const refundAmountMatch =
        expectedRefundCents === null || rowAmount === expectedRefundCents

      return refundAmountMatch && (bookingMatch || refundTextMatch)
    }) || newRows[0]

  expect(matchingRefundRow).toBeTruthy()

  if (expectedRefundCents !== null) {
    const matchedAmount = getNumericAmount(matchingRefundRow)
    if (matchedAmount !== null) {
      expect(matchedAmount).toBe(expectedRefundCents)
    }
  }

  const payoutHoldAfter = await getPayoutHoldForBooking(admin, bookingId)
  expect(payoutHoldAfter).toBeTruthy()

  const buyerContext = await browser.newContext()
  const buyerPage = await buyerContext.newPage()

  await login(buyerPage, BUYER_EMAIL, BUYER_PASSWORD)
  await buyerPage.goto('/sessions')
  await expect(buyerPage).toHaveURL(/\/sessions/, { timeout: 15000 })
  await buyerPage.waitForLoadState('networkidle')

  await expect(buyerPage.locator('body')).toBeVisible({ timeout: 15000 })

  await expect(buyerPage.getByText(/you are available/i)).toBeVisible({ timeout: 15000 })
  await expect(buyerPage.getByText(/no sessions found/i)).toBeVisible({ timeout: 15000 })

  // Timed-out item must no longer render as an actionable session card.
  const sessionCards = buyerPage.locator('article')
  await expect(sessionCards).toHaveCount(0)

  // Scope action checks to cards only, so filter buttons like "Completed" do not false-match.
  await expect(
    sessionCards.getByRole('button', { name: /start chat/i })
  ).toHaveCount(0)

  await expect(
    sessionCards.getByRole('button', { name: /start/i })
  ).toHaveCount(0)

  await expect(
    sessionCards.getByRole('button', { name: /complete|confirm/i })
  ).toHaveCount(0)

  await expect(
    sessionCards.getByRole('button', { name: /report/i })
  ).toHaveCount(0)

  await buyerContext.close()
})