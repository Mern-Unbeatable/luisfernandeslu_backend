import 'dotenv/config'
import prisma from '../../lib/prisma.js'

const total = await prisma.product.count()
const sponsored = await prisma.product.count({ where: { isSponsored: true } })
const featured = await prisma.product.count({ where: { isFeatured: true } })
const approved = await prisma.product.count({
  where: { approvalStatus: 'APPROVED' },
})
const live = await prisma.product.count({
  where: {
    approvalStatus: 'APPROVED',
    inventory: { listedQuantity: { gt: 0 } },
  },
})
console.log(JSON.stringify({ total, sponsored, featured, approved, live }, null, 2))
await prisma.$disconnect()
