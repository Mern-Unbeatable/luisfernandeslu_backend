import prisma from '../lib/prisma.js'

async function main() {
  const count = await prisma.order.count()
  console.log('Order count:', count)
  const orders = await prisma.order.findMany({
    select: { createdAt: true, grandTotal: true },
  })
  const distribution = {}
  orders.forEach((o) => {
    const y = new Date(o.createdAt).getFullYear()
    distribution[y] = (distribution[y] || 0) + 1
  })
  console.log('Orders per year:', distribution)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
