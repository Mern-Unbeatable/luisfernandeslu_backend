/**
 * Backfill CUSTOMER + SUPPLIER invoices for any demo orders missing them.
 * Run: npx tsx src/scripts/seed-order-invoices.js
 */
import prisma from '../../lib/prisma.js'
import { invoiceNumber } from '../shared/numbering.js'

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { orderNumber: { startsWith: 'ORD-DEMO-' } },
        { invoices: { none: {} } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      invoices: { select: { audience: true } },
    },
  })

  let added = 0
  for (const order of orders) {
    const have = new Set(order.invoices.map((i) => i.audience))
    for (const audience of ['CUSTOMER', 'SUPPLIER']) {
      if (have.has(audience)) continue
      await prisma.invoice.create({
        data: {
          orderId: order.id,
          audience,
          invoiceNumber: invoiceNumber(order.orderNumber, { audience }),
          issueDate: order.createdAt || new Date(),
        },
      })
      added += 1
      console.log(`+ ${order.orderNumber} ${audience}`)
    }
  }

  console.log(`Done. Added ${added} invoice(s) across ${orders.length} order(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
