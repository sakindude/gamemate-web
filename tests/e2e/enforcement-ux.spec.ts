import { test, expect, type Page, type Locator } from '@playwright/test'
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

function bookingCta(page: Page): Locator {
  return page
    .locator('aside button')
    .filter({
      hasText:
        /Confirm Booking|Booking Restricted|Resolve Current Flow First|Seller Unavailable|Currently Unavailable|Under Review|Currently Offline/,
    })
    .first()
}

test.describe('Booking Enforcement UX', () => {
  test('buyer sees restricted enforcement state on booking page', async ({ page }) => {
    runSeed('seed-enforcement-restricted-buyer.mjs')

    await loginBuyer(page)
    await page.goto(`/book/${SELLER_ID}`)

    await expect(page.getByText('Booking is temporarily restricted').first()).toBeVisible()

    await expect(
      page
        .getByText(
          'Your account is currently restricted from creating new bookings because of recent no-shows or rule violations.'
        )
        .first()
    ).toBeVisible()

    await expect(page.getByText('Strike points', { exact: true })).toBeVisible()

    await expect(bookingCta(page)).toBeDisabled()
  })

  test('buyer sees seller unavailable message when seller is restricted or under review', async ({ page }) => {
    runSeed('seed-enforcement-restricted-seller.mjs')

    await loginBuyer(page)
    await page.goto(`/book/${SELLER_ID}`)

    await expect(page.getByText('Seller temporarily unavailable').first()).toBeVisible()

    await expect(
      page
        .getByText(
          'This GameMate is currently restricted from receiving new bookings because of recent no-shows or rule violations.'
        )
        .first()
    ).toBeVisible()

    await expect(bookingCta(page)).toBeDisabled()
  })

  test('blocked buyer cannot proceed with booking', async ({ page }) => {
    runSeed('seed-enforcement-restricted-buyer.mjs')

    await loginBuyer(page)
    await page.goto(`/book/${SELLER_ID}`)

    await expect(bookingCta(page)).toBeDisabled()

    await expect(
      page
        .getByText('Your account is currently restricted from creating new bookings.')
        .first()
    ).toBeVisible()
  })
})