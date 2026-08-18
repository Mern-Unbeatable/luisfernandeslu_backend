import prisma from '../../../lib/prisma.js'
import { emitToQuote } from '../../socket/io.js'
import { httpError } from '../../shared/errors.js'
import { mapMessage, messageInclude } from '../offers/mappers.js'
import { assertQuoteParticipantRole } from './roles.js'
import { ensureQuoteThread } from './threads.js'

export async function getQuoteForParticipant(auth, quoteId) {
  const quote = await prisma.quoteRequest.findFirst({
    where: {
      id: quoteId,
      OR: [{ buyerId: auth.id }, { sellerId: auth.id }],
    },
    select: { id: true, buyerId: true, sellerId: true, status: true },
  })
  if (!quote) throw httpError('Quote not found', 404, 'NotFound')
  return quote
}

export async function listQuoteMessages(auth, quoteId, query, baseUrl) {
  assertQuoteParticipantRole(auth)
  await getQuoteForParticipant(auth, quoteId)

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50))
  const where = { quoteRequestId: quoteId }
  if (query.after) {
    where.createdAt = { gt: new Date(query.after) }
  }

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

/**
 * Persist a quote chat TEXT message, bump quote status, and emit `quote:message`.
 * Used by REST `/api/quotes/:id/messages` and the socket `quote:message` event.
 */
export async function postQuoteTextMessage(auth, quoteId, body, baseUrl) {
  assertQuoteParticipantRole(auth)
  const quote = await getQuoteForParticipant(auth, quoteId)
  const messageText = String(body?.message || '').trim()
  if (!messageText) {
    throw httpError('message is required', 400, 'MessageRequired')
  }

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

    const thread = await ensureQuoteThread(tx, {
      quoteRequestId: quoteId,
      buyerId: quote.buyerId,
      sellerId: quote.sellerId,
    })

    return tx.chatMessage.create({
      data: {
        senderId: auth.id,
        quoteRequestId: quoteId,
        chatThreadId: thread.id,
        messageType: 'TEXT',
        messageText,
      },
      include: messageInclude,
    })
  })

  const chatMessage = mapMessage(msg, auth.id, baseUrl)
  emitToQuote(quoteId, 'quote:message', {
    quoteId,
    chatMessage: mapMessage(msg, null, baseUrl),
  })

  return {
    status: 201,
    body: {
      chatMessage,
      message: 'Message sent',
    },
    threadId: msg.chatThreadId,
  }
}
