import { supabase } from './test-harness.mjs'

async function getLatestSession() {
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) throw new Error('No completed session found')
  return session
}

async function getWalletRows(bookingId) {
  const { data } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('booking_id', bookingId)

  return data || []
}

async function run() {
  console.log('--- VERIFY: RELEASE VS DISPUTE CREATE RACE ---')

  const session = await getLatestSession()
  const bookingId = session.booking_request_id

  console.log('Session:', session.id)
  console.log('Booking:', bookingId)

  const beforeWallet = await getWalletRows(bookingId)

  console.log('--- PARALLEL EXECUTION ---')

  const [releaseRes, disputeRes] = await Promise.all([
    supabase.rpc('run_payout_release'),
    supabase.rpc('create_dispute', {
      p_session_id: session.id,
      p_reason: 'race test',
    }),
  ])

  console.log('Release result:', releaseRes)
  console.log('Dispute result:', disputeRes)

  const afterWallet = await getWalletRows(bookingId)

  const newRows = afterWallet.filter(
    (r) => !beforeWallet.some((b) => b.id === r.id)
  )

  const payoutRows = newRows.filter((r) => r.tx_type === 'seller_payout')
  const refundRows = newRows.filter((r) => r.tx_type === 'booking_refund')

  console.log('--- RESULT ---')
  console.log('New wallet rows:', newRows.length)
  console.log('Payout rows:', payoutRows.length)
  console.log('Refund rows:', refundRows.length)

  // 🔥 CRITICAL CHECKS

  if (payoutRows.length > 0 && refundRows.length > 0) {
    throw new Error('❌ CRITICAL: payout AND refund both executed')
  }

  if (payoutRows.length > 1) {
    throw new Error('❌ Duplicate payout detected')
  }

  if (refundRows.length > 1) {
    throw new Error('❌ Duplicate refund detected')
  }

  console.log('✅ RELEASE VS DISPUTE CREATE RACE PASSED')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })