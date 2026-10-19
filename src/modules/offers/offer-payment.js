import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { httpError } from '../../shared/errors.js'
import { money } from '../../shared/money.js'
import { splitName } from '../../shared/party.js'
import { addMonths } from '../../shared/dates.js'
import { checkoutNumber, orderNumber } from '../../shared/numbering.js'
import { mapMessage, mapOfferCard, offerInstallmentsInclude } from './mappers.js'
import eupagoClient, { commissionPercentOf, isMockPayments, createMockSplitPayment } from '../payments/eupago.client.js'
import { resolveVatRate } from '../admin/settings/settings.store.js'
import { notifyPaymentFailure } from '../payments/payment-failure-notify.js'
import { issueTaxInvoicesForCheckout } from '../invoicing/tax-invoice.service.js'

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
      vatRate: true,
      addresses: {
        include: { address: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

async function loadBuyerVatRate(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vatRate: true },
  })
  return resolveVatRate(user?.vatRate)
}

async function createConversionRecords(tx, {
  auth,
  offer,
  productId,
  buyer,
  context,
  extra,
  shippingFee = 0,
  vatAmount = 0,
  paymentMethod = 'multibanco',
  mbwayPhone,
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
      paymentMethod: String(paymentMethod || 'multibanco').toUpperCase(),
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
      vatAmount: money(vatAmount),
      shippingFee: money(shippingFee),
      discountAmount: 0,
      grandTotal: money(total + shippingFee + vatAmount),
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
      vatAmount: money(vatAmount),
      shippingFee: money(shippingFee),
      discountAmount: 0,
      grandTotal: money(total + shippingFee + vatAmount),
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
  const grandTotal = money(total + shippingFee + vatAmount)
  const firstAmount = money(offerInstallments[0]?.amount || total)
  const remaining = money(Math.max(0, grandTotal - firstAmount))

  await tx.paymentPlan.create({
    data: {
      orderId: order.id,
      totalAmount: grandTotal,
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
  shippingFee = 0,
  paymentMethod = 'multibanco',
  mbwayPhone,
}) {
  if (!productId) {
    throw httpError(
      'Offer has no product to convert into an order',
      400,
      'MissingProduct',
    )
  }

  const mock = isMockPayments()
  const sellerId = context.sellerId({ offer, extra })
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      vatRate: true,
      profile: { select: { eupagoExternKey: true, companyName: true } },
    },
  })
  const sellerExternKey = seller?.profile?.eupagoExternKey?.trim()
  if (!sellerExternKey && !mock) {
    throw httpError(
      'Seller payment is not configured',
      400,
      'SellerPaymentNotConfigured',
    )
  }
  const adminExternKey = await eupagoClient.getAdminSplitExternKey()

  const buyer = await loadBuyer(auth.id)
  const vatRate = await loadBuyerVatRate(auth.id)
  const subtotal = money(Number(offer.totalPrice) || 0)
  const vatAmount = money(subtotal * (vatRate / 100))

  const result = await prisma.$transaction(async (tx) => {
    const converted = await createConversionRecords(tx, {
      auth,
      offer,
      productId,
      buyer,
      context,
      extra,
      shippingFee,
      vatAmount,
      paymentMethod,
      mbwayPhone,
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

  // With EuPago the invoice waits for the payment webhook.
  if (mock) void issueTaxInvoicesForCheckout(result.session.id)

  const commissionPercent = commissionPercentOf(seller)
  const grandTotal = money(result.order.grandTotal)
  const merchandise = money(result.order.subTotal)
  const sellerPayout = money(merchandise * (1 - commissionPercent / 100))
  const adminAmount = money(grandTotal - sellerPayout)

  const splits = [
    {
      beneficiaryType: 'SELLER',
      sellerId,
      amount: sellerPayout,
      externKey: sellerExternKey || `MOCK-SELLER-${sellerId}`,
      identifier: `seller-${sellerId}`,
    },
    {
      beneficiaryType: 'ADMIN',
      sellerId: null,
      amount: adminAmount,
      externKey: adminExternKey,
      identifier: 'admin-commission',
    },
  ]

  let eupagoUrl = null
  const method = String(paymentMethod || 'multibanco').toLowerCase()
  try {
    const eupago = await eupagoClient.createSplitPayment({
      paymentMethod: method,
      amount: grandTotal,
      identifier: result.session.checkoutNumber,
      alias: method === 'mbway' ? mbwayPhone : undefined,
      adminCallback: env.payments.eupago.callbackUrl || undefined,
      successUrl: `${env.frontendUrl}/order/confirmation?id=${result.session.id}`,
      cancelUrl: `${env.frontendUrl}/order/confirmation?id=${result.session.id}`,
      beneficiaries: eupagoClient.toEupagoBeneficiaries(
        splits,
        result.session.checkoutNumber,
      ),
    })

    await prisma.checkoutSession.update({
      where: { id: result.session.id },
      data: {
        eupagoEntity: eupago.entity,
        eupagoReference: eupago.reference || eupago.raw?.url || eupago.raw?.redirectUrl || null,
      },
    })

    if (eupago.url) {
      eupagoUrl = eupago.url
    } else if (eupago.raw?.redirectUrl || eupago.raw?.url) {
      eupagoUrl = eupago.raw.redirectUrl || eupago.raw.url
    }
  } catch (err) {
    console.error('EuPago split payment failed, using mock fallback:', err.message)
    void notifyPaymentFailure({
      sellerIds: [sellerId],
      buyerId: auth.id,
      checkoutNumber: result.session.checkoutNumber,
      amount: grandTotal,
      paymentMethod: method,
      error: err,
    })
    const mockResult = createMockSplitPayment({ amount: grandTotal, identifier: result.session.checkoutNumber, paymentMethod: method })
    await prisma.checkoutSession.update({
      where: { id: result.session.id },
      data: {
        eupagoEntity: mockResult.entity,
        eupagoReference: mockResult.reference,
      },
    })
    if (mockResult.url) {
      eupagoUrl = `${env.frontendUrl || 'http://localhost:5173'}/order/confirmation?id=${result.session.id}`
    }
  }

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
      url: eupagoUrl,
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
