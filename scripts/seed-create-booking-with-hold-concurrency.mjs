import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const ALLOWED_SCENARIOS = new Set([
  'double_submit_same_buyer',
  'two_buyers_same_seller',
  'retry_same_payload_after_success',
])

const DEFAULTS = {
  buyerUsername:
    process.env.PW_TEST_BUYER_NAME ||
    process.env.GM_TEST_BUYER_USERNAME ||
    process.env.TEST_BUYER_USERNAME ||
    'gm_test_buyer',

  sellerUsername:
    process.env.PW_TEST_SELLER_NAME ||
    process.env.GM_TEST_SELLER_USERNAME ||
    process.env.TEST_SELLER_USERNAME ||
    'gm_test_seller',

  secondBuyerUsername:
    process.env.PW_TEST_SECOND_BUYER_NAME ||
    process.env.GM_TEST_SECOND_BUYER_USERNAME ||
    process.env.TEST_SECOND_BUYER_USERNAME ||
    'gm_test_buyer_2',

  buyerEmail:
    process.env.PW_TEST_EMAIL ||
    process.env.GM_TEST_BUYER_EMAIL ||
    '',

  sellerEmail:
    process.env.PW_TEST_SELLER_EMAIL ||
    process.env.GM_TEST_SELLER_EMAIL ||
    '',

  buyerPassword:
    process.env.PW_TEST_PASSWORD ||
    process.env.GM_TEST_BUYER_PASSWORD ||
    process.env.TEST_BUYER_PASSWORD ||
    process.env.E2E_TEST_BUYER_PASSWORD ||
    '',

  secondBuyerPassword:
    process.env.PW_TEST_SECOND_BUYER_PASSWORD ||
    process.env.GM_TEST_SECOND_BUYER_PASSWORD ||
    process.env.TEST_SECOND_BUYER_PASSWORD ||
    process.env.E2E_TEST_SECOND_BUYER_PASSWORD ||
    process.env.PW_TEST_PASSWORD ||
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
  const { error } = await admin
    .from('profiles')
    .update({ balance_cents: balanceCents })
    .eq('id', buyerId)

  if (error) fail(`setBuyerBalance failed: ${error.message}`)
}

async function setSellerOnline(admin, sellerId, isOnline) {
  const { error } = await admin
    .from('profiles')
    .update({ is_online: isOnline })
    .eq('id', sellerId)

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

async function listBookingRequests(admin, buyerIds, sellerId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('id, buyer_id, seller_id, status, total_amount_cents, created_at')
    .eq('seller_id', sellerId)
    .in('buyer_id', buyerIds)
    .order('created_at', { ascending: true })

  if (error) fail(`listBookingRequests failed: ${error.message}`)
  return data || []
}

async function listBookingHoldRows(admin, buyerIds) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('id, booking_id, user_id, tx_type, direction, amount_cents, status, created_at')
    .in('user_id', buyerIds)
    .eq('tx_type', 'booking_hold')
    .eq('direction', 'debit')
    .order('created_at', { ascending: true })

  if (error) fail(`listBookingHoldRows failed: ${error.message}`)
  return data || []
}

async function signInBuyer(anon, email, password, label) {
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  })

  if (error) fail(`${label} signInWithPassword failed: ${error.message}`)
  if (!data.session) fail(`${label} auth session not created`)
}

function buildRpcArgs(sellerId) {
  return {
    p_seller_id: sellerId,
    p_duration_minutes: DEFAULTS.durationMinutes,
    p_base_price_cents: DEFAULTS.basePriceCents,
    p_tip_cents: DEFAULTS.tipCents,
    p_processing_fee_cents: DEFAULTS.processingFeeCents,
    p_game: DEFAULTS.game,
    p_communication_method: DEFAULTS.communicationMethod,
    p_currency: DEFAULTS.currency,
  }
}

async function callCreateBooking(client, sellerId, label, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const { data, error } = await client.rpc('create_booking_with_hold', buildRpcArgs(sellerId))

  if (error) {
    return {
      label,
      ok: false,
      kind: 'rpc_error',
      error: error.message,
      data: null,
    }
  }

  return {
    label,
    ok: true,
    kind: 'rpc_result',
    error: null,
    data,
  }
}

function classifyResult(result) {
  if (!result.ok) return 'rpc_error'
  if (result.data?.success === true) return 'success'
  if (result.data?.success === false) return 'failure'
  return 'unknown'
}

function logResults(results) {
  for (const result of results) {
    console.log(`[${result.label}] classification: ${classifyResult(result)}`)
    console.log(`[${result.label}] payload:`, result.data ?? result.error)
  }
}

async function setupCleanState(admin, buyerProfiles, sellerProfile) {
  await resetState(admin, [...buyerProfiles.map((p) => p.id), sellerProfile.id])

  for (const buyer of buyerProfiles) {
    await setBuyerBalance(admin, buyer.id, DEFAULTS.richBalanceCents)
  }

  await setSellerOnline(admin, sellerProfile.id, true)
}

async function assertNoOrphanState(admin, buyerIds, sellerId) {
  const bookings = await listBookingRequests(admin, buyerIds, sellerId)
  const holds = await listBookingHoldRows(admin, buyerIds)
  const bookingIdSet = new Set(bookings.map((b) => b.id))

  for (const hold of holds) {
    assert(bookingIdSet.has(hold.booking_id), `Orphan wallet row detected. wallet booking_id=${hold.booking_id} has no booking_requests row`)
  }

  for (const booking of bookings) {
    const matchingHoldCount = holds.filter((hold) => hold.booking_id === booking.id).length
    assert(
      matchingHoldCount <= 1,
      `Booking ${booking.id} has duplicate hold rows after uniqueness migration`
    )
  }
}

async function assertDoubleSubmitSameBuyer(admin, buyerProfile, sellerProfile, results, beforeBalance) {
  const successResults = results.filter((r) => r.data?.success === true)
  const failureResults = results.filter((r) => r.data?.success === false)

  assertEqual(successResults.length, 1, 'double_submit_same_buyer success count')
  assertEqual(failureResults.length, 1, 'double_submit_same_buyer failure count')

  const successRequestId = successResults[0].data?.request_id
  assert(successRequestId, 'Successful call must return request_id')

  const bookings = await listBookingRequests(admin, [buyerProfile.id], sellerProfile.id)
  assertEqual(bookings.length, 1, 'double_submit_same_buyer booking count')
  assertEqual(bookings[0].status, 'pending', 'double_submit_same_buyer booking status')

  const holds = await listBookingHoldRows(admin, [buyerProfile.id])
  assertEqual(holds.length, 1, 'double_submit_same_buyer hold count')
  assertEqual(holds[0].booking_id, successRequestId, 'double_submit_same_buyer hold booking_id')

  const afterBalance = await getBalanceCents(admin, buyerProfile.id)
  const expectedDebit = DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents
  assertEqual(afterBalance, beforeBalance - expectedDebit, 'double_submit_same_buyer balance delta')

  await assertNoOrphanState(admin, [buyerProfile.id], sellerProfile.id)
}

async function assertTwoBuyersSameSeller(admin, buyerProfile, secondBuyerProfile, sellerProfile, results, beforeBuyer1Balance, beforeBuyer2Balance) {
  const successResults = results.filter((r) => r.data?.success === true)
  const failureResults = results.filter((r) => r.data?.success === false)

  assertEqual(successResults.length, 1, 'two_buyers_same_seller success count')
  assertEqual(failureResults.length, 1, 'two_buyers_same_seller failure count')

  const successRequestId = successResults[0].data?.request_id
  assert(successRequestId, 'Successful call must return request_id')

  const bookings = await listBookingRequests(admin, [buyerProfile.id, secondBuyerProfile.id], sellerProfile.id)
  assertEqual(bookings.length, 1, 'two_buyers_same_seller booking count')
  assertEqual(bookings[0].status, 'pending', 'two_buyers_same_seller booking status')

  const holds = await listBookingHoldRows(admin, [buyerProfile.id, secondBuyerProfile.id])
  assertEqual(holds.length, 1, 'two_buyers_same_seller hold count')
  assertEqual(holds[0].booking_id, successRequestId, 'two_buyers_same_seller hold booking_id')

  const expectedDebit = DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents

  const afterBuyer1Balance = await getBalanceCents(admin, buyerProfile.id)
  const afterBuyer2Balance = await getBalanceCents(admin, secondBuyerProfile.id)

  const buyer1Debited = afterBuyer1Balance === beforeBuyer1Balance - expectedDebit
  const buyer2Debited = afterBuyer2Balance === beforeBuyer2Balance - expectedDebit

  assert(
    (buyer1Debited && !buyer2Debited) || (!buyer1Debited && buyer2Debited),
    `Exactly one buyer must be debited. buyer1Debited=${buyer1Debited} buyer2Debited=${buyer2Debited}`
  )

  await assertNoOrphanState(admin, [buyerProfile.id, secondBuyerProfile.id], sellerProfile.id)
}

