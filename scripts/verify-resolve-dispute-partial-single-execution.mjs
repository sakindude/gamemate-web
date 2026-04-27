import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = process.cwd()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_USER_ID = 'b222a027-c0e8-4c81-b02b-6d9222c4cc88'
const PARTIAL_REFUND_CENTS = 200

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

function countPartialEvents(events) {
  return events.filter((row) => row.event_type === 'dispute_resolved_partial').length
}

function countBuyerRefundWalletRows(rows, bookingId) {
  return rows.filter((row) => {
    const txType = String(row.tx_type || row.type || '').toLowerCase()
    const note = String(row.note || row.description || '').toLowerCase()
    const sameBooking = String(row.booking_id || '') === String(bookingId)

    return (
      sameBooking &&
      (txType.includes('refund') ||
        txType.includes('booking_refund') ||
        note.includes('refund') ||
        note.includes('partial') ||
        note.includes('dispute'))
    )
  }).length
}

function countSellerPayoutWalletRows(rows, bookingId) {
  return rows.filter((row) => {
    const txType = String(row.tx_type || row.type || '').toLowerCase()
    const note = String(row.note || row.description || '').toLowerCase()
    const sameBooking = String(row.booking_id || '') === String(bookingId)

    return (
      sameBooking &&
      (txType.includes('payout') ||
        txType.includes('seller_payout') ||
        note.includes('payout') ||
        note.includes('partial') ||
        note.includes('dispute'))
    )
  }).length
}

console.log('--- VERIFY: PARTIAL SINGLE EXECUTION ---')

runSeed('seed-flow-dispute-resolve-partial.mjs')

const disputeBefore = await getLatestDispute()
const booking = await getBooking(disputeBefore.booking_request_id)
const payoutBefore = await getPayout(disputeBefore.id)

const buyerId = booking.buyer_id
const sellerId = booking.seller_id

if (!buyerId || !sellerId) {
  throw new Error('Booking buyer_id / seller_id missing')
}

const buyerBefore = await getProfile(buyerId)
const sellerBefore = await getProfile(sellerId)

const buyerWalletBefore = await getWallet(buyerId)
const sellerWalletBefore = await getWallet(sellerId)
const eventsBefore = await getEvents(disputeBefore.id)

const expectedSellerPayout =
  Number(payoutBefore.seller_payout_cents ?? booking.seller_payout_cents ?? 0) - PARTIAL_REFUND_CENTS

if (expectedSellerPayout < 0) {
  throw new Error(`Invalid expected seller payout: ${expectedSellerPayout}`)
}

console.log('Dispute:', disputeBefore.id)
console.log('Booking:', booking.id)
console.log('Buyer:', buyerId)
console.log('Seller:', sellerId)
console.log('Expected buyer refund:', PARTIAL_REFUND_CENTS)
console.log('Expected seller payout:', expectedSellerPayout)

console.log('--- FIRST CALL ---')
const { data: firstCall, error: firstError } = await admin.rpc('resolve_dispute', {
  p_dispute_id: disputeBefore.id,
  p_resolution: 'partial',
  p_refund_amount_cents: PARTIAL_REFUND_CENTS,
  p_resolved_by_user_id: ADMIN_USER_ID,
  p_resolution_note: 'verify partial single execution',
})

if (firstError) {
  throw new Error(`First call RPC error: ${firstError.message}`)
}

console.log('First call result:', firstCall)

if (firstCall?.success !== true) {
  throw new Error(`First execution did not succeed: ${JSON.stringify(firstCall)}`)
}

console.log('--- SECOND CALL ---')
const { data: secondCall, error: secondError } = await admin.rpc('resolve_dispute', {
  p_dispute_id: disputeBefore.id,
  p_resolution: 'partial',
  p_refund_amount_cents: PARTIAL_REFUND_CENTS,
  p_resolved_by_user_id: ADMIN_USER_ID,
  p_resolution_note: 'verify partial single execution second call',
})

if (secondError) {
  throw new Error(`Second call RPC error: ${secondError.message}`)
}

console.log('Second call result:', secondCall)

const disputeAfter = await getLatestDispute()
const payoutAfter = await getPayout(disputeBefore.id)

const buyerAfter = await getProfile(buyerId)
const sellerAfter = await getProfile(sellerId)

const buyerWalletAfter = await getWallet(buyerId)
const sellerWalletAfter = await getWallet(sellerId)
const eventsAfter = await getEvents(disputeBefore.id)

console.log('--- VERIFICATION ---')

// 1) second call must fail hard
if (secondCall?.success !== false) {
  throw new Error('Second execution did NOT fail')
}

// 2) dispute must be resolved_partial and remain stable
if (disputeAfter.status !== 'resolved_partial') {
  throw new Error(`Dispute status mismatch: ${disputeAfter.status}`)
}

if (String(disputeAfter.resolved_by_user_id || '') !== ADMIN_USER_ID) {
  throw new Error('resolved_by_user_id mismatch')
}

if (!disputeAfter.resolved_at) {
  throw new Error('resolved_at missing')
}

// 3) payout must be partial_refund once
if (payoutAfter.status !== 'partial_refund') {
  throw new Error(`Payout hold status mismatch: ${payoutAfter.status}`)
}

// 4) buyer and seller balances should move exactly once
const buyerBalanceDiff =
  Number(buyerAfter.balance_cents ?? 0) - Number(buyerBefore.balance_cents ?? 0)
const sellerBalanceDiff =
  Number(sellerAfter.balance_cents ?? 0) - Number(sellerBefore.balance_cents ?? 0)

console.log('Buyer balance diff:', buyerBalanceDiff)
console.log('Seller balance diff:', sellerBalanceDiff)

if (buyerBalanceDiff !== PARTIAL_REFUND_CENTS) {
  throw new Error(
    `Buyer balance diff mismatch: expected ${PARTIAL_REFUND_CENTS}, got ${buyerBalanceDiff}`
  )
}

if (sellerBalanceDiff !== expectedSellerPayout) {
  throw new Error(
    `Seller balance diff mismatch: expected ${expectedSellerPayout}, got ${sellerBalanceDiff}`
  )
}

// 5) wallet rows: exactly one buyer refund row and one seller payout row
const buyerWalletDiff = buyerWalletAfter.length - buyerWalletBefore.length
const sellerWalletDiff = sellerWalletAfter.length - sellerWalletBefore.length

console.log('Buyer wallet diff:', buyerWalletDiff)
console.log('Seller wallet diff:', sellerWalletDiff)

if (buyerWalletDiff !== 1) {
  throw new Error(`Expected exactly 1 new buyer wallet row, got ${buyerWalletDiff}`)
}

if (sellerWalletDiff !== 1) {
  throw new Error(`Expected exactly 1 new seller wallet row, got ${sellerWalletDiff}`)
}

const buyerRefundRowCount = countBuyerRefundWalletRows(buyerWalletAfter, booking.id)
if (buyerRefundRowCount !== 1) {
  throw new Error(`Expected exactly 1 buyer refund row for booking, got ${buyerRefundRowCount}`)
}

const sellerPayoutRowCount = countSellerPayoutWalletRows(sellerWalletAfter, booking.id)
if (sellerPayoutRowCount !== 1) {
  throw new Error(`Expected exactly 1 seller payout row for booking, got ${sellerPayoutRowCount}`)
}

// 6) exactly one partial resolution event
const partialEventCount = countPartialEvents(eventsAfter)
const partialEventCountBefore = countPartialEvents(eventsBefore)
const partialEventDiff = partialEventCount - partialEventCountBefore

console.log('Partial event diff:', partialEventDiff)

if (partialEventDiff !== 1) {
  throw new Error(`Expected exactly 1 new partial event, got ${partialEventDiff}`)
}

// 7) dispute financial fields must match balance movement
const refundAmount = Number(disputeAfter.refund_amount_cents ?? 0)
const sellerAmount = Number(disputeAfter.seller_amount_cents ?? 0)

if (refundAmount !== PARTIAL_REFUND_CENTS) {
  throw new Error(
    `refund_amount_cents mismatch: expected ${PARTIAL_REFUND_CENTS}, got ${refundAmount}`
  )
}

if (sellerAmount !== expectedSellerPayout) {
  throw new Error(
    `seller_amount_cents mismatch: expected ${expectedSellerPayout}, got ${sellerAmount}`
  )
}

console.log('✅ ALL CHECKS PASSED')