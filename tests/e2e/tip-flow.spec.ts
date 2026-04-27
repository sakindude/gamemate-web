import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const BUYER_EMAIL = process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com'
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD || '123456789'

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

  await page.waitForURL(/\/(explore|sessions)/, { timeout: 15000 })
}

test.describe('tip flow', () => {
  test('buyer can send tip from completed session card', async ({ page }) => {
    runSeed('seed-auto-complete-flow.mjs')

    await loginBuyer(page)
    await page.goto('/sessions')

    const tipButton = page.getByRole('button', { name: /tip/i }).first()
    await expect(tipButton).toBeVisible()
    await tipButton.click()

    const modal = page.locator('.fixed.inset-0').first()
    await expect(modal).toBeVisible()

    // preset
    await modal.getByRole('button', { name: '$2', exact: true }).click()

    // send
    await modal.getByRole('button', { name: /send/i }).click()

    // 🔥 FIX: spesifik locator
    await expect(
      page.locator('text=Tip sent').first()
    ).toBeVisible({ timeout: 15000 })
  })

  test('seller does not see tip CTA for completed session', async ({ page }) => {
    runSeed('seed-auto-complete-flow.mjs')

    await loginBuyer(page)
    await page.goto('/sessions')

    await expect(page.getByRole('button', { name: /tip/i })).toHaveCount(0)
  })
})