async function assertRetryAfterSuccess(admin, buyerProfile, sellerProfile, results, beforeBalance) {
  const first = results[0]
  const second = results[1]

  assert(first.data?.success === true, 'retry_same_payload_after_success first call must succeed')
  assert(second.data?.success === false, 'retry_same_payload_after_success second call must fail')

  const expectedSecondMessages = new Set([
    'You already have a pending booking request.',
    'Seller already has a pending booking request.',
  ])

  assert(
    expectedSecondMessages.has(second.data?.message),
    `Unexpected second call failure message: ${second.data?.message}`
  )

  const successRequestId = first.data?.request_id
  assert(successRequestId, 'First successful call must return request_id')

  const bookings = await listBookingRequests(admin, [buyerProfile.id], sellerProfile.id)
  assertEqual(bookings.length, 1, 'retry_same_payload_after_success booking count')

  const holds = await listBookingHoldRows(admin, [buyerProfile.id])
  assertEqual(holds.length, 1, 'retry_same_payload_after_success hold count')
  assertEqual(holds[0].booking_id, successRequestId, 'retry_same_payload_after_success hold booking_id')

  const afterBalance = await getBalanceCents(admin, buyerProfile.id)
  const expectedDebit = DEFAULTS.basePriceCents + DEFAULTS.tipCents + DEFAULTS.processingFeeCents
  assertEqual(afterBalance, beforeBalance - expectedDebit, 'retry_same_payload_after_success balance delta')

  await assertNoOrphanState(admin, [buyerProfile.id], sellerProfile.id)
}

