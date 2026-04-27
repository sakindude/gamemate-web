import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_EMAIL = process.env.PW_TEST_EMAIL
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD
const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

const buyerClient = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY)
)

const admin = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

function fail(message) {
  throw new Error(message)
}

function runSeed(scriptName) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName)
  execFileSync('node', ['--env-file=.env.local', scriptPath], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  })
}

async function getProfileByUsername(username) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, balance_cents')
    .eq('username', username)
    .single()

  if (error) {
    throw new Error(`Profile lookup failed for ${username}: ${error.message}`)
  }

  if (!data?.id) {
    fail(`Profile not found for ${username}`)
  }

  return data
}

async function getLatestCompletedSession() {
  const { data, error } = await admin
    .from('sessions')
    .select('id, booking_request_id, status, completed_at, created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Completed session lookup failed: ${error.message}`)
  }

  if (!data || data.length === 0) {
    fail('No completed session found')
  }

  return data[0]
}

async function getWalletRowsByBooking(bookingId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Wallet lookup failed: ${error.message}`)
  }

  return data || []
}

function getTipRows(rows) {
  return rows.filter((row) => row.tx_type === 'tip_credit')
}

async function loginBuyer() {
  const { data, error } = await buyerClient.auth.signInWithPassword({
    email: requireEnv('PW_TEST_EMAIL', BUYER_EMAIL),
    password: requireEnv('PW_TEST_PASSWORD', BUYER_PASSWORD),
  })

  if (error) {
    throw new Error(`Login failed: ${error.message}`)
  }

  if (!data?.session) {
    fail('Login failed: no session returned')
  }

  console.log('Logged in as buyer')
}

async function callCreateTip(bookingId, amountCents) {
  const { data, error } = await buyerClient.rpc('create_tip', {
    p_booking_id: bookingId,
    p_amount_cents: amountCents,
  })

  return { data, error }
}

async function run() {
  console.log('--- TEST: TIP FLOW ---')

  runSeed('seed-auto-complete-flow.mjs')

  await loginBuyer()

  const buyerBefore = await getProfileByUsername(BUYER_NAME)
  const sellerBefore = await getProfileByUsername(SELLER_NAME)
  const completedSession = await getLatestCompletedSession()
  const bookingId = completedSession.booking_request_id

  if (!bookingId) {
    fail('Latest completed session has no booking_request_id')
  }

  const walletBefore = await getWalletRowsByBooking(bookingId)
  const tipRowsBefore = getTipRows(walletBefore)

  console.log('Using booking:', bookingId)
  console.log('Session completed_at:', completedSession.completed_at)
  console.log('Buyer balance before:', buyerBefore.balance_cents)
  console.log('Seller balance before:', sellerBefore.balance_cents)
  console.log('Tip rows before:', tipRowsBefore.length)

  console.log('--- FIRST TIP CALL ---')
  const first = await callCreateTip(bookingId, 200)

  console.log('FIRST TIP RESULT:', first.data, first.error)

  if (first.error) {
    throw new Error(`First tip call failed with RPC error: ${first.error.message}`)
  }

  if (first.data?.success !== true) {
    throw new Error(`First tip call did not succeed: ${JSON.stringify(first.data)}`)
  }

  const buyerAfterFirst = await getProfileByUsername(BUYER_NAME)
  const sellerAfterFirst = await getProfileByUsername(SELLER_NAME)
  const walletAfterFirst = await getWalletRowsByBooking(bookingId)
  const tipRowsAfterFirst = getTipRows(walletAfterFirst)

  console.log('Buyer balance after first:', buyerAfterFirst.balance_cents)
  console.log('Seller balance after first:', sellerAfterFirst.balance_cents)
  console.log('Tip rows after first:', tipRowsAfterFirst.length)

  const buyerDiffFirst =
    Number(buyerAfterFirst.balance_cents ?? 0) - Number(buyerBefore.balance_cents ?? 0)
  const sellerDiffFirst =
    Number(sellerAfterFirst.balance_cents ?? 0) - Number(sellerBefore.balance_cents ?? 0)

  console.log('Buyer balance diff after first:', buyerDiffFirst)
  console.log('Seller balance diff after first:', sellerDiffFirst)

  if (buyerDiffFirst !== -200) {
    fail(`Expected buyer diff -200, got ${buyerDiffFirst}`)
  }

  if (sellerDiffFirst !== 200) {
    fail(`Expected seller diff +200, got ${sellerDiffFirst}`)
  }

  if (tipRowsAfterFirst.length !== 1) {
    fail(`Expected exactly 1 tip row after first call, got ${tipRowsAfterFirst.length}`)
  }

  const firstTipRow = tipRowsAfterFirst[0]

  if (Number(firstTipRow.amount_cents ?? 0) !== 200) {
    fail(`Expected tip amount 200, got ${firstTipRow.amount_cents}`)
  }

  console.log('--- SECOND TIP CALL ---')
  const second = await callCreateTip(bookingId, 200)

  console.log('SECOND TIP RESULT:', second.data, second.error)

  if (second.error) {
    throw new Error(`Second tip call failed with RPC error: ${second.error.message}`)
  }

  if (second.data?.success !== false) {
    fail(`Expected second tip call to fail, got ${JSON.stringify(second.data)}`)
  }

  if (second.data?.message !== 'Tip already given') {
    fail(`Expected "Tip already given", got ${second.data?.message}`)
  }

  const buyerAfterSecond = await getProfileByUsername(BUYER_NAME)
  const sellerAfterSecond = await getProfileByUsername(SELLER_NAME)
  const walletAfterSecond = await getWalletRowsByBooking(bookingId)
  const tipRowsAfterSecond = getTipRows(walletAfterSecond)

  console.log('Buyer balance after second:', buyerAfterSecond.balance_cents)
  console.log('Seller balance after second:', sellerAfterSecond.balance_cents)
  console.log('Tip rows after second:', tipRowsAfterSecond.length)

  const buyerDiffSecond =
    Number(buyerAfterSecond.balance_cents ?? 0) - Number(buyerAfterFirst.balance_cents ?? 0)
  const sellerDiffSecond =
    Number(sellerAfterSecond.balance_cents ?? 0) - Number(sellerAfterFirst.balance_cents ?? 0)

  console.log('Buyer balance diff after second:', buyerDiffSecond)
  console.log('Seller balance diff after second:', sellerDiffSecond)

  if (buyerDiffSecond !== 0) {
    fail(`Buyer changed on second call unexpectedly: ${buyerDiffSecond}`)
  }

  if (sellerDiffSecond !== 0) {
    fail(`Seller changed on second call unexpectedly: ${sellerDiffSecond}`)
  }

  if (tipRowsAfterSecond.length !== 1) {
    fail(`Expected still exactly 1 tip row after second call, got ${tipRowsAfterSecond.length}`)
  }

  console.log('✅ TIP FLOW TEST PASSED')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })