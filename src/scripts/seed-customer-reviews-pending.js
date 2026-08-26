/**
 * One-off: give customer@test.local COMPLETED orders for Product-to-review demo.
 * Run: node src/scripts/seed-customer-reviews-pending.js
 */
import prisma from '../../lib/prisma.js'

const PASSWORD_HINT = 'Password123!'

async function main() {
  const customer = await prisma.user.findFirst({
    where: { email: 'customer@test.local', role: 'CUSTOMER' },
  })
  if (!customer) throw new Error('customer@test.local not found — run seed-demo first')

  const ship = await prisma.userAddressBridge.findFirst({
    where: { userId: customer.id, addressType: 'SHIPPING' },
    select: { addressId: true },
  })
  if (!ship) throw new Error('Customer shipping address missing')

  const products = await prisma.product.findMany({
    where: {
      sku: { in: ['MKT-DEMO-003', 'MKT-DEMO-004', 'MKT-DEMO-005'] },
      approvalStatus: 'APPROVED',
    },
  })
  if (!products.length) throw new Error('Marketing demo products missing')

  const supplier = await prisma.user.findFirst({
    where: { email: 'supplier@test.local', role: 'SUPPLIER' },
  })
  if (!supplier) throw new Error('supplier@test.local not found')

  let created = 0
  for (let i = 0; i < products.length; i += 1) {
    const product = products[i]
    const orderNumber = `ORD-DEMO-CUST-REV-${String(i + 1).padStart(2, '0')}`

    await prisma.review.deleteMany({
      where: { authorId: customer.id, productId: product.id },
    })

    const existing = await prisma.order.findUnique({ where: { orderNumber } })
    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { orderStatus: 'COMPLETED', cancellationReason: null },
      })
      const hasLine = await prisma.orderLineItem.findFirst({
        where: { orderId: existing.id, productId: product.id },
      })
      if (!hasLine) {
        await prisma.orderLineItem.create({
          data: {
            orderId: existing.id,
            productId: product.id,
            quantity: 8 + i * 2,
            unitPriceLocked: product.basePrice,
            totalPriceLocked: product.basePrice * (8 + i * 2),
          },
        })
      }
      created += 1
      continue
    }

    const qty = 8 + i * 2
    const unit = Number(product.basePrice)
    const sub = unit * qty
    const shippingFee = 15
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        sellerId: supplier.id,
        shippingAddressId: ship.addressId,
        billingAddressId: ship.addressId,
        orderStatus: 'COMPLETED',
        orderSource: 'DIRECT_CART',
        subTotal: sub,
        vatAmount: 0,
        shippingFee,
        discountAmount: 0,
        grandTotal: sub + shippingFee,
        orderLineItems: {
          create: {
            productId: product.id,
            quantity: qty,
            unitPriceLocked: unit,
            totalPriceLocked: sub,
          },
        },
        statusHistory: {
          create: [
            { status: 'PENDING', note: 'Seed: customer review demo' },
            { status: 'DELIVERED', note: 'Seed: delivered' },
            { status: 'COMPLETED', note: 'Seed: completed' },
          ],
        },
      },
    })
    created += 1
    console.log(`Created ${order.orderNumber} → ${product.title}`)
  }

  console.log(`\nDone. ${created} customer completed order(s) ready for review.`)
  console.log(`Login: customer@test.local / ${PASSWORD_HINT}`)
  console.log('GET /api/customer/reviews/pending')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
