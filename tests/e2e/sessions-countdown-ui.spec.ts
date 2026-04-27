import { test, expect, type Page, type Locator } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const BUYER_EMAIL =
  process.env.PW_TEST_EMAIL ||
  process.env.PW_TEST_BUYER_EMAIL ||
  'gm_test_buyer@gmail.com'

const BUYER_PASSWORD =
  process.env.PW_TEST_PASSWORD ||
  process.env.PW_TEST_BUYER_PASSWORD ||
  '123456789'

const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

function runSeed(scriptName: string) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName)

  execFileSync('node', ['--env-file=.env.local', scriptPath], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  })
}

async function loginBuyer(page: Page) {
  await page.goto('/login')

  await page.getByPlaceholder('Email').fill(BUYER_EMAIL)
  await page.getByPlaceholder('Password').fill(BUYER_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(/\/(explore|sessions)/, { timeout: 15000 })
}

async function openSessions(page: Page) {
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

function getSellerCardByCountdown(page: Page, countdownPattern: RegExp): Locator {
  return page
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .filter({ has: page.getByText(countdownPattern) })
    .first()
}

test.describe('sessions countdown UI buyer side', () => {
  test('pending booking shows request expiry countdown', async ({ page }) => {
    runSeed('seed-ui-accept-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getSellerCardByCountdown(page, /^Request expires in /i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/pending/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Request expires in /i)).toBeVisible({ timeout: 15000 })
  })

  test('ready_to_start shows start window countdown', async ({ page }) => {
    runSeed('seed-ui-start-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getSellerCardByCountdown(page, /^Start window ends in /i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/ready/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Start window ends in /i)).toBeVisible({ timeout: 15000 })
  })

  test('active session shows booked time left countdown', async ({ page }) => {
    runSeed('seed-ui-complete-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getSellerCardByCountdown(page, /^Booked time left:/i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/active/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Booked time left:/i)).toBeVisible({ timeout: 15000 })
  })

  test('awaiting confirmation shows auto-complete countdown', async ({ page }) => {
    runSeed('seed-flow-dispute-awaiting-confirmation.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getSellerCardByCountdown(page, /^Auto-completes in /i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/awaiting/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Auto-completes in /i)).toBeVisible({ timeout: 15000 })
  })

  test('completed session shows dispute window countdown for buyer', async ({ page }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getSellerCardByCountdown(page, /^Dispute window ends in /i)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Dispute window ends in /i)).toBeVisible({ timeout: 15000 })
  })
})