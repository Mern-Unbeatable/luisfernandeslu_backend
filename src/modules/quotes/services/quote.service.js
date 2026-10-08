import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { emitToQuote } from '../../../socket/io.js'
import { assertQuoteParticipantRole } from '../../chat/rules.js'
import { listQuoteMessages, postQuoteTextMessage } from '../../chat/messages.js'
import { httpError } from '../../../shared/errors.js'
import { formatMoney } from '../../../shared/money.js'
import { partyName } from '../../../shared/party.js'
import { parsePagination, paginationMeta } from '../../../shared/pagination.js'
import {
  mapMessage,
  mapOfferCard,
  messageInclude,
  offerInstallmentsInclude,
} from '../../offers/mappers.js'
import { offerCreateData } from '../../offers/offer-create.js'
import {
  assertOfferPayable,
  payConvertedOffer,
} from '../../offers/offer-payment.js'
import { quotePayContext } from '../../offers/contexts/quote.context.js'
import { assertSellerEupagoConfigured } from '../../payments/seller-eupago.js'

function parseQuantityAmount(quantityText) {
  const match = String(quantityText || '').match(/\d+/)
  const n = match ? Number.parseInt(match[0], 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}

function liveProductWhere(productId) {
  return {
    id: productId,
    approvalStatus: 'APPROVED',
    inventory: { is: { listedQuantity: { gt: 0 } } },
  }
}

const quoteDetailInclude = {
  buyer: {
    select: {
      id: true,
      name: true,
      role: true,
      image: true,
      profile: { select: { companyName: true } },
    },
  },
  seller: {
    select: {
      id: true,
      name: true,
      role: true,
      image: true,
      profile: { select: { companyName: true } },
    },
  },
  quoteItems: {
    include: {
      product: {
        select: {
          id: true,
          title: true,
          sku: true,
          warehouseLocation: true,
          media: { where: { isBanner: true }, take: 1 },
        },
      },
    },
  },
  offers: {
    orderBy: { createdAt: 'desc' },
    include: offerInstallmentsInclude,
  },
}

function mapQuote(quote, baseUrl, viewerId = null) {
  const item = quote.quoteItems?.[0] || null
  const product = item?.product || null
  const banner = (product?.media || []).find((m) => m.isBanner)

  return {
    id: quote.id,
    status: quote.status,
    budget: quote.proposedBudget,
    proposedBudget: quote.proposedBudget,
    message: quote.message,
    quantity: item?.quantity ?? null,
    offeredUnitPrice: item?.offeredUnitPrice ?? null,
    product: product
      ? {
          id: product.id,
          title: product.title,
          sku: product.sku,
          warehouseLocation: product.warehouseLocation || null,
          image: banner
            ? absolutizeUrl(banner.mediaUrl, baseUrl)
            : null,
        }
      : null,
    buyer: quote.buyer
      ? {
          id: quote.buyer.id,
          name: partyName(quote.buyer),
          role: String(quote.buyer.role || '').toLowerCase(),
          image: quote.buyer.image || null,
        }
      : null,
    seller: quote.seller
      ? {
          id: quote.seller.id,
          name: partyName(quote.seller),
          role: String(quote.seller.role || '').toLowerCase(),
          image: quote.seller.image || null,
        }
      : null,
    offers: (quote.offers || []).map(mapOfferCard),
    viewerRole:
      viewerId && quote.buyerId === viewerId
        ? 'buyer'
        : viewerId && quote.sellerId === viewerId
          ? 'seller'
          : null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  }
}

function broadcastQuoteEvent(quoteId, event, payload) {
  emitToQuote(quoteId, event, payload)
}

class QuoteService {
  assertParticipantRole(auth) {
    return assertQuoteParticipantRole(auth)
  }

  assertCompany(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'company') {
      throw httpError('Only company users can send quotes', 403, 'Forbidden')
    }
  }

  assertSupplier(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    if (auth.role !== 'supplier') {
      throw httpError('Only suppliers can send offers', 403, 'Forbidden')
    }
  }

  async getAccessibleQuote(auth, quoteId) {
    const quote = await prisma.quoteRequest.findFirst({
      where: {
        id: quoteId,
        OR: [{ buyerId: auth.id }, { sellerId: auth.id }],
      },
      include: quoteDetailInclude,
    })
    if (!quote) throw httpError('Quote not found', 404, 'NotFound')
    return quote
  }

  /**
   * Company → Send Quote. Opens chat thread with supplier.
   */
  async createForProduct(auth, productId, body, baseUrl) {
    this.assertCompany(auth)

    const product = await prisma.product.findFirst({
      where: liveProductWhere(productId),
      select: {
        id: true,
        title: true,
        sellerId: true,
        basePrice: true,
        b2bPrice: true,
        minB2bQuantity: true,
        minOrderQuantity: true,
        warehouseLocation: true,
      },
    })

    if (!product) {
      throw httpError(
        'Product not found or not available for quotes',
        404,
        'NotFound',
      )
    }
    if (product.sellerId === auth.id) {
      throw httpError(
        'You cannot send a quote for your own product',
        400,
        'InvalidSeller',
      )
    }

    const quantityAmount = parseQuantityAmount(body.quantity)
    const minQty = product.minB2bQuantity ?? product.minOrderQuantity ?? null
    if (minQty != null && quantityAmount < minQty) {
      throw httpError(
        `Minimum order quantity is ${minQty}`,
        400,
        'BelowMinOrder',
        { minB2bQuantity: minQty, quantity: quantityAmount },
      )
    }

    const offeredUnitPrice =
      product.b2bPrice != null ? product.b2bPrice : product.basePrice
    const quantityNote = `Quantity: ${body.quantity.trim()}`
    const userMessage = body.message?.trim() || ''
    const combinedMessage = userMessage
      ? `${quantityNote}\n\n${userMessage}`
      : quantityNote

    const quote = await prisma.$transaction(async (tx) => {
        const created = await tx.quoteRequest.create({
          data: {
            buyerId: auth.id,
            sellerId: product.sellerId,
            status: 'PENDING',
            proposedBudget: body.budget,
            message: combinedMessage,
            quoteItems: {
              create: {
                productId: product.id,
                quantity: quantityAmount,
                offeredUnitPrice,
              },
            },
          },
        })

        const thread = await tx.chatThread.create({
          data: {
            type: 'QUOTE',
            quoteRequestId: created.id,
            participants: {
              create: [
                { userId: auth.id },
                { userId: product.sellerId },
              ],
            },
          },
        })

        await tx.chatMessage.create({
          data: {
            senderId: auth.id,
            quoteRequestId: created.id,
            chatThreadId: thread.id,
            messageType: 'SYSTEM',
            messageText: `Quote request sent for "${product.title}". Budget: ${formatMoney(body.budget)}. 
${quantityNote}.`,
          },
        })

        if (userMessage) {
          await tx.chatMessage.create({
            data: {
              senderId: auth.id,
              quoteRequestId: created.id,
              chatThreadId: thread.id,
              messageType: 'TEXT',
              messageText: userMessage,
            },
          })
        }

      return tx.quoteRequest.findUnique({
        where: { id: created.id },
        include: quoteDetailInclude,
      })
    })

    broadcastQuoteEvent(quote.id, 'quote:opened', {
      quoteId: quote.id,
      quote: mapQuote(quote, baseUrl, null),
    })

    return {
      status: 201,
      body: {
        quote: mapQuote(quote, baseUrl, auth.id),
        message: 'Quote request sent. Chat with the supplier is now open.',
      },
    }
  }

  /** List quotes — company sees sent; supplier sees incoming */
  async list(auth, query, baseUrl) {
    const role = this.assertParticipantRole(auth)
    const { page, limit, skip } = parsePagination(query, { defaultLimit: 12 })
    const status = query.status || 'all'

    const where =
      role === 'company'
        ? { buyerId: auth.id }
        : { sellerId: auth.id }
    if (status !== 'all') where.status = status

    const [total, rows] = await Promise.all([
      prisma.quoteRequest.count({ where }),
      prisma.quoteRequest.findMany({
        where,
        include: {
          ...quoteDetailInclude,
          chatMessages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  profile: { select: { companyName: true } },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const quotes = rows.map((q) => {
      const last = q.chatMessages?.[0] || null
      const mapped = mapQuote(q, baseUrl, auth.id)
      const partner = role === 'company' ? mapped.seller : mapped.buyer
      return {
        ...mapped,
        // Messenger sidebar shape
        chatId: q.id,
        partner,
        lastMessage: last
          ? last.messageType === 'OFFER'
            ? 'Offer Card'
            : last.messageText
          : mapped.message,
        lastMessageAt: last?.createdAt || q.updatedAt,
        time: new Date(last?.createdAt || q.updatedAt).toLocaleString(),
      }
    })

    return {
      status: 200,
      body: {
        quotes,
        chats: quotes.map((q) => ({
          id: q.id,
          name: q.partner?.name || 'Chat',
          avatar: q.partner?.image || null,
          lastMessage: q.lastMessage,
          time: q.time,
          unreadCount: 0,
          productTitle: q.product?.title || null,
          status: q.status,
        })),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Quotes fetched',
      },
    }
  }

  async getById(auth, quoteId, baseUrl) {
    this.assertParticipantRole(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)
    return {
      status: 200,
      body: {
        quote: mapQuote(quote, baseUrl, auth.id),
        message: 'Quote details fetched',
      },
    }
  }

  async listMessages(auth, quoteId, query, baseUrl) {
    return listQuoteMessages(auth, quoteId, query, baseUrl)
  }

  async sendMessage(auth, quoteId, body, baseUrl) {
    return postQuoteTextMessage(auth, quoteId, body, baseUrl)
  }

  /** Supplier → Create Offer Card (posted into quote chat) */
  async createOffer(auth, quoteId, body, baseUrl) {
    this.assertSupplier(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)

    if (quote.sellerId !== auth.id) {
      throw httpError('Only the product supplier can send offers', 403, 'Forbidden')
    }
    await assertSellerEupagoConfigured(auth.id)

    const quoteProduct = quote.quoteItems?.[0]?.product || null
    let productId = body.productId || quoteProduct?.id || null
    let productName = body.productName

    if (productId) {
      const owned = await prisma.product.findFirst({
        where: { id: productId, sellerId: auth.id },
        select: { id: true, title: true },
      })
      if (!owned) {
        throw httpError('Product not found in your catalog', 404, 'ProductNotFound')
      }
      if (!productName) productName = owned.title
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create project for buyer if it doesn't exist
      if (body.projectName) {
        const existingProject = await tx.project.findFirst({
          where: { userId: quote.buyerId, projectName: body.projectName.trim() }
        })
        if (!existingProject) {
          await tx.project.create({
            data: {
              userId: quote.buyerId,
              projectName: body.projectName.trim(),
              location: body.deliveryLocation?.trim() || body.warehouseLocation?.trim() || 'N/A'
            }
          })
        }
      }

      const offer = await tx.quoteOffer.create({
        data: offerCreateData(body, {
          quoteRequestId: quoteId,
          createdById: auth.id,
          productId,
          productName,
        }),
        include: offerInstallmentsInclude,
      })
      
      const { ensureQuoteThread } = await import('../../chat/threads.js')
      const thread = await ensureQuoteThread(tx, {
        quoteRequestId: quoteId,
        buyerId: quote.buyerId,
        sellerId: quote.sellerId,
      })

      const chatMessage = await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          quoteRequestId: quoteId,
          chatThreadId: thread.id,
          messageType: 'OFFER',
          messageText: `Offer Card: ${offer.productName}`,
          offerId: offer.id,
        },
        include: messageInclude,
      })

      await tx.quoteRequest.update({
        where: { id: quoteId },
        data: { status: 'IN_CHAT' },
      })

      return { offer, chatMessage, threadId: thread.id }
    })

    const offerCard = mapOfferCard(result.offer)
    const chatMessage = mapMessage(result.chatMessage, auth.id, baseUrl)
    
    // Broadcast using the new socket logic
    const { getIO } = await import('../../../socket/io.js')
    const io = getIO()
    if (io) {
      const participations = await prisma.chatThreadParticipant.findMany({
        where: { threadId: result.threadId },
        select: { userId: true },
      })
      const rooms = [`chat:${result.threadId}`]
      participations.forEach(p => rooms.push(`user:${p.userId}`))
      
      const payload = {
        threadId: result.threadId,
        chatMessage: mapMessage(result.chatMessage, null, baseUrl),
      }
      
      io.to(rooms).emit('chat:message', payload)
    }

    return {
      status: 201,
      body: {
        offer: offerCard,
        chatMessage,
        message: 'Offer card sent to company',
      },
    }
  }

  async negotiateOffer(auth, quoteId, offerId, baseUrl) {
    this.assertCompany(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)
    if (quote.buyerId !== auth.id) {
      throw httpError('Only the company buyer can negotiate', 403, 'Forbidden')
    }

    const offer = await prisma.quoteOffer.findFirst({
      where: { id: offerId, quoteRequestId: quoteId },
      include: offerInstallmentsInclude,
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.quoteOffer.update({
        where: { id: offerId },
        data: { status: 'NEGOTIATING' },
        include: offerInstallmentsInclude,
      })
      await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          quoteRequestId: quoteId,
          messageType: 'SYSTEM',
          messageText: 'Company requested negotiation on the offer card.',
          offerId,
        },
      })
      return o
    })

    const offerCard = mapOfferCard(updated)
    broadcastQuoteEvent(quoteId, 'quote:offer_updated', {
      quoteId,
      offerId,
      offer: offerCard,
      action: 'negotiate',
    })

    return {
      status: 200,
      body: {
        offer: offerCard,
        message: 'Negotiation requested',
      },
    }
  }

  async acceptOffer(auth, quoteId, offerId, baseUrl) {
    this.assertCompany(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)
    if (quote.buyerId !== auth.id) {
      throw httpError('Only the company buyer can accept', 403, 'Forbidden')
    }

    const offer = await prisma.quoteOffer.findFirst({
      where: { id: offerId, quoteRequestId: quoteId },
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.quoteOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED' },
        include: offerInstallmentsInclude,
      })
      await tx.quoteRequest.update({
        where: { id: quoteId },
        data: { status: 'ACCEPTED' },
      })
      await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          quoteRequestId: quoteId,
          messageType: 'SYSTEM',
          messageText: 'Company accepted the offer card.',
          offerId,
        },
      })
      return o
    })

    const offerCard = mapOfferCard(updated)
    broadcastQuoteEvent(quoteId, 'quote:offer_updated', {
      quoteId,
      offerId,
      offer: offerCard,
      action: 'accept',
    })

    return {
      status: 200,
      body: {
        offer: offerCard,
        message: 'Offer accepted',
      },
    }
  }

  /**
   * Company → Pay offer (demo/mock). Creates QUOTE_CONVERSION chat order.
   */
  async payOffer(auth, quoteId, offerId, baseUrl, shippingFee = 0, paymentMethod = 'multibanco', mbwayPhone) {
    const role = this.assertParticipantRole(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)
    if (quote.buyerId !== auth.id && quote.sellerId !== auth.id) {
      throw httpError('Only quote participants can pay this offer', 403, 'Forbidden')
    }

    const offer = await prisma.quoteOffer.findFirst({
      where: { id: offerId, quoteRequestId: quoteId },
      include: offerInstallmentsInclude,
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')
    assertOfferPayable(offer, { rejectRejected: true })

    const productId = offer.productId || quote.quoteItems?.[0]?.productId || null

    return payConvertedOffer({
      auth,
      offer,
      productId,
      offerId,
      baseUrl,
      context: quotePayContext,
      extra: { quote, quoteId },
      shippingFee,
      paymentMethod,
      mbwayPhone,
    })
  }

  async getBuyerProjects(auth, quoteId) {
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      select: { buyerId: true, sellerId: true },
    })
    if (!quote) throw httpError('Quote not found', 404)
    if (quote.sellerId !== auth.id) {
      throw httpError('Access denied', 403)
    }

    const projects = await prisma.project.findMany({
      where: { userId: quote.buyerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        projectName: true,
        location: true,
      },
    })

    return {
      status: 200,
      body: {
        projects,
      },
    }
  }
}

export default new QuoteService()
