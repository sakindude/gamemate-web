import {
  TEST_BUYER_NAME,
  TEST_SELLER_NAME,
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  createPendingBooking,
} from './test-harness.mjs'

async function run() {
  console.log('--- SEED: BUSY SELLER ---')
  console.log('Requested seller name:', TEST_SELLER_NAME)
  console.log('Requested buyer name:', TEST_BUYER_NAME)

  const seller = await findSeller()
  const buyer = await findBuyer()

  console.log('Seller found:', seller.display_name, seller.id)
  console.log('Buyer found:', buyer.display_name, buyer.id)

  await forceSellerOnline(seller.id)
  console.log('Seller forced online')

  await clearPendingForSeller(seller.id)
  await clearPendingForBuyer(buyer.id)
  console.log('Old pending bookings cleaned')

  const inserted = await createPendingBooking({
    buyerId: buyer.id,
    sellerId: seller.id,
  })

  console.log('New pending booking created:', inserted.id)
  console.log('Seller is now BUSY')
}

run()
  .then(() => {
    console.log('--- DONE ---')
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })