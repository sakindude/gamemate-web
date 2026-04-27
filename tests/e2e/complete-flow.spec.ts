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

const SELLER_EMAIL = process.env.PW_TEST_SELLER_EMAIL || 'gm_test_seller@gmail.com'
const SELLER_PASSWORD = process.env.PW_TEST_SELLER_PASSWORD || '123456789'
const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'
const PROJECT_ROOT = process.cwd()

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
  await expect(page).toHaveURL(/\/explore/, { timeout: 15000 })
}

test('complete flow shows awaiting confirmation after one-sided complete', async ({ browser }) => {
  runSeed('seed-flow-start-ready.mjs')

  const sellerContext = await browser.newContext()
  const sellerPage = await sellerContext.newPage()

  await login(sellerPage, SELLER_EMAIL, SELLER_PASSWORD)
  await sellerPage.goto('/sessions')

  const sellerReadyCard = sellerPage
    .locator('article')
    .filter({ hasText: BUYER_NAME })
    .first()

  await expect(sellerReadyCard).toBeVisible({ timeout: 15000 })
  await expect(
    sellerReadyCard.getByRole('button', { name: 'Start' })
  ).toBeVisible({ timeout: 15000 })

  await sellerReadyCard.getByRole('button', { name: 'Start' }).click()
  await expect(sellerPage.getByText('Start requested.')).toBeVisible({ timeout: 15000 })

  const buyerContext = await browser.newContext()
  const buyerPage = await buyerContext.newPage()

  await login(buyerPage, BUYER_EMAIL, BUYER_PASSWORD)
  await buyerPage.goto('/sessions')

  const buyerReadyCard = buyerPage
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .first()

  await expect(buyerReadyCard).toBeVisible({ timeout: 15000 })
  await expect(
    buyerReadyCard.getByRole('button', { name: 'Start' })
  ).toBeVisible({ timeout: 15000 })

  await buyerReadyCard.getByRole('button', { name: 'Start' }).click()
  await expect(buyerPage.getByText('Start requested.')).toBeVisible({ timeout: 15000 })

  await buyerPage.waitForTimeout(1500)
  await buyerPage.reload()
  await sellerPage.reload()

  const buyerActiveCard = buyerPage
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .first()

  const sellerActiveCard = sellerPage
    .locator('article')
    .filter({ hasText: BUYER_NAME })
    .first()

  await expect(buyerActiveCard).toBeVisible({ timeout: 15000 })
  await expect(sellerActiveCard).toBeVisible({ timeout: 15000 })

  await expect(
    buyerActiveCard.getByRole('button', { name: 'Complete' })
  ).toBeVisible({ timeout: 15000 })

  await expect(
    sellerActiveCard.getByRole('button', { name: 'Complete' })
  ).toBeVisible({ timeout: 15000 })

  const completeButton = sellerActiveCard.getByRole('button', { name: 'Complete' })

  await completeButton.click()

  await sellerPage.waitForTimeout(2000)

  await sellerPage.reload()
  await buyerPage.reload()

  const sellerAwaitingCard = sellerPage
    .locator('article')
    .filter({ hasText: BUYER_NAME })
    .first()

  const buyerAwaitingCard = buyerPage
    .locator('article')
    .filter({ hasText: SELLER_NAME })
    .first()

  await expect(sellerAwaitingCard).toBeVisible({ timeout: 15000 })
  await expect(buyerAwaitingCard).toBeVisible({ timeout: 15000 })

  await expect(
    sellerAwaitingCard.getByText(/awaiting|waiting/i).first()
  ).toBeVisible({ timeout: 15000 })

  await expect(
    buyerAwaitingCard.getByText(/awaiting|waiting|confirm/i).first()
  ).toBeVisible({ timeout: 15000 })

  await expect(
    sellerAwaitingCard.getByRole('button', { name: 'Complete' })
  ).toHaveCount(0)

  await expect(
    buyerAwaitingCard.getByRole('button', { name: /confirm|complete/i })
  ).toBeVisible({ timeout: 15000 })

  await buyerContext.close()
  await sellerContext.close()
})