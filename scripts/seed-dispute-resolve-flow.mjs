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
  console.log('--- SEED: DISPUTE RESOLVE FLOW ---')

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
    throw new Error('Session not created')
  }

  const session = sessions[0]
  console.log('Session created:', session.id)

  const nowIso = new Date().toISOString()
  const completedAtIso = new Date().toISOString()
  const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: completedSession, error: completeSessionError } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      buyer_started_at: nowIso,
      seller_started_at: nowIso,
      started_at: nowIso,
      planned_end_at: nowIso,
      buyer_completed_at: completedAtIso,
      seller_completed_at: completedAtIso,
      completed_at: completedAtIso,
      dispute_deadline_at: pastIso,
      auto_complete_at: null,
    })
    .eq('id', session.id)
    .select('id, status, dispute_deadline_at, completed_at')
    .single()

  if (completeSessionError) throw completeSessionError
  if (!completedSession) {
    throw new Error('Session could not be forced to completed')
  }

  console.log('Session forced completed:', completedSession.id)

  const { data: holds, error: holdsError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (holdsError) throw holdsError
  if (!holds || holds.length === 0) {
    throw new Error('No payout hold')
  }

  const hold = holds[0]

  const { data: holdReady, error: holdReadyError } = await supabase
    .from('payout_holds')
    .update({
      releasable_at: pastIso,
    })
    .eq('id', hold.id)
    .select('*')
    .single()

  if (holdReadyError) throw holdReadyError
  if (!holdReady) {
    throw new Error('Could not make payout hold releasable')
  }

  console.log('Payout hold ready:', holdReady.id)

  const { data: dispute, error: disputeError } = await supabase
    .from('disputes')
    .insert({
      booking_request_id: booking.id,
      session_id: session.id,
      payout_hold_id: hold.id,
      opened_by_user_id: buyer.id,
      target_user_id: seller.id,
      reason_code: 'technical_problem',
      description: 'Seed dispute for resolve-flow test',
      evidence: {},
      status: 'open',
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
    })
    .select('*')
    .single()

  if (disputeError) throw disputeError
  if (!dispute) {
    throw new Error('Dispute not created')
  }

  console.log('Dispute created:', dispute.id)

  const { data: linkedHold, error: linkedHoldError } = await supabase
    .from('payout_holds')
    .update({
      dispute_id: dispute.id,
      notes: 'Seed-linked dispute for resolve-flow test',
    })
    .eq('id', hold.id)
    .select('*')
    .single()

  if (linkedHoldError) throw linkedHoldError
  if (!linkedHold) {
    throw new Error('Could not link payout hold to dispute')
  }

  console.log('Dispute linked to payout hold:', linkedHold.dispute_id)

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

  const { data: blockedReleaseResult, error: blockedReleaseError } = await supabase.rpc(
    'run_payout_release'
  )

  if (blockedReleaseError) throw blockedReleaseError

  console.log('Release attempt while disputed:', blockedReleaseResult)

  const { data: resolvedDispute, error: resolveError } = await supabase.rpc(
    'resolve_dispute',
    {
      p_dispute_id: dispute.id,
      p_decision: 'seller_favor',
      p_partial_refund_cents: null,
      p_strike_user_id: null,
      p_strike_points: 0,
      p_resolution_note: 'Seed resolve for payout release test',
      p_strike_reason_code: null,
    }
  )

  if (resolveError) throw resolveError
  if (resolvedDispute && typeof resolvedDispute === 'object' && resolvedDispute.success === false) {
    throw new Error(resolvedDispute.message || 'Dispute resolve failed')
  }

  console.log('Dispute resolved:', resolvedDispute)

  const { data: finalDispute, error: finalDisputeError } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', dispute.id)
    .single()

  if (finalDisputeError) throw finalDisputeError
  if (!finalDispute) {
    throw new Error('Final dispute not found')
  }

  console.log('Final dispute status:', finalDispute.status)
  console.log('Final dispute resolved_at:', finalDispute.resolved_at)

  const { data: payoutHoldAfter, error: payoutHoldAfterError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('id', hold.id)
    .single()

  if (payoutHoldAfterError) throw payoutHoldAfterError
  if (!payoutHoldAfter) {
    throw new Error('Final payout hold not found')
  }

  console.log('Final payout hold status:', payoutHoldAfter.status)
  console.log('Final payout hold released_at:', payoutHoldAfter.released_at)
  console.log('Final payout hold dispute_id:', payoutHoldAfter.dispute_id)

  const { data: walletRows, error: walletError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', seller.id)
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })

  if (walletError) throw walletError

  console.log('Wallet rows:', walletRows?.length ?? 0)

  if (!walletRows || walletRows.length === 0) {
    throw new Error('Payout should have happened after resolve')
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })