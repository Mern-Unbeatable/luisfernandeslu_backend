import prisma from '../../../lib/prisma.js'
import { env } from '../../config/env.js'
import { httpError } from '../../shared/errors.js'
import { money } from '../../shared/money.js'
import { splitName } from '../../shared/party.js'
import { addMonths } from '../../shared/dates.js'
import { checkoutNumber, orderNumber } from '../../shared/numbering.js'
import { assertUnloadingVehicle, quoteShippingForSellers } from '../../shared/shipping-quote.js'
import { mapOfferCard, offerInstallmentsInclude } from './mappers.js'
import eupagoClient, { commissionPercentOf, isMockPayments } from '../payments/eupago.client.js'
import { resolveVatRate } from '../admin/settings/settings.store.js'
import { notifyPaymentFailure } from '../payments/payment-failure-notify.js'

export function assertOfferPayable(offer, { rejectRejected = false } = {}) {
  if (offer.status === 'PAID') {
    throw httpError('Offer is already paid', 409, 'AlreadyPaid')
  }
  if (rejectRejected && offer.status === 'REJECTED') {
    throw httpError('Rejected offers cannot be paid', 400, 'OfferRejected')
  }
}

function methodEnum(method) {
  if (method === 'mbway') return 'MBWAY'
  if (method === 'creditcard') return 'CREDITCARD'
  return 'MULTIBANCO'
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

function savedBuyerAddress(buyer) {
  return (
    buyer?.addresses?.find((a) => a.addressType === 'SHIPPING') ||
    buyer?.addresses?.find((a) => a.addressType === 'BILLING') ||
    buyer?.addresses?.[0] ||
    null
  )
}

function hasStreet(address) {
  const street = String(address?.streetAddress || '').trim()
  return Boolean(street && street !== '—')
}

/** Delivery address chosen at checkout: an owned address id, a typed address, or null. */
async function resolveDeliveryAddress(buyer, delivery = {}) {
  if (delivery.shippingAddressId) {
    const owned = buyer?.addresses?.find((a) => a.addressId === delivery.shippingAddressId)
    if (!owned?.address) throw httpError('Address not found', 404, 'AddressNotFound')
    return { id: owned.address.id, address: owned.address }
  }
  if (hasStreet(delivery.shippingAddress)) {
    return { id: null, address: delivery.shippingAddress }
  }
  return null
}

/** Cancels earlier unpaid attempts for the same offer so only one payment can complete it. */
async function cancelStaleOfferSessions(offerId) {
  const stale = await prisma.checkoutSession.findMany({
    where: { quoteOfferId: offerId, paymentStatus: { in: ['PENDING_PAYMENT', 'FAILED'] } },
    select: { id: true },
  })
  if (!stale.length) return
  const ids = stale.map((s) => s.id)
  await prisma.$transaction([
    prisma.checkoutSession.updateMany({
      where: { id: { in: ids }, paymentStatus: { in: ['PENDING_PAYMENT', 'FAILED'] } },
      data: { paymentStatus: 'CANCELLED' },
    }),
    prisma.order.updateMany({
      where: { checkoutSessionId: { in: ids }, orderStatus: 'NEW' },
      data: { orderStatus: 'CANCELLED', cancellationReason: 'Replaced by a new payment attempt' },
    }),
  ])
}

async function createConversionRecords(tx, {
  auth,
  offer,
  productId,
  buyer,
  context,
  extra,
  deliveryAddress,
  unloadingType,
  shippingFee = 0,
  vatAmount = 0,
  paymentMethod = 'multibanco',
}) {
  const quantity = Math.max(1, Math.round(Number(offer.totalQuantity) || 1))
  const total = money(offer.totalPrice)
  const unitPrice = money(total / quantity)
  const now = new Date()
  const { firstName, lastName } = splitName(buyer?.name, context.buyerNameFallback)
  const phone = buyer?.phoneNumber || '000000000'
  const email = buyer?.email || context.emailFallback
  const savedAddress = savedBuyerAddress(buyer)

  let shippingAddressId = deliveryAddress?.id || null
  if (!shippingAddressId && deliveryAddress?.address) {
    const typed = deliveryAddress.address
    const created = await tx.address.create({
      data: {
        title: typed.title || offer.projectName || 'Delivery',
        streetAddress: String(typed.streetAddress).trim(),
        city: String(typed.city || '').trim() || '—',
        state: String(typed.state || '').trim() || '—',
        zipCode: String(typed.zipCode || '').trim() || '—',
        country: String(typed.country || '').trim() || 'Portugal',
      },
    })
    shippingAddressId = created.id
  }
  if (!shippingAddressId) shippingAddressId = savedAddress?.addressId || null
  if (!shippingAddressId) {
    const created = await tx.address.create({
      data: {
        title: offer.projectName || 'Delivery',
        streetAddress: offer.deliveryLocation || 'Delivery address',
        city: '—',
        state: '—',
        zipCode: '—',
        country: 'Portugal',
      },
    })
    shippingAddressId = created.id
  }
  const billingAddressId = savedAddress?.addressId || shippingAddressId

  const project = await tx.project.create({
    data: {
      userId: auth.id,
      projectName: offer.projectName || context.projectFallback,
      location: offer.deliveryLocation || 'Portugal',
    },
  })

  const grandTotal = money(total + shippingFee + vatAmount)
  const session = await tx.checkoutSession.create({
    data: {
      checkoutNumber: checkoutNumber(),
      customerId: auth.id,
      paymentStatus: 'PENDING_PAYMENT',
      paymentMethod: methodEnum(paymentMethod),
      firstName,
      lastName,
      email,
      phone,
      billingAddressId,
      shippingAddressId,
      projectId: project.id,
      quoteOfferId: offer.id,
      unloadingType: unloadingType || offer.unloadingType || null,
      accessConditions: offer.accessConditions || null,
      additionalNotes: context.sessionNotes(offer),
      subTotal: total,
      vatAmount: money(vatAmount),
      shippingFee: money(shippingFee),
      discountAmount: 0,
      grandTotal,
      currency: env.currency,
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
      grandTotal,
      unloadingType: unloadingType || offer.unloadingType || null,
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
          status: 'PENDING',
          paidAt: null,
        })),
      },
    },
  })

  return { order, session }
}

/**
 * Pays an offer through EuPago: creates a pending checkout + order + payment plan.
 * The offer becomes PAID only when the payment is confirmed (webhook, or at once in mock mode).
 * Quote vs factory differences live in `context` (seller, source, shipping, hooks).
 */
export async function payConvertedOffer({
  auth,
  offer,
  productId,
  offerId,
  context,
  extra = {},
  delivery = {},
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
  const vatRate = await resolveVatRate(buyer?.vatRate)
  const subtotal = money(Number(offer.totalPrice) || 0)
  const vatAmount = money(subtotal * (vatRate / 100))
  const deliveryAddress = await resolveDeliveryAddress(buyer, delivery)

  let shippingFee = 0
  let unloadingType = null
  if (context.chargesShipping) {
    if (!deliveryAddress) {
      throw httpError('Provide the delivery address', 400, 'ShippingRequired')
    }
    unloadingType = assertUnloadingVehicle(delivery.unloadingType || offer.unloadingType)
    const quote = await quoteShippingForSellers({
      sellerIds: [sellerId],
      deliveryAddress: deliveryAddress.address,
      unloadingType,
    })
    shippingFee = money(quote.shipping)
  }

  await cancelStaleOfferSessions(offer.id)

  const result = await prisma.$transaction((tx) =>
    createConversionRecords(tx, {
      auth,
      offer,
      productId,
      buyer,
      context,
      extra,
      deliveryAddress,
      unloadingType,
      shippingFee,
      vatAmount,
      paymentMethod,
    }),
  )

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
  await prisma.checkoutPaymentSplit.createMany({
    data: splits.map((s) => ({ ...s, checkoutSessionId: result.session.id })),
  })

  const method = String(paymentMethod || 'multibanco').toLowerCase()
  let eupago
  try {
    eupago = await eupagoClient.createSplitPayment({
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
  } catch (err) {
    await prisma.$transaction([
      prisma.checkoutSession.update({
        where: { id: result.session.id },
        data: { paymentStatus: 'FAILED' },
      }),
      prisma.order.updateMany({
        where: { checkoutSessionId: result.session.id, orderStatus: 'NEW' },
        data: { orderStatus: 'CANCELLED' },
      }),
    ])
    void notifyPaymentFailure({
      sellerIds: [sellerId],
      buyerId: auth.id,
      checkoutNumber: result.session.checkoutNumber,
      amount: grandTotal,
      paymentMethod: method,
      error: err,
    })
    throw httpError(
      err.message || 'Payment provider error',
      err.statusCode || 502,
      err.code || 'EupagoError',
      err.details,
    )
  }

  const redirectUrl = eupago.url || eupago.raw?.redirectUrl || eupago.raw?.url || null
  const session = await prisma.checkoutSession.update({
    where: { id: result.session.id },
    data: {
      eupagoEntity: eupago.entity,
      eupagoReference: eupago.reference || redirectUrl,
      eupagoTransactionId: eupago.raw?.transactionID || eupago.raw?.transactionId || null,
    },
  })

  if (mock) {
    const { default: checkoutService } = await import('../checkout/services/checkout.service.js')
    await checkoutService.markCheckoutPaid(session, 'Mock payment confirmed')
  }

  const [freshOffer, freshSession] = await Promise.all([
    prisma.quoteOffer.findUnique({ where: { id: offer.id }, include: offerInstallmentsInclude }),
    prisma.checkoutSession.findUnique({
      where: { id: session.id },
      select: { id: true, checkoutNumber: true, paymentStatus: true, eupagoEntity: true, eupagoReference: true },
    }),
  ])

  return {
    status: 201,
    body: {
      offer: mapOfferCard(freshOffer),
      url: method === 'creditcard' && !mock ? redirectUrl : null,
      payment: {
        entity: freshSession.eupagoEntity,
        reference: freshSession.eupagoReference,
      },
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        orderStatus: result.order.orderStatus,
        orderSource: result.order.orderSource,
        grandTotal,
      },
      checkout: {
        id: freshSession.id,
        checkoutNumber: freshSession.checkoutNumber,
        paymentStatus: freshSession.paymentStatus,
      },
      offerId,
      message:
        freshSession.paymentStatus === 'PAID'
          ? 'Payment confirmed — order created.'
          : context.responseMessage,
    },
  }
}
