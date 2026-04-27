import {
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  supabase,
} from './test-harness.mjs'

async function failIfError(error, label) {
  if (error) {
    throw new Error(`${label}: ${error.message}`)
  }
}

async function clearSessionsAndRelatedRowsForUsers(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]

  const { data: sessions, error: sessionsLoadError } = await supabase
    .from('sessions')
    .select('id, booking_request_id')
    .or(uniqueUserIds.map((id) => `buyer_id.eq.${id},seller_id.eq.${id}`).join(','))

  await failIfError(sessionsLoadError, 'Load sessions failed')

  const sessionIds = (sessions || []).map((row) => row.id)
  const bookingIdsFromSessions = (sessions || [])
    .map((row) => row.booking_request_id)
    .filter(Boolean)

  const { data: bookings, error: bookingsLoadError } = await supabase
    .from('booking_requests')
    .select('id')
    .or(uniqueUserIds.map((id) => `buyer_id.eq.${id},seller_id.eq.${id}`).join(','))

  await failIfError(bookingsLoadError, 'Load bookings failed')

  const bookingIds = [
    ...new Set([...(bookings || []).map((row) => row.id), ...bookingIdsFromSessions]),
  ]

  if (sessionIds.length > 0) {
    const { error } = await supabase.from('session_events').delete().in('session_id', sessionIds)
    await failIfError(error, 'Delete session_events failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('wallet_transactions').delete().in('booking_id', bookingIds)
    await failIfError(error, 'Delete wallet_transactions by booking_id failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('booking_request_slots').delete().in('request_id', bookingIds)
    await failIfError(error, 'Delete booking_request_slots failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('reviews').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete reviews failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('buyer_reviews').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete buyer_reviews failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase
      .from('buyer_review_details')
      .delete()
      .in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete buyer_review_details failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase
      .from('seller_review_details')
      .delete()
      .in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete seller_review_details failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('booking_escrows').delete().in('booking_id', bookingIds)
    await failIfError(error, 'Delete booking_escrows failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase
      .from('booking_chat_reads')
      .delete()
      .in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete booking_chat_reads failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('booking_messages').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete booking_messages failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('strikes').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete strikes by booking_request_id failed')
  }

  if (sessionIds.length > 0) {
    const { error } = await supabase.from('strikes').delete().in('session_id', sessionIds)
    await failIfError(error, 'Delete strikes by session_id failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('disputes').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete disputes failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('payout_holds').delete().in('booking_request_id', bookingIds)
    await failIfError(error, 'Delete payout_holds failed')
  }

  if (sessionIds.length > 0) {
    const { error } = await supabase.from('sessions').delete().in('id', sessionIds)
    await failIfError(error, 'Delete sessions failed')
  }

  if (bookingIds.length > 0) {
    const { error } = await supabase.from('booking_requests').delete().in('id', bookingIds)
    await failIfError(error, 'Delete booking_requests failed')
  }
}

async function createBookingWithHold(buyerId, sellerId) {
  const totalAmountCents = 600
  const sellerPayoutCents = 600

  const { data, error } = await supabase
    .from('booking_requests')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      status: 'pending',
      game: 'Test Game',
      communication_method: 'Discord',
      duration_minutes: 60,
      base_price_cents: 500,
      tip_cents: 100,
      processing_fee_cents: 0,
      platform_fee_cents: 0,
      total_amount_cents: totalAmountCents,
      total_price: totalAmountCents / 100,
      seller_payout_cents: sellerPayoutCents,
      currency: 'USD',
    })
    .select('*')
    .single()

  await failIfError(error, 'Create booking_request failed')
  return data
}

async function loadSessionForAcceptedBooking(booking) {
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('booking_request_id', booking.id)
    .single()

  await failIfError(error, 'Load session failed')
  return data
}

async function loadPayoutHoldForAcceptedBooking(booking) {
  const { data, error } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)
    .single()

  await failIfError(error, 'Load payout_hold failed')
  return data
}

async function run() {
  console.log('--- SEED: FLOW START READY ---')

  const buyer = await findBuyer()
  const seller = await findSeller()

  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  await forceSellerOnline(seller.id)
  await clearPendingForBuyer(buyer.id)
  await clearPendingForSeller(seller.id)
  await clearSessionsAndRelatedRowsForUsers([buyer.id, seller.id])

  console.log('Clean state ready')

  const booking = await createBookingWithHold(buyer.id, seller.id)
  console.log('Pending created:', booking.id)

  const { data: acceptedBooking, error: acceptError } = await supabase
    .from('booking_requests')
    .update({ status: 'accepted' })
    .eq('id', booking.id)
    .eq('status', 'pending')
    .select('*')
    .single()

  await failIfError(acceptError, 'Accept booking failed')

  if (!acceptedBooking) {
    throw new Error('Accepted booking row missing')
  }

  console.log('Booking marked accepted:', acceptedBooking.id)

const session = await loadSessionForAcceptedBooking(acceptedBooking)
console.log('Session found:', session.id)
console.log('Session status:', session.status)

  if (session.status !== 'ready_to_start') {
    throw new Error(`Expected ready_to_start but got ${session.status}`)
  }

const payoutHold = await loadPayoutHoldForAcceptedBooking(acceptedBooking)
console.log('Payout hold found:', payoutHold.id)
console.log('Payout hold status:', payoutHold.status)

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
