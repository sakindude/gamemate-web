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

function countBuyerFavorEvents(events) {
  return events.filter((row) => row.event_type === 'dispute_resolved_buyer_favor').length
}

function countBuyerRefundWalletRows(rows, bookingId) {
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

console.log('--- VERIFY: LIGHT CONCURRENCY / BUYER FAVOR ---')

runSeed('seed-flow-dispute-resolve-buyer-favor.mjs')

const disputeBefore = await getLatestDispute()
const booking = await getBooking(disputeBefore.booking_request_id)
const payoutBefore = await getPayout(disputeBefore.id)

const buyerId = booking.buyer_id
const sellerId = booking.seller_id

const buyerBefore = await getProfile(buyerId)
const sellerBefore = await getProfile(sellerId)

const buyerWalletBefore = await getWallet(buyerId)
const sellerWalletBefore = await getWallet(sellerId)
const eventsBefore = await getEvents(disputeBefore.id)

console.log('Dispute:', disputeBefore.id)
console.log('Booking:', booking.id)
console.log('Buyer:', buyerId)
console.log('Seller:', sellerId)

const payload = {
  p_dispute_id: disputeBefore.id,
  p_resolution: 'buyer_favor',
  p_resolved_by_user_id: ADMIN_USER_ID,
  p_resolution_note: 'verify light concurrency buyer favor',
}

console.log('--- FIRING TWO CALLS IN PARALLEL ---')

const [call1, call2] = await Promise.all([
  admin.rpc('resolve_dispute', payload),
  admin.rpc('resolve_dispute', payload),
])

if (call1.error) {
  throw new Error(`Call 1 RPC error: ${call1.error.message}`)
}

if (call2.error) {
  throw new Error(`Call 2 RPC error: ${call2.error.message}`)
}

console.log('Call 1 result:', call1.data)
console.log('Call 2 result:', call2.data)

const results = [call1.data, call2.data]
const successCount = results.filter((row) => row?.success === true).length
const failCount = results.filter((row) => row?.success === false).length

const disputeAfter = await getLatestDispute()
const payoutAfter = await getPayout(disputeBefore.id)

const buyerAfter = await getProfile(buyerId)
const sellerAfter = await getProfile(sellerId)

const buyerWalletAfter = await getWallet(buyerId)
const sellerWalletAfter = await getWallet(sellerId)
const eventsAfter = await getEvents(disputeBefore.id)

console.log('--- VERIFICATION ---')
console.log('Success count:', successCount)
console.log('Fail count:', failCount)

if (successCount !== 1) {
  throw new Error(`Expected exactly 1 success, got ${successCount}`)
}

if (failCount !== 1) {
  throw new Error(`Expected exactly 1 failure, got ${failCount}`)
}

if (disputeAfter.status !== 'resolved_buyer_favor') {
  throw new Error(`Dispute status mismatch: ${disputeAfter.status}`)
}

if (payoutAfter.status !== 'refunded') {
  throw new Error(`Payout hold status mismatch: ${payoutAfter.status}`)
}

const buyerBalanceDiff =
  Number(buyerAfter.balance_cents ?? 0) - Number(buyerBefore.balance_cents ?? 0)
const sellerBalanceDiff =
  Number(sellerAfter.balance_cents ?? 0) - Number(sellerBefore.balance_cents ?? 0)

console.log('Buyer balance diff:', buyerBalanceDiff)
console.log('Seller balance diff:', sellerBalanceDiff)

if (sellerBalanceDiff !== 0) {
  throw new Error(`Seller balance changed unexpectedly: ${sellerBalanceDiff}`)
}

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

const buyerRefundRowCount = countBuyerRefundWalletRows(buyerWalletAfter, booking.id)
if (buyerRefundRowCount !== 1) {
  throw new Error(`Expected exactly 1 buyer refund row for booking, got ${buyerRefundRowCount}`)
}

const buyerFavorEventCountBefore = countBuyerFavorEvents(eventsBefore)
const buyerFavorEventCountAfter = countBuyerFavorEvents(eventsAfter)
const buyerFavorEventDiff = buyerFavorEventCountAfter - buyerFavorEventCountBefore

console.log('Buyer favor event diff:', buyerFavorEventDiff)

if (buyerFavorEventDiff !== 1) {
  throw new Error(`Expected exactly 1 new buyer-favor event, got ${buyerFavorEventDiff}`)
}

console.log('✅ LIGHT CONCURRENCY CHECK PASSED')