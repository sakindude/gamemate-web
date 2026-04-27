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
  console.log('--- SEED: PAYOUT BLOCKED FLOW ---')

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

  const nowIso = new Date().toISOString()
  const plannedEndIso = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const completedAtIso = new Date().toISOString()
  const expiredDisputeDeadlineIso = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const expiredReleasableAtIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: updatedSession, error: sessionUpdateError } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      buyer_started_at: nowIso,
      seller_started_at: nowIso,
      started_at: nowIso,
      planned_end_at: plannedEndIso,
      buyer_completed_at: completedAtIso,
      seller_completed_at: completedAtIso,
      completed_at: completedAtIso,
      dispute_deadline_at: expiredDisputeDeadlineIso,
      auto_complete_at: null,
    })
    .eq('id', session.id)
    .select('id, status, dispute_deadline_at, completed_at')
    .single()

  if (sessionUpdateError) throw sessionUpdateError
  if (!updatedSession) {
    throw new Error('Session could not be moved to completed')
  }

  console.log('Session forced completed:', updatedSession.id)

  const { data: payoutHoldRowsBefore, error: payoutHoldBeforeError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (payoutHoldBeforeError) throw payoutHoldBeforeError
  if (!payoutHoldRowsBefore || payoutHoldRowsBefore.length === 0) {
    throw new Error('No payout_holds row found for booking_request_id')
  }

  const payoutHold = payoutHoldRowsBefore[0]

  console.log('Payout hold found:', payoutHold.id)
  console.log('Payout hold status before:', payoutHold.status)

  const { data: payoutHoldUpdated, error: payoutHoldUpdateError } = await supabase
    .from('payout_holds')
    .update({
      releasable_at: expiredReleasableAtIso,
    })
    .eq('id', payoutHold.id)
    .select('*')
    .single()

  if (payoutHoldUpdateError) throw payoutHoldUpdateError
  if (!payoutHoldUpdated) {
    throw new Error('Payout hold could not be updated')
  }

  console.log('Payout hold releasable_at forced expired:', payoutHoldUpdated.releasable_at)

  const { data: disputeRow, error: disputeInsertError } = await supabase
    .from('disputes')
    .insert({
      booking_request_id: booking.id,
      session_id: session.id,
      payout_hold_id: payoutHold.id,
      opened_by_user_id: buyer.id,
      target_user_id: seller.id,
      reason_code: 'technical_problem',
      description: 'Seed-created dispute to block payout release',
      evidence: {},
      status: 'open',
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
    })
    .select('id, status, payout_hold_id')
    .single()

  if (disputeInsertError) throw disputeInsertError
  if (!disputeRow) {
    throw new Error('Dispute row was not created')
  }

  console.log('Dispute created:', disputeRow.id)

  const { data: linkedPayoutHold, error: linkedPayoutHoldError } = await supabase
    .from('payout_holds')
    .update({
      dispute_id: disputeRow.id,
      notes: 'Seed-linked dispute for payout block test',
    })
    .eq('id', payoutHold.id)
    .select('*')
    .single()

  if (linkedPayoutHoldError) throw linkedPayoutHoldError
  if (!linkedPayoutHold) {
    throw new Error('Could not link payout_hold to dispute')
  }

  console.log('Payout hold linked to dispute:', linkedPayoutHold.dispute_id)

  const { data: disputedSession, error: disputedSessionError } = await supabase
    .from('sessions')
    .update({
      status: 'disputed',
    })
    .eq('id', session.id)
    .select('id, status')
    .single()

  if (disputedSessionError) throw disputedSessionError
  if (!disputedSession) {
    throw new Error('Session could not be moved to disputed')
  }

  console.log('Session marked disputed:', disputedSession.id)

  const { data: releaseResult, error: releaseError } = await supabase.rpc(
    'run_payout_release'
  )

  if (releaseError) throw releaseError

  console.log('run_payout_release result:', releaseResult)

  const { data: payoutHoldRowsAfter, error: payoutHoldAfterError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (payoutHoldAfterError) throw payoutHoldAfterError
  if (!payoutHoldRowsAfter || payoutHoldRowsAfter.length === 0) {
    throw new Error('No payout_holds row found after release')
  }

  const payoutHoldAfter = payoutHoldRowsAfter[0]

  console.log('Payout hold status after:', payoutHoldAfter.status)
  console.log('Payout hold released_at after:', payoutHoldAfter.released_at)
  console.log('Payout hold dispute_id after:', payoutHoldAfter.dispute_id)

  const { data: walletRows, error: walletError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', seller.id)
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })

  if (walletError) throw walletError

  console.log('Seller wallet rows for booking:', walletRows?.length ?? 0)

  if (payoutHoldAfter.status === 'released' || payoutHoldAfter.released_at) {
    throw new Error('Payout should have stayed blocked, but payout_hold was released')
  }

  if (walletRows && walletRows.length > 0) {
    throw new Error('Payout should have stayed blocked, but seller wallet transaction exists')
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })