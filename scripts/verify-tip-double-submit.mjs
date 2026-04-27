import { createClient } from '@supabase/supabase-js'
import { supabase } from './test-harness.mjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BUYER_EMAIL = process.env.PW_TEST_EMAIL
const BUYER_PASSWORD = process.env.PW_TEST_PASSWORD

const TIP_AMOUNT_CENTS = 200

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function createBuyerClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function signInBuyer(client) {
  const { data, error } = await client.auth.signInWithPassword({
    email: BUYER_EMAIL,
    password: BUYER_PASSWORD,
  })

  if (error) fail(`Buyer signInWithPassword failed: ${error.message}`)
  if (!data.session) fail('Buyer auth session not created')
}

async function getLatestCompletedSession() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) fail(`getLatestCompletedSession failed: ${error.message}`)
  if (!data) fail('No completed session found')

  return data
}

async function getProfileBalance(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('balance_cents')
    .eq('id', userId)
    .single()

  if (error) fail(`getProfileBalance failed: ${error.message}`)
  if (!data) fail(`Profile not found for ${userId}`)

  return Number(data.balance_cents ?? 0)
}

async function getTipRows(bookingId) {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('tx_type', 'tip_credit')
    .order('created_at', { ascending: true })

  if (error) fail(`getTipRows failed: ${error.message}`)

  return data || []
}

async function callCreateTip(client, bookingId, label) {
  const { data, error } = await client.rpc('create_tip', {
    p_booking_id: bookingId,
    p_amount_cents: TIP_AMOUNT_CENTS,
  })

  return {
    label,
    ok: !error && data?.success === true,
    error: error?.message || null,
    data,
  }
}

async function run() {
  console.log('--- VERIFY: TIP DOUBLE SUBMIT ---')

  const buyerClient1 = createBuyerClient()
  const buyerClient2 = createBuyerClient()

  try {
    await signInBuyer(buyerClient1)
    await signInBuyer(buyerClient2)

    const session = await getLatestCompletedSession()
    const bookingId = session.booking_request_id
    const buyerId = session.buyer_id
    const sellerId = session.seller_id

    console.log('Session:', session.id)
    console.log('Booking:', bookingId)

    const buyerBalanceBefore = await getProfileBalance(buyerId)
    const sellerBalanceBefore = await getProfileBalance(sellerId)
    const tipRowsBefore = await getTipRows(bookingId)

    console.log('Buyer balance before:', buyerBalanceBefore)
    console.log('Seller balance before:', sellerBalanceBefore)
    console.log('Tip rows before:', tipRowsBefore.length)

    const [call1, call2] = await Promise.all([
      callCreateTip(buyerClient1, bookingId, 'tip-call-1'),
      callCreateTip(buyerClient2, bookingId, 'tip-call-2'),
    ])

    console.log(call1)
    console.log(call2)

    const buyerBalanceAfter = await getProfileBalance(buyerId)
    const sellerBalanceAfter = await getProfileBalance(sellerId)
    const tipRowsAfter = await getTipRows(bookingId)

    const newTipRows = tipRowsAfter.filter(
      (row) => !tipRowsBefore.some((before) => before.id === row.id)
    )

    const successCount = [call1, call2].filter((x) => x.ok).length

    console.log('Buyer balance after:', buyerBalanceAfter)
    console.log('Seller balance after:', sellerBalanceAfter)
    console.log('New tip rows:', newTipRows.length)
    console.log('Success count:', successCount)

    assert(successCount <= 1, 'More than one tip request succeeded')
    assert(newTipRows.length <= 1, 'More than one tip_credit row created')

    if (successCount === 1) {
      assert(
        buyerBalanceAfter === buyerBalanceBefore - TIP_AMOUNT_CENTS,
        `Buyer balance should decrease once by ${TIP_AMOUNT_CENTS}`
      )
      assert(
        sellerBalanceAfter === sellerBalanceBefore + TIP_AMOUNT_CENTS,
        `Seller balance should increase once by ${TIP_AMOUNT_CENTS}`
      )
      assert(newTipRows.length === 1, 'Expected exactly one new tip_credit row')
    }

    if (successCount === 0) {
      assert(
        buyerBalanceAfter === buyerBalanceBefore,
        'Buyer balance changed even though both tip calls failed'
      )
      assert(
        sellerBalanceAfter === sellerBalanceBefore,
        'Seller balance changed even though both tip calls failed'
      )
      assert(newTipRows.length === 0, 'Tip row created even though both tip calls failed')
    }

    console.log('✅ TIP DOUBLE SUBMIT PASSED')
  } finally {
    try {
      await buyerClient1.auth.signOut()
    } catch {}

    try {
      await buyerClient2.auth.signOut()
    } catch {}
  }
}

await run()