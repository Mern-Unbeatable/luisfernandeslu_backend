import { emitToChat, emitToQuote } from '../../../socket/io.js'
import { messageInclude } from '../mappers.js'
import { ensureQuoteThread } from '../../chat/threads.js'

export const quotePayContext = {
  orderSource: 'QUOTE_CONVERSION',
  orderNumberSuffix: 'Q',
  buyerNameFallback: 'Company',
  emailFallback: 'company@local',
  projectFallback: 'Chat order',
  historyNote: 'Chat offer paid (demo) — awaiting supplier acceptance',
  responseMessage: 'Demo payment confirmed. Chat order created for the supplier.',
  sessionNotes: (offer) => `Quote offer ${offer.id} demo pay`,
  sellerId: ({ extra }) => extra.quote.sellerId,
  quoteRequestId: ({ extra }) => extra.quoteId,

  async afterPaid(tx, { auth, extra, order, offerId }) {
    await tx.quoteRequest.update({
      where: { id: extra.quoteId },
      data: { status: 'ACCEPTED' },
    })

    const thread = await ensureQuoteThread(tx, {
      quoteRequestId: extra.quoteId,
      buyerId: extra.quote.buyerId,
      sellerId: extra.quote.sellerId,
    })

    const chatMessage = await tx.chatMessage.create({
      data: {
        senderId: auth.id,
        quoteRequestId: extra.quoteId,
        chatThreadId: thread.id,
        messageType: 'SYSTEM',
        messageText: `Demo payment confirmed for offer card. Order ${order.orderNumber} created.`,
        offerId,
      },
      include: messageInclude,
    })

    return { chatMessage, threadId: thread.id }
  },

  emitPaid({ extra, offerId, offerCard, chatMessage, threadId }) {
    emitToQuote(extra.quoteId, 'quote:offer_updated', {
      quoteId: extra.quoteId,
      offerId,
      offer: offerCard,
      action: 'pay',
    })
    emitToQuote(extra.quoteId, 'quote:message', {
      quoteId: extra.quoteId,
      chatMessage,
    })
    emitToChat(threadId, 'chat:message', {
      threadId,
      chatMessage,
    })
  },
}
