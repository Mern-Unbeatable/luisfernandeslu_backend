/**
 * One-off: payment plan for ORD-DEMO-TR-DONE-001 (company project order detail UI).
 * Run: npx tsx src/scripts/seed-order-installments-demo.js
 */
import prisma from '../../lib/prisma.js'
import { addMonths } from '../shared/dates.js'

function splitInstallmentAmounts(total, parts) {
  const n = Math.max(1, parts)
  const base = Math.floor((Number(total) / n) * 100) / 100
  const amounts = Array.from({ length: n - 1 }, () => base)
  const used = base * (n - 1)
  amounts.push(Math.round((Number(total) - used) * 100) / 100)
  return amounts
}

async function ensureOrderPaymentPlan(orderId, { termMonths = 3, allPaid = false } = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, grandTotal: true, createdAt: true, orderNumber: true },
  })
  if (!order) throw new Error('Order not found')

  const existing = await prisma.paymentPlan.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  })
  if (existing) {
    await prisma.installmentSchedule.deleteMany({
      where: { paymentPlanId: existing.id },
    })
    await prisma.paymentPlan.delete({ where: { id: existing.id } })
  }

  const totalAmount = Number(order.grandTotal) || 0
  const amounts = splitInstallmentAmounts(totalAmount, termMonths)
  const anchor = order.createdAt || new Date()
  const rows = amounts.map((amount, index) => {
    const dueDate = addMonths(anchor, index)
    const paid = allPaid || index === 0
    return {
      installmentNumber: index + 1,
      amount,
      dueDate,
      status: paid ? 'COMPLETED' : 'PENDING',
      paidAt: paid ? addMonths(anchor, index) : null,
    }
  })
  const paidAmount = rows
    .filter((row) => row.status === 'COMPLETED')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)

  await prisma.paymentPlan.create({
    data: {
      orderId: order.id,
      totalAmount,
      downPayment: rows[0]?.amount ?? totalAmount,
      remainingBalance: Math.round((totalAmount - paidAmount) * 100) / 100,
      termMonths,
      installments: { create: rows },
    },
  })

  return order.orderNumber
}

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderNumber: 'ORD-DEMO-TR-DONE-001' },
    select: { id: true },
  })
  if (!order) {
    console.error('ORD-DEMO-TR-DONE-001 not found — run pnpm seed:demo first')
    process.exit(1)
  }
  const orderNumber = await ensureOrderPaymentPlan(order.id, {
    termMonths: 3,
    allPaid: true,
  })
  console.log(`Payment plan seeded for ${orderNumber} (3 installments, fully paid)`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
