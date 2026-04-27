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
  console.log('--- SEED: DISPUTE CREATE FLOW ---')

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
    .select('id')
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

  console.log('Session is ACTIVE:', startedRows.id)

  // Seed için dispute state'ini direkt kuruyoruz.
  // Bu auth isteyen RPC'yi bypass eder.
  const { data: disputeRow, error: disputeInsertError } = await supabase
    .from('disputes')
    .insert({
      booking_request_id: booking.id,
      session_id: session.id,
      payout_hold_id: null,
      opened_by_user_id: buyer.id,
      target_user_id: seller.id,
      reason_code: 'technical_problem',
      description: 'Seed-created dispute for automated test flow',
      evidence: {},
      status: 'open',
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
    })
    .select('id, booking_request_id, session_id, opened_by_user_id, target_user_id, reason_code, status')
    .single()

  if (disputeInsertError) throw disputeInsertError
  if (!disputeRow) {
    throw new Error('Dispute row was not created')
  }

  console.log('Dispute created:', disputeRow.id)

  const { data: finalSession, error: finalSessionError } = await supabase
    .from('sessions')
    .update({
      status: 'disputed',
    })
    .eq('id', session.id)
    .select('id, status')
    .single()

  if (finalSessionError) throw finalSessionError
  if (!finalSession) {
    throw new Error('Final session not found after dispute update')
  }

  console.log('Final session status:', finalSession.status)

  if (finalSession.status !== 'disputed') {
    throw new Error(`Expected disputed but got ${finalSession.status}`)
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })