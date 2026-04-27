import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import path from 'node:path'

const projectDir = process.cwd()

loadEnvConfig(projectDir)

const PORT = Number(process.env.PORT || 3000)
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${PORT}`

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
)

export default defineConfig({
  testDir: './tests/e2e',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 180_000,

  expect: {
    timeout: 30_000,
  },

  reporter: [
    ['list'],
    ['html', { open: 'always' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  use: {
    baseURL: BASE_URL,

    trace: 'on-first-retry',

    screenshot: {
      mode: 'only-on-failure',
      fullPage: true,
    },

    video: 'retain-on-failure',

    // 🔥 BURASI KRITIK
    headless: false,

    launchOptions: {
      slowMo: 1000,
    },

    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    cwd: projectDir,
    env: webServerEnv,
  },

  outputDir: path.join(projectDir, 'test-results'),
})