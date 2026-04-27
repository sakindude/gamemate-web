import { createClient } from '@supabase/supabase-js'
import {
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  createPendingBooking,
  supabase,
} from './test-harness.mjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const SELLER_EMAIL =
  process.env.PW_TEST_SELLER_EMAIL ||
  'gm_test_seller@gmail.com'

const SELLER_PASSWORD =
  process.env.PW_TEST_SELLER_PASSWORD ||
  process.env.PW_TEST_PASSWORD

function createAuthedSellerClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function run() {
  console.log('--- SEED: REJECT REFUND FLOW ---')

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
    throw new Error('Booking not found before reject')
  }

  console.log('Booking status before reject:', bookingBefore.status)
  console.log('Booking total_amount_cents:', bookingBefore.total_amount_cents)

  const { data: holdBeforeRows, error: holdBeforeError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (holdBeforeError) throw holdBeforeError

  console.log('Payout hold rows before reject:', holdBeforeRows?.length ?? 0)

  if (!SELLER_EMAIL || !SELLER_PASSWORD) {
    throw new Error(
      'Missing seller credentials. Need PW_TEST_SELLER_EMAIL/PW_TEST_SELLER_PASSWORD or PW_TEST_PASSWORD fallback.'
    )
  }

  const sellerClient = createAuthedSellerClient()

  const { data: signInData, error: signInError } = await sellerClient.auth.signInWithPassword({
    email: SELLER_EMAIL,
    password: SELLER_PASSWORD,
  })

  if (signInError) throw signInError
  if (!signInData.session) {
    throw new Error('Seller sign-in failed')
  }

  console.log('Seller authenticated for reject RPC')

  const { data: rejectResult, error: rejectError } = await sellerClient.rpc(
    'update_booking_request_status_with_refund',
    {
      p_request_id: booking.id,
      p_status: 'rejected',
    }
  )

  if (rejectError) throw rejectError
  if (rejectResult && typeof rejectResult === 'object' && rejectResult.success === false) {
    throw new Error(rejectResult.message || 'Reject flow failed')
  }

  console.log('Reject result:', rejectResult)

  const { data: bookingAfter, error: bookingAfterError } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', booking.id)
    .single()

  if (bookingAfterError) throw bookingAfterError
  if (!bookingAfter) {
    throw new Error('Booking not found after reject')
  }

  console.log('Booking status after reject:', bookingAfter.status)

  const { data: holdAfterRows, error: holdAfterError } = await supabase
    .from('payout_holds')
    .select('*')
    .eq('booking_request_id', booking.id)

  if (holdAfterError) throw holdAfterError

  console.log('Payout hold rows after reject:', holdAfterRows?.length ?? 0)

  if (holdAfterRows && holdAfterRows.length > 0) {
    console.log('Payout hold status after reject:', holdAfterRows[0].status)
    console.log('Payout hold refunded_at after reject:', holdAfterRows[0].refunded_at)
  }

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

  const { data: buyerPendingRows, error: buyerPendingError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('buyer_id', buyer.id)
    .eq('status', 'pending')

  if (buyerPendingError) throw buyerPendingError

  const { data: sellerPendingRows, error: sellerPendingError } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('seller_id', seller.id)
    .eq('status', 'pending')

  if (sellerPendingError) throw sellerPendingError

  console.log('Buyer pending rows after reject:', buyerPendingRows?.length ?? 0)
  console.log('Seller pending rows after reject:', sellerPendingRows?.length ?? 0)

  if (bookingAfter.status !== 'rejected') {
    throw new Error(`Expected rejected but got ${bookingAfter.status}`)
  }

  if (!buyerWalletRows || buyerWalletRows.length === 0) {
    throw new Error('Buyer refund wallet transaction should exist after reject')
  }

  if (buyerPendingRows && buyerPendingRows.some((row) => row.id === booking.id)) {
    throw new Error('Buyer should not stay pending on rejected booking')
  }

  if (sellerPendingRows && sellerPendingRows.some((row) => row.id === booking.id)) {
    throw new Error('Seller should not stay pending on rejected booking')
  }

  await sellerClient.auth.signOut().catch(() => {})

  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })