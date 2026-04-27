import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUYER_EMAIL = process.env.PW_TEST_EMAIL
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

const buyerClient = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
    },
  }
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

async function loginBuyer() {
  const { data, error } = await buyerClient.auth.signInWithPassword({
    email: requireEnv('PW_TEST_EMAIL', BUYER_EMAIL),
    password: requireEnv('PW_TEST_PASSWORD', BUYER_PASSWORD),
  })

  if (error) {
    throw new Error(`Buyer login failed: ${error.message}`)
  }

  if (!data?.session) {
    fail('Buyer login returned no session')
  }

  console.log('Logged in as buyer')
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

async function getTipViewRow(sessionId) {
  const { data, error } = await admin
    .from('sessions_with_tip')
    .select(`
      id,
      booking_request_id,
      status,
      tip_eligible,
      tip_already_given,
      tip_amount_cents,
      tip_expires_at,
      tip_block_reason
    `)
    .eq('id', sessionId)
    .single()

  if (error) {
    throw new Error(`sessions_with_tip lookup failed: ${error.message}`)
  }

  if (!data) {
    fail(`No sessions_with_tip row found for session ${sessionId}`)
  }

  return data
}

async function callCreateTip(bookingId, amountCents) {
  const { data, error } = await buyerClient.rpc('create_tip', {
    p_booking_id: bookingId,
    p_amount_cents: amountCents,
  })

  return { data, error }
}

async function run() {
  console.log('--- VERIFY: TIP DERIVED FIELDS ---')

  runSeed('seed-auto-complete-flow.mjs')
  await loginBuyer()

  const session = await getLatestCompletedSession()

  console.log('Using session:', session.id)
  console.log('Using booking:', session.booking_request_id)

  const before = await getTipViewRow(session.id)

  console.log('--- BEFORE TIP ---')
  console.log(before)

  if (before.status !== 'completed') {
    fail(`Expected completed session, got ${before.status}`)
  }

  if (before.tip_eligible !== true) {
    fail(`Expected tip_eligible=true before tip, got ${before.tip_eligible}`)
  }

  if (before.tip_already_given !== false) {
    fail(`Expected tip_already_given=false before tip, got ${before.tip_already_given}`)
  }

  if (before.tip_amount_cents !== null) {
    fail(`Expected tip_amount_cents=null before tip, got ${before.tip_amount_cents}`)
  }

  if (!before.tip_expires_at) {
    fail('Expected tip_expires_at to be populated before tip')
  }

  if (before.tip_block_reason !== null) {
    fail(`Expected tip_block_reason=null before tip, got ${before.tip_block_reason}`)
  }

  console.log('--- CREATE TIP ---')
  const tipCall = await callCreateTip(session.booking_request_id, 200)

  console.log('TIP CALL RESULT:', tipCall.data, tipCall.error)

  if (tipCall.error) {
    throw new Error(`create_tip RPC failed: ${tipCall.error.message}`)
  }

  if (tipCall.data?.success !== true) {
    fail(`Expected create_tip success, got ${JSON.stringify(tipCall.data)}`)
  }

  const after = await getTipViewRow(session.id)

  console.log('--- AFTER TIP ---')
  console.log(after)

  if (after.tip_eligible !== false) {
    fail(`Expected tip_eligible=false after tip, got ${after.tip_eligible}`)
  }

  if (after.tip_already_given !== true) {
    fail(`Expected tip_already_given=true after tip, got ${after.tip_already_given}`)
  }

  if (Number(after.tip_amount_cents ?? 0) !== 200) {
    fail(`Expected tip_amount_cents=200 after tip, got ${after.tip_amount_cents}`)
  }

  if (after.tip_block_reason !== 'already_tipped') {
    fail(
      `Expected tip_block_reason=already_tipped after tip, got ${after.tip_block_reason}`
    )
  }

  if (!after.tip_expires_at) {
    fail('Expected tip_expires_at to remain populated after tip')
  }

  console.log('✅ TIP DERIVED FIELDS VERIFIED')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })