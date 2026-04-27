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
  console.log('--- SEED: PENDING TIMEOUT REFUND FLOW ---')

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

  const { data: bookingBefore, error: bookingBeforeError } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', booking.id)
    .single()

  if (bookingBeforeError) throw bookingBeforeError
  if (!bookingBefore) {
    throw new Error('Booking not found before timeout')
  }

  console.log('Booking status before timeout:', bookingBefore.status)
  console.log('Booking total_amount_cents:', bookingBefore.total_amount_cents)

  const { data: buyerPendingBefore, error: buyerPendingBeforeError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('buyer_id', buyer.id)
    .eq('status', 'pending')

  if (buyerPendingBeforeError) throw buyerPendingBeforeError

  const { data: sellerPendingBefore, error: sellerPendingBeforeError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('seller_id', seller.id)
    .eq('status', 'pending')

  if (sellerPendingBeforeError) throw sellerPendingBeforeError

  console.log('Buyer pending rows before timeout:', buyerPendingBefore?.length ?? 0)
  console.log('Seller pending rows before timeout:', sellerPendingBefore?.length ?? 0)

  const pastIso = new Date(Date.now() - 20 * 60 * 1000).toISOString()

  const { data: forcedExpiredBooking, error: forcedExpiredBookingError } = await supabase
    .from('booking_requests')
    .update({
      created_at: pastIso,
    })
    .eq('id', booking.id)
    .select('*')
    .single()

  if (forcedExpiredBookingError) throw forcedExpiredBookingError
  if (!forcedExpiredBooking) {
    throw new Error('Could not force booking old enough for timeout')
  }

  console.log('Booking created_at forced to past:', forcedExpiredBooking.created_at)

  const { data: timeoutResult, error: timeoutError } = await supabase.rpc(
    'update_booking_request_status_with_refund',
    {
      p_request_id: booking.id,
      p_status: 'expired',
    }
  )

  if (timeoutError) throw timeoutError
  if (timeoutResult && typeof timeoutResult === 'object' && timeoutResult.success === false) {
    throw new Error(timeoutResult.message || 'Timeout refund flow failed')
  }

  console.log('Timeout result:', timeoutResult)

  const { data: bookingAfter, error: bookingAfterError } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', booking.id)
    .single()

  if (bookingAfterError) throw bookingAfterError
  if (!bookingAfter) {
    throw new Error('Booking not found after timeout')
  }

  console.log('Booking status after timeout:', bookingAfter.status)

  const { data: buyerWalletRows, error: buyerWalletError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', buyer.id)
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })

  if (buyerWalletError) throw buyerWalletError

  console.log('Buyer wallet rows:', buyerWalletRows?.length ?? 0)

  if (buyerWalletRows && buyerWalletRows.length > 0) {
    console.log('Latest buyer tx type:', buyerWalletRows[0].tx_type)
    console.log('Latest buyer tx direction:', buyerWalletRows[0].direction)
    console.log('Latest buyer tx status:', buyerWalletRows[0].status)
    console.log('Latest buyer tx amount_cents:', buyerWalletRows[0].amount_cents)
  }

  const { data: buyerPendingAfter, error: buyerPendingAfterError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('buyer_id', buyer.id)
    .eq('status', 'pending')

  if (buyerPendingAfterError) throw buyerPendingAfterError

  const { data: sellerPendingAfter, error: sellerPendingAfterError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('seller_id', seller.id)
    .eq('status', 'pending')

  if (sellerPendingAfterError) throw sellerPendingAfterError

  console.log('Buyer pending rows after timeout:', buyerPendingAfter?.length ?? 0)
  console.log('Seller pending rows after timeout:', sellerPendingAfter?.length ?? 0)

  if (bookingAfter.status !== 'expired') {
    throw new Error(`Expected expired but got ${bookingAfter.status}`)
  }

  if (!buyerWalletRows || buyerWalletRows.length === 0) {
    throw new Error('Buyer refund wallet transaction should exist after pending timeout')
  }

  if (buyerPendingAfter && buyerPendingAfter.some((row) => row.id === booking.id)) {
    throw new Error('Buyer should not stay pending after timeout')
  }

  if (sellerPendingAfter && sellerPendingAfter.some((row) => row.id === booking.id)) {
    throw new Error('Seller should not stay pending after timeout')
  }

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })