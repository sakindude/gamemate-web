import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUYER_NAME = process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer'
const SELLER_NAME = process.env.PW_TEST_SELLER_NAME || 'gm_test_seller'

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

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

function failIfError(prefix, error) {
  if (error) {
    throw new Error(`${prefix}: ${error.message}`)
  }
}

async function getProfileByUsername(username) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, balance_cents, is_online')
    .eq('username', username)
    .single()

  failIfError(`Profile lookup failed for ${username}`, error)

  if (!data?.id) {
    fail(`Profile not found for ${username}`)
  }

  return data
}

async function clearUserStrikes(userId) {
  const { error } = await admin
    .from('strikes')
    .delete()
    .eq('user_id', userId)

  failIfError(`Failed to clear strikes for ${userId}`, error)
}

async function clearPairState(buyerId, sellerId) {
  const { data: bookingRows, error: bookingError } = await admin
    .from('booking_requests')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)

  failIfError('Booking cleanup lookup failed', bookingError)

  const bookingIds = (bookingRows || []).map((row) => row.id)

  const { data: sessionRows, error: sessionLookupError } = await admin
    .from('sessions')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)

  failIfError('Session cleanup lookup failed', sessionLookupError)

  const sessionIds = (sessionRows || []).map((row) => row.id)

  if (sessionIds.length > 0) {
    const { error: sessionEventsDeleteError } = await admin
      .from('session_events')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Session events cleanup failed', sessionEventsDeleteError)
  }

  if (bookingIds.length > 0) {
    const { data: disputeRows, error: disputeLookupError } = await admin
      .from('disputes')
      .select('id')
      .in('booking_request_id', bookingIds)

    failIfError('Dispute cleanup lookup failed', disputeLookupError)

    const disputeIds = (disputeRows || []).map((row) => row.id)

    if (disputeIds.length > 0) {
      const { error: disputesDeleteError } = await admin
        .from('disputes')
        .delete()
        .in('id', disputeIds)

      failIfError('Dispute cleanup failed', disputesDeleteError)
    }

    const { data: payoutRows, error: payoutLookupError } = await admin
      .from('payout_holds')
      .select('id')
      .in('booking_request_id', bookingIds)

    failIfError('Payout cleanup lookup failed', payoutLookupError)

    const payoutIds = (payoutRows || []).map((row) => row.id)

    if (payoutIds.length > 0) {
      const { error: payoutDeleteError } = await admin
        .from('payout_holds')
        .delete()
        .in('id', payoutIds)

      failIfError('Payout cleanup failed', payoutDeleteError)
    }

    const { error: walletDeleteError } = await admin
      .from('wallet_transactions')
      .delete()
      .in('booking_id', bookingIds)

    failIfError('Wallet cleanup failed', walletDeleteError)

    const { error: slotsDeleteError } = await admin
      .from('booking_request_slots')
      .delete()
      .in('request_id', bookingIds)

    if (
      slotsDeleteError &&
      !String(slotsDeleteError.message || '').includes('booking_request_slots')
    ) {
      failIfError('Booking slots cleanup failed', slotsDeleteError)
    }

    const { error: reviewsDeleteError } = await admin
      .from('reviews')
      .delete()
      .in('booking_request_id', bookingIds)

    if (
      reviewsDeleteError &&
      !String(reviewsDeleteError.message || '').includes('reviews')
    ) {
      failIfError('Reviews cleanup failed', reviewsDeleteError)
    }

    const { error: buyerReviewsDeleteError } = await admin
      .from('buyer_reviews')
      .delete()
      .in('booking_request_id', bookingIds)

    if (
      buyerReviewsDeleteError &&
      !String(buyerReviewsDeleteError.message || '').includes('buyer_reviews')
    ) {
      failIfError('Buyer reviews cleanup failed', buyerReviewsDeleteError)
    }
  }

  if (sessionIds.length > 0) {
    const { error: sessionDeleteError } = await admin
      .from('sessions')
      .delete()
      .in('id', sessionIds)

    failIfError('Session cleanup failed', sessionDeleteError)
  }

  if (bookingIds.length > 0) {
    const { error: bookingDeleteError } = await admin
      .from('booking_requests')
      .delete()
      .in('id', bookingIds)

    failIfError('Booking cleanup failed', bookingDeleteError)
  }
}

async function clearBuyerPendingAndBlocking(buyerId) {
  const { data: bookingRows, error: bookingError } = await admin
    .from('booking_requests')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('status', 'pending')

  failIfError('Buyer pending booking lookup failed', bookingError)

  const bookingIds = (bookingRows || []).map((row) => row.id)

  if (bookingIds.length > 0) {
    const { error: walletDeleteError } = await admin
      .from('wallet_transactions')
      .delete()
      .in('booking_id', bookingIds)

    failIfError('Buyer pending wallet cleanup failed', walletDeleteError)

    const { error: bookingDeleteError } = await admin
      .from('booking_requests')
      .delete()
      .in('id', bookingIds)

    failIfError('Buyer pending booking cleanup failed', bookingDeleteError)
  }

  const { data: sessionRows, error: sessionError } = await admin
    .from('sessions')
    .select('id')
    .eq('buyer_id', buyerId)
    .or(
      [
        'status.eq.ready_to_start',
        'status.eq.active',
        'and(status.eq.awaiting_confirmation,buyer_completed_at.is.null)',
      ].join(',')
    )

  failIfError('Buyer blocking session lookup failed', sessionError)

  const sessionIds = (sessionRows || []).map((row) => row.id)

  if (sessionIds.length > 0) {
    const { error: sessionEventsDeleteError } = await admin
      .from('session_events')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Buyer session event cleanup failed', sessionEventsDeleteError)

    const { error: payoutDeleteError } = await admin
      .from('payout_holds')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Buyer payout cleanup failed', payoutDeleteError)

    const { error: sessionDeleteError } = await admin
      .from('sessions')
      .delete()
      .in('id', sessionIds)

    failIfError('Buyer session cleanup failed', sessionDeleteError)
  }
}

