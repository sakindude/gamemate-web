import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const ALLOWED_SCENARIOS = new Set([
  'success',
  'insufficient_balance',
  'seller_not_found',
  'seller_offline',
  'buyer_has_pending',
  'seller_has_pending',
  'buyer_blocking_session',
  'seller_blocking_session',
])

const DEFAULTS = {
  buyerUsername: process.env.GM_TEST_BUYER_USERNAME || process.env.TEST_BUYER_USERNAME || 'gm_test_buyer',
  sellerUsername: process.env.GM_TEST_SELLER_USERNAME || process.env.TEST_SELLER_USERNAME || 'gm_test_seller',
  buyerPassword:
    process.env.GM_TEST_BUYER_PASSWORD ||
    process.env.TEST_BUYER_PASSWORD ||
    process.env.E2E_TEST_BUYER_PASSWORD ||
    '',
  durationMinutes: 60,
  basePriceCents: 500,
  tipCents: 100,
  processingFeeCents: 0,
  game: 'Test Game',
  communicationMethod: 'Discord',
  currency: 'USD',
  richBalanceCents: 5000,
  lowBalanceCents: 100,
}

function getArg(name) {
  const withEquals = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (withEquals) return withEquals.slice(name.length + 1)

  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]

  return null
}

function getEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (value && String(value).trim() !== '') return value
  }
  return null
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} mismatch. Expected: ${JSON.stringify(expected)} | Actual: ${JSON.stringify(actual)}`)
  }
}

function createAnonClient() {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')

  if (!url) fail('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) fail('Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function createAdminClient() {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url) fail('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceRoleKey) fail('Missing env: SUPABASE_SERVICE_ROLE_KEY')

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function findProfileByUsername(admin, username) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, username, display_name, balance_cents, is_online')
    .eq('username', username)
    .limit(1)
    .maybeSingle()

  if (error) fail(`findProfileByUsername failed for ${username}: ${error.message}`)
  if (!data) fail(`Profile not found for username: ${username}`)
  return data
}

async function resetState(admin, userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]

  const { data: bookingRows, error: bookingError } = await admin
    .from('booking_requests')
    .select('id')
    .or(uniqueUserIds.map((id) => `buyer_id.eq.${id},seller_id.eq.${id}`).join(','))

  if (bookingError) fail(`resetState load booking_requests failed: ${bookingError.message}`)

  const bookingIds = (bookingRows || []).map((row) => row.id)

  const { data: sessionRows, error: sessionError } = await admin
    .from('sessions')
    .select('id')
    .or(uniqueUserIds.map((id) => `buyer_id.eq.${id},seller_id.eq.${id}`).join(','))

  if (sessionError) fail(`resetState load sessions failed: ${sessionError.message}`)

  const sessionIds = (sessionRows || []).map((row) => row.id)

  if (sessionIds.length > 0) {
    const { error } = await admin.from('session_events').delete().in('session_id', sessionIds)
    if (error) fail(`resetState delete session_events failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('wallet_transactions').delete().in('booking_id', bookingIds)
    if (error) fail(`resetState delete wallet_transactions by booking_id failed: ${error.message}`)
  }

  const { error: walletByUserError } = await admin.from('wallet_transactions').delete().in('user_id', uniqueUserIds)
  if (walletByUserError) fail(`resetState delete wallet_transactions by user_id failed: ${walletByUserError.message}`)

  if (bookingIds.length > 0) {
    const { error } = await admin.from('booking_request_slots').delete().in('request_id', bookingIds)
    if (error) fail(`resetState delete booking_request_slots failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('reviews').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete reviews failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('buyer_reviews').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete buyer_reviews failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('buyer_review_details').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete buyer_review_details failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('seller_review_details').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete seller_review_details failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('booking_escrows').delete().in('booking_id', bookingIds)
    if (error) fail(`resetState delete booking_escrows failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('booking_chat_reads').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete booking_chat_reads failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('booking_messages').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete booking_messages failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('strikes').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete strikes by booking_request_id failed: ${error.message}`)
  }

  if (sessionIds.length > 0) {
    const { error } = await admin.from('strikes').delete().in('session_id', sessionIds)
    if (error) fail(`resetState delete strikes by session_id failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('disputes').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete disputes failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('payout_holds').delete().in('booking_request_id', bookingIds)
    if (error) fail(`resetState delete payout_holds failed: ${error.message}`)
  }

  if (sessionIds.length > 0) {
    const { error } = await admin.from('sessions').delete().in('id', sessionIds)
    if (error) fail(`resetState delete sessions failed: ${error.message}`)
  }

  if (bookingIds.length > 0) {
    const { error } = await admin.from('booking_requests').delete().in('id', bookingIds)
    if (error) fail(`resetState delete booking_requests failed: ${error.message}`)
  }
}

