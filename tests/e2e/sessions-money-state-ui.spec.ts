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

function getPrimarySellerCard(page: Page) {
  return page.locator('article').filter({ hasText: SELLER_NAME }).first()
}

async function expectLegacyMoneyDupesRemoved(card: Locator) {
  await expect(card.getByText(/^Money state$/i)).toHaveCount(0)
  await expect(card.getByText(/^Buyer outcome$/i)).toHaveCount(0)
  await expect(card.getByText(/^Seller outcome$/i)).toHaveCount(0)
}

test.describe('sessions money/state UI', () => {
  test('pending booking shows right-side payment reserved state without left-side duplicate money labels', async ({
    page,
  }) => {
    runSeed('seed-ui-accept-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getPrimarySellerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/pending/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payment reserved')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'Your payment is reserved while this booking request waits for a seller response.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(
      card.getByText(
        'If the seller rejects or the request expires, the reserved money returns to your balance.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^You paid$/i)).toBeVisible({ timeout: 15000 })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({ timeout: 15000 })

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('ready_to_start shows payment still reserved and Start action', async ({ page }) => {
    runSeed('seed-ui-start-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getPrimarySellerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/ready/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payment still reserved')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'Your payment is still reserved. It does not finalize just because the session exists.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(
      card.getByText(
        'Press Start Session when you are ready. The money state does not finalize until the session flow resolves.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Start$/i })).toBeVisible({ timeout: 15000 })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({ timeout: 15000 })
    await expect(card.getByRole('button', { name: /^Report$/i })).toBeVisible({ timeout: 15000 })

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('active session shows payment remains reserved and Complete action', async ({ page }) => {
    runSeed('seed-ui-complete-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = page
      .locator('article')
      .filter({ hasText: 'Payment remains reserved' })
      .first()

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/active/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payment remains reserved')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText('Your payment is still reserved while the session is live.')
    ).toBeVisible({ timeout: 15000 })

    await expect(
      card.getByText('Complete when you are done, or report a problem if something went wrong.')
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Complete$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({ timeout: 15000 })
    await expect(card.getByRole('button', { name: /^Report$/i })).toBeVisible({ timeout: 15000 })

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('awaiting confirmation can be disputed and then shows funds on hold during dispute', async ({
    page,
  }) => {
    runSeed('seed-flow-dispute-awaiting-confirmation.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const awaitingCard = getPrimarySellerCard(page)

    await expect(awaitingCard).toBeVisible({ timeout: 15000 })
    await expect(awaitingCard.getByText(/awaiting/i).first()).toBeVisible({ timeout: 15000 })

    await expect(awaitingCard.getByText('Payment still on hold')).toBeVisible({ timeout: 15000 })
    await expect(
      awaitingCard.getByText(
        'Your payment is still reserved until both sides finish confirmation or the auto-complete path resolves it.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(
      awaitingCard.getByText(
        'Your confirmation is still needed before the session can fully resolve.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(awaitingCard.getByRole('button', { name: /^Confirm$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(awaitingCard.getByRole('button', { name: /^Chat$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(awaitingCard.getByRole('button', { name: /^Report$/i })).toBeVisible({
      timeout: 15000,
    })

    await expectLegacyMoneyDupesRemoved(awaitingCard)

    await awaitingCard.getByRole('button', { name: /^Report$/i }).click()

    const modal = page.locator('.fixed.inset-0').first()
    await expect(modal).toBeVisible({ timeout: 15000 })

    const select = modal.locator('select').first()
    if (await select.count()) {
      const optionCount = await select.locator('option').count()
      await select.selectOption({ index: optionCount > 1 ? 1 : 0 })
    }

    const textarea = modal.locator('textarea').first()
    if (await textarea.count()) {
      await textarea.fill('E2E sessions UI dispute test')
    }

    await modal.getByRole('button', { name: /submit report/i }).click()

    await expect(page.getByText('Report submitted. Dispute opened.')).toBeVisible({
      timeout: 15000,
    })

    await page.waitForTimeout(1200)
    await page.reload()
    await page.waitForLoadState('networkidle')

    const disputedCard = getPrimarySellerCard(page)

    await expect(disputedCard).toBeVisible({ timeout: 15000 })
    await expect(disputedCard.getByText(/disputed/i).first()).toBeVisible({ timeout: 15000 })

    await expect(disputedCard.getByText('Funds on hold during dispute')).toBeVisible({
      timeout: 15000,
    })
    await expect(
      disputedCard.getByText(
        'Funds are paused during dispute review. Normal payout or refund flow does not continue until the dispute is resolved.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(
      disputedCard.getByText(
        'Normal payout or refund flow is paused until the review is complete.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expectLegacyMoneyDupesRemoved(disputedCard)
  })

  test('completed session shows payment completed plus Tip and Rate actions', async ({ page }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginBuyer(page)
    await openSessions(page)

    const card = getPrimarySellerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payment completed')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'Your payment is complete. A dispute can still affect the money outcome until the dispute window closes.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Tip$/i })).toBeVisible({ timeout: 15000 })
    await expect(card.getByRole('button', { name: /^Rate$/i })).toBeVisible({ timeout: 15000 })

    await expectLegacyMoneyDupesRemoved(card)
  })
})