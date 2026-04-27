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

  const { data: disputeRows, error: disputeLookupError } = await admin
    .from('disputes')
    .select('id')
    .in('booking_request_id', bookingIds)

  failIfError('Dispute cleanup lookup failed', disputeLookupError)

  const disputeIds = (disputeRows || []).map((row) => row.id)

  const { data: payoutRows, error: payoutLookupError } = await admin
    .from('payout_holds')
    .select('id, session_id')
    .in('booking_request_id', bookingIds)

  failIfError('Payout cleanup lookup failed', payoutLookupError)

  const payoutIds = (payoutRows || []).map((row) => row.id)
  const sessionIds = [...new Set((payoutRows || []).map((row) => row.session_id).filter(Boolean))]

  if (sessionIds.length > 0) {
    const { error: sessionEventsDeleteError } = await admin
      .from('session_events')
      .delete()
      .in('session_id', sessionIds)

    failIfError('Session events cleanup failed', sessionEventsDeleteError)
  }

  if (disputeIds.length > 0) {
    const { error: disputesDeleteError } = await admin
      .from('disputes')
      .delete()
      .in('id', disputeIds)

    failIfError('Dispute cleanup delete failed', disputesDeleteError)
  }

  if (payoutIds.length > 0) {
    const { error: payoutDeleteError } = await admin
      .from('payout_holds')
      .delete()
      .in('id', payoutIds)

    failIfError('Payout hold cleanup failed', payoutDeleteError)
  }

  if (sessionIds.length > 0) {
    const { error: sessionDeleteError } = await admin
      .from('sessions')
      .delete()
      .in('id', sessionIds)

    failIfError('Session cleanup failed', sessionDeleteError)
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

  const { data: updatedProfile, error: updatedProfileError } = await admin
    .from('profiles')
    .select('balance_cents')
    .eq('id', profileId)
    .single()

  failIfError('Buyer balance top-up profile re-read failed', updatedProfileError)

  const balanceAfterCents = Number(updatedProfile?.balance_cents ?? 0)

  const { error: walletInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: profileId,
      tx_type: 'deposit',
      direction: 'credit',
      amount_cents: addAmount,
      amount: addAmount / 100,
      balance_after: balanceAfterCents / 100,
      currency: 'USD',
      status: 'posted',
      note: 'Seed top-up for dispute resolve partial flow',
      metadata: {
        source: 'seed-flow-dispute-resolve-partial',
      },
    })

  failIfError('Buyer balance top-up transaction insert failed', walletInsertError)

  return balanceAfterCents
}

