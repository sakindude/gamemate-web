// FILE START: scripts/seed-enforcement-restricted-seller.mjs
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function seedRestrictedSeller() {
  const sellerId = '675fdf02-248d-46b0-8f21-e55b4c33195c' // gm_test_seller
  const buyerId = '3268c09d-4bd1-4f63-9029-d403a04db5b3' // gm_test_buyer

  console.log('--- SEED: ENFORCEMENT RESTRICTED SELLER ---')
  console.log(`Seller: gm_test_seller ${sellerId}`)
  console.log(`Buyer: gm_test_buyer ${buyerId}`)

  // Clean up existing booking/session between this pair
  await supabase
    .from('sessions')
    .delete()
    .or(`buyer_id.eq.${buyerId},seller_id.eq.${sellerId}`)
    .eq('status', 'ready_to_start')

  await supabase
    .from('booking_requests')
    .delete()
    .or(`buyer_id.eq.${buyerId},seller_id.eq.${sellerId}`)
    .eq('status', 'pending')

  // Insert strike to push seller into "restricted" state
  const { data, error } = await supabase.rpc('insert_strike', {
    p_user_id: sellerId,
    p_session_id: null,
    p_reason_code: 'no_show_seller',
    p_booking_request_id: null,
    p_points: 5,
    p_note: 'Auto strike for testing enforcement',
    p_expires_at: null,
  })

  if (error) {
    console.error('Error inserting strike:', error)
    process.exit(1)
  }

  // Call enforcement refresh (get_user_enforcement_state) to confirm
  const { data: enforcementData, error: enforcementError } = await supabase.rpc(
    'get_user_enforcement_state',
    { p_user_id: sellerId }
  )

  if (enforcementError) {
    console.error('Error fetching enforcement state:', enforcementError)
    process.exit(1)
  }

  console.log('Seller strike points:', enforcementData.active_strike_points)
  console.log('Seller enforcement state:', enforcementData.enforcement_state)
  console.log('Next threshold:', enforcementData.next_threshold)
  console.log('--- DONE ---')
}

seedRestrictedSeller()