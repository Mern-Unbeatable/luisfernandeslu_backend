/**
 * One-off: make DEMO10 apply on seeded carts (product bridge + cart link).
 * Run: npx tsx src/scripts/seed-cart-promo-demo.js
 */
import prisma from '../../lib/prisma.js'

async function main() {
  const product = await prisma.product.findFirst({
    where: { sku: 'CEM-DEMO-001' },
    select: { id: true, sellerId: true },
  })
  if (!product) {
    console.error('CEM-DEMO-001 not found — run pnpm seed:demo first')
    process.exit(1)
  }

  const promo = await prisma.promoCode.upsert({
    where: { code: 'DEMO10' },
    create: {
      sellerId: product.sellerId,
      code: 'DEMO10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 50,
      usageLimit: 100,
      expiryDate: new Date('2027-12-31'),
      isActive: true,
      applicableUsers: 'ALL',
    },
    update: {
      sellerId: product.sellerId,
      isActive: true,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 50,
      expiryDate: new Date('2027-12-31'),
    },
  })

  await prisma.promoCodeProductBridge.upsert({
    where: {
      promoCodeId_productId: {
        promoCodeId: promo.id,
        productId: product.id,
      },
    },
    create: { promoCodeId: promo.id, productId: product.id },
    update: {},
  })

  const buyers = await prisma.user.findMany({
    where: {
      email: { in: ['customer@test.local', 'company@test.local'] },
    },
    select: { id: true, email: true },
  })

  for (const buyer of buyers) {
    const cart = await prisma.cart.upsert({
      where: { userId: buyer.id },
      create: { userId: buyer.id },
      update: {},
      select: { id: true },
    })

    const hasItem = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: product.id },
      select: { id: true },
    })
    if (!hasItem) {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, quantity: 12 },
      })
    }

    await prisma.cartPromoCode.upsert({
      where: {
        cartId_promoCodeId: {
          cartId: cart.id,
          promoCodeId: promo.id,
        },
      },
      create: { cartId: cart.id, promoCodeId: promo.id },
      update: {},
    })

    console.log(`Applied DEMO10 on cart for ${buyer.email}`)
  }

  console.log('Done — GET /api/cart should show promo.codes with DEMO10')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
