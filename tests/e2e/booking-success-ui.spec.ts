import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const BUYER_EMAIL = process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com'
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD || '123456789'
const SELLER_ID = process.env.PW_TEST_SELLER_ID || '675fdf02-248d-46b0-8f21-e55b4c33195c'

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

  await page.waitForURL(/\/(explore|sessions)/)
}

function confirmButton(page: Page) {
  return page
    .locator('aside button')
    .filter({ hasText: /Confirm Booking/ })
    .first()
}

test('booking success flow works end-to-end', async ({ page }) => {
  runSeed('seed-booking-success-ui.mjs')

  await loginBuyer(page)
  await page.goto(`/book/${SELLER_ID}`)

  await page.getByRole('button', { name: '1 Hour' }).click()
  await page.getByRole('button', { name: 'World of Warcraft' }).click()
  await page.getByRole('button', { name: 'Discord' }).click()

  const btn = confirmButton(page)

  await expect(btn).toBeEnabled()
  await btn.click()

  // redirect
  await page.waitForURL(/\/sessions/, { timeout: 10000 })

  // pending booking should be visible after successful booking
  await expect(page.getByText('Your pending booking is still open')).toBeVisible()
  await expect(page.getByText('World of Warcraft').first()).toBeVisible()
  await expect(page.getByText('PENDING').first()).toBeVisible()
})
