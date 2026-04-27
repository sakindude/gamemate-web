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

async function clearUserStrikes(userId) {
  const { error } = await admin
    .from('strikes')
    .delete()
    .eq('user_id', userId)

  failIfError('Failed to clear buyer strikes', error)
}

async function insertStrike({
  userId,
  reasonCode,
  points,
  note,
}) {
  const { error } = await admin
    .from('strikes')
    .insert({
      user_id: userId,
      session_id: null,
      booking_request_id: null,
      reason_code: reasonCode,
      points,
      note,
      expires_at: null,
      created_at: new Date().toISOString(),
    })

  failIfError(`Failed to insert strike (${reasonCode})`, error)
}

async function ensureBuyerRestricted(userId) {
  await clearUserStrikes(userId)

  await insertStrike({
    userId,
    reasonCode: 'no_show_buyer',
    points: 2,
    note: 'Seed enforcement test strike 1',
  })

  await insertStrike({
    userId,
    reasonCode: 'harassment',
    points: 3,
    note: 'Seed enforcement test strike 2',
  })

  const { data, error } = await admin.rpc('get_user_enforcement_state', {
    p_user_id: userId,
  })

  failIfError('Failed to verify buyer enforcement state', error)

  if (!data?.success) {
    fail('Buyer enforcement state RPC returned success=false')
  }

  const activeStrikePoints = Number(data.active_strike_points ?? 0)
  const enforcementState = String(data.enforcement_state || '')

  if (activeStrikePoints < 5) {
    fail(
      `Buyer did not reach restricted threshold. active_strike_points=${activeStrikePoints}`
    )
  }

  if (enforcementState !== 'restricted') {
    fail(
      `Buyer enforcement state is not restricted. enforcement_state=${enforcementState}`
    )
  }

  return data
}

async function clearPairBookingState(buyerId, sellerId) {
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

    failIfError('Dispute cleanup failed', disputesDeleteError)
  }

  if (payoutIds.length > 0) {
    const { error: payoutDeleteError } = await admin
      .from('payout_holds')
      .delete()
      .in('id', payoutIds)

    failIfError('Payout cleanup failed', payoutDeleteError)
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

  failIfError('Wallet cleanup failed', walletDeleteError)

  const { error: slotsDeleteError } = await admin
    .from('booking_request_slots')
    .delete()
    .in('request_id', bookingIds)

  if (
    slotsDeleteError &&
    !String(slotsDeleteError.message || '').includes('booking_request_slots')
  ) {
    failIfError('Booking slot cleanup failed', slotsDeleteError)
  }

  const { error: reviewsDeleteError } = await admin
    .from('reviews')
    .delete()
    .in('booking_request_id', bookingIds)

  if (
    reviewsDeleteError &&
    !String(reviewsDeleteError.message || '').includes('reviews')
  ) {
    failIfError('Review cleanup failed', reviewsDeleteError)
  }

  const { error: buyerReviewsDeleteError } = await admin
    .from('buyer_reviews')
    .delete()
    .in('booking_request_id', bookingIds)

  if (
    buyerReviewsDeleteError &&
    !String(buyerReviewsDeleteError.message || '').includes('buyer_reviews')
  ) {
    failIfError('Buyer review cleanup failed', buyerReviewsDeleteError)
  }

  const { error: bookingDeleteError } = await admin
    .from('booking_requests')
    .delete()
    .in('id', bookingIds)

  failIfError('Booking cleanup failed', bookingDeleteError)
}

async function run() {
  console.log('--- SEED: ENFORCEMENT RESTRICTED BUYER ---')

  const buyer = await getProfileByUsername(BUYER_NAME)
  const seller = await getProfileByUsername(SELLER_NAME)

  console.log(`Buyer: ${buyer.username} ${buyer.id}`)
  console.log(`Seller: ${seller.username} ${seller.id}`)

  await clearPairBookingState(buyer.id, seller.id)
  console.log('Pair booking/session state cleared')

  const enforcement = await ensureBuyerRestricted(buyer.id)

  console.log(`Buyer strike points: ${enforcement.active_strike_points}`)
  console.log(`Buyer enforcement state: ${enforcement.enforcement_state}`)
  console.log(`Next threshold: ${enforcement.next_threshold}`)
  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})