import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_EMAIL = process.env.GM_TEST_BUYER_EMAIL ?? 'gm_test_buyer@gmail.com'
const BUYER_PASSWORD = process.env.GM_TEST_BUYER_PASSWORD ?? '123456789'
const SELLER_EMAIL = process.env.GM_TEST_SELLER_EMAIL ?? 'gm_test_seller@gmail.com'

const BASE_PRICE_CENTS = 500
const TIP_CENTS = 0
const PROCESSING_FEE_CENTS = 0
const DURATION_MINUTES = 60
const GAME = 'Test Game'
const COMMUNICATION_METHOD = 'Discord'
const CURRENCY = 'USD'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  )
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const buyerAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function getProfileByEmail(email) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, display_name, balance_cents, is_online')
    .eq('email', email)
    .single()

  if (error) throw error
  return data
}

async function cleanupPendingBookingsForUser(column, userId) {
  const { data: rows, error } = await admin
    .from('booking_requests')
    .select('id')
    .eq(column, userId)
    .eq('status', 'pending')

  if (error) throw error

  const ids = (rows ?? []).map((row) => row.id)
  if (ids.length === 0) return []

  const { error: slotsError } = await admin
    .from('booking_request_slots')
    .delete()
    .in('request_id', ids)

  if (slotsError) throw slotsError

  const { error: walletError } = await admin
    .from('wallet_transactions')
    .delete()
    .in('booking_id', ids)

  if (walletError) throw walletError

  const { error: bookingError } = await admin
    .from('booking_requests')
    .delete()
    .in('id', ids)

  if (bookingError) throw bookingError

  return ids
}

async function cleanupBlockingSessionsForUser(roleColumn, userId) {
  const blockingStatuses = ['ready_to_start', 'active', 'awaiting_confirmation']

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('id, booking_request_id, status')
    .eq(roleColumn, userId)
    .in('status', blockingStatuses)

  if (error) throw error

  if (!sessions || sessions.length === 0) return []

  const sessionIds = sessions.map((s) => s.id)
  const bookingIds = sessions.map((s) => s.booking_request_id).filter(Boolean)

  const { error: eventsError } = await admin
    .from('session_events')
    .delete()
    .in('session_id', sessionIds)

  if (eventsError) throw eventsError

  const { error: disputesError } = await admin
    .from('disputes')
    .delete()
    .in('session_id', sessionIds)

  if (disputesError) throw disputesError

  const { error: holdsError } = await admin
    .from('payout_holds')
    .delete()
    .in('session_id', sessionIds)

  if (holdsError) throw holdsError

  const { error: sessionsError } = await admin
    .from('sessions')
    .delete()
    .in('id', sessionIds)

  if (sessionsError) throw sessionsError

  if (bookingIds.length > 0) {
    const { error: walletError } = await admin
      .from('wallet_transactions')
      .delete()
      .in('booking_id', bookingIds)

    if (walletError) throw walletError

    const { error: slotsError } = await admin
      .from('booking_request_slots')
      .delete()
      .in('request_id', bookingIds)

    if (slotsError) throw slotsError

    const { error: bookingsError } = await admin
      .from('booking_requests')
      .delete()
      .in('id', bookingIds)

    if (bookingsError) throw bookingsError
  }

  return sessionIds
}