async function setBuyerBalance(admin, buyerId, balanceCents) {
  const { error } = await admin.from('profiles').update({ balance_cents: balanceCents }).eq('id', buyerId)
  if (error) fail(`setBuyerBalance failed: ${error.message}`)
}

async function setSellerOnline(admin, sellerId, isOnline) {
  const { error } = await admin.from('profiles').update({ is_online: isOnline }).eq('id', sellerId)
  if (error) fail(`setSellerOnline failed: ${error.message}`)
}

async function getBalanceCents(admin, userId) {
  const { data, error } = await admin
    .from('profiles')
    .select('balance_cents')
    .eq('id', userId)
    .limit(1)
    .maybeSingle()

  if (error) fail(`getBalanceCents failed: ${error.message}`)
  if (!data) fail(`Profile not found while reading balance for user ${userId}`)

  return Number(data.balance_cents ?? 0)
}

async function countBookingRequests(admin, buyerId, sellerId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('id')
    .or(`buyer_id.eq.${buyerId},seller_id.eq.${sellerId}`)

  if (error) fail(`countBookingRequests failed: ${error.message}`)
  return (data || []).length
}

async function countBuyerWalletTransactions(admin, buyerId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('id')
    .eq('user_id', buyerId)

  if (error) fail(`countBuyerWalletTransactions failed: ${error.message}`)
  return (data || []).length
}

async function getWalletTransactionForBooking(admin, bookingId, userId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('id, tx_type, direction, amount_cents, currency, status, note, metadata, booking_id, user_id')
    .eq('booking_id', bookingId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail(`getWalletTransactionForBooking failed: ${error.message}`)
  return data
}

async function getBookingRequest(admin, requestId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('*')
    .eq('id', requestId)
    .limit(1)
    .maybeSingle()

  if (error) fail(`getBookingRequest failed: ${error.message}`)
  return data
}

async function insertPendingBooking(admin, { buyerId, sellerId }) {
  const totalAmountCents = DEFAULTS.basePriceCents + DEFAULTS.tipCents

  const { data, error } = await admin
    .from('booking_requests')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      total_price: totalAmountCents / 100,
      status: 'pending',
      created_at: new Date().toISOString(),
      game: DEFAULTS.game,
      communication_method: DEFAULTS.communicationMethod,
      currency: DEFAULTS.currency,
      base_price_cents: DEFAULTS.basePriceCents,
      tip_cents: DEFAULTS.tipCents,
      processing_fee_cents: DEFAULTS.processingFeeCents,
      total_amount_cents: totalAmountCents,
      platform_fee_cents: 0,
      seller_payout_cents: DEFAULTS.basePriceCents + DEFAULTS.tipCents,
      duration_minutes: DEFAULTS.durationMinutes,
    })
    .select('id')
    .single()

  if (error) fail(`insertPendingBooking failed: ${error.message}`)
  return data.id
}

async function insertBlockingSession(admin, { buyerId, sellerId, status }) {
  const bookingId = randomUUID()

  const { error: bookingError } = await admin.from('booking_requests').insert({
    id: bookingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    total_price: (DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents) / 100,
    status: 'accepted',
    created_at: new Date().toISOString(),
    game: DEFAULTS.game,
    communication_method: DEFAULTS.communicationMethod,
    currency: DEFAULTS.currency,
    base_price_cents: DEFAULTS.basePriceCents,
    tip_cents: DEFAULTS.tipCents,
    processing_fee_cents: DEFAULTS.processingFeeCents,
    total_amount_cents: DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents,
    platform_fee_cents: 0,
    seller_payout_cents: DEFAULTS.basePriceCents + DEFAULTS.tipCents,
    duration_minutes: DEFAULTS.durationMinutes,
  })

  if (bookingError) fail(`insertBlockingSession booking insert failed: ${bookingError.message}`)

  const sessionId = randomUUID()
  const nowIso = new Date().toISOString()

  const payload = {
    id: sessionId,
    booking_request_id: bookingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    status,
    duration_minutes: DEFAULTS.durationMinutes,
    created_at: nowIso,
    updated_at: nowIso,
  }

  if (status === 'active') {
    payload.started_at = nowIso
    payload.buyer_started_at = nowIso
    payload.seller_started_at = nowIso
  }

  if (status === 'awaiting_confirmation') {
    payload.started_at = nowIso
    payload.buyer_started_at = nowIso
    payload.seller_started_at = nowIso
    payload.seller_completed_at = nowIso
  }

  const { error: sessionError } = await admin.from('sessions').insert(payload)
  if (sessionError) fail(`insertBlockingSession session insert failed: ${sessionError.message}`)

  return sessionId
}

async function signInBuyer(anon, email, password) {
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  })

  if (error) fail(`Buyer signInWithPassword failed: ${error.message}`)
  if (!data.session) fail('Buyer auth session not created')

  return data
}

async function runScenarioSetup(admin, scenario, buyerProfile, sellerProfile) {
  await resetState(admin, [buyerProfile.id, sellerProfile.id])
  await setBuyerBalance(admin, buyerProfile.id, DEFAULTS.richBalanceCents)
  await setSellerOnline(admin, sellerProfile.id, true)

  switch (scenario) {
    case 'success':
      break

    case 'insufficient_balance':
      await setBuyerBalance(admin, buyerProfile.id, DEFAULTS.lowBalanceCents)
      break

    case 'seller_not_found':
      break

    case 'seller_offline':
      await setSellerOnline(admin, sellerProfile.id, false)
      break

    case 'buyer_has_pending':
      await insertPendingBooking(admin, {
        buyerId: buyerProfile.id,
        sellerId: sellerProfile.id,
      })
      break

    case 'seller_has_pending':
      await insertPendingBooking(admin, {
        buyerId: sellerProfile.id,
        sellerId: sellerProfile.id,
      })
      break

    case 'buyer_blocking_session':
      await insertBlockingSession(admin, {
        buyerId: buyerProfile.id,
        sellerId: sellerProfile.id,
        status: 'active',
      })
      break

    case 'seller_blocking_session':
      await insertBlockingSession(admin, {
        buyerId: sellerProfile.id,
        sellerId: sellerProfile.id,
        status: 'active',
      })
      break

    default:
      fail(`Unsupported setup scenario: ${scenario}`)
  }
}

function buildRpcArgs(scenario, sellerId) {
  const effectiveSellerId = scenario === 'seller_not_found' ? randomUUID() : sellerId

  return {
    p_seller_id: effectiveSellerId,
    p_duration_minutes: DEFAULTS.durationMinutes,
    p_base_price_cents: DEFAULTS.basePriceCents,
    p_tip_cents: DEFAULTS.tipCents,
    p_processing_fee_cents: DEFAULTS.processingFeeCents,
    p_game: DEFAULTS.game,
    p_communication_method: DEFAULTS.communicationMethod,
    p_currency: DEFAULTS.currency,
  }
}

async function assertSuccessScenario(admin, result, beforeBalance, beforeBookingCount, beforeWalletCount, buyerProfile, sellerProfile) {
  assert(result && typeof result === 'object', 'Success scenario result must be an object')
  assertEqual(result.success, true, 'success')
  assertEqual(result.status, 'pending', 'status')
  assert(result.request_id, 'request_id must exist')

  const afterBalance = await getBalanceCents(admin, buyerProfile.id)
  const expectedDebit = DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents
  assertEqual(afterBalance, beforeBalance - expectedDebit, 'buyer balance after success')

  const afterBookingCount = await countBookingRequests(admin, buyerProfile.id, sellerProfile.id)
  assertEqual(afterBookingCount, beforeBookingCount + 1, 'booking request count delta')

  const afterWalletCount = await countBuyerWalletTransactions(admin, buyerProfile.id)
  assertEqual(afterWalletCount, beforeWalletCount + 1, 'buyer wallet transaction count delta')

  const requestRow = await getBookingRequest(admin, result.request_id)
  assert(requestRow, 'booking_requests row must exist')
  assertEqual(requestRow.buyer_id, buyerProfile.id, 'booking buyer_id')
  assertEqual(requestRow.seller_id, sellerProfile.id, 'booking seller_id')
  assertEqual(requestRow.status, 'pending', 'booking status')
  assertEqual(Number(requestRow.base_price_cents), DEFAULTS.basePriceCents, 'booking base_price_cents')
  assertEqual(Number(requestRow.tip_cents), DEFAULTS.tipCents, 'booking tip_cents')
  assertEqual(Number(requestRow.processing_fee_cents), DEFAULTS.processingFeeCents, 'booking processing_fee_cents')
  assertEqual(
    Number(requestRow.total_amount_cents),
    DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents,
    'booking total_amount_cents'
  )
  assertEqual(Number(requestRow.seller_payout_cents), DEFAULTS.basePriceCents + DEFAULTS.tipCents, 'booking seller_payout_cents')
  assertEqual(requestRow.currency, DEFAULTS.currency, 'booking currency')
  assertEqual(requestRow.duration_minutes, DEFAULTS.durationMinutes, 'booking duration_minutes')
  assertEqual(requestRow.game, DEFAULTS.game, 'booking game')
  assertEqual(requestRow.communication_method, DEFAULTS.communicationMethod, 'booking communication_method')

  const walletRow = await getWalletTransactionForBooking(admin, result.request_id, buyerProfile.id)
  assert(walletRow, 'wallet_transactions row must exist for created booking')
  assertEqual(walletRow.tx_type, 'booking_hold', 'wallet tx_type')
  assertEqual(walletRow.direction, 'debit', 'wallet direction')
  assertEqual(Number(walletRow.amount_cents), expectedDebit, 'wallet amount_cents')
  assertEqual(walletRow.currency, DEFAULTS.currency, 'wallet currency')
  assertEqual(walletRow.status, 'posted', 'wallet status')
}

async function assertFailureScenario(
  admin,
  scenario,
  result,
  beforeBalance,
  beforeBookingCount,
  beforeWalletCount,
  buyerProfile,
  sellerProfile
) {
  assert(result && typeof result === 'object', `${scenario} result must be an object`)
  assertEqual(result.success, false, `${scenario} success`)

  const expectedMessageMap = {
    insufficient_balance: 'Insufficient balance.',
    seller_not_found: 'Seller not found.',
    seller_offline: 'Seller is offline.',
    buyer_has_pending: 'You already have a pending booking request.',
    seller_has_pending: 'Seller already has a pending booking request.',
    buyer_blocking_session: 'You already have an unfinished booking or session.',
    seller_blocking_session: 'Seller is currently busy with another request or session.',
  }

  assertEqual(result.message, expectedMessageMap[scenario], `${scenario} message`)

  const afterBalance = await getBalanceCents(admin, buyerProfile.id)
  assertEqual(afterBalance, beforeBalance, `${scenario} buyer balance unchanged`)

  const afterBookingCount = await countBookingRequests(admin, buyerProfile.id, sellerProfile.id)
  assertEqual(afterBookingCount, beforeBookingCount, `${scenario} booking count unchanged`)

  const afterWalletCount = await countBuyerWalletTransactions(admin, buyerProfile.id)
  assertEqual(afterWalletCount, beforeWalletCount, `${scenario} wallet count unchanged`)
}

