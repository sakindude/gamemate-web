import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_NAME = (process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer').trim()
const BUYER_EMAIL = (process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com').trim()
const BUYER_PASSWORD = (process.env.PW_TEST_PASSWORD || '123456789').trim()

const SELLER_NAME = (process.env.PW_TEST_SELLER_NAME || 'gm_test_seller').trim()
const SELLER_EMAIL = (process.env.PW_TEST_SELLER_EMAIL || 'gm_test_seller@gmail.com').trim()

const BASE_PRICE_CENTS = 500
const TIP_CENTS = 100
const PROCESSING_FEE_CENTS = 0
const TOTAL_AMOUNT_CENTS = BASE_PRICE_CENTS + TIP_CENTS
const SELLER_PAYOUT_CENTS = BASE_PRICE_CENTS + TIP_CENTS

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  )
}

function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

const admin = createAdminClient()

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

async function findProfileByName(name, { mustBeSeller = false } = {}) {
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('display_name', name)
    .limit(1)
    .maybeSingle()

  if (error) fail(`findProfileByName failed for ${name}: ${error.message}`)
  if (!data) fail(`Profile not found for "${name}"`)
  if (mustBeSeller && !data.is_seller) fail(`${name} is not a seller`)

  return data
}

async function setSellerOnline(sellerId, isOnline) {
  const { error } = await admin
    .from('profiles')
    .update({ is_online: isOnline })
    .eq('id', sellerId)

  if (error) fail(`setSellerOnline failed: ${error.message}`)
}

async function setBuyerBalance(buyerId, balanceCents) {
  const { error } = await admin
    .from('profiles')
    .update({ balance_cents: balanceCents })
    .eq('id', buyerId)

  if (error) fail(`setBuyerBalance failed: ${error.message}`)
}

async function getBalanceCents(userId) {
  const { data, error } = await admin
    .from('profiles')
    .select('balance_cents')
    .eq('id', userId)
    .limit(1)
    .maybeSingle()

  if (error) fail(`getBalanceCents failed: ${error.message}`)
  if (!data) fail(`Profile missing while reading balance for ${userId}`)

  return Number(data.balance_cents ?? 0)
}

async function resetState(userIds) {
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

  const { error: walletByUserError } = await admin
    .from('wallet_transactions')
    .delete()
    .in('user_id', uniqueUserIds)

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

async function signInBuyer(client) {
  const { data, error } = await client.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (error) fail(`Buyer signInWithPassword failed: ${error.message}`)
  if (!data.session) fail('Buyer auth session not created')
}

async function createBookingWithHold(buyerClient, sellerId) {
  const { data, error } = await buyerClient.rpc('create_booking_with_hold', {
    p_seller_id: sellerId,
    p_duration_minutes: 60,
    p_base_price_cents: BASE_PRICE_CENTS,
    p_tip_cents: TIP_CENTS,
    p_processing_fee_cents: PROCESSING_FEE_CENTS,
    p_game: 'Test Game',
    p_communication_method: 'Discord',
    p_currency: 'USD',
  })

  if (error) fail(`create_booking_with_hold failed: ${error.message}`)
  if (!data?.success) fail(`create_booking_with_hold failed: ${data?.message || 'unknown failure'}`)
  if (!data?.request_id) fail('create_booking_with_hold returned no request_id')

  return data.request_id
}

async function acceptBooking(bookingId) {
  const { data, error } = await admin
    .from('booking_requests')
    .update({ status: 'accepted' })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('id, status')
    .single()

  if (error) fail(`acceptBooking failed: ${error.message}`)
  if (!data) fail('Booking could not be marked as accepted')

  return data
}

async function waitForSession(bookingId) {
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await admin
      .from('sessions')
      .select('*')
      .eq('booking_request_id', bookingId)
      .limit(1)
      .maybeSingle()

    if (error) fail(`waitForSession failed: ${error.message}`)
    if (data) return data

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  fail('Session not created after accept')
}

async function forceCompletedAndReleasable(sessionId, bookingId) {
  const nowIso = new Date().toISOString()
  const plannedEndIso = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const completedAtIso = new Date().toISOString()
  const expiredDisputeDeadlineIso = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const expiredReleasableAtIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: updatedSession, error: sessionUpdateError } = await admin
    .from('sessions')
    .update({
      status: 'completed',
      buyer_started_at: nowIso,
      seller_started_at: nowIso,
      started_at: nowIso,
      planned_end_at: plannedEndIso,
      buyer_completed_at: completedAtIso,
      seller_completed_at: completedAtIso,
      completed_at: completedAtIso,
      dispute_deadline_at: expiredDisputeDeadlineIso,
      auto_complete_at: null,
    })
    .eq('id', sessionId)
    .select('id, status, dispute_deadline_at, completed_at')
    .single()

  if (sessionUpdateError) fail(`forceCompleted session update failed: ${sessionUpdateError.message}`)
  if (!updatedSession) fail('Session could not be forced to completed')

  const { data: payoutHold, error: payoutHoldError } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)
    .maybeSingle()

  if (payoutHoldError) fail(`load payout_hold failed: ${payoutHoldError.message}`)
  if (!payoutHold) fail('No payout_holds row found for booking_request_id')

  const { data: updatedHold, error: payoutHoldUpdateError } = await admin
    .from('payout_holds')
    .update({
      releasable_at: expiredReleasableAtIso,
    })
    .eq('id', payoutHold.id)
    .select('*')
    .single()

  if (payoutHoldUpdateError) fail(`payout_hold update failed: ${payoutHoldUpdateError.message}`)
  if (!updatedHold) fail('Payout hold could not be updated')

  return updatedHold
}

