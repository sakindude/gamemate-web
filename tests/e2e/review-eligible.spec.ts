// FILE START: tests/e2e/review-eligible.spec.ts

import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const BUYER_EMAIL =
  process.env.PW_TEST_EMAIL ||
  process.env.PW_TEST_BUYER_EMAIL ||
  'gm_test_buyer@gmail.com'

const BUYER_PASSWORD =
  process.env.PW_TEST_PASSWORD ||
  process.env.PW_TEST_BUYER_PASSWORD ||
  '123456789'

const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'
const PROJECT_ROOT = process.cwd()

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

  await expect(page).toHaveURL(/\/explore/, { timeout: 15000 })
}

test.describe('review eligible flow', () => {
  test('buyer can leave a review for an eligible completed session', async ({ page }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginBuyer(page)

    await page.goto('/sessions')
    await page.waitForLoadState('networkidle')

    const sessionCard = page
      .locator('article')
      .filter({ hasText: SELLER_NAME })
      .filter({ hasText: /completed|session finished/i })
      .first()

    await expect(sessionCard).toBeVisible({ timeout: 15000 })

    const rateButton = sessionCard.getByRole('button', { name: /^Rate$/i })
    await expect(rateButton).toBeVisible({ timeout: 15000 })
    await rateButton.click()

    await expect(page.getByRole('heading', { name: /Leave Review/i })).toBeVisible({
      timeout: 15000,
    })

    await page.getByRole('button', { name: 'Punctuality 5' }).click()
    await page.getByRole('button', { name: 'Communication 5' }).click()
    await page.getByRole('button', { name: 'Vibe 5' }).click()
    await page.getByRole('button', { name: 'Reliability 5' }).click()
    await page.getByRole('button', { name: 'Skill 5' }).click()

    await page.getByPlaceholder('Write a short review...').fill('Great session from e2e test')

    await page.getByRole('button', { name: 'Submit Review' }).click()

    await expect(page.getByText('Review submitted.')).toBeVisible({ timeout: 15000 })

    await page.waitForTimeout(1200)
    await page.reload()
    await page.waitForLoadState('networkidle')

    const ratedCard = page
      .locator('article')
      .filter({ hasText: SELLER_NAME })
      .filter({ hasText: /completed|session finished/i })
      .first()

    await expect(ratedCard).toBeVisible({ timeout: 15000 })
    await expect(ratedCard.getByRole('button', { name: /^Rated$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(ratedCard.getByRole('button', { name: /^Rate$/i })).toHaveCount(0)
  })
})

// FILE END