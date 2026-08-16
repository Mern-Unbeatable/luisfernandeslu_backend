import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { emitToQuote } from '../../../socket/io.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

function parseQuantityAmount(quantityText) {
  const match = String(quantityText || '').match(/\d+/)
  const n = match ? Number.parseInt(match[0], 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}

function money(n) {
  return Number(Number(n).toFixed(2))
}

function formatMoney(n) {
  return `$${money(n).toFixed(2)}`
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const map = { 1: 'st', 2: 'nd', 3: 'rd' }
  return `${n}${map[n % 10] || 'th'}`
}

function liveProductWhere(productId) {
  return {
    id: productId,
    approvalStatus: 'APPROVED',
    inventory: { is: { listedQuantity: { gt: 0 } } },
  }
}

function partyName(user) {
  if (!user) return 'User'
  return user.profile?.companyName?.trim() || user.name || 'User'
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
    include: {
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
  },
}

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
  const monthly =
    months > 0 ? money(remaining / months) : null

  const pricing = [
    {
      label: 'Total Price',
      value: formatMoney(offer.totalPrice),
      icon: 'dollar',
    },
    {
      label: 'Installment',
      value: `${offer.installmentMonths} months`,
      icon: 'calendar',
    },
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
    // Relative to viewer when known; clients should prefer senderId
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

function broadcastQuoteEvent(quoteId, event, payload) {
  emitToQuote(quoteId, event, payload)
}

class QuoteService {
  assertParticipantRole(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'company' && role !== 'supplier') {
      throw httpError(
        'Only company or supplier can access quotes',
        403,
        'Forbidden',
      )
    }
    return role
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

      await tx.chatMessage.create({
        data: {
          senderId: auth.id,
          quoteRequestId: created.id,
          messageType: 'SYSTEM',
          messageText: `Quote request sent for "${product.title}". Budget: ${formatMoney(body.budget)}. ${quantityNote}.`,
        },
      })

      if (userMessage) {
        await tx.chatMessage.create({
          data: {
            senderId: auth.id,
            quoteRequestId: created.id,
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
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12))
    const skip = (page - 1) * limit
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
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
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
    this.assertParticipantRole(auth)
    await this.getAccessibleQuote(auth, quoteId)

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50))
    const where = { quoteRequestId: quoteId }
    if (query.after) {
      where.createdAt = { gt: new Date(query.after) }
    }

    const rows = await prisma.chatMessage.findMany({
      where,
      include: {
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
      },
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

  async sendMessage(auth, quoteId, body, baseUrl) {
    this.assertParticipantRole(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)

    const msg = await prisma.$transaction(async (tx) => {
      if (quote.status === 'PENDING') {
        await tx.quoteRequest.update({
          where: { id: quoteId },
          data: { status: 'IN_CHAT' },
        })
      } else {
        await tx.quoteRequest.update({
          where: { id: quoteId },
          data: { updatedAt: new Date() },
        })
      }

      let thread = await tx.chatThread.findUnique({
        where: { quoteRequestId: quoteId },
        select: { id: true },
      })
      if (!thread) {
        thread = await tx.chatThread.create({
          data: {
            type: 'QUOTE',
            quoteRequestId: quoteId,
            participants: {
              create: [
                { userId: quote.buyerId },
                { userId: quote.sellerId },
              ],
            },
          },
          select: { id: true },
        })
      }

      return tx.chatMessage.create({
        data: {
          senderId: auth.id,
          quoteRequestId: quoteId,
          chatThreadId: thread.id,
          messageType: 'TEXT',
          messageText: body.message.trim(),
        },
        include: {
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
        },
      })
    })

    const chatMessage = mapMessage(msg, auth.id, baseUrl)
    broadcastQuoteEvent(quoteId, 'quote:message', {
      quoteId,
      chatMessage: mapMessage(msg, null, baseUrl),
    })

    return {
      status: 201,
      body: {
        chatMessage,
        message: 'Message sent',
      },
    }
  }

  /** Supplier → Create Offer Card (posted into quote chat) */
  async createOffer(auth, quoteId, body, baseUrl) {
    this.assertSupplier(auth)
    const quote = await this.getAccessibleQuote(auth, quoteId)

    if (quote.sellerId !== auth.id) {
      throw httpError('Only the product supplier can send offers', 403, 'Forbidden')
    }

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
      const offer = await tx.quoteOffer.create({
        data: {
          quoteRequestId: quoteId,
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
          quoteRequestId: quoteId,
          messageType: 'OFFER',
          messageText: `Offer Card: ${offer.productName}`,
          offerId: offer.id,
        },
        include: {
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
        },
      })

      await tx.quoteRequest.update({
        where: { id: quoteId },
        data: { status: 'IN_CHAT' },
      })

      return { offer, chatMessage }
    })

    const offerCard = mapOfferCard(result.offer)
    const chatMessage = mapMessage(result.chatMessage, auth.id, baseUrl)
    broadcastQuoteEvent(quoteId, 'quote:offer', {
      quoteId,
      offer: offerCard,
      chatMessage: mapMessage(result.chatMessage, null, baseUrl),
    })
    broadcastQuoteEvent(quoteId, 'quote:message', {
      quoteId,
      chatMessage: mapMessage(result.chatMessage, null, baseUrl),
    })

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
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
    })
    if (!offer) throw httpError('Offer not found', 404, 'NotFound')

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.quoteOffer.update({
        where: { id: offerId },
        data: { status: 'NEGOTIATING' },
        include: { installments: { orderBy: { installmentNumber: 'asc' } } },
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
        include: { installments: { orderBy: { installmentNumber: 'asc' } } },
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
}

export default new QuoteService()