async function getPayoutHoldByBooking(bookingId) {
  const { data, error } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .limit(1)
    .maybeSingle()

  if (error) fail(`getPayoutHoldByBooking failed: ${error.message}`)
  if (!data) fail(`No payout_hold found for booking ${bookingId}`)

  return data
}

async function getSellerWalletRows(sellerId, bookingId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', sellerId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) fail(`getSellerWalletRows failed: ${error.message}`)
  return data || []
}

function countSellerPayoutCredits(rows) {
  return rows.filter((row) => {
    const direction = row.direction
    const amountCents = Number(row.amount_cents ?? 0)
    return direction === 'credit' && amountCents === SELLER_PAYOUT_CENTS
  }).length
}

async function callRunPayoutRelease(client, label, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const { data, error } = await client.rpc('run_payout_release')

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
  return 'success_or_null'
}

function logResults(results) {
  for (const result of results) {
    console.log(`[${result.label}] classification: ${classifyResult(result)}`)
    console.log(`[${result.label}] payload:`, result.data ?? result.error)
  }
}

async function assertNoOrphanState(bookingId, sellerId) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  if (payoutHold.status === 'released' || payoutHold.released_at) {
    assertEqual(payoutCreditCount, 1, 'released payout_hold must have exactly one seller payout credit')
  }

  if (payoutCreditCount > 0) {
    assert(
      payoutHold.status === 'released' || !!payoutHold.released_at,
      'seller payout credit exists but payout_hold is not marked released'
    )
  }
}

async function assertDoubleReleaseSameHold(bookingId, sellerId, sellerBalanceBefore, results) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const sellerBalanceAfter = await getBalanceCents(sellerId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  const successLike = results.filter((r) => r.ok)
  assert(successLike.length >= 1, 'At least one release job should complete')

  assert(
    payoutHold.status === 'released' || !!payoutHold.released_at,
    `Payout hold should be released after double job, got status=${payoutHold.status}`
  )

  assertEqual(payoutCreditCount, 1, 'seller payout credit count after double release')
  assertEqual(
    sellerBalanceAfter,
    sellerBalanceBefore + SELLER_PAYOUT_CENTS,
    'seller balance after double release'
  )

  await assertNoOrphanState(bookingId, sellerId)
}

async function assertReleaseThenReleaseAgain(bookingId, sellerId, sellerBalanceBefore, first, second) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const sellerBalanceAfter = await getBalanceCents(sellerId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  assert(first.ok, 'First release call should not be rpc_error')
  assert(second.ok, 'Second release call should not be rpc_error')

  assert(
    payoutHold.status === 'released' || !!payoutHold.released_at,
    `Payout hold should be released after release_then_release_again, got status=${payoutHold.status}`
  )

  assertEqual(payoutCreditCount, 1, 'seller payout credit count after release_then_release_again')
  assertEqual(
    sellerBalanceAfter,
    sellerBalanceBefore + SELLER_PAYOUT_CENTS,
    'seller balance after release_then_release_again'
  )

  await assertNoOrphanState(bookingId, sellerId)
}

