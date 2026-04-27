import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = process.cwd()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_USER_ID = 'b222a027-c0e8-4c81-b02b-6d9222c4cc88'

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function runSeed(scriptName) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName)
  execFileSync('node', ['--env-file=.env.local', scriptPath], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  })
}

async function getLatestDispute() {
  const { data, error } = await admin
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  if (!data?.[0]) throw new Error('Latest dispute not found')
  return data[0]
}

async function getBooking(bookingId) {
  const { data, error } = await admin
    .from('booking_requests')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (error) throw error
  return data
}

async function getPayout(disputeId) {
  const { data, error } = await admin
    .from('payout_holds')
    .select('*')
    .eq('dispute_id', disputeId)
    .limit(1)

  if (error) throw error
  if (!data?.[0]) throw new Error('Payout hold not found')
  return data[0]
}

async function getProfile(id) {
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

async function getWallet(userId) {
  const { data, error } = await admin
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data || []
}

async function getEvents(disputeId) {
  const { data, error } = await admin
    .from('session_events')
    .select('*')
    .eq('entity_id', disputeId)

  if (error) throw error
  return data || []
}

async function snapshotForDispute(disputeId, bookingId, buyerId, sellerId) {
  const [dispute, payout, buyer, seller, buyerWallet, sellerWallet, events] = await Promise.all([
    getLatestDispute(),
    getPayout(disputeId),
    getProfile(buyerId),
    getProfile(sellerId),
    getWallet(buyerId),
    getWallet(sellerId),
    getEvents(disputeId),
  ])

  return {
    dispute,
    payout,
    buyerBalance: Number(buyer.balance_cents ?? 0),
    sellerBalance: Number(seller.balance_cents ?? 0),
    buyerWalletCount: buyerWallet.length,
    sellerWalletCount: sellerWallet.length,
    eventCount: events.length,
    bookingId,
  }
}

function assertNoSideEffects(before, after, label) {
  if (before.dispute.status !== after.dispute.status) {
    throw new Error(`${label}: dispute status changed unexpectedly`)
  }

  if (before.payout.status !== after.payout.status) {
    throw new Error(`${label}: payout_hold status changed unexpectedly`)
  }

  if (before.buyerBalance !== after.buyerBalance) {
    throw new Error(`${label}: buyer balance changed unexpectedly`)
  }

  if (before.sellerBalance !== after.sellerBalance) {
    throw new Error(`${label}: seller balance changed unexpectedly`)
  }

  if (before.buyerWalletCount !== after.buyerWalletCount) {
    throw new Error(`${label}: buyer wallet count changed unexpectedly`)
  }

  if (before.sellerWalletCount !== after.sellerWalletCount) {
    throw new Error(`${label}: seller wallet count changed unexpectedly`)
  }

  if (before.eventCount !== after.eventCount) {
    throw new Error(`${label}: event count changed unexpectedly`)
  }
}

async function prepareOpenBuyerFavorCase() {
  runSeed('seed-flow-dispute-resolve-buyer-favor.mjs')
  const dispute = await getLatestDispute()
  const booking = await getBooking(dispute.booking_request_id)
  const payout = await getPayout(dispute.id)

  return {
    dispute,
    booking,
    payout,
    buyerId: booking.buyer_id,
    sellerId: booking.seller_id,
  }
}

async function prepareOpenPartialCase() {
  runSeed('seed-flow-dispute-resolve-partial.mjs')
  const dispute = await getLatestDispute()
  const booking = await getBooking(dispute.booking_request_id)
  const payout = await getPayout(dispute.id)

  return {
    dispute,
    booking,
    payout,
    buyerId: booking.buyer_id,
    sellerId: booking.seller_id,
  }
}

async function resolveOnce(disputeId, resolution, refundAmount = null) {
  const payload = {
    p_dispute_id: disputeId,
    p_resolution: resolution,
    p_resolved_by_user_id: ADMIN_USER_ID,
    p_resolution_note: 'invalid-case setup resolve once',
  }

  if (refundAmount !== null) {
    payload.p_refund_amount_cents = refundAmount
  }

  const { data, error } = await admin.rpc('resolve_dispute', payload)
  if (error) throw new Error(`Setup resolve RPC error: ${error.message}`)
  if (data?.success !== true) {
    throw new Error(`Setup resolve failed: ${JSON.stringify(data)}`)
  }
}

console.log('--- VERIFY: RESOLVE_DISPUTE INVALID CASES ---')

//
// CASE 1: missing resolved_by_user_id
//
console.log('\n--- CASE 1: missing resolved_by_user_id ---')
{
  const { dispute, booking, buyerId, sellerId } = await prepareOpenBuyerFavorCase()
  const before = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)

  const { data, error } = await admin.rpc('resolve_dispute', {
    p_dispute_id: dispute.id,
    p_resolution: 'buyer_favor',
    p_resolution_note: 'missing resolver should fail',
  })

  if (error) throw new Error(`CASE 1 RPC error: ${error.message}`)
  console.log('CASE 1 result:', data)

  if (data?.success !== false) {
    throw new Error('CASE 1 should have failed')
  }

  const after = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)
  assertNoSideEffects(before, after, 'CASE 1')
}

//
// CASE 2: partial without refund amount
//
console.log('\n--- CASE 2: partial without refund amount ---')
{
  const { dispute, booking, buyerId, sellerId } = await prepareOpenPartialCase()
  const before = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)

  const { data, error } = await admin.rpc('resolve_dispute', {
    p_dispute_id: dispute.id,
    p_resolution: 'partial',
    p_resolved_by_user_id: ADMIN_USER_ID,
    p_resolution_note: 'missing refund should fail',
  })

  if (error) throw new Error(`CASE 2 RPC error: ${error.message}`)
  console.log('CASE 2 result:', data)

  if (data?.success !== false) {
    throw new Error('CASE 2 should have failed')
  }

  const after = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)
  assertNoSideEffects(before, after, 'CASE 2')
}

//
// CASE 3: partial with refund too large
//
console.log('\n--- CASE 3: partial with refund too large ---')
{
  const { dispute, booking, payout, buyerId, sellerId } = await prepareOpenPartialCase()
  const before = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)

  const tooLargeRefund = Number(payout.seller_payout_cents ?? 0) + 1

  const { data, error } = await admin.rpc('resolve_dispute', {
    p_dispute_id: dispute.id,
    p_resolution: 'partial',
    p_refund_amount_cents: tooLargeRefund,
    p_resolved_by_user_id: ADMIN_USER_ID,
    p_resolution_note: 'too large refund should fail',
  })

  if (error) throw new Error(`CASE 3 RPC error: ${error.message}`)
  console.log('CASE 3 result:', data)

  if (data?.success !== false) {
    throw new Error('CASE 3 should have failed')
  }

  const after = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)
  assertNoSideEffects(before, after, 'CASE 3')
}

//
// CASE 4: already resolved dispute must fail and remain immutable
//
console.log('\n--- CASE 4: already resolved dispute ---')
{
  const { dispute, booking, buyerId, sellerId } = await prepareOpenBuyerFavorCase()

  await resolveOnce(dispute.id, 'buyer_favor')

  const before = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)

  const { data, error } = await admin.rpc('resolve_dispute', {
    p_dispute_id: dispute.id,
    p_resolution: 'buyer_favor',
    p_resolved_by_user_id: ADMIN_USER_ID,
    p_resolution_note: 'second resolve should fail',
  })

  if (error) throw new Error(`CASE 4 RPC error: ${error.message}`)
  console.log('CASE 4 result:', data)

  if (data?.success !== false) {
    throw new Error('CASE 4 should have failed')
  }

  const after = await snapshotForDispute(dispute.id, booking.id, buyerId, sellerId)
  assertNoSideEffects(before, after, 'CASE 4')
}

console.log('\n✅ ALL INVALID CASE CHECKS PASSED')