import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import cartService from '../../cart/services/cart.service.js'
import {
  createSplitPayment,
  getAdminExternKey,
  getCommissionPercent,
  getPaymentProvider,
  isMockPayments,
} from '../../payments/eupago.client.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

function money(n) {
  return Number(Number(Math.max(0, n)).toFixed(2))
}

function methodEnum(method) {
  const m = String(method || 'multibanco').toLowerCase()
  if (m === 'mbway') return 'MBWAY'
  if (m === 'creditcard') return 'CREDITCARD'
  return 'MULTIBANCO'
}

function siteConditionsText(body) {
  const parts = []
  if (body.unloadingLocationDescription) {
    parts.push(`Unloading: ${body.unloadingLocationDescription}`)
  }
  if (body.accessConditions) {
    parts.push(`Access: ${body.accessConditions}`)
  }
  if (body.additionalNotes) {
    parts.push(`Notes: ${body.additionalNotes}`)
  }
  return parts.length ? parts.join('\n') : null
}

function checkoutNumber() {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `CHK-${t}-${r}`
}

function orderNumber(suffix) {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `ORD-${t}-${r}${suffix != null ? `-${suffix}` : ''}`
}

function mapAddress(a) {
  if (!a) return null
  return {
    id: a.id,
    title: a.title,
    streetAddress: a.streetAddress,
    city: a.city,
    state: a.state,
    zipCode: a.zipCode,
    country: a.country,
  }
}

function formatAddressLine(a) {
  if (!a) return null
  return [a.streetAddress, a.city, a.state, a.zipCode, a.country]
    .filter(Boolean)
    .join(', ')
}

/**
 * Success / failed page — only fields shown on Order Confirmed UI.
 */
function mapConfirmationPage(session, baseUrl) {
  const items = []
  for (const order of session.orders || []) {
    for (const li of order.orderLineItems || []) {
      const banner = (li.product?.media || []).find((m) => m.isBanner)
      items.push({
        title: li.product?.title || null,
        image: banner ? absolutizeUrl(banner.mediaUrl, baseUrl) : null,
        quantity: li.quantity,
        unitPrice: li.unitPriceLocked,
      })
    }
  }

  const status = session.paymentStatus
  const page =
    status === 'PAID' ? 'success' : status === 'PENDING_PAYMENT' ? 'pending' : 'failed'

  const orderNumber =
    session.checkoutNumber ||
    session.orders?.[0]?.orderNumber ||
    null

  return {
    page,
    orderNumber,
    date: session.paidAt || session.createdAt,
    email: session.email,
    itemCount: items.length,
    shippingAddress: formatAddressLine(session.shippingAddress),
    shippingMethod: 'Standard Courier',
    items,
    subtotal: session.subTotal,
    shipping: session.shippingFee,
    vat: session.vatAmount,
    total: session.grandTotal,
    currency: session.currency,
    paymentMethod: 'Online Payment',
  }
}

const confirmationInclude = {
  billingAddress: true,
  shippingAddress: true,
  orders: {
    include: {
      orderLineItems: {
        include: {
          product: {
            select: {
              title: true,
              media: {
                where: { isBanner: true },
                take: 1,
                select: { mediaUrl: true, isBanner: true },
              },
            },
          },
        },
      },
    },
  },
}

