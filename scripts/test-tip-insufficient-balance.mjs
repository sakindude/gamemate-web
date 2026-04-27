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
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

const buyerClient = createClient(
  requireEnv('SUPABASE_URL', SUPABASE_URL),
  requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY)
)

const admin = createClient(
  requireEnv('SUPABASE_URL', SUPABASE_URL),
  requireEnv('SERVICE_ROLE', SUPABASE_SERVICE_ROLE_KEY)
)

function runSeed() {
  execFileSync(
    'node',
    ['--env-file=.env.local', 'scripts/seed-auto-complete-flow.mjs'],
    { stdio: 'inherit' }
  )
}

async function loginBuyer() {
  const { error } = await buyerClient.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (error) throw error
  console.log('Logged in as buyer')
}

async function getProfile(username) {
  const { data } = await admin
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  return data
}

async function getLatestCompleted() {
  const { data } = await admin
    .from('sessions')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)

  return data[0]
}

async function run() {
  console.log('--- TEST: TIP INSUFFICIENT BALANCE ---')

  runSeed()
  await loginBuyer()

  const session = await getLatestCompleted()
  const bookingId = session.booking_request_id

  const buyerBefore = await getProfile(BUYER_NAME)
  const sellerBefore = await getProfile(SELLER_NAME)

  console.log('Buyer before:', buyerBefore.balance_cents)
  console.log('Seller before:', sellerBefore.balance_cents)

  // 🔥 Buyer balance sıfırla (force insufficient)
  await admin
    .from('profiles')
    .update({ balance_cents: 0 })
    .eq('id', buyerBefore.id)

  console.log('Buyer balance forced to 0')

  const { data, error } = await buyerClient.rpc('create_tip', {
    p_booking_id: bookingId,
    p_amount_cents: 200,
  })

  console.log('TIP RESULT:', data, error)

  if (error) throw error

  if (data.success !== false) {
    throw new Error('Expected failure but got success')
  }

  if (data.message !== 'Insufficient balance') {
    throw new Error(`Unexpected message: ${data.message}`)
  }

  const buyerAfter = await getProfile(BUYER_NAME)
  const sellerAfter = await getProfile(SELLER_NAME)

  console.log('Buyer after:', buyerAfter.balance_cents)
  console.log('Seller after:', sellerAfter.balance_cents)

  if (buyerAfter.balance_cents !== 0) {
    throw new Error('Buyer balance changed unexpectedly')
  }

  if (sellerAfter.balance_cents !== sellerBefore.balance_cents) {
    throw new Error('Seller balance changed unexpectedly')
  }

  const { data: wallet } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('booking_id', bookingId)

  const tipRows = wallet.filter((r) => r.tx_type === 'tip_credit')

  console.log('Tip rows:', tipRows.length)

  if (tipRows.length !== 0) {
    throw new Error('Tip row should not exist')
  }

  console.log('✅ INSUFFICIENT BALANCE TEST PASSED')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})