async function main() {
  const scenario = getArg('--scenario')

  if (!scenario) {
    fail(`Missing --scenario. Supported: ${Array.from(ALLOWED_SCENARIOS).join(', ')}`)
  }

  if (!ALLOWED_SCENARIOS.has(scenario)) {
    fail(`Invalid --scenario=${scenario}. Supported: ${Array.from(ALLOWED_SCENARIOS).join(', ')}`)
  }

  if (!DEFAULTS.buyerPassword) {
    fail('Missing env: PW_TEST_PASSWORD (or GM_TEST_BUYER_PASSWORD / TEST_BUYER_PASSWORD / E2E_TEST_BUYER_PASSWORD)')
  }

  if (!DEFAULTS.secondBuyerPassword && scenario === 'two_buyers_same_seller') {
    fail('Missing env: PW_TEST_SECOND_BUYER_PASSWORD (or GM_TEST_SECOND_BUYER_PASSWORD / TEST_SECOND_BUYER_PASSWORD / E2E_TEST_SECOND_BUYER_PASSWORD)')
  }

  const admin = createAdminClient()
  const buyerClient1 = createAnonClient()
  const buyerClient2 = createAnonClient()

  const buyerProfile = await findProfileByUsername(admin, DEFAULTS.buyerUsername)
  const sellerProfile = await findProfileByUsername(admin, DEFAULTS.sellerUsername)

  const secondBuyerProfile =
    scenario === 'two_buyers_same_seller'
      ? await findProfileByUsername(admin, DEFAULTS.secondBuyerUsername)
      : null

  const buyerEmail = DEFAULTS.buyerEmail || buyerProfile.email
  const sellerEmail = DEFAULTS.sellerEmail || sellerProfile.email

  if (!buyerEmail) fail(`Buyer profile ${DEFAULTS.buyerUsername} has no email and PW_TEST_EMAIL is missing`)
  if (!sellerEmail) fail(`Seller profile ${DEFAULTS.sellerUsername} has no email and PW_TEST_SELLER_EMAIL is missing`)
  if (secondBuyerProfile && !secondBuyerProfile.email) {
    fail(`Second buyer profile ${DEFAULTS.secondBuyerUsername} has no email`)
  }

  console.log(`--- SEED: CREATE BOOKING WITH HOLD CONCURRENCY (${scenario.toUpperCase()}) ---`)
  console.log(`Buyer1: ${buyerProfile.username || buyerProfile.display_name} ${buyerProfile.id}`)
  if (secondBuyerProfile) {
    console.log(`Buyer2: ${secondBuyerProfile.username || secondBuyerProfile.display_name} ${secondBuyerProfile.id}`)
  }
  console.log(`Seller: ${sellerProfile.username || sellerProfile.display_name} ${sellerProfile.id}`)

  const allProfiles = secondBuyerProfile ? [buyerProfile, secondBuyerProfile] : [buyerProfile]

  try {
    await setupCleanState(admin, allProfiles, sellerProfile)
    console.log('Clean state ready')

    await signInBuyer(buyerClient1, buyerEmail, DEFAULTS.buyerPassword, 'buyer1')
    console.log('Buyer1 authenticated')

    if (secondBuyerProfile) {
      await signInBuyer(
        buyerClient2,
        secondBuyerProfile.email,
        DEFAULTS.secondBuyerPassword,
        'buyer2'
      )
      console.log('Buyer2 authenticated')
    } else {
      await signInBuyer(buyerClient2, buyerEmail, DEFAULTS.buyerPassword, 'buyer2')
      console.log('Buyer2 authenticated')
    }

    const beforeBuyer1Balance = await getBalanceCents(admin, buyerProfile.id)
    const beforeBuyer2Balance = secondBuyerProfile
      ? await getBalanceCents(admin, secondBuyerProfile.id)
      : null

    let results = []

    if (scenario === 'double_submit_same_buyer') {
      results = await Promise.all([
        callCreateBooking(buyerClient1, sellerProfile.id, 'buyer1-call1'),
        callCreateBooking(buyerClient2, sellerProfile.id, 'buyer1-call2'),
      ])

      logResults(results)

      await assertDoubleSubmitSameBuyer(
        admin,
        buyerProfile,
        sellerProfile,
        results,
        beforeBuyer1Balance
      )
    } else if (scenario === 'two_buyers_same_seller') {
      results = await Promise.all([
        callCreateBooking(buyerClient1, sellerProfile.id, 'buyer1-call'),
        callCreateBooking(buyerClient2, sellerProfile.id, 'buyer2-call'),
      ])

      logResults(results)

      await assertTwoBuyersSameSeller(
        admin,
        buyerProfile,
        secondBuyerProfile,
        sellerProfile,
        results,
        beforeBuyer1Balance,
        beforeBuyer2Balance
      )
    } else if (scenario === 'retry_same_payload_after_success') {
      const first = await callCreateBooking(buyerClient1, sellerProfile.id, 'buyer1-first-call')
      const second = await callCreateBooking(buyerClient1, sellerProfile.id, 'buyer1-retry-call', 25)

      results = [first, second]

      logResults(results)

      await assertRetryAfterSuccess(
        admin,
        buyerProfile,
        sellerProfile,
        results,
        beforeBuyer1Balance
      )
    } else {
      fail(`Unsupported concurrency scenario: ${scenario}`)
    }

    console.log('--- DONE ---')
  } finally {
    try {
      await buyerClient1.auth.signOut()
    } catch {
      // ignore
    }

    try {
      await buyerClient2.auth.signOut()
    } catch {
      // ignore
    }

    const userIds = secondBuyerProfile
      ? [buyerProfile.id, secondBuyerProfile.id, sellerProfile.id]
      : [buyerProfile.id, sellerProfile.id]

    await resetState(admin, userIds)
    await setBuyerBalance(admin, buyerProfile.id, DEFAULTS.richBalanceCents)
    if (secondBuyerProfile) {
      await setBuyerBalance(admin, secondBuyerProfile.id, DEFAULTS.richBalanceCents)
    }
    await setSellerOnline(admin, sellerProfile.id, true)
  }
}

await main()