async function createDisputedFlow({ buyerId, sellerId, buyerBalanceCents }) {
  const basePriceCents = 500
  const tipCents = 100
  const processingFeeCents = 0
  const platformFeeCents = 0
  const totalAmountCents = basePriceCents + tipCents
  const sellerPayoutCents = basePriceCents + tipCents - platformFeeCents
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

  const now = Date.now()
  const createdAt = new Date(now - 30 * 60 * 60 * 1000).toISOString()
  const startedAt = new Date(now - 28 * 60 * 60 * 1000).toISOString()
  const buyerCompletedAt = new Date(now - 27 * 60 * 60 * 1000).toISOString()
  const sellerCompletedAt = new Date(now - 27 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString()
  const completedAt = new Date(now - 27 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString()
  const disputeOpenedAt = new Date(now - 26 * 60 * 60 * 1000).toISOString()
  const plannedEndAt = new Date(now - 27 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString()
  const disputeDeadlineAt = new Date(now - 25 * 60 * 60 * 1000).toISOString()

  const { data: booking, error: bookingInsertError } = await admin
    .from('booking_requests')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      total_price: totalPrice,
      status: 'accepted',
      created_at: createdAt,
      game: 'World of Warcraft',
      communication_method: 'Discord',
      completed_at: completedAt,
      buyer_confirmed_at: completedAt,
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

  failIfError('Booking insert failed', bookingInsertError)

  if (!booking?.id) {
    fail('Booking insert returned no row')
  }

  const { error: walletHoldInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: buyerId,
      booking_id: booking.id,
      tx_type: 'booking_hold',
      direction: 'debit',
      amount_cents: totalAmountCents,
      amount: totalAmountCents / 100,
      balance_after: nextBuyerBalance / 100,
      currency: 'USD',
      status: 'posted',
      note: 'Balance reserved for booking request',
      metadata: {
        booking_request_id: booking.id,
        seller_id: sellerId,
        duration_minutes: 60,
        game: 'World of Warcraft',
        source: 'seed-flow-dispute-resolve-partial',
      },
    })

  failIfError('Booking hold wallet transaction insert failed', walletHoldInsertError)

  const { data: session, error: sessionInsertError } = await admin
    .from('sessions')
    .insert({
      booking_request_id: booking.id,
      buyer_id: buyerId,
      seller_id: sellerId,
      status: 'disputed',
      started_at: startedAt,
      ended_at: completedAt,
      completed_at: completedAt,
      buyer_started_at: startedAt,
      seller_started_at: startedAt,
      buyer_completed_at: buyerCompletedAt,
      seller_completed_at: sellerCompletedAt,
      auto_complete_at: null,
      dispute_deadline_at: disputeDeadlineAt,
      duration_minutes: 60,
      planned_end_at: plannedEndAt,
      created_at: createdAt,
      updated_at: disputeOpenedAt,
    })
    .select('*')
    .single()

  failIfError('Session insert failed', sessionInsertError)

  if (!session?.id) {
    fail('Session insert returned no row')
  }

  const { data: dispute, error: disputeInsertError } = await admin
    .from('disputes')
    .insert({
      booking_request_id: booking.id,
      session_id: session.id,
      opened_by_user_id: buyerId,
      status: 'open',
      reason_code: 'different_from_profile',
      description: 'Seeded dispute resolution test - partial path',
      created_at: disputeOpenedAt,
      updated_at: disputeOpenedAt,
    })
    .select('*')
    .single()

  failIfError('Dispute insert failed', disputeInsertError)

  if (!dispute?.id) {
    fail('Dispute insert returned no row')
  }

  const { data: payoutHold, error: payoutHoldInsertError } = await admin
    .from('payout_holds')
    .insert({
      booking_request_id: booking.id,
      session_id: session.id,
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
      status: 'disputed',
      held_at: createdAt,
      releasable_at: null,
      released_at: null,
      refunded_at: null,
      dispute_id: dispute.id,
      notes: 'Seeded dispute resolve partial flow hold',
    })
    .select('*')
    .single()

  failIfError('Payout hold insert failed', payoutHoldInsertError)

  if (!payoutHold?.id) {
    fail('Payout hold insert returned no row')
  }

  const sessionEvents = [
    {
      session_id: session.id,
      event_type: 'session_created',
      actor_user_id: null,
      entity_id: booking.id,
      metadata: {
        booking_request_id: booking.id,
        status: 'ready_to_start',
        duration_minutes: 60,
      },
    },
    {
      session_id: session.id,
      event_type: 'session_activated',
      actor_user_id: null,
      entity_id: null,
      metadata: {
        activated_at: startedAt,
        duration_minutes: 60,
        planned_end_at: plannedEndAt,
      },
    },
    {
      session_id: session.id,
      event_type: 'buyer_completed',
      actor_user_id: buyerId,
      entity_id: null,
      metadata: {
        side: 'buyer',
      },
    },
    {
      session_id: session.id,
      event_type: 'seller_completed',
      actor_user_id: sellerId,
      entity_id: null,
      metadata: {
        side: 'seller',
      },
    },
    {
      session_id: session.id,
      event_type: 'session_completed',
      actor_user_id: null,
      entity_id: null,
      metadata: {
        completed_at: completedAt,
        dispute_deadline_at: disputeDeadlineAt,
      },
    },
    {
      session_id: session.id,
      event_type: 'dispute_opened',
      actor_user_id: buyerId,
      entity_id: dispute.id,
      metadata: {
        dispute_id: dispute.id,
        reason_code: 'different_from_profile',
      },
    },
  ]

  const { error: sessionEventsInsertError } = await admin
    .from('session_events')
    .insert(sessionEvents)

  failIfError('Session events insert failed', sessionEventsInsertError)

  return { booking, session, dispute, payoutHold }
}

async function run() {
  console.log('--- SEED: FLOW DISPUTE RESOLVE PARTIAL ---')

  const buyer = await getProfileByUsername(BUYER_NAME)
  const seller = await getProfileByUsername(SELLER_NAME)

  console.log(`Buyer: ${buyer.username} ${buyer.id}`)
  console.log(`Seller: ${seller.username} ${seller.id}`)

  await cleanupPairState(buyer.id, seller.id)
  console.log('Clean state ready')

  const buyerBalanceAfterTopUp = await ensureBuyerHasBalance(
    buyer.id,
    buyer.balance_cents,
    600
  )

  const { booking, session, dispute, payoutHold } = await createDisputedFlow({
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerBalanceCents: buyerBalanceAfterTopUp,
  })

  console.log(`Booking created: ${booking.id}`)
  console.log(`Booking status: ${booking.status}`)
  console.log(`Session created: ${session.id}`)
  console.log(`Session status: ${session.status}`)
  console.log(`Dispute created: ${dispute.id}`)
  console.log(`Dispute status: ${dispute.status}`)
  console.log(`Payout hold found: ${payoutHold.id}`)
  console.log(`Payout hold status: ${payoutHold.status}`)
  console.log(`Expected seller payout cents: ${payoutHold.seller_payout_cents}`)
  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})