function mapCheckout(session) {
  return {
    id: session.id,
    checkoutNumber: session.checkoutNumber,
    paymentStatus: session.paymentStatus,
    paymentMethod: session.paymentMethod,
    contact: {
      firstName: session.firstName,
      lastName: session.lastName,
      email: session.email,
      phone: session.phone,
    },
    billingAddress: mapAddress(session.billingAddress),
    shippingAddress: mapAddress(session.shippingAddress),
    project: session.project
      ? {
          id: session.project.id,
          projectName: session.project.projectName,
          location: session.project.location,
        }
      : null,
    unloadingType: session.unloadingType,
    unloadingLocationDescription: session.unloadingLocationDescription,
    accessConditions: session.accessConditions,
    additionalNotes: session.additionalNotes,
    totals: {
      subtotal: session.subTotal,
      discount: session.discountAmount,
      shipping: session.shippingFee,
      vat: session.vatAmount,
      total: session.grandTotal,
      currency: session.currency,
    },
    payment: {
      provider: getPaymentProvider(),
      entity: session.eupagoEntity,
      reference: session.eupagoReference,
      transactionId: session.eupagoTransactionId,
      ...(getPaymentProvider() === 'mock' &&
      session.paymentStatus === 'PENDING_PAYMENT'
        ? { confirmPath: `/api/checkout/${session.id}/pay` }
        : {}),
    },
    splits: (session.splits || []).map((s) => ({
      id: s.id,
      beneficiaryType: s.beneficiaryType,
      sellerId: s.sellerId,
      amount: s.amount,
      identifier: s.identifier,
    })),
    orders: (session.orders || []).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      sellerId: o.sellerId,
      orderStatus: o.orderStatus,
      subTotal: o.subTotal,
      discountAmount: o.discountAmount,
      shippingFee: o.shippingFee,
      vatAmount: o.vatAmount,
      grandTotal: o.grandTotal,
      lineItems: (o.orderLineItems || []).map((li) => ({
        id: li.id,
        productId: li.productId,
        quantity: li.quantity,
        unitPrice: li.unitPriceLocked,
        totalPrice: li.totalPriceLocked,
        title: li.product?.title,
      })),
    })),
    createdAt: session.createdAt,
    paidAt: session.paidAt,
  }
}

class CheckoutService {
  assertBuyer(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'customer' && role !== 'company') {
      throw httpError(
        'Only customer or company can checkout',
        403,
        'Forbidden',
      )
    }
    return role
  }

  async loadVatRate(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { vatRate: true },
    })
    return user?.vatRate ?? 0
  }

  async assertOwnedAddress(userId, addressId) {
    const bridge = await prisma.userAddressBridge.findFirst({
      where: { userId, addressId },
      select: { addressId: true },
    })
    if (!bridge) {
      throw httpError('Address not found', 404, 'AddressNotFound')
    }
    return addressId
  }

  async createInlineAddress(tx, userId, data, { save, addressType }) {
    const address = await tx.address.create({
      data: {
        title: data.title || null,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        country: data.country || 'Portugal',
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      },
    })

    if (save) {
      await tx.userAddressBridge.create({
        data: {
          userId,
          addressId: address.id,
          addressType: addressType || 'SHIPPING',
          isDefault: false,
        },
      })
    }

    return address.id
  }

  async resolveAddresses(tx, userId, body) {
    let billingAddressId
    if (body.billingAddressId) {
      billingAddressId = await this.assertOwnedAddress(
        userId,
        body.billingAddressId,
      )
    } else {
      billingAddressId = await this.createInlineAddress(
        tx,
        userId,
        body.billingAddress,
        {
          save: Boolean(body.saveBillingAddress),
          addressType: 'BILLING',
        },
      )
    }

    let shippingAddressId
    if (body.sameAsBilling) {
      shippingAddressId = billingAddressId
    } else if (body.shippingAddressId) {
      shippingAddressId = await this.assertOwnedAddress(
        userId,
        body.shippingAddressId,
      )
    } else {
      shippingAddressId = await this.createInlineAddress(
        tx,
        userId,
        body.shippingAddress,
        {
          save: Boolean(body.saveShippingAddress),
          addressType: 'SHIPPING',
        },
      )
    }

    return { billingAddressId, shippingAddressId }
  }

  buildSellerBuckets(pricedItems) {
    const bySeller = new Map()
    for (const item of pricedItems) {
      const sellerId = item.sellerId
      if (!sellerId) {
        throw httpError(
          `Product ${item.title} has no seller`,
          400,
          'MissingSeller',
        )
      }
      if (!bySeller.has(sellerId)) {
        bySeller.set(sellerId, {
          sellerId,
          items: [],
          merchandise: 0,
          discount: 0,
          original: 0,
        })
      }
      const bucket = bySeller.get(sellerId)
      bucket.items.push(item)
      bucket.merchandise = money(bucket.merchandise + item.subtotal)
      bucket.discount = money(
        bucket.discount + (item.promo?.discountAmount || 0),
      )
      bucket.original = money(
        bucket.original +
          (item.promo?.originalSubtotal ?? item.subtotal + (item.promo?.discountAmount || 0)),
      )
    }
    return [...bySeller.values()]
  }

  allocateSharedFees(buckets, shipping, vat) {
    const totalMerch = money(
      buckets.reduce((s, b) => s + b.merchandise, 0),
    )
    let shippingLeft = shipping
    let vatLeft = vat
    return buckets.map((b, idx) => {
      const isLast = idx === buckets.length - 1
      let shipShare = 0
      let vatShare = 0
      if (isLast) {
        shipShare = money(shippingLeft)
        vatShare = money(vatLeft)
      } else if (totalMerch > 0) {
        shipShare = money((shipping * b.merchandise) / totalMerch)
        vatShare = money((vat * b.merchandise) / totalMerch)
        shippingLeft = money(shippingLeft - shipShare)
        vatLeft = money(vatLeft - vatShare)
      }
      const grandTotal = money(b.merchandise + shipShare + vatShare)
      return {
        ...b,
        shippingFee: shipShare,
        vatAmount: vatShare,
        grandTotal,
      }
    })
  }

  async place(auth, body, baseUrl) {
    const role = this.assertBuyer(auth)

    if (role === 'company') {
      if (!body.projectName?.trim() || !body.projectLocation?.trim()) {
        throw httpError(
          'projectName and projectLocation are required for company checkout',
          400,
          'ProjectRequired',
        )
      }
    }

    const mock = isMockPayments()
    const adminExternKey = getAdminExternKey()
    if (!mock && !adminExternKey) {
      throw httpError(
        'Admin EuPago beneficiary is not configured',
        503,
        'EupagoAdminNotConfigured',
      )
    }

    const vatRate = await this.loadVatRate(auth.id)
    const priced = await cartService.priceSelection(
      auth.id,
      role,
      body.cartItemIds,
      vatRate,
      baseUrl,
    )

    let buckets = this.buildSellerBuckets(priced.items)
    buckets = this.allocateSharedFees(
      buckets,
      priced.totals.shipping,
      priced.totals.vat,
    )

    const sellerIds = buckets.map((b) => b.sellerId)
    const sellers = await prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: {
        id: true,
        profile: { select: { eupagoExternKey: true, companyName: true } },
      },
    })
    const sellerMap = new Map(sellers.map((s) => [s.id, s]))

    for (const b of buckets) {
      const seller = sellerMap.get(b.sellerId)
      const key = seller?.profile?.eupagoExternKey?.trim()
      if (!key && !mock) {
        throw httpError(
          `Seller payment is not configured for one or more products`,
          400,
          'SellerPaymentNotConfigured',
          {
            sellerId: b.sellerId,
            productIds: b.items.map((i) => i.productId),
          },
        )
      }
      b.externKey = key || `MOCK-SELLER-${b.sellerId}`
    }

    const commissionPercent = getCommissionPercent()
    const splits = []
    let sellerPayoutSum = 0
    for (const b of buckets) {
      const payout = money(
        b.merchandise * (1 - commissionPercent / 100),
      )
      b.sellerPayout = payout
      sellerPayoutSum = money(sellerPayoutSum + payout)
      splits.push({
        beneficiaryType: 'SELLER',
        sellerId: b.sellerId,
        amount: payout,
        externKey: b.externKey,
        identifier: `seller-${b.sellerId}`,
      })
    }

    const grandTotal = priced.totals.total
    const adminAmount = money(grandTotal - sellerPayoutSum)
    if (adminAmount < 0) {
      throw httpError('Invalid payment split amounts', 500, 'SplitError')
    }
    splits.push({
      beneficiaryType: 'ADMIN',
      sellerId: null,
      amount: adminAmount,
      externKey: adminExternKey,
      identifier: 'admin-commission',
    })

    const paymentMethod = methodEnum(body.paymentMethod)
    const siteConditions = siteConditionsText(body)
    const chkNumber = checkoutNumber()

    const session = await prisma.$transaction(async (tx) => {
      const { billingAddressId, shippingAddressId } =
        await this.resolveAddresses(tx, auth.id, body)

      let projectId = null
      if (body.projectName?.trim() && body.projectLocation?.trim()) {
        const project = await tx.project.create({
          data: {
            userId: auth.id,
            projectName: body.projectName.trim(),
            location: body.projectLocation.trim(),
          },
        })
        projectId = project.id
      }

      const created = await tx.checkoutSession.create({
        data: {
          checkoutNumber: chkNumber,
          customerId: auth.id,
          paymentStatus: 'PENDING_PAYMENT',
          paymentMethod,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          billingAddressId,
          shippingAddressId,
          projectId,
          unloadingType: body.unloadingType || null,
          unloadingLocationDescription:
            body.unloadingLocationDescription || null,
          accessConditions: body.accessConditions || null,
          additionalNotes: body.additionalNotes || null,
          subTotal: priced.totals.subtotal,
          vatAmount: priced.totals.vat,
          shippingFee: priced.totals.shipping,
          discountAmount: priced.totals.discount,
          grandTotal,
          currency: priced.totals.currency,
          cartItemIds: priced.items.map((i) => i.id),
          splits: {
            create: splits.map((s) => ({
              beneficiaryType: s.beneficiaryType,
              sellerId: s.sellerId,
              amount: s.amount,
              externKey: s.externKey,
              identifier: s.identifier,
            })),
          },
        },
      })

      let idx = 0
      for (const b of buckets) {
        idx += 1
        const order = await tx.order.create({
          data: {
            orderNumber: orderNumber(idx),
            customerId: auth.id,
            sellerId: b.sellerId,
            checkoutSessionId: created.id,
            projectId,
            shippingAddressId,
            billingAddressId,
            orderStatus: 'NEW',
            orderSource: 'DIRECT_CART',
            subTotal: b.merchandise,
            vatAmount: b.vatAmount,
            shippingFee: b.shippingFee,
            discountAmount: b.discount,
            grandTotal: b.grandTotal,
            unloadingType: body.unloadingType || null,
            siteConditions,
            orderLineItems: {
              create: b.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPriceLocked: item.unitPrice,
                totalPriceLocked: item.subtotal,
              })),
            },
            statusHistory: {
              create: {
                status: 'NEW',
                note: 'Order created — awaiting payment',
              },
            },
          },
        })
        b.orderId = order.id
        b.orderNumber = order.orderNumber
      }

      return created
    })

    let eupago
    try {
      eupago = await createSplitPayment({
        paymentMethod: String(body.paymentMethod || 'multibanco').toLowerCase(),
        amount: grandTotal,
        identifier: session.checkoutNumber,
        alias: body.mbwayPhone,
        adminCallback:
          process.env.EUPAGO_CALLBACK_URL ||
          undefined,
        beneficiaries: splits.map((s) => ({
          externKey: s.externKey,
          amount: s.amount,
          identifier: `${session.checkoutNumber}-${s.identifier}`,
          immediatePayment: false,
        })),
      })
    } catch (err) {
      await prisma.checkoutSession.update({
        where: { id: session.id },
        data: { paymentStatus: 'FAILED' },
      })
      throw httpError(
        err.message || 'Payment provider error',
        err.statusCode || 502,
        err.code || 'EupagoError',
        err.details,
      )
    }

    const updated = await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        eupagoEntity: eupago.entity,
        eupagoReference: eupago.reference,
        eupagoTransactionId:
          eupago.raw?.transactionID ||
          eupago.raw?.transactionId ||
          null,
      },
      select: {
        id: true,
        checkoutNumber: true,
        paymentStatus: true,
        grandTotal: true,
        currency: true,
        eupagoEntity: true,
        eupagoReference: true,
      },
    })

    const payment = {
      provider: getPaymentProvider(),
      entity: updated.eupagoEntity,
      reference: updated.eupagoReference,
    }
    if (mock) {
      payment.confirmPath = `/api/checkout/${updated.id}/pay`
    }

    return {
      status: 201,
      body: {
        id: updated.id,
        checkoutNumber: updated.checkoutNumber,
        paymentStatus: updated.paymentStatus,
        total: updated.grandTotal,
        currency: updated.currency,
        payment,
        message: mock
          ? 'Checkout created — call POST /api/checkout/:id/pay to confirm mock payment'
          : 'Checkout created — complete payment to confirm order',
      },
    }
  }

  async loadCheckoutForBuyer(checkoutId, customerId) {
    return prisma.checkoutSession.findFirst({
      where: { id: checkoutId, customerId },
      include: confirmationInclude,
    })
  }

  async markCheckoutPaid(session, note = 'Payment confirmed') {
    if (session.paymentStatus === 'PAID') {
      return { alreadyPaid: true }
    }

    await prisma.$transaction(async (tx) => {
      await tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
        },
      })

      await tx.order.updateMany({
        where: { checkoutSessionId: session.id },
        data: { orderStatus: 'PENDING' },
      })

      const orders =
        session.orders ||
        (await tx.order.findMany({
          where: { checkoutSessionId: session.id },
          select: { id: true },
        }))

      for (const order of orders) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: 'PENDING',
            note,
          },
        })
      }

      if (session.cartItemIds?.length) {
        await tx.cartItem.deleteMany({
          where: {
            id: { in: session.cartItemIds },
            cart: { userId: session.customerId },
          },
        })
      }
    })

    return { alreadyPaid: false }
  }

  /**
   * POST /checkout/:id/pay
   * Mock: marks paid then returns success-page data.
   * Already PAID / FAILED / CANCELLED: returns success|failed page data (no extra GET).
   * EuPago + still PENDING: returns page "pending" (wait for webhook, call again).
   */
  async confirmPayment(auth, checkoutId, baseUrl) {
    this.assertBuyer(auth)

    let session = await prisma.checkoutSession.findFirst({
      where: { id: checkoutId, customerId: auth.id },
      include: { orders: { select: { id: true } } },
    })
    if (!session) throw httpError('Checkout not found', 404, 'NotFound')

    if (session.paymentStatus === 'PENDING_PAYMENT' && isMockPayments()) {
      await this.markCheckoutPaid(session, 'Mock payment confirmed')
    }

    const full = await this.loadCheckoutForBuyer(checkoutId, auth.id)
    const confirmation = mapConfirmationPage(full, baseUrl)

    let message = 'Checkout status'
    if (confirmation.page === 'success') message = 'Order confirmed'
    else if (confirmation.page === 'failed') message = 'Payment failed'
    else message = 'Payment pending'

    return {
      status: 200,
      body: {
        ...confirmation,
        message,
      },
    }
  }

  async getById(auth, checkoutId) {
    this.assertBuyer(auth)
    const session = await prisma.checkoutSession.findFirst({
      where: { id: checkoutId, customerId: auth.id },
      include: {
        billingAddress: true,
        shippingAddress: true,
        project: true,
        splits: true,
        orders: {
          include: {
            orderLineItems: {
              include: { product: { select: { title: true } } },
            },
          },
        },
      },
    })
    if (!session) throw httpError('Checkout not found', 404, 'NotFound')

    return {
      status: 200,
      body: {
        checkout: mapCheckout(session),
        message: 'Checkout fetched',
      },
    }
  }

  /**
   * EuPago adminCallback — idempotent mark as paid.
   * Accepts reference / identifier / checkoutNumber in body or query.
   */
  async handleEupagoWebhook(payload = {}, query = {}) {
    const secret = String(process.env.EUPAGO_WEBHOOK_SECRET || '').trim()
    if (secret) {
      const provided =
        payload.secret ||
        query.secret ||
        query.token ||
        payload.token
      if (provided !== secret) {
        throw httpError('Invalid webhook secret', 401, 'Unauthorized')
      }
    }

    const reference =
      payload.referencia ||
      payload.reference ||
      query.referencia ||
      query.reference ||
      null
    const identifier =
      payload.identifier ||
      payload.identificador ||
      query.identifier ||
      null

    const or = []
    if (reference) or.push({ eupagoReference: String(reference) })
    if (identifier) or.push({ checkoutNumber: String(identifier) })
    if (!or.length) {
      throw httpError(
        'Provide reference or identifier',
        400,
        'WebhookPayloadInvalid',
      )
    }

    const session = await prisma.checkoutSession.findFirst({
      where: { OR: or },
      include: { orders: { select: { id: true } } },
    })

    if (!session) {
      throw httpError('Checkout not found for payment', 404, 'NotFound')
    }

    if (session.paymentStatus === 'PAID') {
      return {
        status: 200,
        body: {
          id: session.id,
          paymentStatus: 'PAID',
          message: 'Already paid',
        },
      }
    }

    await this.markCheckoutPaid(session, 'Payment confirmed via EuPago')

    return {
      status: 200,
      body: {
        id: session.id,
        paymentStatus: 'PAID',
        message: 'Payment confirmed',
      },
    }
  }
}

export default new CheckoutService()
