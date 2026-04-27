import {
  findBuyer,
  findSeller,
  forceSellerOnline,
  clearPendingForSeller,
  clearPendingForBuyer,
  createPendingBooking,
} from './test-harness.mjs'

async function run() {
  console.log('--- SEED: BUYER BLOCK ---')

  const buyer = await findBuyer()
  const seller = await findSeller()

  console.log('Buyer:', buyer.display_name, buyer.id)
  console.log('Seller:', seller.display_name, seller.id)

  await forceSellerOnline(seller.id)

  // buyer ve seller temizlenir
  await clearPendingForBuyer(buyer.id)
  await clearPendingForSeller(seller.id)

  console.log('Clean state ready')

  // buyer → seller pending oluştur
  const booking = await createPendingBooking({
    buyerId: buyer.id,
    sellerId: seller.id,
  })

  console.log('Buyer now has pending booking:', booking.id)
  console.log('--- DONE ---')
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })