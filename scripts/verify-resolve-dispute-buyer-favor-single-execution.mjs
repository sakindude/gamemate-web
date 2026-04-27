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

function countBuyerFavorEvents(events) {
  return events.filter((row) => row.event_type === 'dispute_resolved_buyer_favor').length
}

function countRefundWalletRows(rows, bookingId) {
  return rows.filter((row) => {
    const txType = String(row.tx_type || row.type || '').toLowerCase()
    const note = String(row.note || row.description || '').toLowerCase()
    const sameBooking = String(row.booking_id || '') === String(bookingId)

    return (
      sameBooking &&
      (txType.includes('refund') ||
        note.includes('refund') ||
        note.includes('buyer favor') ||
        note.includes('dispute'))
    )
  }).length
}

console.log('--- VERIFY: BUYER FAVOR SINGLE EXECUTION ---')

runSeed('seed-flow-dispute-resolve-buyer-favor.mjs')

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

console.log('Dispute:', disputeBefore.id)
console.log('Booking:', booking.id)
console.log('Buyer:', buyerId)
console.log('Seller:', sellerId)

console.log('--- FIRST CALL ---')
const { data: firstCall, error: firstError } = await admin.rpc('resolve_dispute', {
  p_dispute_id: disputeBefore.id,
  p_resolution: 'buyer_favor',
  p_resolved_by_user_id: ADMIN_USER_ID,
  p_resolution_note: 'verify buyer favor single execution',
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
  p_resolution: 'buyer_favor',
  p_resolved_by_user_id: ADMIN_USER_ID,
  p_resolution_note: 'verify buyer favor single execution second call',
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

// 2) dispute must be in resolved buyer favor state and remain stable
if (disputeAfter.status !== 'resolved_buyer_favor') {
  throw new Error(`Dispute status mismatch: ${disputeAfter.status}`)
}

if (String(disputeAfter.resolved_by_user_id || '') !== ADMIN_USER_ID) {
  throw new Error('resolved_by_user_id mismatch')
}

if (!disputeAfter.resolved_at) {
  throw new Error('resolved_at missing')
}

// 3) payout must be refunded once
if (payoutAfter.status !== 'refunded') {
  throw new Error(`Payout hold status mismatch: ${payoutAfter.status}`)
}

// 4) buyer should gain refund once, seller should gain nothing
const buyerBalanceDiff = Number(buyerAfter.balance_cents ?? 0) - Number(buyerBefore.balance_cents ?? 0)
const sellerBalanceDiff = Number(sellerAfter.balance_cents ?? 0) - Number(sellerBefore.balance_cents ?? 0)

console.log('Buyer balance diff:', buyerBalanceDiff)
console.log('Seller balance diff:', sellerBalanceDiff)

if (sellerBalanceDiff !== 0) {
  throw new Error(`Seller balance changed unexpectedly: ${sellerBalanceDiff}`)
}

// 5) wallet rows: exactly one new buyer-side refund row, zero seller rows
const buyerWalletDiff = buyerWalletAfter.length - buyerWalletBefore.length
const sellerWalletDiff = sellerWalletAfter.length - sellerWalletBefore.length

console.log('Buyer wallet diff:', buyerWalletDiff)
console.log('Seller wallet diff:', sellerWalletDiff)

if (buyerWalletDiff !== 1) {
  throw new Error(`Expected exactly 1 new buyer wallet row, got ${buyerWalletDiff}`)
}

if (sellerWalletDiff !== 0) {
  throw new Error(`Expected 0 new seller wallet rows, got ${sellerWalletDiff}`)
}

const buyerRefundRowCount = countRefundWalletRows(buyerWalletAfter, booking.id)
if (buyerRefundRowCount !== 1) {
  throw new Error(`Expected exactly 1 buyer refund row for booking, got ${buyerRefundRowCount}`)
}

// 6) exactly one buyer-favor resolution event
const buyerFavorEventCount = countBuyerFavorEvents(eventsAfter)
const buyerFavorEventCountBefore = countBuyerFavorEvents(eventsBefore)
const buyerFavorEventDiff = buyerFavorEventCount - buyerFavorEventCountBefore

console.log('Buyer favor event diff:', buyerFavorEventDiff)

if (buyerFavorEventDiff !== 1) {
  throw new Error(`Expected exactly 1 new buyer-favor event, got ${buyerFavorEventDiff}`)
}

// 7) refund amount should match dispute financial fields if present
const refundAmount = Number(disputeAfter.refund_amount_cents ?? 0)
if (refundAmount < 0) {
  throw new Error(`Invalid dispute refund_amount_cents: ${refundAmount}`)
}

if (buyerBalanceDiff !== refundAmount) {
  throw new Error(
    `Buyer balance diff (${buyerBalanceDiff}) does not match dispute refund_amount_cents (${refundAmount})`
  )
}

console.log('✅ ALL CHECKS PASSED')