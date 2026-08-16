import { verifyAccessToken } from '../lib/jwt.js'
import prisma from '../../lib/prisma.js'
import quoteService from '../modules/quotes/services/quote.service.js'
import { quoteRoom } from './io.js'

function parseToken(socket) {
  const authToken = socket.handshake?.auth?.token
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '')

  const header = socket.handshake?.headers?.authorization
  if (header) {
    const [type, token] = String(header).split(' ')
    if (type?.toLowerCase() === 'bearer' && token) return token
  }

  const queryToken = socket.handshake?.query?.token
  if (queryToken) return String(queryToken)
  return null
}

function attachAuth(socket, next) {
  try {
    const token = parseToken(socket)
    if (!token) {
      return next(new Error('Unauthorized: access token required'))
    }
    const payload = verifyAccessToken(token)
    const role = String(payload.role || '').toLowerCase()
    if (role !== 'company' && role !== 'supplier') {
      return next(new Error('Forbidden: company or supplier only'))
    }
    socket.user = {
      id: payload.id || payload.sub,
      email: payload.email,
      role,
      status: payload.status,
      name: payload.name,
    }
    return next()
  } catch (err) {
    return next(new Error('Unauthorized: invalid or expired token'))
  }
}

async function assertQuoteParticipant(userId, quoteId) {
  const quote = await prisma.quoteRequest.findFirst({
    where: {
      id: quoteId,
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    select: { id: true, buyerId: true, sellerId: true, status: true },
  })
  return quote
}

/**
 * @param {import('socket.io').Server} io
 */
export function registerQuoteChatSocket(io) {
  io.use(attachAuth)

  io.on('connection', (socket) => {
    socket.emit('connected', {
      userId: socket.user.id,
      role: socket.user.role,
      message: 'Socket connected for live quote chat',
    })

    socket.on('quote:join', async (payload = {}, ack) => {
      try {
        const quoteId = payload.quoteId || payload.id
        if (!quoteId) throw new Error('quoteId is required')

        const quote = await assertQuoteParticipant(socket.user.id, quoteId)
        if (!quote) throw new Error('Quote not found or access denied')

        await socket.join(quoteRoom(quoteId))
        socket.data.activeQuoteId = quoteId

        const result = typeof ack === 'function' ? ack : null
        result?.({
          ok: true,
          quoteId,
          room: quoteRoom(quoteId),
        })

        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          name: socket.user.name,
          status: 'joined',
        })
      } catch (err) {
        const message = err.message || 'Failed to join quote room'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('quote:error', { message })
      }
    })

    socket.on('quote:leave', async (payload = {}, ack) => {
      const quoteId = payload.quoteId || socket.data.activeQuoteId
      if (quoteId) {
        await socket.leave(quoteRoom(quoteId))
        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          status: 'left',
        })
        if (socket.data.activeQuoteId === quoteId) {
          socket.data.activeQuoteId = null
        }
      }
      if (typeof ack === 'function') ack({ ok: true })
    })

    socket.on('quote:typing', (payload = {}) => {
      const quoteId = payload.quoteId || socket.data.activeQuoteId
      if (!quoteId) return
      socket.to(quoteRoom(quoteId)).emit('quote:typing', {
        quoteId,
        userId: socket.user.id,
        name: socket.user.name,
        isTyping: Boolean(payload.isTyping),
      })
    })

    socket.on('quote:message', async (payload = {}, ack) => {
      try {
        const quoteId = payload.quoteId || socket.data.activeQuoteId
        const message = payload.message || payload.text
        if (!quoteId) throw new Error('quoteId is required')
        if (!message || !String(message).trim()) {
          throw new Error('message is required')
        }

        const quote = await assertQuoteParticipant(socket.user.id, quoteId)
        if (!quote) throw new Error('Quote not found or access denied')

        // Persist + broadcast (broadcast happens inside service)
        const result = await quoteService.sendMessage(
          socket.user,
          quoteId,
          { message: String(message).trim() },
          null,
        )

        if (typeof ack === 'function') {
          ack({
            ok: true,
            chatMessage: result.body.chatMessage,
          })
        }
      } catch (err) {
        const message = err.message || 'Failed to send message'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('quote:error', { message, code: err.code || 'Error' })
      }
    })

    socket.on('disconnect', () => {
      const quoteId = socket.data.activeQuoteId
      if (quoteId) {
        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          status: 'offline',
        })
      }
    })
  })
}

export default registerQuoteChatSocket
