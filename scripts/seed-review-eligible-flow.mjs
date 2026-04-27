// FILE START: scripts/seed-review-eligible-flow.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const BUYER_NAME = (process.env.PW_TEST_BUYER_NAME || 'gm_test_buyer').trim()
const BUYER_EMAIL = (process.env.PW_TEST_EMAIL || 'gm_test_buyer@gmail.com').trim()
const BUYER_PASSWORD = (process.env.PW_TEST_PASSWORD || '123456789').trim()

const SELLER_NAME = (process.env.PW_TEST_SELLER_NAME || 'gm_test_seller').trim()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const buyerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function findProfileIdByDisplayName(displayName) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('display_name', displayName)
    .maybeSingle()

  if (error) throw error
  if (!data?.id) {
    throw new Error(`Profile not found for display_name="${displayName}"`)
  }

  return data.id
}

async function signInBuyer() {
  const { data, error } = await buyerClient.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (error) throw error
  if (!data?.user?.id) {
    throw new Error('Buyer login failed')
  }

  return data.user.id
}

async function clearUserStrikes(userId) {
  const { error } = await admin
    .from('strikes')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}

async function verifyUserEnforcementIsGood(userId, label) {
  const { data, error } = await admin.rpc('get_user_enforcement_state', {
    p_user_id: userId,
  })

  if (error) throw error

  const enforcementState = String(data?.enforcement_state || 'unknown')
  const activeStrikePoints = Number(data?.active_strike_points || 0)

  console.log(`${label} enforcement state:`, enforcementState)
  console.log(`${label} active strike points:`, activeStrikePoints)

  if (enforcementState !== 'good') {
    throw new Error(
      `${label} enforcement is not good after cleanup. state=${enforcementState}, active_strike_points=${activeStrikePoints}`
    )
  }
}

async function ensureSellerOnline(sellerId) {
  const { error } = await admin
    .from('profiles')
    .update({ is_online: true })
    .eq('id', sellerId)

  if (error) throw error
}

async function ensureBuyerHasBalance(buyerId, minimumBalanceCents = 20000) {
  const { data: buyerProfile, error: buyerProfileError } = await admin
    .from('profiles')
    .select('balance_cents')
    .eq('id', buyerId)
    .maybeSingle()

  if (buyerProfileError) throw buyerProfileError

  const currentBalance = Number(buyerProfile?.balance_cents ?? 0)

  if (currentBalance >= minimumBalanceCents) {
    console.log('Buyer balance ready:', currentBalance)
    return
  }

  const topUpAmount = minimumBalanceCents - currentBalance + 10000
  const nextBalance = currentBalance + topUpAmount

  const { error: balanceUpdateError } = await admin
    .from('profiles')
    .update({ balance_cents: nextBalance })
    .eq('id', buyerId)

  if (balanceUpdateError) throw balanceUpdateError

  const { error: walletInsertError } = await admin
    .from('wallet_transactions')
    .insert({
      user_id: buyerId,
      tx_type: 'deposit',
      direction: 'credit',
      amount_cents: topUpAmount,
      currency: 'USD',
      status: 'posted',
      note: 'Seed top-up for review eligible flow',
      metadata: {
        source: 'seed-review-eligible-flow',
      },
    })

  if (walletInsertError) throw walletInsertError

  console.log('Buyer balance topped up:', nextBalance)
}

async function deleteSessionBundle(sessionIds) {
  if (!sessionIds.length) return

  const { error: reviewDeleteError } = await admin
    .from('session_reviews')
    .delete()
    .in('session_id', sessionIds)

  if (reviewDeleteError) throw reviewDeleteError

  const { error: disputeDeleteError } = await admin
    .from('disputes')
    .delete()
    .in('session_id', sessionIds)

  if (disputeDeleteError) throw disputeDeleteError

  const { error: sessionEventsDeleteError } = await admin
    .from('session_events')
    .delete()
    .in('session_id', sessionIds)

  if (sessionEventsDeleteError) throw sessionEventsDeleteError

  const { error: sessionDeleteError } = await admin
    .from('sessions')
    .delete()
    .in('id', sessionIds)

  if (sessionDeleteError) throw sessionDeleteError
}

async function deleteBookingBundle(bookingIds) {
  if (!bookingIds.length) return

  const { error: payoutHoldDeleteError } = await admin
    .from('payout_holds')
    .delete()
    .in('booking_request_id', bookingIds)

  if (payoutHoldDeleteError) {
    console.warn('payout_holds delete warning:', payoutHoldDeleteError.message)
  }

  const { error: bookingDeleteError } = await admin
    .from('booking_requests')
    .delete()
    .in('id', bookingIds)

  if (bookingDeleteError) throw bookingDeleteError
}

async function cleanupBlockingState(buyerId, sellerId) {
  console.log('Cleaning blocking state...')

  const { data: blockingBookings, error: blockingBookingsError } = await admin
    .from('booking_requests')
    .select('id, buyer_id, seller_id, status')
    .or(
      `buyer_id.eq.${buyerId},seller_id.eq.${buyerId},buyer_id.eq.${sellerId},seller_id.eq.${sellerId}`
    )
    .in('status', ['pending'])

  if (blockingBookingsError) throw blockingBookingsError

  const blockingBookingIds = (blockingBookings || []).map((row) => row.id)

  const { data: blockingSessions, error: blockingSessionsError } = await admin
    .from('sessions')
    .select(
      'id, booking_request_id, buyer_id, seller_id, status, buyer_completed_at, seller_completed_at'
    )
    .or(
      `buyer_id.eq.${buyerId},seller_id.eq.${buyerId},buyer_id.eq.${sellerId},seller_id.eq.${sellerId}`
    )
    .or(
      [
        'status.eq.ready_to_start',
        'status.eq.active',
        'and(status.eq.awaiting_confirmation,buyer_completed_at.is.null)',
        'and(status.eq.awaiting_confirmation,seller_completed_at.is.null)',
      ].join(',')
    )

  if (blockingSessionsError) throw blockingSessionsError

  const blockingSessionIds = (blockingSessions || []).map((row) => row.id)
  const blockingSessionBookingIds = (blockingSessions || [])
    .map((row) => row.booking_request_id)
    .filter(Boolean)

  const allBookingIds = Array.from(new Set([...blockingBookingIds, ...blockingSessionBookingIds]))

  if (blockingSessionIds.length > 0) {
    console.log(`Deleting blocking sessions: ${blockingSessionIds.length}`)
    await deleteSessionBundle(blockingSessionIds)
  }

  if (allBookingIds.length > 0) {
    console.log(`Deleting blocking bookings: ${allBookingIds.length}`)
    await deleteBookingBundle(allBookingIds)
  }
}

async function cleanupOldPairHistory(buyerId, sellerId) {
  console.log('Cleaning old pair history...')

  const { data: oldSessions, error: oldSessionsError } = await admin
    .from('sessions')
    .select('id, booking_request_id')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (oldSessionsError) throw oldSessionsError

  const oldSessionIds = (oldSessions || []).map((row) => row.id).filter(Boolean)
  const oldBookingIds = (oldSessions || []).map((row) => row.booking_request_id).filter(Boolean)

  if (oldSessionIds.length > 0) {
    console.log(`Deleting old pair sessions: ${oldSessionIds.length}`)
    await deleteSessionBundle(oldSessionIds)
  }

  if (oldBookingIds.length > 0) {
    console.log(`Deleting old pair bookings: ${oldBookingIds.length}`)
    await deleteBookingBundle(oldBookingIds)
  }
}

async function createBookingAsBuyer(sellerId) {
  const { data, error } = await buyerClient.rpc('create_booking_with_hold', {
    p_seller_id: sellerId,
    p_duration_minutes: 60,
    p_base_price_cents: 1000,
    p_tip_cents: 0,
    p_processing_fee_cents: 0,
    p_game: 'World of Warcraft',
    p_communication_method: 'Discord',
    p_currency: 'USD',
  })

  if (error) throw error

  if (!data?.success) {
    throw new Error(data?.message || 'create_booking_with_hold failed')
  }

  return data.booking_id || data.request_id || data.id || null
}

async function getBookingRow(bookingId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function manuallyAcceptBooking(bookingId) {
  const { error } = await admin
    .from('booking_requests')
    .update({
      status: 'accepted',
    })
    .eq('id', bookingId)

  if (error) throw error
}

async function findSessionForBooking(bookingId, attempts = 6, delayMs = 300) {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await admin
      .from('sessions')
      .select('*')
      .eq('booking_request_id', bookingId)
      .maybeSingle()

    if (error) throw error
    if (data?.id) return data

    await sleep(delayMs)
  }

  return null
}

