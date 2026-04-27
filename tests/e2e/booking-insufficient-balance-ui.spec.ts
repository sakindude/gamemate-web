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

  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await page.getByPlaceholder('Email').fill(BUYER_EMAIL)

  await expect(page.getByPlaceholder('Password')).toBeVisible()
  await page.getByPlaceholder('Password').fill(BUYER_PASSWORD)

  await page.getByRole('button', { name: 'Login' }).click()

  await page.waitForURL(/\/(explore|sessions|profile|balance|chat|book)/, {
    timeout: 15000,
  })
}

function confirmBookingButton(page: Page) {
  return page
    .locator('aside button')
    .filter({ hasText: /Confirm Booking|Currently Unavailable|Seller Unavailable|Resolve Current Flow First|Booking Restricted|Under Review|Currently Offline/ })
    .first()
}

test.describe('Booking Insufficient Balance UI', () => {
  test('buyer sees insufficient balance error and stays on booking page', async ({ page }) => {
    runSeed('seed-booking-insufficient-balance-ui.mjs')

    await loginBuyer(page)
    await page.goto(`/book/${SELLER_ID}`)

    await expect(page.getByRole('heading', { name: 'Book Session' })).toBeVisible()
    await expect(page.getByText('Booking Summary')).toBeVisible()

    await page.getByRole('button', { name: '1 Hour' }).click()
    await page.getByRole('button', { name: 'World of Warcraft' }).click()
    await page.getByRole('button', { name: 'Discord' }).click()

    const confirmButton = confirmBookingButton(page)

    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()

    await expect(page.getByText('Insufficient balance.').first()).toBeVisible()

    await expect(page).toHaveURL(new RegExp(`/book/${SELLER_ID}$`))
    await expect(page.getByText('Booking created successfully.')).toHaveCount(0)
  })
})