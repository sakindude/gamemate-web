import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE env vars')
}

export const TEST_BUYER_NAME = (process.env.PW_TEST_BUYER_NAME || '').trim()
export const TEST_SELLER_NAME = (process.env.PW_TEST_SELLER_NAME || '').trim()

if (!TEST_BUYER_NAME || !TEST_SELLER_NAME) {
  throw new Error('Missing PW_TEST_BUYER_NAME or PW_TEST_SELLER_NAME')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function findProfileByName(name, { mustBeSeller = false } = {}) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('display_name', name)
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error(`Profile not found for "${name}"`)
  }

  if (mustBeSeller && !data.is_seller) {
    throw new Error(`${name} is not a seller`)
  }

  return data
}

export async function findBuyer() {
  const profile = await findProfileByName(TEST_BUYER_NAME)
  return profile
}

export async function findSeller() {
  const profile = await findProfileByName(TEST_SELLER_NAME, { mustBeSeller: true })
  return profile
}

export async function forceSellerOnline(sellerId) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_online: true })
    .eq('id', sellerId)

  if (error) throw error
}

export async function clearPendingForSeller(sellerId) {
  const { error } = await supabase
    .from('booking_requests')
    .delete()
    .eq('seller_id', sellerId)
    .eq('status', 'pending')

  if (error) throw error
}

export async function clearPendingForBuyer(buyerId) {
  const { error } = await supabase
    .from('booking_requests')
    .delete()
    .eq('buyer_id', buyerId)
    .eq('status', 'pending')

  if (error) throw error
}

export async function createPendingBooking({
  buyerId,
  sellerId,
}) {
  const base = 500
  const tip = 0
  const fee = 0
  const total = base + tip

  const { data, error } = await supabase
    .from('booking_requests')
    .insert({
      seller_id: sellerId,
      buyer_id: buyerId,
      status: 'pending',
      duration_minutes: 60,
      game: 'Destiny 2',
      communication_method: 'Discord',
      currency: 'USD',

      total_price: total / 100,
      base_price_cents: base,
      tip_cents: tip,
      processing_fee_cents: 0,
      platform_fee_cents: 0,
      total_amount_cents: total,
      seller_payout_cents: base + tip,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}