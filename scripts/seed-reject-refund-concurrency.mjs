import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_NAME = (process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer').trim()
const BUYER_EMAIL = (process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com').trim()
const BUYER_PASSWORD = (
  process.env.PW_TEST_PASSWORD ||
  '123456789'
).trim()

const SELLER_NAME = (process.env.PW_TEST_SELLER_NAME || 'gm_test_seller').trim()
const SELLER_EMAIL = (process.env.PW_TEST_SELLER_EMAIL || 'gm_test_seller@gmail.com').trim()
const SELLER_PASSWORD = (
  process.env.PW_TEST_SELLER_PASSWORD ||
  process.env.PW_TEST_PASSWORD ||
  '123456789'
).trim()

const BASE_PRICE_CENTS = 500
const TIP_CENTS = 100
const PROCESSING_FEE_CENTS = 0
const TOTAL_AMOUNT_CENTS = BASE_PRICE_CENTS + TIP_CENTS

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  )
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
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

async function findProfileByName(name, { mustBeSeller = false } = {}) {
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('display_name', name)
    .limit(1)
    .maybeSingle()

  if (error) fail(`findProfileByName failed for ${name}: ${error.message}`)
  if (!data) fail(`Profile not found for "${name}"`)
  if (mustBeSeller && !data.is_seller) {
    fail(`${name} is not a seller`)
  }

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

async function getBuyerBalance(buyerId) {
  const { data, error } = await admin
    .from('profiles')
    .select('balance_cents')
    .eq('id', buyerId)
    .limit(1)
    .maybeSingle()

  if (error) fail(`getBuyerBalance failed: ${error.message}`)
  if (!data) fail(`Buyer profile missing while reading balance for ${buyerId}`)

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

async function signInSeller(client) {
  const { data, error } = await client.auth.signInWithPassword({
    email: SELLER_EMAIL,
    password: SELLER_PASSWORD,
  })

  if (error) fail(`Seller signInWithPassword failed: ${error.message}`)
  if (!data.session) fail('Seller auth session not created')
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

async function callReject(client, bookingId, label, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const { data, error } = await client.rpc('update_booking_request_status_with_refund', {
    p_request_id: bookingId,
    p_status: 'rejected',
  })

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
  if (result.data?.success === false) return 'failure'
  return 'success_or_null'
}

function logResults(results) {
  for (const result of results) {
    console.log(`[${result.label}] classification: ${classifyResult(result)}`)
    console.log(`[${result.label}] payload:`, result.data ?? result.error)
  }
}

async function getBooking(bookingId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (error) fail(`getBooking failed: ${error.message}`)
  return data
}

async function getBuyerWalletRows(buyerId, bookingId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', buyerId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) fail(`getBuyerWalletRows failed: ${error.message}`)
  return data || []
}

function countRefundRows(rows) {
  return rows.filter((row) => {
    const txType = row.tx_type || row.type
    const direction = row.direction
    return (
      direction === 'credit' &&
      (txType === 'booking_refund' ||
        txType === 'refund' ||
        txType === 'booking_reject_refund' ||
        txType === 'pending_refund')
    )
  }).length
}

function countHoldRows(rows) {
  return rows.filter((row) => row.tx_type === 'booking_hold' && row.direction === 'debit').length
}

async function assertNoOrphanState(buyerId, bookingId) {
  const booking = await getBooking(bookingId)
  const walletRows = await getBuyerWalletRows(buyerId, bookingId)

  assert(booking, `Booking ${bookingId} missing after reject flow`)
  assert(walletRows.length > 0, `Wallet rows missing for booking ${bookingId}`)

  const refundCount = countRefundRows(walletRows)
  const holdCount = countHoldRows(walletRows)

  assert(holdCount >= 1, `Original hold row missing for booking ${bookingId}`)
  assert(refundCount <= 1, `Duplicate refund rows detected for booking ${bookingId}`)
}

async function assertDoubleReject(bookingId, buyerId, buyerBalanceBefore, results) {
  const bookingAfter = await getBooking(bookingId)
  const buyerBalanceAfter = await getBuyerBalance(buyerId)
  const buyerWalletRows = await getBuyerWalletRows(buyerId, bookingId)

  const successLike = results.filter((r) => r.ok && r.data?.success !== false)
  const failureLike = results.filter((r) => !r.ok || r.data?.success === false)

  assert(successLike.length >= 1, 'At least one reject call should complete successfully')
  assert(failureLike.length <= 1, 'At most one reject call should fail/no-op')

  assertEqual(bookingAfter.status, 'rejected', 'booking status after double reject')

  const refundCount = countRefundRows(buyerWalletRows)
  assertEqual(refundCount, 1, 'refund row count after double reject')

  assertEqual(
    buyerBalanceAfter,
    buyerBalanceBefore + TOTAL_AMOUNT_CENTS,
    'buyer balance after double reject'
  )

  await assertNoOrphanState(buyerId, bookingId)
}

async function assertRejectThenReject(bookingId, buyerId, buyerBalanceBefore, first, second) {
  const bookingAfter = await getBooking(bookingId)
  const buyerBalanceAfter = await getBuyerBalance(buyerId)
  const buyerWalletRows = await getBuyerWalletRows(buyerId, bookingId)

  assert(first.ok, 'First reject call should not be rpc_error')
  assert(first.data?.success !== false, 'First reject call should complete successfully')

  if (second.ok && second.data && second.data.success === false) {
    console.log('Second reject call failed safely with message:', second.data.message)
  }

  assertEqual(bookingAfter.status, 'rejected', 'booking status after reject-then-reject')

  const refundCount = countRefundRows(buyerWalletRows)
  assertEqual(refundCount, 1, 'refund row count after reject-then-reject')

  assertEqual(
    buyerBalanceAfter,
    buyerBalanceBefore + TOTAL_AMOUNT_CENTS,
    'buyer balance after reject-then-reject'
  )

  await assertNoOrphanState(buyerId, bookingId)
}

async function assertSingleRejectOrphanCheck(bookingId, buyerId, buyerBalanceBefore, result) {
  const bookingAfter = await getBooking(bookingId)
  const buyerBalanceAfter = await getBuyerBalance(buyerId)
  const buyerWalletRows = await getBuyerWalletRows(buyerId, bookingId)

  assert(result.ok, 'Single reject should not be rpc_error')
  assert(result.data?.success !== false, 'Single reject should complete successfully')
  assertEqual(bookingAfter.status, 'rejected', 'booking status after single reject')

  const refundCount = countRefundRows(buyerWalletRows)
  assertEqual(refundCount, 1, 'refund row count after single reject')

  assertEqual(
    buyerBalanceAfter,
    buyerBalanceBefore + TOTAL_AMOUNT_CENTS,
    'buyer balance after single reject'
  )

  await assertNoOrphanState(buyerId, bookingId)
}

async function main() {
  const scenario = (process.argv.find((arg) => arg.startsWith('--scenario=')) || '').split('=')[1]

  const allowed = new Set([
    'double_reject_same_booking',
    'reject_then_reject_again',
    'single_reject_orphan_check',
  ])

  if (!scenario) {
    fail('Missing --scenario. Supported: double_reject_same_booking, reject_then_reject_again, single_reject_orphan_check')
  }

  if (!allowed.has(scenario)) {
    fail(`Invalid scenario: ${scenario}`)
  }

  const buyer = await findProfileByName(BUYER_NAME)
  const seller = await findProfileByName(SELLER_NAME, { mustBeSeller: true })

  if (!buyer.email) fail(`Buyer ${BUYER_NAME} has no email`)
  if (!seller.email) fail(`Seller ${SELLER_NAME} has no email`)
  if (!BUYER_EMAIL || !BUYER_PASSWORD) {
    fail('Missing buyer credentials from PW_TEST_EMAIL / PW_TEST_PASSWORD')
  }
  if (!SELLER_EMAIL || !SELLER_PASSWORD) {
    fail('Missing seller credentials from PW_TEST_SELLER_EMAIL / PW_TEST_SELLER_PASSWORD / PW_TEST_PASSWORD')
  }

  console.log(`--- SEED: REJECT REFUND CONCURRENCY (${scenario.toUpperCase()}) ---`)
  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  const buyerClient = createAnonClient()
  const sellerClient1 = createAnonClient()
  const sellerClient2 = createAnonClient()

  try {
    await resetState([buyer.id, seller.id])
    await setSellerOnline(seller.id, true)
    await setBuyerBalance(buyer.id, 5000)
    console.log('Clean state ready')

    await signInBuyer(buyerClient)
    console.log('Buyer client authenticated')

    const bookingId = await createBookingWithHold(buyerClient, seller.id)
    console.log('Booking created with HOLD:', bookingId)

    const buyerBalanceBeforeRefund = await getBuyerBalance(buyer.id)
    console.log('Buyer balance before refund action:', buyerBalanceBeforeRefund)

    await signInSeller(sellerClient1)
    console.log('Seller client 1 authenticated')

    await signInSeller(sellerClient2)
    console.log('Seller client 2 authenticated')

    if (scenario === 'double_reject_same_booking') {
      const results = await Promise.all([
        callReject(sellerClient1, bookingId, 'reject-call-1'),
        callReject(sellerClient2, bookingId, 'reject-call-2'),
      ])

      logResults(results)
      await assertDoubleReject(bookingId, buyer.id, buyerBalanceBeforeRefund, results)
    }

    if (scenario === 'reject_then_reject_again') {
      const first = await callReject(sellerClient1, bookingId, 'reject-first-call')
      const second = await callReject(sellerClient2, bookingId, 'reject-second-call', 25)

      logResults([first, second])
      await assertRejectThenReject(bookingId, buyer.id, buyerBalanceBeforeRefund, first, second)
    }

    if (scenario === 'single_reject_orphan_check') {
      const result = await callReject(sellerClient1, bookingId, 'single-reject-call')

      logResults([result])
      await assertSingleRejectOrphanCheck(bookingId, buyer.id, buyerBalanceBeforeRefund, result)
    }

    console.log('--- DONE ---')
  } finally {
    try {
      await buyerClient.auth.signOut()
    } catch {
      // ignore
    }

    try {
      await sellerClient1.auth.signOut()
    } catch {
      // ignore
    }

    try {
      await sellerClient2.auth.signOut()
    } catch {
      // ignore
    }

    await resetState([buyer.id, seller.id])
    await setSellerOnline(seller.id, true)
    await setBuyerBalance(buyer.id, 5000)
  }
}

await main()
