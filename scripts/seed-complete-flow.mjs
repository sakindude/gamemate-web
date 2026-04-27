import {
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  createPendingBooking,
  supabase,
} from './test-harness.mjs'

async function run() {
  console.log('--- SEED: COMPLETE FLOW ---')

  const buyer = await findBuyer()
  const seller = await findSeller()

  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  await forceSellerOnline(seller.id)

  await clearPendingForBuyer(buyer.id)
  await clearPendingForSeller(seller.id)

  console.log('Clean state ready')

  const booking = await createPendingBooking({
    buyerId: buyer.id,
    sellerId: seller.id,
  })

  console.log('Pending created:', booking.id)

  const { data: acceptedRows, error: acceptError } = await supabase
    .from('booking_requests')
    .update({ status: 'accepted' })
    .eq('id', booking.id)
    .eq('status', 'pending')
    .select('id, status')
    .single()

  if (acceptError) throw acceptError
  if (!acceptedRows) {
    throw new Error('Booking could not be marked as accepted')
  }

  console.log('Booking marked accepted:', acceptedRows.id)

  await new Promise((resolve) => setTimeout(resolve, 1000))

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (sessionsError) throw sessionsError
  if (!sessions || sessions.length === 0) {
    throw new Error('Session NOT created after accept')
  }

  const session = sessions[0]

  console.log('Session created:', session.id)
  console.log('Session status before start:', session.status)

  const nowIso = new Date().toISOString()
  const plannedEndIso = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const { data: startedRows, error: startError } = await supabase
    .from('sessions')
    .update({
      status: 'active',
      buyer_started_at: nowIso,
      seller_started_at: nowIso,
      started_at: nowIso,
      planned_end_at: plannedEndIso,
    })
    .eq('id', session.id)
    .eq('status', 'ready_to_start')
    .select('id, status')
    .single()

  if (startError) throw startError
  if (!startedRows) {
    throw new Error('Session could not be moved to active')
  }

  console.log('Session started:', startedRows.id)

  const buyerCompletedAt = new Date().toISOString()

  const { data: completedRows, error: completeError } = await supabase
    .from('sessions')
    .update({
      status: 'awaiting_confirmation',
      buyer_completed_at: buyerCompletedAt,
      auto_complete_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', session.id)
    .eq('status', 'active')
    .select('id, status, buyer_completed_at, seller_completed_at, auto_complete_at')
    .single()

  if (completeError) throw completeError
  if (!completedRows) {
    throw new Error('Session could not be moved to awaiting_confirmation')
  }

  console.log('Session moved to awaiting_confirmation:', completedRows.id)
  console.log('Status:', completedRows.status)
  console.log('Buyer completed at:', completedRows.buyer_completed_at)
  console.log('Seller completed at:', completedRows.seller_completed_at)
  console.log('Auto-complete at:', completedRows.auto_complete_at)

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })