import {
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  createPendingBooking,
} from './test-harness.mjs'

async function run() {
  console.log('--- SEED: UI ACCEPT FLOW ---')

  const buyer = await findBuyer()
  const seller = await findSeller()

  console.log('Buyer:', buyer.display_name)
  console.log('Seller:', seller.display_name)

  await forceSellerOnline(seller.id)

  await clearPendingForBuyer(buyer.id)
  await clearPendingForSeller(seller.id)

  const booking = await createPendingBooking({
    buyerId: buyer.id,
    sellerId: seller.id,
  })

  console.log('Pending ready for UI accept:', booking.id)
  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })