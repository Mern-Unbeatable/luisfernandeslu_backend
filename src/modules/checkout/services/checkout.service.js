import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import cartService from '../../cart/services/cart.service.js'
import {
  createSplitPayment,
  commissionPercentOf,
  getAdminSplitExternKey,
  getPaymentProvider,
  isMockPayments,
  toEupagoBeneficiaries,
} from '../../payments/eupago.client.js'
import { recordAffiliateCommissionsForCheckout } from '../../affiliates/services/commission.service.js'
import { resolveVatRate } from '../../admin/settings/settings.store.js'
import { httpError } from '../../../shared/errors.js'
import { moneyNonNegative as money } from '../../../shared/money.js'
import { mapAddress, formatAddressLine } from '../../../shared/address.js'
import { checkoutNumber, orderNumber } from '../../../shared/numbering.js'
import {
  assertUnloadingVehicle,
  quoteShippingForSellers,
} from '../../../shared/shipping-quote.js'
import { hasMapboxToken, suggestPlaces } from '../../../shared/distance.js'
import { env } from '../../../config/env.js'
import { notifyPaymentFailure } from '../../payments/payment-failure-notify.js'
import { issueTaxInvoicesForCheckout } from '../../invoicing/tax-invoice.service.js'

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
    if (role !== 'customer' && role !== 'company' && role !== 'supplier') {
      throw httpError(
        'Only customer, company, or supplier can checkout',
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
    return resolveVatRate(user?.vatRate)
  }

  async quoteDirectBuy(auth, body, baseUrl) {
    const role = this.assertBuyer(auth)
    const vatRate = await this.loadVatRate(auth.id)
    const { directBuy, promos } = body

    const priced = await cartService.priceDirectBuy(
      auth.id,
      role,
      directBuy,
      vatRate,
      baseUrl,
      promos || []
    )

    return {
      status: 200,
      body: {
        cart: {
          id: priced.cartId, // usually null for direct buy
          promos: priced.promos,
          items: priced.items,
          fees: cartService.buildCartPayload(priced.cartId, priced.itemsRaw, role, vatRate, baseUrl, priced.promos).fees
        }
      }
    }
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

  /**
   * Reuse existing company project by id or case-insensitive name;
   * otherwise create a new project from name + location.
   */
  async resolveCompanyProject(tx, userId, body) {
    if (body.projectId) {
      const existing = await tx.project.findFirst({
        where: { id: body.projectId, userId },
      })
      if (!existing) throw httpError('Project not found', 404, 'NotFound')
      const nextLocation = body.projectLocation?.trim()
      if (nextLocation && nextLocation !== existing.location) {
        return tx.project.update({
          where: { id: existing.id },
          data: { location: nextLocation },
        })
      }
      return existing
    }

    const projectName = String(body.projectName || '').trim()
    const location = String(body.projectLocation || '').trim()
    if (!projectName || !location) {
      throw httpError(
        'projectName and projectLocation are required',
        400,
        'ProjectRequired',
      )
    }

    const match = await tx.project.findFirst({
      where: {
        userId,
        projectName: { equals: projectName, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (match) {
      if (location !== match.location) {
        return tx.project.update({
          where: { id: match.id },
          data: { location },
        })
      }
      return match
    }

    return tx.project.create({
      data: { userId, projectName, location },
    })
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

  /** VAT shared by merchandise; shipping set per seller from distance × per-km quote. */
  applyQuotedShipping(buckets, vat, quote) {
    const totalMerch = money(
      buckets.reduce((s, b) => s + b.merchandise, 0),
    )
    let vatLeft = vat
    return buckets.map((b, idx) => {
      const isLast = idx === buckets.length - 1
      let vatShare = 0
      if (isLast) {
        vatShare = money(vatLeft)
      } else if (totalMerch > 0) {
        vatShare = money((vat * b.merchandise) / totalMerch)
        vatLeft = money(vatLeft - vatShare)
      }
      const leg = quote.bySeller.get(b.sellerId)
      const shippingFee = money(leg?.shippingFee || 0)
      return {
        ...b,
        shippingFee,
        vatAmount: vatShare,
        distanceKm: leg?.distanceKm ?? null,
        grandTotal: money(b.merchandise + shippingFee + vatShare),
      }
    })
  }

  async resolveDeliveryAddressForQuote(userId, body) {
    if (body.sameAsBilling) {
      if (body.billingAddressId) {
        const addr = await this.assertOwnedAddressRow(userId, body.billingAddressId)
        return addr
      }
      if (body.billingAddress) return body.billingAddress
    }
    if (body.shippingAddressId) {
      return this.assertOwnedAddressRow(userId, body.shippingAddressId)
    }
    if (body.shippingAddress) return body.shippingAddress
    throw httpError(
      'Provide shippingAddressId, shippingAddress, or sameAsBilling',
      400,
      'ShippingRequired',
    )
  }

  async assertOwnedAddressRow(userId, addressId) {
    const bridge = await prisma.userAddressBridge.findFirst({
      where: { userId, addressId },
      include: { address: true },
    })
    if (!bridge?.address) {
      throw httpError('Address not found', 404, 'AddressNotFound')
    }
    return bridge.address
  }

  async quoteDirectBuy(auth, body, baseUrl) {
    this.assertBuyer(auth)
    const role = String(auth.role || '').toLowerCase()
    const vatRate = await this.loadVatRate(auth.id)
    
    if (!body.directBuy || !body.directBuy.productId) {
      throw httpError('Missing directBuy product details', 400, 'InvalidDirectBuy')
    }

    const priced = await cartService.priceDirectBuy(
      auth.id,
      role,
      body.directBuy,
      vatRate,
      baseUrl,
      body.promos || []
    )

    return {
      status: 200,
      body: {
        cart: {
          id: priced.cartId,
          promos: priced.promos,
          items: priced.items,
          fees: cartService.buildCartPayload(priced.cartId, priced.itemsRaw, role, vatRate, baseUrl, priced.promos).fees
        }
      }
    }
  }

  async quoteShipping(auth, body) {
    this.assertBuyer(auth)
    const vehicleId = assertUnloadingVehicle(body.unloadingType)
    const role = String(auth.role || '').toLowerCase()
    const vatRate = await this.loadVatRate(auth.id)
    let priced
    if (body.directBuy?.offerId) {
      const offer = await prisma.quoteOffer.findUnique({
        where: { id: body.directBuy.offerId },
      })
      if (!offer) throw httpError('Offer not found', 404, 'NotFound')
      
      const subtotal = Number(offer.totalPrice) || 0
      const vat = money(subtotal * (vatRate / 100))
      
      priced = {
        items: [{
          sellerId: offer.createdById,
          subtotal: subtotal,
          promo: null,
        }],
        totals: {
          subtotal,
          vat,
          currency: 'EUR'
        }
      }
    } else if (body.directBuy) {
      priced = await cartService.priceDirectBuy(
        auth.id,
        role,
        body.directBuy,
        vatRate,
        null,
        body.promos || []
      )
    } else {
      priced = await cartService.priceSelection(
        auth.id,
        role,
        body.cartItemIds,
        vatRate,
        null,
      )
    }
    const buckets = this.buildSellerBuckets(priced.items)
    const deliveryAddress = await this.resolveDeliveryAddressForQuote(
      auth.id,
      body,
    )
    const quote = await quoteShippingForSellers({
      sellerIds: buckets.map((b) => b.sellerId),
      deliveryAddress,
      unloadingType: vehicleId,
    })
    const shipping = quote.shipping
    const vat = priced.totals.vat
    const subtotal = priced.totals.subtotal
    const total = money(subtotal + shipping + vat)

    return {
      status: 200,
      body: {
        message: 'Shipping quoted',
        unloadingType: quote.unloadingType,
        pricePerKm: quote.pricePerKm,
        distanceKm: quote.distanceKm,
        shipping,
        subtotal,
        vat,
        total,
        currency: priced.totals.currency,
        legs: quote.legs,
        fees: {
          shipping,
          shippingQuoted: true,
          vat,
          vatRate,
          currency: priced.totals.currency,
        },
      },
    }
  }

  async place(auth, body, baseUrl) {
    const role = this.assertBuyer(auth)
    const { cartItemIds, directBuy, promos, ...details } = body
    
    if (!directBuy && (!cartItemIds || !cartItemIds.length)) {
      throw httpError('Cart items required for checkout', 400, 'MissingCartItems')
    }

    if (role === 'company') {
      const hasProjectId = Boolean(body.projectId)
      const hasNameLoc =
        Boolean(body.projectName?.trim()) &&
        Boolean(body.projectLocation?.trim())
      if (!hasProjectId && !hasNameLoc) {
        throw httpError(
          'Provide projectId or projectName + projectLocation for company checkout',
          400,
          'ProjectRequired',
        )
      }
    }

    const mock = isMockPayments()

    const vatRate = await this.loadVatRate(auth.id)
    let priced
    if (directBuy) {
      priced = await cartService.priceDirectBuy(
        auth.id,
        role,
        directBuy,
        vatRate,
        baseUrl,
        promos || []
      )
    } else {
      priced = await cartService.priceSelection(
        auth.id,
        role,
        cartItemIds,
        vatRate,
        baseUrl,
      )
    }

    let buckets = this.buildSellerBuckets(priced.items)

    const deliveryAddress = await this.resolveDeliveryAddressForQuote(
      auth.id,
      body,
    )
    const vehicleId = assertUnloadingVehicle(body.unloadingType)
    const quote = await quoteShippingForSellers({
      sellerIds: buckets.map((b) => b.sellerId),
      deliveryAddress,
      unloadingType: vehicleId,
    })
    buckets = this.applyQuotedShipping(buckets, priced.totals.vat, quote)

    const shippingTotal = quote.shipping
    const grandTotal = money(
      priced.totals.subtotal + shippingTotal + priced.totals.vat,
    )

    const sellerIds = buckets.map((b) => b.sellerId)
    const sellers = await prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: {
        id: true,
        vatRate: true,
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
      b.commissionPercent = commissionPercentOf(seller)
    }

    const adminExternKey = await getAdminSplitExternKey()

    const splits = []
    let sellerPayoutSum = 0
    for (const b of buckets) {
      const payout = money(
        b.merchandise * (1 - b.commissionPercent / 100),
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
      if (role === 'company') {
        const project = await this.resolveCompanyProject(tx, auth.id, body)
        projectId = project.id
      } else if (body.projectName?.trim() && body.projectLocation?.trim()) {
        const project = await this.resolveCompanyProject(tx, auth.id, body)
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
          unloadingType: vehicleId,
          unloadingLocationDescription:
            body.unloadingLocationDescription || null,
          accessConditions: body.accessConditions || null,
          additionalNotes: body.additionalNotes || null,
          subTotal: priced.totals.subtotal,
          vatAmount: priced.totals.vat,
          shippingFee: shippingTotal,
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
            unloadingType: vehicleId,
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
        adminCallback: env.payments.eupago.callbackUrl || undefined,
        successUrl: `${env.frontendUrl}/order/confirmation?id=${session.id}`,
        cancelUrl: `${env.frontendUrl}/order/confirmation?id=${session.id}`,
        beneficiaries: toEupagoBeneficiaries(splits, session.checkoutNumber),
      })
    } catch (err) {
      await prisma.$transaction([
        prisma.checkoutSession.update({
          where: { id: session.id },
          data: { paymentStatus: 'FAILED' },
        }),
        prisma.order.updateMany({
          where: { checkoutSessionId: session.id, orderStatus: 'NEW' },
          data: { orderStatus: 'CANCELLED' },
        }),
      ])
      void notifyPaymentFailure({
        sellerIds: buckets.map((b) => b.sellerId),
        buyerId: auth.id,
        checkoutNumber: session.checkoutNumber,
        amount: grandTotal,
        paymentMethod: body.paymentMethod,
        error: err,
      })
      throw httpError(
        err.message || 'Payment provider error',
        err.statusCode || 502,
        err.code || 'EupagoError',
        err.details,
      )
    }

    if (priced.items.length && !directBuy) {
      await prisma.cartItem.deleteMany({
        where: {
          id: { in: priced.items.map((i) => i.id) },
          cart: { userId: auth.id },
        },
      })
    }

    const updated = await prisma.checkoutSession.update({
      where: { id: session.id },
      data: {
        eupagoEntity: eupago.entity,
        eupagoReference: eupago.reference || eupago.raw?.url || eupago.raw?.redirectUrl || null,
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

    if (eupago && (eupago.raw?.redirectUrl || eupago.raw?.url)) {
      payment.url = eupago.raw.redirectUrl || eupago.raw.url
    } else {
      payment.url = updated.eupagoReference // fallback
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

      // Keep orderStatus NEW after payment — supplier must Accept (→ PENDING).
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
            status: 'NEW',
            note: note || 'Payment confirmed — awaiting supplier acceptance',
          },
        })
      }

      await recordAffiliateCommissionsForCheckout(session.id, tx)
    })

    void issueTaxInvoicesForCheckout(session.id)

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
    const secret = env.payments.eupago.webhookSecret
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
      // Offer checkouts are stored as PAID up front; the webhook is the real payment signal.
      void issueTaxInvoicesForCheckout(session.id)
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

  async suggestLocations(auth, query) {
    const term = String(query.q || query.search || '').trim()
    const limit = Math.min(15, Math.max(1, Number(query.limit) || 8))

    if (term.length < 2) {
      return {
        status: 200,
        body: {
          locations: [],
          message: 'Type at least 2 characters',
        },
      }
    }

    let locations = []
    if (hasMapboxToken()) {
      try {
        locations = await suggestPlaces(term, {
          limit,
          country: 'pt',
        })
      } catch (err) {
        console.error('[suggestLocations] Mapbox:', err.message)
        throw httpError(
          'Location suggestions unavailable',
          502,
          'MapboxSuggestFailed',
        )
      }
    }

    return {
      status: 200,
      body: {
        locations,
        message: 'Location suggestions fetched',
      },
    }
  }
}

export default new CheckoutService()
