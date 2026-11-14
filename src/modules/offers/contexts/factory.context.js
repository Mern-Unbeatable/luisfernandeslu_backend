import { emitToChat } from '../../../socket/io.js'
import { messageInclude } from '../mappers.js'

export const factoryPayContext = {
  orderSource: 'FACTORY_CONVERSION',
  orderNumberSuffix: 'F',
  buyerNameFallback: 'Supplier',
  emailFallback: 'supplier@local',
  projectFallback: 'Factory chat order',
  historyNote: 'Factory offer order created — awaiting payment',
  responseMessage: 'Factory order created — complete the payment to confirm it.',
  sessionNotes: (offer) => `Factory offer ${offer.id}`,
  chargesShipping: false,
  sellerId: ({ offer }) => offer.createdById,

  async afterPaid(tx, { auth, offer, order, offerId }) {
    const chatMessage = await tx.chatMessage.create({
      data: {
        senderId: auth.id,
        chatThreadId: offer.chatThreadId,
        messageType: 'SYSTEM',
        messageText: `Payment confirmed for the factory offer. Order ${order.orderNumber} created.`,
        offerId,
      },
      include: messageInclude,
    })
    return { chatMessage, threadId: offer.chatThreadId }
  },

  emitPaid({ offerId, offerCard, chatMessage, threadId }) {
    emitToChat(threadId, 'chat:message', {
      threadId,
      chatMessage,
    })
    emitToChat(threadId, 'factory:offer_updated', {
      threadId,
      offerId,
      offer: offerCard,
      action: 'pay',
    })
  },
}
