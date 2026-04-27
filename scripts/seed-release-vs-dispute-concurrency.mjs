import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_NAME = (process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer').trim()
const BUYER_EMAIL = (process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com').trim()
const BUYER_PASSWORD = (process.env.PW_TEST_PASSWORD || '123456789').trim()

const SELLER_NAME = (process.env.PW_TEST_SELLER_NAME || 'gm_test_seller').trim()

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

async function createDisputeAndFreeze({ bookingId, sessionId, payoutHoldId, buyerId, sellerId }) {
  const { data: disputeRow, error: disputeInsertError } = await admin
    .from('disputes')
    .insert({
      booking_request_id: bookingId,
      session_id: sessionId,
      payout_hold_id: payoutHoldId,
      opened_by_user_id: buyerId,
      target_user_id: sellerId,
      reason_code: 'technical_problem',
      description: 'Concurrency race dispute seed',
      evidence: {},
      status: 'open',
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
    })
    .select('id, status, payout_hold_id')
    .single()

  if (disputeInsertError) {
    return {
      ok: false,
      kind: 'insert_error',
      error: disputeInsertError.message,
      data: null,
    }
  }

  const { data: linkedPayoutHold, error: linkedPayoutHoldError } = await admin
    .from('payout_holds')
    .update({
      dispute_id: disputeRow.id,
      notes: 'Concurrency race dispute link',
    })
    .eq('id', payoutHoldId)
    .is('released_at', null)
    .neq('status', 'released')
    .select('*')
    .maybeSingle()

  if (linkedPayoutHoldError) {
    return {
      ok: false,
      kind: 'link_error',
      error: linkedPayoutHoldError.message,
      data: disputeRow,
    }
  }

  const { data: disputedSession, error: disputedSessionError } = await admin
    .from('sessions')
    .update({
      status: 'disputed',
    })
    .eq('id', sessionId)
    .neq('status', 'disputed')
    .select('id, status')
    .maybeSingle()

  if (disputedSessionError) {
    return {
      ok: false,
      kind: 'session_update_error',
      error: disputedSessionError.message,
      data: {
        dispute: disputeRow,
        linkedPayoutHold,
      },
    }
  }

  return {
    ok: true,
    kind: 'dispute_result',
    error: null,
    data: {
      dispute: disputeRow,
      linkedPayoutHold,
      disputedSession,
    },
  }
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

async function getSessionById(sessionId) {
  const { data, error } = await admin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) fail(`getSessionById failed: ${error.message}`)
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

async function callDisputeFreeze(args, label, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const result = await createDisputeAndFreeze(args)

  return {
    label,
    ok: result.ok,
    kind: result.kind,
    error: result.error,
    data: result.data,
  }
}

function classifyResult(result) {
  if (!result.ok) return result.kind || 'error'
  return result.kind || 'success'
}

function logResults(results) {
  for (const result of results) {
    console.log(`[${result.label}] classification: ${classifyResult(result)}`)
    console.log(`[${result.label}] payload:`, result.data ?? result.error)
  }
}

async function assertNoOrphanState({ bookingId, sellerId }) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  if (payoutHold.status === 'released' || payoutHold.released_at) {
    assertEqual(payoutCreditCount, 1, 'released payout_hold must have exactly one seller payout credit')
    assert(
      !payoutHold.dispute_id,
      'released payout_hold must not still be dispute-linked'
    )
  }

  if (payoutHold.dispute_id) {
    assertEqual(payoutCreditCount, 0, 'dispute-linked payout_hold must not have seller payout credit')
    assert(
      payoutHold.status !== 'released' && !payoutHold.released_at,
      'dispute-linked payout_hold must not also be released'
    )
  }

  if (payoutCreditCount > 0) {
    assert(
      payoutHold.status === 'released' || !!payoutHold.released_at,
      'seller payout credit exists but payout_hold is not marked released'
    )
  }
}

async function assertRaceOutcome({ bookingId, sessionId, sellerId, sellerBalanceBefore }) {
  const payoutHold = await getPayoutHoldByBooking(bookingId)
  const sessionAfter = await getSessionById(sessionId)
  const sellerWalletRows = await getSellerWalletRows(sellerId, bookingId)
  const sellerBalanceAfter = await getBalanceCents(sellerId)
  const payoutCreditCount = countSellerPayoutCredits(sellerWalletRows)

  const released = payoutHold.status === 'released' || !!payoutHold.released_at
  const disputeLinked = !!payoutHold.dispute_id

  assert(
    released || disputeLinked,
    `Race ended with neither release nor dispute linkage. payout_hold status=${payoutHold.status}`
  )

  assert(
    !(released && disputeLinked),
    'Contradiction: payout_hold cannot be both released and dispute-linked'
  )

  if (released) {
    assertEqual(payoutCreditCount, 1, 'released race outcome payout credit count')
    assertEqual(
      sellerBalanceAfter,
      sellerBalanceBefore + SELLER_PAYOUT_CENTS,
      'seller balance after released race outcome'
    )
    assert(
      sessionAfter.status !== 'disputed',
      `Released outcome should not leave session disputed, got ${sessionAfter.status}`
    )
  }

  if (disputeLinked) {
    assertEqual(payoutCreditCount, 0, 'disputed race outcome payout credit count')
    assertEqual(
      sellerBalanceAfter,
      sellerBalanceBefore,
      'seller balance after disputed race outcome'
    )
    assertEqual(sessionAfter.status, 'disputed', 'session status after disputed race outcome')
  }

  await assertNoOrphanState({ bookingId, sellerId })
}

async function main() {
  const scenario = (process.argv.find((arg) => arg.startsWith('--scenario=')) || '').split('=')[1]

  const allowed = new Set([
    'release_vs_dispute_parallel',
    'dispute_then_release_immediate',
    'release_orphan_check_under_race',
  ])

  if (!scenario) {
    fail('Missing --scenario. Supported: release_vs_dispute_parallel, dispute_then_release_immediate, release_orphan_check_under_race')
  }

  if (!allowed.has(scenario)) {
    fail(`Invalid scenario: ${scenario}`)
  }

  const buyer = await findProfileByName(BUYER_NAME)
  const seller = await findProfileByName(SELLER_NAME, { mustBeSeller: true })

  if (!buyer.email) fail(`Buyer ${BUYER_NAME} has no email`)
  if (!BUYER_EMAIL || !BUYER_PASSWORD) fail('Missing buyer credentials from PW_TEST_EMAIL / PW_TEST_PASSWORD')

  console.log(`--- SEED: RELEASE VS DISPUTE CONCURRENCY (${scenario.toUpperCase()}) ---`)
  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  const buyerClient = createAnonClient()
  const releaseClient = createAdminClient()

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

    const payoutHold = await forceCompletedAndReleasable(session.id, bookingId)
    console.log('Payout hold ready for release:', payoutHold.id)

    const sellerBalanceBefore = await getBalanceCents(seller.id)
    console.log('Seller balance before race:', sellerBalanceBefore)

    const disputeArgs = {
      bookingId,
      sessionId: session.id,
      payoutHoldId: payoutHold.id,
      buyerId: buyer.id,
      sellerId: seller.id,
    }

    let results = []

    if (scenario === 'release_vs_dispute_parallel') {
      results = await Promise.all([
        callRunPayoutRelease(releaseClient, 'release-call'),
        callDisputeFreeze(disputeArgs, 'dispute-call'),
      ])
    }

    if (scenario === 'dispute_then_release_immediate') {
      const first = await callDisputeFreeze(disputeArgs, 'dispute-first-call')
      const second = await callRunPayoutRelease(releaseClient, 'release-second-call', 25)
      results = [first, second]
    }

    if (scenario === 'release_orphan_check_under_race') {
      results = await Promise.all([
        callRunPayoutRelease(releaseClient, 'release-call'),
        callDisputeFreeze(disputeArgs, 'dispute-call'),
      ])
    }

    logResults(results)
    await assertRaceOutcome({
      bookingId,
      sessionId: session.id,
      sellerId: seller.id,
      sellerBalanceBefore,
    })

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