async function createSessionManuallyFromBooking(bookingRow, buyerId, sellerId) {
  const nowIso = new Date().toISOString()

  const insertPayload = {
    booking_request_id: bookingRow.id,
    buyer_id: buyerId,
    seller_id: sellerId,
    status: 'ready_to_start',
    duration_minutes: bookingRow.duration_minutes ?? 60,
    created_at: nowIso,
  }

  const { data, error } = await admin
    .from('sessions')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) throw error
  return data
}

async function releasePayoutHoldIfExists(bookingId) {
  const { data: existingHold, error: existingHoldError } = await admin
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', bookingId)
    .maybeSingle()

  if (existingHoldError) {
    console.warn('payout_holds lookup warning:', existingHoldError.message)
    return
  }

  if (!existingHold?.id) {
    console.log('No payout_hold row found. Skipping payout release step.')
    return
  }

  const payload = {
    status: 'released',
  }

  if ('released_at' in existingHold) {
    payload.released_at = new Date().toISOString()
  }

  const { error: payoutReleaseError } = await admin
    .from('payout_holds')
    .update(payload)
    .eq('id', existingHold.id)

  if (payoutReleaseError) {
    console.warn('payout release warning:', payoutReleaseError.message)
    return
  }

  console.log('Payout hold released:', existingHold.id)
}

async function run() {
  console.log('--- seed-review-eligible-flow ---')

  const buyerId = await findProfileIdByDisplayName(BUYER_NAME)
  const sellerId = await findProfileIdByDisplayName(SELLER_NAME)

  console.log('Buyer:', buyerId)
  console.log('Seller:', sellerId)

  const signedInBuyerId = await signInBuyer()
  console.log('Signed in buyer:', signedInBuyerId)

  if (signedInBuyerId !== buyerId) {
    throw new Error(`Logged-in buyer mismatch. Expected ${buyerId}, got ${signedInBuyerId}`)
  }

  console.log('Clearing buyer/seller strikes...')
  await clearUserStrikes(buyerId)
  await clearUserStrikes(sellerId)

  await verifyUserEnforcementIsGood(buyerId, 'Buyer')
  await verifyUserEnforcementIsGood(sellerId, 'Seller')

  await ensureSellerOnline(sellerId)
  await ensureBuyerHasBalance(buyerId, 20000)

  await cleanupBlockingState(buyerId, sellerId)
  await cleanupOldPairHistory(buyerId, sellerId)

  await verifyUserEnforcementIsGood(buyerId, 'Buyer')
  await verifyUserEnforcementIsGood(sellerId, 'Seller')

  const bookingId = await createBookingAsBuyer(sellerId)

  if (!bookingId) {
    throw new Error('Booking created but booking id not returned')
  }

  console.log('Booking created:', bookingId)

  await manuallyAcceptBooking(bookingId)

  const bookingRowAfterAccept = await getBookingRow(bookingId)
  console.log('Booking status after manual accept:', bookingRowAfterAccept?.status || '(unknown)')

  let sessionRow = await findSessionForBooking(bookingId)

  if (!sessionRow) {
    console.log('No session found after accept. Creating session manually for seed stability...')
    sessionRow = await createSessionManuallyFromBooking(bookingRowAfterAccept, buyerId, sellerId)
  }

  if (!sessionRow?.id) {
    throw new Error('Session not found and could not be created manually')
  }

  console.log('Session ready:', sessionRow.id)

  const nowIso = new Date().toISOString()

  const { error: activateError } = await admin
    .from('sessions')
    .update({
      status: 'active',
      buyer_started_at: nowIso,
      seller_started_at: nowIso,
      started_at: nowIso,
      planned_end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .eq('id', sessionRow.id)

  if (activateError) throw activateError

  const completedIso = new Date().toISOString()

  const { error: completeError } = await admin
    .from('sessions')
    .update({
      status: 'completed',
      buyer_completed_at: completedIso,
      seller_completed_at: completedIso,
      completed_at: completedIso,
      ended_at: completedIso,
      dispute_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', sessionRow.id)

  if (completeError) throw completeError

  await releasePayoutHoldIfExists(bookingId)

  console.log('Session completed:', sessionRow.id)
  console.log('Review should now be available for this session.')
  console.log('--- DONE ---')
}

run().catch((error) => {
  console.error('seed-review-eligible-flow failed')
  console.error(error)
  process.exit(1)
})

// FILE END