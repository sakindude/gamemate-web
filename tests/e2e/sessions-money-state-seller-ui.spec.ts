import { test, expect, type Page, type Locator } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const SELLER_EMAIL =
  process.env.PW_TEST_SELLER_EMAIL ||
  'gm_test_seller@gmail.com'

const SELLER_PASSWORD =
  process.env.PW_TEST_SELLER_PASSWORD ||
  '123456789'

const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'

function runSeed(scriptName: string) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName)

  execFileSync('node', ['--env-file=.env.local', scriptPath], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  })
}

async function loginSeller(page: Page) {
  await page.goto('/login')

  await page.getByPlaceholder('Email').fill(SELLER_EMAIL)
  await page.getByPlaceholder('Password').fill(SELLER_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(/\/(explore|sessions)/, { timeout: 15000 })
}

async function openSessions(page: Page) {
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/sessions/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

function getPrimaryBuyerCard(page: Page) {
  return page.locator('article').filter({ hasText: BUYER_NAME }).first()
}

async function expectLegacyMoneyDupesRemoved(card: Locator) {
  await expect(card.getByText(/^Money state$/i)).toHaveCount(0)
  await expect(card.getByText(/^Buyer outcome$/i)).toHaveCount(0)
  await expect(card.getByText(/^Seller outcome$/i)).toHaveCount(0)
}

test.describe('sessions money/state UI seller side', () => {
  test('pending booking shows customer payment reserved and seller actions', async ({
    page,
  }) => {
    runSeed('seed-ui-accept-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getPrimaryBuyerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/pending/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Customer payment reserved')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'The buyer payment is reserved, but nothing is paid out until the session flow is completed.'
      )
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText('Accept or reject this request before taking another booking.')
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^Customer total$/i)).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Accept$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Reject$/i })).toBeVisible({
      timeout: 15000,
    })

    await expect(card.getByText(/^Your payout$/i)).toHaveCount(0)

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('ready_to_start shows payout not released yet and Start action', async ({ page }) => {
    runSeed('seed-ui-start-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getPrimaryBuyerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/ready/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payout not released yet')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'The booking exists, but seller payout cannot release before the session completes and clears the dispute window.'
      )
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'Press Start Session when you are ready. The money state does not finalize until the session flow resolves.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^Customer total$/i)).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Your payout$/i)).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Start$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Report$/i })).toBeVisible({
      timeout: 15000,
    })

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('active session shows payout is not released during live session and Complete action', async ({
    page,
  }) => {
    runSeed('seed-ui-complete-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = page
      .locator('article')
      .filter({ hasText: 'Payout is not released during live session' })
      .first()

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/active/i).first()).toBeVisible({ timeout: 15000 })

    await expect(
      card.getByText('Payout is not released during live session')
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'The session is live. Seller payout is still waiting until the session outcome is finalized.'
      )
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText('Complete when you are done, or report a problem if something went wrong.')
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^Customer total$/i)).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Your payout$/i)).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Complete$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Chat$/i })).toBeVisible({
      timeout: 15000,
    })
    await expect(card.getByRole('button', { name: /^Report$/i })).toBeVisible({
      timeout: 15000,
    })

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('awaiting confirmation shows payout still waiting for final completion and no confirm action for seller who already completed', async ({
    page,
  }) => {
    runSeed('seed-flow-dispute-awaiting-confirmation.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getPrimaryBuyerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/awaiting/i).first()).toBeVisible({ timeout: 15000 })

    await expect(
      card.getByText('Payout still waiting for final completion')
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'Seller payout still cannot release until the session fully resolves from awaiting confirmation.'
      )
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'You completed the session. The final money outcome still waits for the other side or auto-complete.'
      )
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^Customer total$/i)).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Your payout$/i)).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Confirm$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Complete$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Chat$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Report$/i })).toHaveCount(0)

    await expectLegacyMoneyDupesRemoved(card)
  })

  test('completed session shows payout pending release and seller has no Tip or Rate actions', async ({
    page,
  }) => {
    runSeed('seed-review-eligible-flow.mjs')

    await loginSeller(page)
    await openSessions(page)

    const card = getPrimaryBuyerCard(page)

    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 })

    await expect(card.getByText('Payout pending release')).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText(
        'The session is completed. Seller payout normally waits until the dispute window passes.'
      )
    ).toBeVisible({ timeout: 15000 })
    await expect(
      card.getByText('Payout normally waits until the dispute window passes without a dispute.')
    ).toBeVisible({ timeout: 15000 })

    await expect(card.getByText(/^Customer total$/i)).toBeVisible({ timeout: 15000 })
    await expect(card.getByText(/^Your payout$/i)).toBeVisible({ timeout: 15000 })

    await expect(card.getByRole('button', { name: /^Tip$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Rate$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Rated$/i })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Tipped$/i })).toHaveCount(0)

    await expectLegacyMoneyDupesRemoved(card)
  })
})