async function createSeedPendingBooking({ buyerId, sellerId }) {
  const totalAmountCents = BASE_PRICE_CENTS + TIP_CENTS

  const { data, error } = await admin
    .from('booking_requests')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      status: 'pending',
      duration_minutes: DURATION_MINUTES,
      game: GAME,
      communication_method: COMMUNICATION_METHOD,
      currency: CURRENCY,
      total_price: totalAmountCents / 100,
      base_price_cents: BASE_PRICE_CENTS,
      tip_cents: TIP_CENTS,
      processing_fee_cents: PROCESSING_FEE_CENTS,
      platform_fee_cents: 0,
      total_amount_cents: totalAmountCents,
      seller_payout_cents: BASE_PRICE_CENTS,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

async function run() {
  console.log('--- SEED: CREATE BOOKING WITH HOLD BUYER HAS PENDING ---')

  const buyerBefore = await getProfileByEmail(BUYER_EMAIL)
  const sellerBefore = await getProfileByEmail(SELLER_EMAIL)

  assert(buyerBefore, `Buyer profile not found for ${BUYER_EMAIL}`)
  assert(sellerBefore, `Seller profile not found for ${SELLER_EMAIL}`)

  console.log('Buyer:', buyerBefore.display_name ?? buyerBefore.email, buyerBefore.id)
  console.log('Seller:', sellerBefore.display_name ?? sellerBefore.email, sellerBefore.id)

  const totalAmountCents = BASE_PRICE_CENTS + TIP_CENTS
  assert(
    (buyerBefore.balance_cents ?? 0) >= totalAmountCents,
    `Buyer balance is too low. Need at least ${totalAmountCents}, current: ${buyerBefore.balance_cents ?? 0}`
  )

  const { error: sellerOnlineError } = await admin
    .from('profiles')
    .update({ is_online: true })
    .eq('id', sellerBefore.id)

  if (sellerOnlineError) throw sellerOnlineError
  console.log('Seller forced online')

  const buyerPendingDeleted = await cleanupPendingBookingsForUser('buyer_id', buyerBefore.id)
  const sellerPendingDeleted = await cleanupPendingBookingsForUser('seller_id', sellerBefore.id)

  console.log('Buyer pending cleaned:', buyerPendingDeleted.length)
  console.log('Seller pending cleaned:', sellerPendingDeleted.length)

  const buyerBlockingDeleted = await cleanupBlockingSessionsForUser('buyer_id', buyerBefore.id)
  const sellerBlockingDeleted = await cleanupBlockingSessionsForUser('seller_id', sellerBefore.id)

  console.log('Buyer blocking sessions cleaned:', buyerBlockingDeleted.length)
  console.log('Seller blocking sessions cleaned:', sellerBlockingDeleted.length)

  const seededPending = await createSeedPendingBooking({
    buyerId: buyerBefore.id,
    sellerId: sellerBefore.id,
  })

  console.log('Seed pending booking created:', seededPending.id)

  const { data: signInData, error: signInError } = await buyerAnon.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (signInError) throw signInError
  assert(signInData?.session, 'Buyer session was not created after sign in')
  console.log('Buyer authenticated for create_booking_with_hold RPC')

  const buyerBalanceBefore = buyerBefore.balance_cents ?? 0

  const { data: rpcResult, error: rpcError } = await buyerAnon.rpc('create_booking_with_hold', {
    p_seller_id: sellerBefore.id,
    p_duration_minutes: DURATION_MINUTES,
    p_base_price_cents: BASE_PRICE_CENTS,
    p_tip_cents: TIP_CENTS,
    p_processing_fee_cents: PROCESSING_FEE_CENTS,
    p_game: GAME,
    p_communication_method: COMMUNICATION_METHOD,
    p_currency: CURRENCY,
  })

  if (rpcError) throw rpcError

  console.log('RPC result:', rpcResult)

  assert(rpcResult, 'RPC did not return a result object')
  assert(rpcResult.success === false, 'Expected success=false for buyer has pending')
  assert(
    rpcResult.message === 'You already have a pending booking request.',
    `Unexpected message: ${rpcResult.message}`
  )
  assert(!rpcResult.request_id, 'RPC should not return request_id when buyer already has pending')

  const buyerAfter = await getProfileByEmail(BUYER_EMAIL)
  const buyerBalanceAfter = buyerAfter.balance_cents ?? 0

  console.log('Buyer balance before RPC:', buyerBalanceBefore)
  console.log('Buyer balance after RPC:', buyerBalanceAfter)

  assert(
    buyerBalanceAfter === buyerBalanceBefore,
    `Buyer balance changed unexpectedly. Expected ${buyerBalanceBefore}, got ${buyerBalanceAfter}`
  )

  const { data: pendingRows, error: pendingRowsError } = await admin
    .from('booking_requests')
    .select('id, status')
    .eq('buyer_id', buyerBefore.id)
    .eq('status', 'pending')

  if (pendingRowsError) throw pendingRowsError

  console.log('Pending booking rows after RPC:', pendingRows?.length ?? 0)

  assert((pendingRows ?? []).length === 1, 'Expected exactly one pending booking to remain')
  assert(pendingRows[0].id === seededPending.id, 'Unexpected pending booking row after RPC')

  const { data: recentWalletRows, error: recentWalletRowsError } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', buyerBefore.id)
    .eq('tx_type', 'booking_hold')
    .order('created_at', { ascending: false })
    .limit(5)

  if (recentWalletRowsError) throw recentWalletRowsError

  const recentMatchingRows = (recentWalletRows ?? []).filter(
    (row) =>
      row.amount_cents === totalAmountCents &&
      row.direction === 'debit' &&
      row.status === 'posted' &&
      row.metadata?.seller_id === sellerBefore.id &&
      row.metadata?.game === GAME
  )

  console.log('Recent matching booking_hold rows:', recentMatchingRows.length)

  assert(
    recentMatchingRows.length === 0,
    'Unexpected booking_hold wallet transaction was created'
  )

  console.log('Buyer pending guard behavior verified')
  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