async function clearSellerPendingAndBlocking(sellerId) {
  const { data: bookingRows, error: bookingError } = await admin
    .from('booking_requests')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('status', 'pending')

  failIfError('Seller pending booking lookup failed', bookingError)

  const bookingIds = (bookingRows || []).map((row) => row.id)

  if (bookingIds.length > 0) {
    const { error: walletDeleteError } = await admin
      .from('wallet_transactions')
      .delete()
      .in('booking_id', bookingIds)

    failIfError('Seller pending wallet cleanup failed', walletDeleteError)

    const { error: bookingDeleteError } = await admin
      .from('booking_requests')
      .delete()
      .in('id', bookingIds)

    failIfError('Seller pending booking cleanup failed', bookingDeleteError)
  }

  const { data: sessionRows, error: sessionError } = await admin
    .from('sessions')
    .select('id')
    .eq('seller_id', sellerId)
    .or(
      [
        'status.eq.ready_to_start',
        'status.eq.active',
        'and(status.eq.awaiting_confirmation,seller_completed_at.is.null)',
      ].join(',')
    )

  failIfError('Seller blocking session lookup failed', sessionError)

  const sessionIds = (sessionRows || []).map((row) => row.id)

  if (sessionIds.length > 0) {
    const { error: sessionEventsDeleteError } = await admin
      .from('session_events')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Seller session event cleanup failed', sessionEventsDeleteError)

    const { error: payoutDeleteError } = await admin
      .from('payout_holds')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Seller payout cleanup failed', payoutDeleteError)

    const { error: sessionDeleteError } = await admin
      .from('sessions')
      .delete()
      .in('id', sessionIds)

    failIfError('Seller session cleanup failed', sessionDeleteError)
  }
}

async function ensureSellerOnline(sellerId) {
  const { error } = await admin
    .from('profiles')
    .update({ is_online: true })
    .eq('id', sellerId)

  failIfError('Failed to force seller online', error)
}

async function ensureBuyerHasBalance(profileId, currentBalanceCents, requiredAmountCents) {
  const current = Number(currentBalanceCents ?? 0)

  if (current >= requiredAmountCents) {
    return current
  }

  const addAmount = requiredAmountCents - current + 10000
  const nextBalance = current + addAmount

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update({ balance_cents: nextBalance })
    .eq('id', profileId)

  failIfError('Buyer balance top-up failed', profileUpdateError)

  const { error: walletInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: profileId,
      tx_type: 'deposit',
      direction: 'credit',
      amount_cents: addAmount,
      currency: 'USD',
      status: 'posted',
      note: 'Seed top-up for booking success UI test',
      metadata: {
        source: 'seed-booking-success-ui',
      },
    })

  failIfError('Buyer top-up wallet transaction failed', walletInsertError)

  return nextBalance
}

async function verifyStates(buyerId, sellerId) {
  const { data: buyerState, error: buyerStateError } = await admin.rpc(
    'get_user_enforcement_state',
    { p_user_id: buyerId }
  )

  failIfError('Buyer enforcement state lookup failed', buyerStateError)

  const { data: sellerState, error: sellerStateError } = await admin.rpc(
    'get_user_enforcement_state',
    { p_user_id: sellerId }
  )

  failIfError('Seller enforcement state lookup failed', sellerStateError)

  if (String(buyerState?.enforcement_state || '') !== 'good') {
    fail(`Buyer is not in good state: ${JSON.stringify(buyerState)}`)
  }

  if (String(sellerState?.enforcement_state || '') !== 'good') {
    fail(`Seller is not in good state: ${JSON.stringify(sellerState)}`)
  }

  const { data: availability, error: availabilityError } = await admin.rpc(
    'get_seller_booking_availability',
    { p_seller_id: sellerId }
  )

  failIfError('Seller booking availability lookup failed', availabilityError)

  if (availability?.is_bookable !== true) {
    fail(`Seller is not bookable: ${JSON.stringify(availability)}`)
  }

  return { buyerState, sellerState, availability }
}

async function run() {
  console.log('--- SEED: BOOKING SUCCESS UI ---')

  const buyer = await getProfileByUsername(BUYER_NAME)
  const seller = await getProfileByUsername(SELLER_NAME)

  console.log(`Buyer: ${buyer.username} ${buyer.id}`)
  console.log(`Seller: ${seller.username} ${seller.id}`)

  await clearPairState(buyer.id, seller.id)
  console.log('Pair state cleared')

  await clearBuyerPendingAndBlocking(buyer.id)
  console.log('Buyer pending/blocking state cleared')

  await clearSellerPendingAndBlocking(seller.id)
  console.log('Seller pending/blocking state cleared')

  await clearUserStrikes(buyer.id)
  await clearUserStrikes(seller.id)
  console.log('Buyer/seller strikes cleared')

  await ensureSellerOnline(seller.id)
  console.log('Seller forced online')

  const buyerBalance = await ensureBuyerHasBalance(
    buyer.id,
    buyer.balance_cents,
    20000
  )
  console.log(`Buyer balance ready: ${buyerBalance}`)

  const verification = await verifyStates(buyer.id, seller.id)
  console.log(`Buyer enforcement: ${verification.buyerState.enforcement_state}`)
  console.log(`Seller enforcement: ${verification.sellerState.enforcement_state}`)
  console.log(`Seller bookable: ${verification.availability.is_bookable}`)

  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})