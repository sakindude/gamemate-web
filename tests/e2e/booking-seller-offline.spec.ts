import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const BUYER_EMAIL = process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com'
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD || '123456789'
const SELLER_ID =
  process.env.PW_TEST_SELLER_ID ||
  '675fdf02-248d-46b0-8f21-e55b4c33195c'

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

test.describe('Booking Seller Offline UX', () => {
  test('buyer sees seller offline and cannot book', async ({ page }) => {
    runSeed('seed-booking-seller-offline-ui.mjs')

    await loginBuyer(page)
    await page.goto(`/book/${SELLER_ID}`)

    // 🔥 FIX 1: duplicate text → pick first
    await expect(
      page
        .getByText(
          'This GameMate is offline right now. You can still view the profile and chat, but booking is temporarily unavailable.'
        )
        .first()
    ).toBeVisible()

    // 🔥 FIX 2: target ONLY confirm button (not sidebar toggle)
    const confirmButton = page.getByRole('button', {
      name: 'Currently Offline',
    })

    await expect(confirmButton).toBeDisabled()
  })
})