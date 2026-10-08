import prisma from '../../../../lib/prisma.js'
import { money } from '../../../shared/money.js'
import { commissionPercentOf } from '../../payments/eupago.client.js'
import {
  activeSinceDate,
  isReferralActive,
  resolveTier,
} from '../helpers.js'

/**
 * After checkout is paid: attribute affiliate commission from admin merchandise share.
 * Formula: adminShare = order.subTotal * seller commission% ; commission = adminShare * tier%
 * Only if buyer was referred and registration is still within the 2-month window.
 */
export async function recordAffiliateCommissionsForCheckout(checkoutSessionId, tx = prisma) {
  if (!checkoutSessionId) return []

  const orders = await tx.order.findMany({
    where: { checkoutSessionId },
    select: {
      id: true,
      customerId: true,
      affiliateId: true,
      subTotal: true,
      grandTotal: true,
      commission: { select: { id: true } },
      seller: { select: { vatRate: true } },
      customer: {
        select: {
          id: true,
          referredById: true,
          createdAt: true,
          referrer: { select: { id: true, role: true } },
        },
      },
    },
  })

  if (!orders.length) return []

  const created = []

  for (const order of orders) {
    if (order.commission) continue

    const affiliateId =
      order.affiliateId ||
      (order.customer?.referrer?.role === 'AFFILIATE'
        ? order.customer.referredById
        : null)

    if (!affiliateId) continue
    if (!order.customer?.createdAt) continue
    if (!isReferralActive(order.customer.createdAt)) continue

    const activeCount = await tx.user.count({
      where: {
        referredById: affiliateId,
        role: { in: ['CUSTOMER', 'COMPANY'] },
        createdAt: { gte: activeSinceDate() },
      },
    })

    const tiers = await tx.affiliateTier.findMany({
      where: { isActive: true },
      orderBy: { minActiveClients: 'desc' },
    })
    const tier = resolveTier(tiers, activeCount)
    const tierPercent = Number(tier?.commissionPercent ?? 0)
    if (tierPercent <= 0) continue

    const adminPercent = commissionPercentOf(order.seller)
    const adminShare = money((Number(order.subTotal) || 0) * (adminPercent / 100))
    const commissionAmount = money(adminShare * (tierPercent / 100))
    if (commissionAmount <= 0) continue

    await tx.order.update({
      where: { id: order.id },
      data: { affiliateId },
    })

    const row = await tx.commissionTransaction.create({
      data: {
        affiliateId,
        orderId: order.id,
        saleAmount: money(order.subTotal),
        commissionAmount,
        status: 'PENDING',
      },
    })

    await tx.wallet.upsert({
      where: { userId: affiliateId },
      create: {
        userId: affiliateId,
        availableBalance: 0,
        pendingBalance: commissionAmount,
      },
      update: {
        pendingBalance: { increment: commissionAmount },
      },
    })

    const wallet = await tx.wallet.findUnique({
      where: { userId: affiliateId },
      select: { id: true },
    })
    if (wallet) {
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          grossAmount: adminShare,
          platformFee: money(adminShare - commissionAmount),
          netAmount: commissionAmount,
          description: `Affiliate commission (${tierPercent}% of admin share) — order ${order.id}`,
        },
      })
    }

    created.push(row)
  }

  return created
}

export default { recordAffiliateCommissionsForCheckout }