async function assertReleaseOrphanCheck(bookingId, sellerId, sellerBalanceBefore, result) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const sellerBalanceAfter = await getBalanceCents(sellerId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  assert(result.ok, 'Single release should not be rpc_error')

  assert(
    payoutHold.status === 'released' || !!payoutHold.released_at,
    `Payout hold should be released after single release, got status=${payoutHold.status}`
  )

  assertEqual(payoutCreditCount, 1, 'seller payout credit count after release_orphan_check')
  assertEqual(
    sellerBalanceAfter,
    sellerBalanceBefore + SELLER_PAYOUT_CENTS,
    'seller balance after release_orphan_check'
  )

  await assertNoOrphanState(bookingId, sellerId)
}

async function main() {
  const scenario = (process.argv.find((arg) => arg.startsWith('--scenario=')) || '').split('=')[1]

  const allowed = new Set([
    'double_release_same_hold',
    'release_then_release_again',
    'release_orphan_check',
  ])

  if (!scenario) {
    fail('Missing --scenario. Supported: double_release_same_hold, release_then_release_again, release_orphan_check')
  }

  if (!allowed.has(scenario)) {
    fail(`Invalid scenario: ${scenario}`)
  }

  const buyer = await findProfileByName(BUYER_NAME)
  const seller = await findProfileByName(SELLER_NAME, { mustBeSeller: true })

  if (!buyer.email) fail(`Buyer ${BUYER_NAME} has no email`)
  if (!seller.email) fail(`Seller ${SELLER_NAME} has no email`)
  if (!BUYER_EMAIL || !BUYER_PASSWORD) fail('Missing buyer credentials from PW_TEST_EMAIL / PW_TEST_PASSWORD')
  if (!SELLER_EMAIL) fail('Missing seller email from PW_TEST_SELLER_EMAIL')

  console.log(`--- SEED: PAYOUT RELEASE CONCURRENCY (${scenario.toUpperCase()}) ---`)
  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  const buyerClient = createAnonClient()
  const releaseClient1 = createAdminClient()
  const releaseClient2 = createAdminClient()

  try {
    await resetState([buyer.id, seller.id])
    await setSellerOnline(seller.id, true)
    await setBuyerBalance(buyer.id, 5000)
    console.log('Clean state ready')

    await signInBuyer(buyerClient)
    console.log('Buyer client authenticated')

    const bookingId = await createBookingWithHold(buyerClient, seller.id)
    console.log('Booking created with HOLD:', bookingId)

    const accepted = await acceptBooking(bookingId)
    console.log('Booking marked accepted:', accepted.id)

    const session = await waitForSession(bookingId)
    console.log('Session created:', session.id)

    const holdReady = await forceCompletedAndReleasable(session.id, bookingId)
    console.log('Payout hold ready for release:', holdReady.id)

    const sellerBalanceBefore = await getBalanceCents(seller.id)
    console.log('Seller balance before payout:', sellerBalanceBefore)

    if (scenario === 'double_release_same_hold') {
      const results = await Promise.all([
        callRunPayoutRelease(releaseClient1, 'release-call-1'),
        callRunPayoutRelease(releaseClient2, 'release-call-2'),
      ])

      logResults(results)
      await assertDoubleReleaseSameHold(bookingId, seller.id, sellerBalanceBefore, results)
    }

    if (scenario === 'release_then_release_again') {
      const first = await callRunPayoutRelease(releaseClient1, 'release-first-call')
      const second = await callRunPayoutRelease(releaseClient2, 'release-second-call', 25)

      logResults([first, second])
      await assertReleaseThenReleaseAgain(bookingId, seller.id, sellerBalanceBefore, first, second)
    }

    if (scenario === 'release_orphan_check') {
      const result = await callRunPayoutRelease(releaseClient1, 'single-release-call')

      logResults([result])
      await assertReleaseOrphanCheck(bookingId, seller.id, sellerBalanceBefore, result)
    }

    console.log('--- DONE ---')
  } finally {
    try {
      await buyerClient.auth.signOut()
    } catch {
      // ignore
    }

    await resetState([buyer.id, seller.id])
    await setSellerOnline(seller.id, true)
    await setBuyerBalance(buyer.id, 5000)
  }
}

await main()
