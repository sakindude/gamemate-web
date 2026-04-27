import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const PROJECT_ROOT = process.cwd()

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

const ADMIN_EMAIL = process.env.PW_TEST_ADMIN_EMAIL || 'adminadmin@gmail.com'
const ADMIN_PASSWORD = process.env.PW_TEST_ADMIN_PASSWORD || 'adminadmin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type EligibilityStatus = 'not_started' | 'pending_review' | 'approved' | 'rejected'

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

  await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Password')).toBeVisible({ timeout: 15000 })

  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: /^Login$/i }).click()

  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 15000,
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
  status: EligibilityStatus,
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

async function getEligibilityOverviewRow(admin: SupabaseClient, sellerId: string) {
  const { data, error } = await admin
    .from('admin_seller_payout_eligibility_overview')
    .select('*')
    .eq('seller_id', sellerId)
    .single()

  if (error || !data?.seller_id) {
    throw new Error(
      `Failed to load eligibility overview row: ${error?.message || 'not found'}`
    )
  }

  return data as Record<string, any>
}

async function buildBlockedPayoutState(admin: SupabaseClient) {
  runSeed('seed-flow-payout-release-completed.mjs')

  const buyer = await findProfileByUsername(admin, BUYER_NAME)
  const seller = await findProfileByUsername(admin, SELLER_NAME)

  const unapprovedResult = await setSellerEligibilityStatus(
    admin,
    seller.id,
    'not_started',
    'E2E admin payouts UI setup: force blocked unverified seller state'
  )

  if (!unapprovedResult.success) {
    throw new Error('Could not move seller to not_started for blocked payout setup')
  }

  const booking = await getLatestBookingForPair(admin, buyer.id, seller.id)
  const bookingId = String(booking.id)

  const { data: releaseResult, error: releaseError } = await admin.rpc(
    'run_payout_release'
  )

  if (releaseError) {
    throw new Error(`run_payout_release failed during UI setup: ${releaseError.message}`)
  }

  if (releaseResult?.success === false) {
    throw new Error(releaseResult.message || 'run_payout_release returned success=false during UI setup')
  }

  const payoutHold = await getPayoutHoldForBooking(admin, bookingId)

  expect(payoutHold.status).toBe('blocked_unverified_seller')
  expect(payoutHold.blocked_reason).toBe('seller_not_approved')
  expect(payoutHold.released_at ?? null).toBeNull()

  return {
    buyer,
    seller,
    bookingId,
  }
}

function getBlockedPayoutSellerRow(page: Page) {
  const blockedTable = page.locator('table').nth(0)

  return blockedTable.locator('tr').filter({ hasText: SELLER_NAME }).first()
}

function getEligibilitySellerRow(page: Page) {
  const overviewTable = page.locator('table').nth(1)

  return overviewTable.locator('tr').filter({ hasText: SELLER_NAME }).first()
}

test('admin payouts page can approve blocked seller payout eligibility from the UI', async ({
  page,
}) => {
  const admin = getAdminClient()

  const { seller } = await buildBlockedPayoutState(admin)

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)

  await page.goto('/admin/payouts')
  await expect(page).toHaveURL(/\/admin\/payouts$/, { timeout: 15000 })

  await expect(
    page.getByRole('heading', { name: /Admin Payouts/i })
  ).toBeVisible({ timeout: 15000 })

  const blockedRow = getBlockedPayoutSellerRow(page)
  await expect(blockedRow).toBeVisible({ timeout: 15000 })
  await expect(blockedRow).toContainText(SELLER_NAME)
  await expect(blockedRow).toContainText('blocked unverified seller')
  await expect(blockedRow).toContainText('seller not approved')

  const overviewRowBefore = getEligibilitySellerRow(page)
  await expect(overviewRowBefore).toBeVisible({ timeout: 15000 })
  await expect(overviewRowBefore.locator('td').nth(1)).toContainText('not started')

  const statusSelect = overviewRowBefore.locator('select').first()
  await expect(statusSelect).toBeVisible({ timeout: 15000 })
  await statusSelect.selectOption('approved')

  const applyButton = overviewRowBefore.getByRole('button', { name: /^Apply$/i })
  await expect(applyButton).toBeVisible({ timeout: 15000 })
  await applyButton.click()

  await expect(
    page.getByText(`Updated ${SELLER_NAME} to approved.`)
  ).toBeVisible({ timeout: 15000 })

  const overviewRowAfter = getEligibilitySellerRow(page)
  await expect(overviewRowAfter.locator('td').nth(1)).toContainText('approved', {
    timeout: 15000,
  })

  await expect
    .poll(
      async () => {
        const row = await getEligibilityOverviewRow(admin, seller.id)
        return String(row.payout_eligibility_status || '')
      },
      { timeout: 15000 }
    )
    .toBe('approved')
})