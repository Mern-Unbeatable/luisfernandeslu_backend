import prisma from '../../../../lib/prisma.js'
import { emitToChat } from '../../../socket/io.js'
import { openOrGetThread } from '../../chat/threads.js'
import { httpError } from '../../../shared/errors.js'
import {
  mapMessage,
  mapOfferCard,
  messageInclude,
  offerInstallmentsInclude,
} from '../mappers.js'
import { offerCreateData } from '../offer-create.js'
import {
  assertOfferPayable,
  payConvertedOffer,
} from '../offer-payment.js'
import { factoryPayContext } from '../contexts/factory.context.js'
import factoryOrderService from '../../orders/services/factory-order.service.js'
import { assertSellerEupagoConfigured } from '../../payments/seller-eupago.js'

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
    await assertSellerEupagoConfigured(auth.id)

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

    let thread;
    if (body.threadId) {
      thread = await prisma.chatThread.findUnique({
        where: { id: body.threadId },
        include: { participants: true },
      })
      if (!thread || thread.type !== 'FACTORY_SUPPLIER') {
        throw httpError('Invalid thread', 400, 'InvalidThread')
      }
      const hasAuth = thread.participants.some(p => p.userId === auth.id)
      const hasSupplier = thread.participants.some(p => p.userId === body.supplierId)
      if (!hasAuth || !hasSupplier) {
        throw httpError('Invalid thread participants', 400, 'InvalidThread')
      }
    } else {
      thread = await openOrGetThread(auth, {
        type: 'FACTORY_SUPPLIER',
        productId,
        supplierId: body.supplierId,
      })
    }

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.quoteOffer.create({
        data: offerCreateData(body, {
          chatThreadId: thread.id,
          buyerId: body.supplierId,
          createdById: auth.id,
          productId,
          productName,
        }),
        include: offerInstallmentsInclude,
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
    return factoryOrderService.list(auth, query)
  }

  async pay(auth, offerId, baseUrl, shippingFee = 0, paymentMethod = 'multibanco', mbwayPhone) {
    this.assertSupplier(auth)

    const offer = await prisma.quoteOffer.findFirst({
      where: {
        id: offerId,
        buyerId: auth.id,
        chatThreadId: { not: null },
        quoteRequestId: null,
      },
      include: {
        ...offerInstallmentsInclude,
        createdBy: { select: { id: true, role: true } },
      },
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')
    assertOfferPayable(offer)
    if (String(offer.createdBy?.role || '').toLowerCase() !== 'factory') {
      throw httpError('This offer is not from a factory', 400, 'InvalidOffer')
    }

    return payConvertedOffer({
      auth,
      offer,
      productId: offer.productId,
      offerId,
      baseUrl,
      context: factoryPayContext,
      shippingFee,
      paymentMethod,
      mbwayPhone,
    })
  }
}

export default new FactoryOfferService()