async function main() {
  const scenario = getArg('--scenario')

  if (!scenario) {
    fail(
      `Missing --scenario. Supported: ${Array.from(ALLOWED_SCENARIOS).join(', ')}`
    )
  }

  if (!ALLOWED_SCENARIOS.has(scenario)) {
    fail(
      `Invalid --scenario=${scenario}. Supported: ${Array.from(ALLOWED_SCENARIOS).join(', ')}`
    )
  }

  if (!DEFAULTS.buyerPassword) {
    fail('Missing env: GM_TEST_BUYER_PASSWORD (or TEST_BUYER_PASSWORD / E2E_TEST_BUYER_PASSWORD)')
  }

  const admin = createAdminClient()
  const anon = createAnonClient()

  const buyerProfile = await findProfileByUsername(admin, DEFAULTS.buyerUsername)
  const sellerProfile = await findProfileByUsername(admin, DEFAULTS.sellerUsername)

  if (!buyerProfile.email) fail(`Buyer profile ${DEFAULTS.buyerUsername} has no email`)
  if (!sellerProfile.email) fail(`Seller profile ${DEFAULTS.sellerUsername} has no email`)

  console.log(`--- SEED: CREATE BOOKING WITH HOLD (${scenario.toUpperCase()}) ---`)
  console.log(`Buyer: ${buyerProfile.username || buyerProfile.display_name} ${buyerProfile.id}`)
  console.log(`Seller: ${sellerProfile.username || sellerProfile.display_name} ${sellerProfile.id}`)

  try {
    await runScenarioSetup(admin, scenario, buyerProfile, sellerProfile)
    console.log('Clean state ready')

    await signInBuyer(anon, buyerProfile.email, DEFAULTS.buyerPassword)
    console.log('Buyer authenticated for create_booking_with_hold RPC')

    const beforeBalance = await getBalanceCents(admin, buyerProfile.id)
    const beforeBookingCount = await countBookingRequests(admin, buyerProfile.id, sellerProfile.id)
    const beforeWalletCount = await countBuyerWalletTransactions(admin, buyerProfile.id)

    const rpcArgs = buildRpcArgs(scenario, sellerProfile.id)

    console.log('RPC args:', rpcArgs)

    const { data, error } = await anon.rpc('create_booking_with_hold', rpcArgs)

    if (error) {
      fail(`RPC error: ${error.message}`)
    }

    console.log('RPC result:', data)

    if (scenario === 'success') {
      await assertSuccessScenario(
        admin,
        data,
        beforeBalance,
        beforeBookingCount,
        beforeWalletCount,
        buyerProfile,
        sellerProfile
      )
    } else {
      await assertFailureScenario(
        admin,
        scenario,
        data,
        beforeBalance,
        beforeBookingCount,
        beforeWalletCount,
        buyerProfile,
        sellerProfile
      )
    }

    console.log('--- DONE ---')
  } finally {
    try {
      await anon.auth.signOut()
    } catch {
      // ignore
    }

    await resetState(admin, [buyerProfile.id, sellerProfile.id])
    await setBuyerBalance(admin, buyerProfile.id, DEFAULTS.richBalanceCents)
    await setSellerOnline(admin, sellerProfile.id, true)
  }
}

await main()
