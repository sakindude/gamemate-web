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
  console.log('--- SEED: AUTO COMPLETE FLOW ---')

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

  const now = new Date()
  const nowIso = now.toISOString()
  const plannedEndIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

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
  const expiredAutoCompleteAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: awaitingRows, error: completeError } = await supabase
    .from('sessions')
    .update({
      status: 'awaiting_confirmation',
      buyer_completed_at: buyerCompletedAt,
      auto_complete_at: expiredAutoCompleteAt,
    })
    .eq('id', session.id)
    .eq('status', 'active')
    .select('id, status, buyer_completed_at, seller_completed_at, auto_complete_at')
    .single()

  if (completeError) throw completeError
  if (!awaitingRows) {
    throw new Error('Session could not be moved to awaiting_confirmation')
  }

  console.log('Session moved to awaiting_confirmation:', awaitingRows.id)
  console.log('Auto-complete at forced expired value:', awaitingRows.auto_complete_at)

  const { data: autoCompleteResult, error: autoCompleteError } = await supabase.rpc(
    'run_session_auto_complete'
  )

  if (autoCompleteError) throw autoCompleteError

  console.log('run_session_auto_complete result:', autoCompleteResult)

  const { data: finalSession, error: finalSessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session.id)
    .single()

  if (finalSessionError) throw finalSessionError
  if (!finalSession) {
    throw new Error('Final session not found')
  }

  console.log('Final session status:', finalSession.status)
  console.log('Dispute deadline at:', finalSession.dispute_deadline_at)

  if (finalSession.status !== 'completed') {
    throw new Error(`Expected completed but got ${finalSession.status}`)
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })