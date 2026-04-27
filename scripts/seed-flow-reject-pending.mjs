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
    .select('id, username, balance_cents')
    .eq('username', username)
    .single()

  failIfError(`Profile lookup failed for ${username}`, error)

  if (!data?.id) {
    fail(`Profile not found for ${username}`)
  }

  return data
}

async function cleanupPairState(buyerId, sellerId) {
  const { data: bookingRows, error: bookingError } = await admin
    .from('booking_requests')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)

  failIfError('Booking cleanup lookup failed', bookingError)

  const bookingIds = (bookingRows || []).map((row) => row.id)

  if (bookingIds.length === 0) {
    return
  }

  const { data: sessionRows, error: sessionLookupError } = await admin
    .from('sessions')
    .select('id')
    .in('booking_request_id', bookingIds)

  failIfError('Session cleanup lookup failed', sessionLookupError)

  const sessionIds = (sessionRows || []).map((row) => row.id)

  if (sessionIds.length > 0) {
    const { error: sessionEventsDeleteError } = await admin
      .from('session_events')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Session events cleanup failed', sessionEventsDeleteError)

    const { error: sessionDeleteError } = await admin
      .from('sessions')
      .delete()
      .in('id', sessionIds)

    failIfError('Session cleanup failed', sessionDeleteError)
  }

  const { error: payoutDeleteError } = await admin
    .from('payout_holds')
    .delete()
    .in('booking_request_id', bookingIds)

  failIfError('Payout hold cleanup failed', payoutDeleteError)

  const { error: disputeDeleteError } = await admin
    .from('disputes')
    .delete()
    .in('booking_request_id', bookingIds)

  if (
    disputeDeleteError &&
    !String(disputeDeleteError.message || '').includes('booking_request_id')
  ) {
    failIfError('Dispute cleanup failed', disputeDeleteError)
  }

  const { error: walletDeleteError } = await admin
    .from('wallet_transactions')
    .delete()
    .in('booking_id', bookingIds)

  failIfError('Wallet transaction cleanup failed', walletDeleteError)

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

  const { error: bookingDeleteError } = await admin
    .from('booking_requests')
    .delete()
    .in('id', bookingIds)

  failIfError('Booking cleanup delete failed', bookingDeleteError)
}

async function ensureBuyerHasBalance(profileId, currentBalanceCents, requiredAmountCents) {
  const current = Number(currentBalanceCents ?? 0)

  if (current >= requiredAmountCents) {
    return current
  }

  const addAmount = requiredAmountCents - current + 5000
  const nextBalance = current + addAmount

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update({ balance_cents: nextBalance })
    .eq('id', profileId)

  failIfError('Buyer balance top-up profile update failed', profileUpdateError)

  const { error: walletInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: profileId,
      tx_type: 'deposit',
      direction: 'credit',
      amount_cents: addAmount,
      currency: 'USD',
      status: 'posted',
      note: 'Seed top-up for reject/refund pending flow',
      metadata: {
        source: 'seed-flow-reject-pending',
      },
    })

  failIfError('Buyer balance top-up transaction insert failed', walletInsertError)

  return nextBalance
}

async function createPendingBookingAndHold({ buyerId, sellerId, buyerBalanceCents }) {
  const basePriceCents = 500
  const tipCents = 100
  const processingFeeCents = 0
  const platformFeeCents = 0
  const totalAmountCents = basePriceCents + tipCents
  const sellerPayoutCents = basePriceCents + tipCents
  const totalPrice = totalAmountCents / 100

  if (buyerBalanceCents < totalAmountCents) {
    fail(
      `Buyer balance still insufficient after top-up. balance=${buyerBalanceCents}, needed=${totalAmountCents}`
    )
  }

  const nextBuyerBalance = buyerBalanceCents - totalAmountCents

  const { error: buyerBalanceUpdateError } = await admin
    .from('profiles')
    .update({ balance_cents: nextBuyerBalance })
    .eq('id', buyerId)

  failIfError('Buyer balance hold update failed', buyerBalanceUpdateError)

  const { data: booking, error: bookingInsertError } = await admin
    .from('booking_requests')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      total_price: totalPrice,
      status: 'pending',
      created_at: new Date().toISOString(),
      game: 'World of Warcraft',
      communication_method: 'Discord',
      completed_at: null,
      buyer_confirmed_at: null,
      currency: 'USD',
      base_price_cents: basePriceCents,
      tip_cents: tipCents,
      processing_fee_cents: processingFeeCents,
      total_amount_cents: totalAmountCents,
      platform_fee_cents: platformFeeCents,
      seller_payout_cents: sellerPayoutCents,
      duration_minutes: 60,
    })
    .select('*')
    .single()

  failIfError('Pending booking insert failed', bookingInsertError)

  if (!booking?.id) {
    fail('Pending booking insert returned no row')
  }

  const { error: walletHoldInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: buyerId,
      booking_id: booking.id,
      tx_type: 'booking_hold',
      direction: 'debit',
      amount_cents: totalAmountCents,
      currency: 'USD',
      status: 'posted',
      note: 'Balance reserved for booking request',
      metadata: {
        booking_request_id: booking.id,
        seller_id: sellerId,
        duration_minutes: 60,
        game: 'World of Warcraft',
        source: 'seed-flow-reject-pending',
      },
    })

  failIfError('Booking hold wallet transaction insert failed', walletHoldInsertError)

  const { data: payoutHold, error: payoutHoldInsertError } = await admin
    .from('payout_holds')
    .insert({
      booking_request_id: booking.id,
      session_id: null,
      buyer_id: buyerId,
      seller_id: sellerId,
      currency: 'USD',
      base_price_cents: basePriceCents,
      tip_cents: tipCents,
      processing_fee_cents: processingFeeCents,
      platform_fee_cents: platformFeeCents,
      total_amount_cents: totalAmountCents,
      seller_payout_cents: sellerPayoutCents,
      refundable_amount_cents: totalAmountCents,
      status: 'held',
      held_at: new Date().toISOString(),
      notes: 'Seeded pending reject/refund flow hold',
    })
    .select('*')
    .single()

  failIfError('Payout hold insert failed', payoutHoldInsertError)

  if (!payoutHold?.id) {
    fail('Payout hold insert returned no row')
  }

  return { booking, payoutHold }
}

async function run() {
  console.log('--- SEED: FLOW REJECT PENDING ---')

  const buyer = await getProfileByUsername(BUYER_NAME)
  const seller = await getProfileByUsername(SELLER_NAME)

  console.log(`Buyer: ${buyer.username} ${buyer.id}`)
  console.log(`Seller: ${seller.username} ${seller.id}`)

  await cleanupPairState(buyer.id, seller.id)
  console.log('Clean state ready')

  const buyerBalanceAfterTopUp = await ensureBuyerHasBalance(
    buyer.id,
    buyer.balance_cents,
    615
  )

  const { booking, payoutHold } = await createPendingBookingAndHold({
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerBalanceCents: buyerBalanceAfterTopUp,
  })

  console.log(`Pending created: ${booking.id}`)
  console.log(`Pending status: ${booking.status}`)
  console.log(`Payout hold found: ${payoutHold.id}`)
  console.log(`Payout hold status: ${payoutHold.status}`)

  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
