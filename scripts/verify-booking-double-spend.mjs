import {
    findBuyer,
    findSeller,
    forceSellerOnline,
    clearPendingForBuyer,
    clearPendingForSeller,
    supabase,
} from './test-harness.mjs'

async function setBuyerBalance(buyerId, amountCents) {
    const { error } = await supabase
        .from('profiles')
        .update({ balance_cents: amountCents })
        .eq('id', buyerId)

    if (error) throw error
}

async function getProfileBalance(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, balance_cents')
        .eq('id', userId)
        .single()

    if (error) throw error
    if (!data) throw new Error(`Profile not found for ${userId}`)

    return Number(data.balance_cents ?? 0)
}

async function getBuyerBookingRows(buyerId) {
    const { data, error } = await supabase
        .from('booking_requests')
        .select('id, status, seller_id, total_amount_cents, created_at')
        .eq('buyer_id', buyerId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
}

async function getBuyerHoldRows(buyerId) {
    const bookingRows = await getBuyerBookingRows(buyerId)
    const bookingIds = bookingRows.map((row) => row.id)

    if (bookingIds.length === 0) return []

    const { data, error } = await supabase
        .from('payout_holds')
        .select('*')
        .in('booking_request_id', bookingIds)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
}

async function getBuyerWalletRows(buyerId) {
    const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', buyerId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
}

function createAnonClient() {
    const { createClient } = globalThis.__supabase_pkg
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}

async function ensureSupabasePkg() {
    if (globalThis.__supabase_pkg) return
    const pkg = await import('@supabase/supabase-js')
    globalThis.__supabase_pkg = pkg
}

async function createBookingWithHoldAsBuyer({
    buyerEmail,
    buyerPassword,
    sellerId,
}) {
    const anon = createAnonClient()

    const { data: authData, error: authError } = await anon.auth.signInWithPassword({
        email: buyerEmail,
        password: buyerPassword,
    })

    if (authError) {
        return { ok: false, stage: 'login', error: authError.message }
    }

    if (!authData?.session) {
        return { ok: false, stage: 'login', error: 'No buyer session returned' }
    }

    const { data, error } = await anon.rpc('create_booking_with_hold', {
        p_base_price_cents: 1000,
        p_communication_method: 'Discord',
        p_currency: 'USD',
        p_duration_minutes: 60,
        p_game: 'Integrity Test Game',
        p_processing_fee_cents: 0,
        p_seller_id: sellerId,
        p_tip_cents: 0,
    })

    if (error) {
        return { ok: false, stage: 'rpc', error: error.message, rawError: error }
    }

    if (data && typeof data === 'object' && data.success === false) {
        return {
            ok: false,
            stage: 'rpc',
            error: data.message || 'RPC returned success=false',
            data,
        }
    }

    return { ok: true, data }
}

async function run() {
    console.log('--- VERIFY: BOOKING DOUBLE SPEND / PARALLEL BOOKING CREATION ---')

    await ensureSupabasePkg()

    const buyer = await findBuyer()
    const seller = await findSeller()

    const buyerEmail = process.env.PW_TEST_EMAIL
    const buyerPassword = process.env.PW_TEST_PASSWORD

    if (!buyerEmail || !buyerPassword) {
        throw new Error('Missing PW_TEST_EMAIL / PW_TEST_PASSWORD env vars')
    }

    console.log('Buyer:', buyer.display_name, buyer.id)
    console.log('Seller:', seller.display_name, seller.id)

    await forceSellerOnline(seller.id)
    await clearPendingForBuyer(buyer.id)
    await clearPendingForSeller(seller.id)

    console.log('Clean state ready')

    const buyerWalletBefore = await getBuyerWalletRows(buyer.id)
    const bookingsBefore = await getBuyerBookingRows(buyer.id)
    const holdsBefore = await getBuyerHoldRows(buyer.id)

    const startingBalance = 1000
    await setBuyerBalance(buyer.id, startingBalance)

    const buyerBalanceBefore = await getProfileBalance(buyer.id)

    console.log('Buyer balance forced to:', buyerBalanceBefore)

    console.log('--- FIRING TWO BOOKING CREATIONS IN PARALLEL ---')

    const [call1, call2] = await Promise.all([
        createBookingWithHoldAsBuyer({
            buyerEmail,
            buyerPassword,
            sellerId: seller.id,
        }),
        createBookingWithHoldAsBuyer({
            buyerEmail,
            buyerPassword,
            sellerId: seller.id,
        }),
    ])

    console.log('Call 1:', call1)
    console.log('Call 2:', call2)

    const buyerBalanceAfter = await getProfileBalance(buyer.id)
    const buyerWalletAfter = await getBuyerWalletRows(buyer.id)
    const bookingsAfter = await getBuyerBookingRows(buyer.id)
    const holdsAfter = await getBuyerHoldRows(buyer.id)

    const newBookings = bookingsAfter.filter(
        (row) => !bookingsBefore.some((before) => before.id === row.id)
    )

    const newHolds = holdsAfter.filter(
        (row) => !holdsBefore.some((before) => before.id === row.id)
    )

    const newWalletRows = buyerWalletAfter.filter(
        (row) => !buyerWalletBefore.some((before) => before.id === row.id)
    )

    const successCount = [call1, call2].filter((x) => x.ok).length
    const failCount = [call1, call2].filter((x) => !x.ok).length

    console.log('--- VERIFICATION SNAPSHOT ---')
    console.log('Success count:', successCount)
    console.log('Fail count:', failCount)
    console.log('Buyer balance before:', buyerBalanceBefore)
    console.log('Buyer balance after:', buyerBalanceAfter)
    console.log('Balance diff:', buyerBalanceAfter - buyerBalanceBefore)
    console.log('New bookings count:', newBookings.length)
    console.log('New holds count:', newHolds.length)
    console.log('New buyer wallet rows count:', newWalletRows.length)

    if (successCount > 1) {
        throw new Error('DOUBLE-SPEND RISK: more than one parallel booking succeeded')
    }

    if (newBookings.length > 1) {
        throw new Error('INTEGRITY FAILURE: more than one new booking row was created')
    }

    if (newHolds.length > 1) {
        throw new Error('INTEGRITY FAILURE: more than one new payout_hold row was created')
    }

    if (successCount === 1 && newBookings.length !== 1) {
        throw new Error(
            `Expected exactly 1 booking row after one success, got ${newBookings.length}`
        )
    }

    if (successCount === 1 && newHolds.length !== 1) {
        throw new Error(
            `Expected exactly 1 payout_hold row after one success, got ${newHolds.length}`
        )
    }

    if (successCount === 0 && newBookings.length !== 0) {
        throw new Error(
            `Expected 0 new booking rows when both calls failed, got ${newBookings.length}`
        )
    }

    if (successCount === 0 && newHolds.length !== 0) {
        throw new Error(
            `Expected 0 new payout_hold rows when both calls failed, got ${newHolds.length}`
        )
    }

    console.log('✅ BOOKING DOUBLE-SPEND VERIFICATION PASSED')
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })