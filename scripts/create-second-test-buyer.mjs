import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const SECOND_BUYER_EMAIL =
  process.env.PW_TEST_SECOND_BUYER_EMAIL ||
  'gm_test_buyer_2@gmail.com'

const SECOND_BUYER_PASSWORD =
  process.env.PW_TEST_SECOND_BUYER_PASSWORD ||
  process.env.PW_TEST_PASSWORD ||
  '123456789'

const SECOND_BUYER_USERNAME =
  process.env.PW_TEST_SECOND_BUYER_NAME ||
  'gm_test_buyer_2'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function fail(message) {
  throw new Error(message)
}

async function ensureAuthUser() {
  const { data: listData, error: listError } = await admin.auth.admin.listUsers()

  if (listError) throw listError

  const existing = (listData?.users || []).find(
    (user) => user.email?.toLowerCase() === SECOND_BUYER_EMAIL.toLowerCase()
  )

  if (existing) {
    console.log('Auth user already exists:', existing.id)
    return existing
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: SECOND_BUYER_EMAIL,
    password: SECOND_BUYER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: SECOND_BUYER_USERNAME,
      display_name: SECOND_BUYER_USERNAME,
    },
  })

  if (error) throw error
  if (!data?.user) fail('Auth user was not created')

  console.log('Auth user created:', data.user.id)
  return data.user
}

async function ensureProfile(userId) {
  const { data: existingProfile, error: existingError } = await admin
    .from('profiles')
    .select('id, email, username, display_name, is_seller')
    .eq('id', userId)
    .maybeSingle()

  if (existingError) throw existingError

  if (existingProfile) {
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        email: SECOND_BUYER_EMAIL,
        username: SECOND_BUYER_USERNAME,
        display_name: SECOND_BUYER_USERNAME,
        is_seller: false,
        balance_cents: 5000,
      })
      .eq('id', userId)

    if (updateError) throw updateError

    console.log('Profile updated:', userId)
    return
  }

  const { error: insertError } = await admin
    .from('profiles')
    .insert({
      id: userId,
      email: SECOND_BUYER_EMAIL,
      username: SECOND_BUYER_USERNAME,
      display_name: SECOND_BUYER_USERNAME,
      is_seller: false,
      balance_cents: 5000,
    })

  if (insertError) throw insertError

  console.log('Profile inserted:', userId)
}

async function main() {
  console.log('--- CREATE SECOND TEST BUYER ---')
  console.log('Email:', SECOND_BUYER_EMAIL)
  console.log('Username:', SECOND_BUYER_USERNAME)

  const user = await ensureAuthUser()
  await ensureProfile(user.id)

  const { data: finalProfile, error: finalError } = await admin
    .from('profiles')
    .select('id, email, username, display_name, is_seller, balance_cents')
    .eq('id', user.id)
    .single()

  if (finalError) throw finalError

  console.log('Final profile:', finalProfile)
  console.log('--- DONE ---')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})