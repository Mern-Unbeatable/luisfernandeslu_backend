import { env } from '../../config/env.js'
import { mapMessage, mapOfferCard, offerInstallmentsInclude } from './mappers.js'
import { factoryPayContext } from './contexts/factory.context.js'
import { quotePayContext } from './contexts/quote.context.js'

/**
 * Offer side of a confirmed checkout payment: offer PAID, first installment
 * settled, chat confirmation. Runs inside the payment transaction; returns a
 * function that emits the socket events once the transaction committed.
 */
export async function applyOfferPaid(tx, session) {
  if (!session?.quoteOfferId) return null

  const offer = await tx.quoteOffer.findUnique({
    where: { id: session.quoteOfferId },
    include: offerInstallmentsInclude,
  })
  if (!offer || offer.status === 'PAID') return null

  const order = await tx.order.findFirst({
    where: { checkoutSessionId: session.id },
    select: {
      id: true,
      orderNumber: true,
      orderSource: true,
      quoteRequestId: true,
      paymentPlan: { select: { id: true } },
    },
  })
  if (!order) return null

  const now = new Date()
  const paidOffer = await tx.quoteOffer.update({
    where: { id: offer.id },
    data: { status: 'PAID' },
    include: offerInstallmentsInclude,
  })
  if (order.paymentPlan) {
    await tx.installmentSchedule.updateMany({
      where: { paymentPlanId: order.paymentPlan.id, installmentNumber: 1 },
      data: { status: 'COMPLETED', paidAt: now },
    })
  }

  const isFactory = order.orderSource === 'FACTORY_CONVERSION'
  const context = isFactory ? factoryPayContext : quotePayContext
  let extra = {}
  if (!isFactory && order.quoteRequestId) {
    const quote = await tx.quoteRequest.findUnique({
      where: { id: order.quoteRequestId },
      select: { id: true, buyerId: true, sellerId: true },
    })
    extra = { quote, quoteId: order.quoteRequestId }
  }

  const followUp = await context.afterPaid(tx, {
    auth: { id: session.customerId },
    offer,
    offerId: offer.id,
    extra,
    order,
  })

  return () =>
    context.emitPaid({
      extra,
      offerId: offer.id,
      offerCard: mapOfferCard(paidOffer),
      chatMessage: mapMessage(followUp.chatMessage, null, env.apiUrl),
      threadId: followUp.threadId,
    })
}
