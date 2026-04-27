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
  console.log('--- SEED: PAYOUT FLOW ---')

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
  console.log('Dispute deadline forced expired:', updatedSession.dispute_deadline_at)

  const { data: payoutHoldRowsBefore, error: payoutHoldBeforeError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (payoutHoldBeforeError) throw payoutHoldBeforeError

  console.log('Payout holds before release:', payoutHoldRowsBefore?.length ?? 0)

  if (!payoutHoldRowsBefore || payoutHoldRowsBefore.length === 0) {
    throw new Error('No payout_holds row found for booking_request_id')
  }

  const payoutHold = payoutHoldRowsBefore[0]

  console.log('Payout hold found:', payoutHold.id)
  console.log('Payout hold status before:', payoutHold.status)
  console.log('Payout hold releasable_at before:', payoutHold.releasable_at)
  console.log('Payout hold released_at before:', payoutHold.released_at)

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

  const { data: escrowRowsBefore, error: escrowBeforeError } = await supabase
    .from('booking_escrows')
    .select('*')
    .eq('booking_id', booking.id)

  if (escrowBeforeError) throw escrowBeforeError

  console.log('Escrow rows before release:', escrowRowsBefore?.length ?? 0)

  if (escrowRowsBefore && escrowRowsBefore.length > 0) {
    console.log('Escrow status before:', escrowRowsBefore[0].status)
    console.log('Escrow released_at before:', escrowRowsBefore[0].released_at)
  }

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

  console.log('Payout holds after release:', payoutHoldRowsAfter?.length ?? 0)

  if (!payoutHoldRowsAfter || payoutHoldRowsAfter.length === 0) {
    throw new Error('No payout_holds row found after release')
  }

  const payoutHoldAfter = payoutHoldRowsAfter[0]

  console.log('Payout hold status after:', payoutHoldAfter.status)
  console.log('Payout hold releasable_at after:', payoutHoldAfter.releasable_at)
  console.log('Payout hold released_at after:', payoutHoldAfter.released_at)

  const { data: escrowRowsAfter, error: escrowAfterError } = await supabase
    .from('booking_escrows')
    .select('*')
    .eq('booking_id', booking.id)

  if (escrowAfterError) throw escrowAfterError

  console.log('Escrow rows after release:', escrowRowsAfter?.length ?? 0)

  if (escrowRowsAfter && escrowRowsAfter.length > 0) {
    console.log('Escrow status after:', escrowRowsAfter[0].status)
    console.log('Escrow released_at after:', escrowRowsAfter[0].released_at)
  }

  const { data: walletRows, error: walletError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', seller.id)
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })

  if (walletError) throw walletError

  console.log('Seller wallet rows for booking:', walletRows?.length ?? 0)

  if (walletRows && walletRows.length > 0) {
    console.log('Latest wallet tx type:', walletRows[0].tx_type)
    console.log('Latest wallet tx direction:', walletRows[0].direction)
    console.log('Latest wallet tx status:', walletRows[0].status)
    console.log('Latest wallet tx amount_cents:', walletRows[0].amount_cents)
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })