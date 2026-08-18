import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { httpError } from '../../shared/errors.js'
import { money } from '../../shared/money.js'
import { splitName } from '../../shared/party.js'
import { addMonths } from '../../shared/dates.js'
import { checkoutNumber, orderNumber } from '../../shared/numbering.js'
import { mapMessage, mapOfferCard, offerInstallmentsInclude } from './mappers.js'

export function assertOfferPayable(offer, { rejectRejected = false } = {}) {
  if (offer.status === 'PAID') {
    throw httpError('Offer is already paid', 409, 'AlreadyPaid')
  }
  if (rejectRejected && offer.status === 'REJECTED') {
    throw httpError('Rejected offers cannot be paid', 400, 'OfferRejected')
  }
}

async function loadBuyer(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      addresses: {
        include: { address: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

async function createConversionRecords(tx, {
  auth,
  offer,
  productId,
  buyer,
  context,
  extra,
}) {
  const quantity = Math.max(1, Math.round(Number(offer.totalQuantity) || 1))
  const total = money(offer.totalPrice)
  const unitPrice = money(total / quantity)
  const now = new Date()
  const { firstName, lastName } = splitName(buyer?.name, context.buyerNameFallback)
  const phone = buyer?.phoneNumber || '000000000'
  const email = buyer?.email || context.emailFallback
  const savedAddress =
    buyer?.addresses?.find((a) => a.addressType === 'SHIPPING') ||
    buyer?.addresses?.find((a) => a.addressType === 'BILLING') ||
    buyer?.addresses?.[0] ||
    null

  let shippingAddressId = savedAddress?.addressId || null
  let billingAddressId = savedAddress?.addressId || null

  if (!shippingAddressId) {
    const createdAddress = await tx.address.create({
      data: {
        title: offer.projectName || 'Delivery',
        streetAddress: offer.deliveryLocation || 'Delivery address',
        city: 'Lisbon',
        state: 'Lisboa',
        zipCode: '1000-001',
        country: 'Portugal',
      },
    })
    shippingAddressId = createdAddress.id
    billingAddressId = createdAddress.id
  }

  const project = await tx.project.create({
    data: {
      userId: auth.id,
      projectName: offer.projectName || context.projectFallback,
      location: offer.deliveryLocation || 'Portugal',
    },
  })

  const session = await tx.checkoutSession.create({
    data: {
      checkoutNumber: checkoutNumber(),
      customerId: auth.id,
      paymentStatus: 'PAID',
      paymentMethod: 'MULTIBANCO',
      firstName,
      lastName,
      email,
      phone,
      billingAddressId,
      shippingAddressId,
      projectId: project.id,
      unloadingType: offer.unloadingType || null,
      accessConditions: offer.accessConditions || null,
      additionalNotes: context.sessionNotes(offer),
      subTotal: total,
      vatAmount: 0,
      shippingFee: 0,
      discountAmount: 0,
      grandTotal: total,
      currency: env.currency,
      paidAt: now,
    },
  })

  const order = await tx.order.create({
    data: {
      orderNumber: orderNumber(context.orderNumberSuffix),
      customerId: auth.id,
      sellerId: context.sellerId({ offer, extra }),
      checkoutSessionId: session.id,
      projectId: project.id,
      ...(context.quoteRequestId
        ? { quoteRequestId: context.quoteRequestId({ extra }) }
        : {}),
      shippingAddressId,
      billingAddressId,
      orderStatus: 'NEW',
      orderSource: context.orderSource,
      subTotal: total,
      vatAmount: 0,
      shippingFee: 0,
      discountAmount: 0,
      grandTotal: total,
      unloadingType: offer.unloadingType || null,
      siteConditions: offer.accessConditions || null,
      orderLineItems: {
        create: {
          productId,
          quantity,
          unitPriceLocked: unitPrice,
          totalPriceLocked: total,
          warehouseLocation: offer.warehouseLocation || null,
        },
      },
      statusHistory: {
        create: [{ status: 'NEW', note: context.historyNote }],
      },
    },
  })

  const offerInstallments = offer.installments?.length
    ? offer.installments
    : [{ installmentNumber: 1, amount: total, quantity }]
  const firstAmount = money(offerInstallments[0]?.amount || total)
  const remaining = money(Math.max(0, total - firstAmount))

  await tx.paymentPlan.create({
    data: {
      orderId: order.id,
      totalAmount: total,
      downPayment: firstAmount,
      remainingBalance: remaining,
      termMonths: offer.installmentMonths || offerInstallments.length || 1,
      installments: {
        create: offerInstallments.map((row, index) => ({
          installmentNumber: row.installmentNumber || index + 1,
          amount: money(row.amount),
          dueDate: addMonths(now, index),
          status: index === 0 ? 'COMPLETED' : 'PENDING',
          paidAt: index === 0 ? now : null,
        })),
      },
    },
  })

  const paidOffer = await tx.quoteOffer.update({
    where: { id: offer.id },
    data: { status: 'PAID' },
    include: offerInstallmentsInclude,
  })

  return { order, session, offer: paidOffer }
}

/**
 * Demo-pay an offer: checkout + order + payment plan + PAID status.
 * Quote vs factory differences live in `context` (seller, source, hooks).
 */
export async function payConvertedOffer({
  auth,
  offer,
  productId,
  offerId,
  baseUrl,
  context,
  extra = {},
}) {
  if (!productId) {
    throw httpError(
      'Offer has no product to convert into an order',
      400,
      'MissingProduct',
    )
  }

  const buyer = await loadBuyer(auth.id)
  const result = await prisma.$transaction(async (tx) => {
    const converted = await createConversionRecords(tx, {
      auth,
      offer,
      productId,
      buyer,
      context,
      extra,
    })
    const followUp = await context.afterPaid(tx, {
      auth,
      offer,
      offerId,
      extra,
      ...converted,
    })
    return { ...converted, ...followUp }
  })

  const offerCard = mapOfferCard(result.offer)
  const chatMessage = mapMessage(result.chatMessage, auth.id, baseUrl)
  const publicMessage = mapMessage(result.chatMessage, null, baseUrl)

  context.emitPaid({
    extra,
    offerId,
    offerCard,
    chatMessage: publicMessage,
    threadId: result.threadId,
  })

  return {
    status: 201,
    body: {
      offer: offerCard,
      chatMessage,
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        orderStatus: result.order.orderStatus,
        orderSource: result.order.orderSource,
        grandTotal: money(result.order.grandTotal),
      },
      checkout: {
        id: result.session.id,
        checkoutNumber: result.session.checkoutNumber,
        paymentStatus: result.session.paymentStatus,
      },
      message: context.responseMessage,
    },
  }
}
