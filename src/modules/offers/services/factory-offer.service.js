import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { emitToChat } from '../../../socket/io.js'
import { openOrGetThread } from '../../../socket/chatThreadService.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

function money(n) {
  return Number(Number(n || 0).toFixed(2))
}

function formatMoney(n) {
  return `€${money(n).toFixed(2)}`
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const map = { 1: 'st', 2: 'nd', 3: 'rd' }
  return `${n}${map[n % 10] || 'th'}`
}

function partyName(user) {
  if (!user) return 'User'
  return user.profile?.companyName?.trim() || user.name || 'User'
}

function checkoutNumber() {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `CHK-${t}-${r}`
}

function orderNumber() {
  const t = Date.now().toString(36).toUpperCase()
  const r = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `ORD-${t}-${r}-F`
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function splitName(fullName) {
  const parts = String(fullName || 'Supplier').trim().split(/\s+/)
  const firstName = parts[0] || 'Supplier'
  const lastName = parts.slice(1).join(' ') || firstName
  return { firstName, lastName }
}

const CURRENCY = process.env.CART_CURRENCY || 'EUR'

function mapOfferCard(offer) {
  const installments = (offer.installments || []).map((row) => ({
    installmentNumber: row.installmentNumber,
    amount: money(row.amount),
    quantity: row.quantity,
    label: `${ordinal(row.installmentNumber)} Installment`,
    amountLabel: formatMoney(row.amount),
    quantityLabel: `${row.quantity} ${offer.quantityUnit || 'bags'}`,
  }))

  const first = installments[0]
  const remaining = first
    ? Math.max(0, money(offer.totalPrice) - first.amount)
    : money(offer.totalPrice)
  const months = offer.installmentMonths || 0
  const monthly = months > 0 ? money(remaining / months) : null

  const pricing = [
    { label: 'Total Price', value: formatMoney(offer.totalPrice), icon: 'dollar' },
    { label: 'Installment', value: `${offer.installmentMonths} months`, icon: 'calendar' },
  ]
  for (const row of installments) {
    pricing.push({ label: row.label, value: row.amountLabel, icon: 'dollar' })
    pricing.push({ label: 'Quantity', value: row.quantityLabel })
  }

  return {
    id: offer.id,
    title: 'Offer Card',
    status: offer.status,
    statusLabel:
      offer.status === 'PENDING_RESPONSE'
        ? 'Pending Response'
        : offer.status === 'NEGOTIATING'
          ? 'Negotiation requested'
          : offer.status === 'ACCEPTED'
            ? 'Accepted'
            : offer.status === 'PAID'
              ? 'Paid'
              : offer.status,
    warehouseLocation: offer.warehouseLocation,
    product: offer.productName,
    productId: offer.productId,
    quantity: `${offer.totalQuantity} ${offer.quantityUnit || 'bags'}`,
    totalQuantity: offer.totalQuantity,
    quantityUnit: offer.quantityUnit || 'bags',
    projectName: offer.projectName,
    address: offer.deliveryLocation,
    deliveryLocation: offer.deliveryLocation,
    unloadingType: offer.unloadingType,
    accessConditions: offer.accessConditions,
    totalPrice: money(offer.totalPrice),
    installmentMonths: offer.installmentMonths,
    installments,
    pricing,
    summary: {
      firstInstallment: first ? first.amountLabel : null,
      remainingBalance: formatMoney(remaining),
      note:
        monthly != null && months > 0
          ? `Pay ${formatMoney(monthly)}/month for ${months} months`
          : null,
    },
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  }
}

function mapMessage(msg, viewerId, baseUrl) {
  const isMine = viewerId ? msg.senderId === viewerId : null
  return {
    id: msg.id,
    type: String(msg.messageType || 'TEXT').toLowerCase(),
    messageType: msg.messageType,
    text: msg.messageText,
    attachmentUrl: msg.attachmentUrl
      ? absolutizeUrl(msg.attachmentUrl, baseUrl)
      : null,
    sender: isMine == null ? undefined : isMine ? 'me' : 'them',
    senderId: msg.senderId,
    senderName: partyName(msg.sender),
    senderImage: msg.sender?.image || null,
    offer: msg.offer ? mapOfferCard(msg.offer) : null,
    createdAt: msg.createdAt,
    time: new Date(msg.createdAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }),
  }
}

const messageInclude = {
  sender: {
    select: {
      id: true,
      name: true,
      image: true,
      profile: { select: { companyName: true } },
    },
  },
  offer: {
    include: {
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
  },
}

class FactoryOfferService {
  role(auth) {
    return String(auth?.role || '').toLowerCase()
  }

  assertFactory(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (this.role(auth) !== 'factory') {
      throw httpError('Only factories can send these offers', 403, 'Forbidden')
    }
  }

  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (this.role(auth) !== 'supplier') {
      throw httpError('Only suppliers can pay factory offers', 403, 'Forbidden')
    }
  }

  async create(auth, body, baseUrl) {
    this.assertFactory(auth)

    let productId = body.productId || null
    let productName = body.productName

    const product = await prisma.product.findFirst({
      where: {
        ...(productId ? { id: productId } : {}),
        sellerId: auth.id,
        seller: { role: 'FACTORY' },
      },
      select: { id: true, title: true, sellerId: true },
      orderBy: { createdAt: 'desc' },
    })

    if (productId && !product) {
      throw httpError('Product not found in your factory catalog', 404, 'ProductNotFound')
    }
    if (product) {
      productId = product.id
      if (!productName) productName = product.title
    }
    if (!productId) {
      throw httpError('productId is required for factory offers', 400, 'ProductRequired')
    }
    if (!productName) {
      throw httpError('Product name is required', 400, 'ProductNameRequired')
    }

    const supplier = await prisma.user.findUnique({
      where: { id: body.supplierId },
      select: { id: true, role: true },
    })
    if (!supplier || String(supplier.role).toLowerCase() !== 'supplier') {
      throw httpError('supplierId must be a supplier user', 400, 'InvalidSupplier')
    }

    const thread = await openOrGetThread(auth, {
      type: 'FACTORY_SUPPLIER',
      productId,
      supplierId: body.supplierId,
    })

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.quoteOffer.create({
        data: {
          chatThreadId: thread.id,
          buyerId: body.supplierId,
          createdById: auth.id,
          productId,
          warehouseLocation: body.warehouseLocation.trim(),
          productName: productName.trim(),
          totalQuantity: body.totalQuantity,
          quantityUnit: body.quantityUnit || 'bags',
          projectName: body.projectName.trim(),
          deliveryLocation: body.deliveryLocation.trim(),
          unloadingType: body.unloadingType.trim(),
          accessConditions: body.accessConditions.trim(),
          totalPrice: body.totalPrice,
          installmentMonths: body.installmentMonths,
          status: 'PENDING_RESPONSE',
          installments: {
            create: body.installments.map((row, index) => ({
              installmentNumber: index + 1,
              amount: row.price,
              quantity: row.quantity,
            })),
          },
        },
        include: {
          installments: { orderBy: { installmentNumber: 'asc' } },
        },
      })

      const chatMessage = await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          chatThreadId: thread.id,
          messageType: 'OFFER',
          messageText: `Offer Card: ${offer.productName}`,
          offerId: offer.id,
        },
        include: messageInclude,
      })

      return { offer, chatMessage }
    })

    const offerCard = mapOfferCard(result.offer)
    const chatMessage = mapMessage(result.chatMessage, auth.id, baseUrl)
    const publicMessage = mapMessage(result.chatMessage, null, baseUrl)

    emitToChat(thread.id, 'chat:message', {
      threadId: thread.id,
      chatMessage: publicMessage,
    })
    emitToChat(thread.id, 'factory:offer', {
      threadId: thread.id,
      offer: offerCard,
      chatMessage: publicMessage,
    })

    return {
      status: 201,
      body: {
        offer: offerCard,
        chatMessage,
        threadId: thread.id,
        message: 'Offer card sent to supplier',
      },
    }
  }

  async listThreadMessages(auth, threadId, query, baseUrl) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = this.role(auth)
    if (role !== 'factory' && role !== 'supplier') {
      throw httpError('Forbidden', 403, 'Forbidden')
    }

    const thread = await prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { participants: { select: { userId: true } } },
    })
    if (!thread || thread.type !== 'FACTORY_SUPPLIER') {
      throw httpError('Thread not found', 404, 'NotFound')
    }
    const isPeer = thread.participants.some((p) => p.userId === auth.id)
    if (!isPeer) throw httpError('Not a participant of this chat', 403, 'Forbidden')

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50))
    const where = { chatThreadId: threadId }
    if (query.after) where.createdAt = { gt: new Date(query.after) }

    const rows = await prisma.chatMessage.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
      take: limit,
    })

    return {
      status: 200,
      body: {
        messages: rows.map((m) => mapMessage(m, auth.id, baseUrl)),
        message: 'Messages fetched',
      },
    }
  }

  async listOrders(auth, query) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = this.role(auth)
    if (role !== 'factory' && role !== 'supplier') {
      throw httpError('Forbidden', 403, 'Forbidden')
    }

    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit
    const where =
      role === 'factory'
        ? { sellerId: auth.id, orderSource: 'FACTORY_CONVERSION' }
        : { customerId: auth.id, orderSource: 'FACTORY_CONVERSION' }

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          createdAt: true,
          customerId: true,
          sellerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { companyName: true } },
            },
          },
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { companyName: true } },
            },
          },
          paymentPlan: {
            select: {
              totalAmount: true,
              downPayment: true,
              remainingBalance: true,
              termMonths: true,
              installments: {
                orderBy: { installmentNumber: 'asc' },
                select: {
                  installmentNumber: true,
                  amount: true,
                  status: true,
                  dueDate: true,
                  paidAt: true,
                },
              },
            },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        orders: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          orderStatus: o.orderStatus,
          orderSource: 'FACTORY_CONVERSION',
          total: money(o.grandTotal || o.paymentPlan?.totalAmount),
          currency: CURRENCY,
          date: o.createdAt,
          supplier: {
            id: o.customer?.id,
            name: partyName(o.customer),
          },
          factory: {
            id: o.seller?.id,
            name: partyName(o.seller),
          },
          paymentPlan: o.paymentPlan,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        message: 'Factory chat orders fetched',
      },
    }
  }

  async pay(auth, offerId, baseUrl) {
    this.assertSupplier(auth)

    const offer = await prisma.quoteOffer.findFirst({
      where: {
        id: offerId,
        buyerId: auth.id,
        chatThreadId: { not: null },
        quoteRequestId: null,
      },
      include: {
        installments: { orderBy: { installmentNumber: 'asc' } },
        createdBy: { select: { id: true, role: true } },
      },
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')
    if (offer.status === 'PAID') {
      throw httpError('Offer is already paid', 409, 'AlreadyPaid')
    }
    if (String(offer.createdBy?.role || '').toLowerCase() !== 'factory') {
      throw httpError('This offer is not from a factory', 400, 'InvalidOffer')
    }
    if (!offer.productId) {
      throw httpError('Offer has no product to convert into an order', 400, 'MissingProduct')
    }

    const buyer = await prisma.user.findUnique({
      where: { id: auth.id },
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

    const quantity = Math.max(1, Math.round(Number(offer.totalQuantity) || 1))
    const total = money(offer.totalPrice)
    const unitPrice = money(total / quantity)
    const now = new Date()
    const { firstName, lastName } = splitName(buyer?.name)
    const phone = buyer?.phoneNumber || '000000000'
    const email = buyer?.email || 'supplier@local'
    const savedAddress =
      buyer?.addresses?.find((a) => a.addressType === 'SHIPPING') ||
      buyer?.addresses?.find((a) => a.addressType === 'BILLING') ||
      buyer?.addresses?.[0] ||
      null

    const result = await prisma.$transaction(async (tx) => {
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
          projectName: offer.projectName || 'Factory chat order',
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
          additionalNotes: `Factory offer ${offer.id} demo pay`,
          subTotal: total,
          vatAmount: 0,
          shippingFee: 0,
          discountAmount: 0,
          grandTotal: total,
          currency: CURRENCY,
          paidAt: now,
        },
      })

      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          customerId: auth.id,
          sellerId: offer.createdById,
          checkoutSessionId: session.id,
          projectId: project.id,
          shippingAddressId,
          billingAddressId,
          orderStatus: 'NEW',
          orderSource: 'FACTORY_CONVERSION',
          subTotal: total,
          vatAmount: 0,
          shippingFee: 0,
          discountAmount: 0,
          grandTotal: total,
          unloadingType: offer.unloadingType || null,
          siteConditions: offer.accessConditions || null,
          orderLineItems: {
            create: {
              productId: offer.productId,
              quantity,
              unitPriceLocked: unitPrice,
              totalPriceLocked: total,
              warehouseLocation: offer.warehouseLocation || null,
            },
          },
          statusHistory: {
            create: {
              status: 'NEW',
              note: 'Factory offer paid (demo) — awaiting factory acceptance',
            },
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
        where: { id: offerId },
        data: { status: 'PAID' },
        include: { installments: { orderBy: { installmentNumber: 'asc' } } },
      })

      const chatMessage = await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          chatThreadId: offer.chatThreadId,
          messageType: 'SYSTEM',
          messageText: `Demo payment confirmed for factory offer. Order ${order.orderNumber} created.`,
          offerId,
        },
        include: messageInclude,
      })

      return { order, session, offer: paidOffer, chatMessage, threadId: offer.chatThreadId }
    })

    const offerCard = mapOfferCard(result.offer)
    const chatMessage = mapMessage(result.chatMessage, auth.id, baseUrl)
    const publicMessage = mapMessage(result.chatMessage, null, baseUrl)

    emitToChat(result.threadId, 'chat:message', {
      threadId: result.threadId,
      chatMessage: publicMessage,
    })
    emitToChat(result.threadId, 'factory:offer_updated', {
      threadId: result.threadId,
      offerId,
      offer: offerCard,
      action: 'pay',
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
        message: 'Demo payment confirmed. Factory chat order created.',
      },
    }
  }
}

export default new FactoryOfferService()
