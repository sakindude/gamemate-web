import { test, expect, type Page, type Locator } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

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

async function loginBuyer(page: Page) {
  await login(page, BUYER_EMAIL, BUYER_PASSWORD)
}

async function loginSeller(page: Page) {
  await login(page, SELLER_EMAIL, SELLER_PASSWORD)
}

async function disableAutoRefreshIfEnabled(page: Page) {
  const switches = page.getByRole('switch')
  const switchCount = await switches.count()

  if (switchCount === 0) {
    return
  }

  const toggle = switches.first()
  const isVisible = await toggle.isVisible().catch(() => false)

  if (!isVisible) {
    return
  }

  const checked = await toggle.getAttribute('aria-checked')
  if (checked === 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  }
}

async function openSessions(page: Page) {
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await disableAutoRefreshIfEnabled(page)
}

function getCardWithAction(page: Page, otherName: string, actionName: RegExp): Locator {
  return page
    .locator('article')
    .filter({ hasText: otherName })
    .filter({ has: page.getByRole('button', { name: actionName }) })
    .first()
}

test.describe.configure({ mode: 'serial' })

test.describe('sessions action click smoke', () => {
  test('seller can click Start on ready session', async ({ page }) => {
    runSeed('seed-ui-start-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getCardWithAction(page, BUYER_NAME, /^Start$/i)
    await expect(card).toBeVisible({ timeout: 15000 })

    const startButton = card.getByRole('button', { name: /^Start$/i })
    await expect(startButton).toBeVisible({ timeout: 15000 })

    await startButton.click()

    await expect(page.getByText('Start requested.')).toBeVisible({ timeout: 15000 })
  })

  test('seller can click Complete on active session', async ({ page }) => {
    runSeed('seed-ui-complete-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getCardWithAction(page, BUYER_NAME, /^Complete$/i)
    await expect(card).toBeVisible({ timeout: 15000 })

    const completeButton = card.getByRole('button', { name: /^Complete$/i })
    await expect(completeButton).toBeVisible({ timeout: 15000 })

    await completeButton.click()

    await expect(page.getByText('Complete clicked.')).toBeVisible({ timeout: 15000 })
  })

  test('seller can click Report and report modal opens', async ({ page }) => {
    runSeed('seed-ui-complete-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getCardWithAction(page, BUYER_NAME, /^Report$/i)
    await expect(card).toBeVisible({ timeout: 15000 })

    const reportButton = card.getByRole('button', { name: /^Report$/i })
    await expect(reportButton).toBeVisible({ timeout: 15000 })

    await reportButton.click()

    const modal = page.locator('.fixed.inset-0').first()
    await expect(modal).toBeVisible({ timeout: 15000 })
    await expect(modal.getByRole('heading', { name: /Report Problem/i })).toBeVisible({
      timeout: 15000,
    })

    await modal.getByRole('button', { name: /^Cancel$/i }).click()
    await expect(modal).toHaveCount(0)
  })

  test('buyer can click Tip and tip modal opens', async ({ page }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getCardWithAction(page, SELLER_NAME, /^Tip$/i)
    await expect(card).toBeVisible({ timeout: 15000 })

    const tipButton = card.getByRole('button', { name: /^Tip$/i })
    await expect(tipButton).toBeVisible({ timeout: 15000 })

    await tipButton.click()

    const modal = page.locator('.fixed.inset-0').first()
    await expect(modal).toBeVisible({ timeout: 15000 })
    await expect(modal.getByRole('heading', { name: /Send Tip/i })).toBeVisible({
      timeout: 15000,
    })

    await modal.getByRole('button', { name: /^Cancel$/i }).click()
    await expect(modal).toHaveCount(0)
  })

  test('buyer can click Rate and review modal opens', async ({ page }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getCardWithAction(page, SELLER_NAME, /^Rate$/i)
    await expect(card).toBeVisible({ timeout: 15000 })

    const rateButton = card.getByRole('button', { name: /^Rate$/i })
    await expect(rateButton).toBeVisible({ timeout: 15000 })

    await rateButton.click()

    const modal = page.locator('.fixed.inset-0').first()
    await expect(modal).toBeVisible({ timeout: 15000 })
    await expect(modal.getByRole('heading', { name: /Leave Review/i })).toBeVisible({
      timeout: 15000,
    })
  })
})