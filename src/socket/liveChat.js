import { verifyAccessToken } from '../lib/jwt.js'
import {
  CHAT_ROLES,
  normalizeRole,
  isAdmin,
} from './chatRules.js'
import {
  markOnline,
  markOffline,
  isUserOnline,
  listOnlineUserIds,
} from './chatPresence.js'
import {
  openOrGetThread,
  getThreadForUser,
  persistTextMessage,
  mapThreadSummary,
} from './chatThreadService.js'
import { chatRoom, quoteRoom, emitToChat } from './io.js'
import quoteService from '../modules/quotes/services/quote.service.js'
import prisma from '../../lib/prisma.js'

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
    const role = normalizeRole(payload.role)
    if (!CHAT_ROLES.includes(role)) {
      return next(new Error('Forbidden: role not allowed for chat'))
    }
    socket.user = {
      id: payload.id || payload.sub,
      email: payload.email,
      role,
      status: payload.status,
      name: payload.name,
    }
    return next()
  } catch {
    return next(new Error('Unauthorized: invalid or expired token'))
  }
}

function emitPresenceToThread(socket, threadId, status) {
  socket.to(chatRoom(threadId)).emit('chat:presence', {
    threadId,
    userId: socket.user.id,
    name: socket.user.name,
    role: socket.user.role,
    status,
    online: isUserOnline(socket.user.id),
  })
}

/**
 * @param {import('socket.io').Server} io
 */
export function registerLiveChatSocket(io) {
  io.use(attachAuth)

  io.on('connection', (socket) => {
    markOnline(socket.user.id, socket.id)
    socket.join(`user:${socket.user.id}`)

    socket.emit('connected', {
      userId: socket.user.id,
      role: socket.user.role,
      message: 'Socket connected for live chat',
    })

    io.emit('user:presence', {
      userId: socket.user.id,
      status: 'online',
    })

    // ——— Open / create thread (rules enforced) ———
    socket.on('chat:open', async (payload = {}, ack) => {
      try {
        const thread = await openOrGetThread(socket.user, payload)
        const summary = mapThreadSummary(thread)
        if (typeof ack === 'function') {
          ack({
            ok: true,
            thread: summary,
            participantsOnline: summary.participantIds.map((id) => ({
              userId: id,
              online: isUserOnline(id),
            })),
          })
        }
      } catch (err) {
        const message = err.message || 'Failed to open chat'
        if (typeof ack === 'function') {
          ack({ ok: false, message, code: err.code || 'ChatOpenError' })
        }
        socket.emit('chat:error', { message, code: err.code })
      }
    })

    socket.on('chat:join', async (payload = {}, ack) => {
      try {
        const threadId = payload.threadId || payload.id
        if (!threadId) throw new Error('threadId is required')

        const thread = await getThreadForUser(threadId, socket.user)
        if (!thread) throw new Error('Thread not found or access denied')

        // Admin joining: ensure participant row so they stay in room rules
        if (isAdmin(socket.user.role)) {
          await prisma.chatThreadParticipant.upsert({
            where: {
              threadId_userId: { threadId, userId: socket.user.id },
            },
            create: { threadId, userId: socket.user.id },
            update: {},
          })
        }

        await socket.join(chatRoom(threadId))
        if (thread.quoteRequestId) {
          await socket.join(quoteRoom(thread.quoteRequestId))
        }
        socket.data.activeThreadId = threadId

        if (typeof ack === 'function') {
          ack({
            ok: true,
            threadId,
            room: chatRoom(threadId),
            thread: mapThreadSummary(thread),
          })
        }

        emitPresenceToThread(socket, threadId, 'joined')
      } catch (err) {
        const message = err.message || 'Failed to join chat'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('chat:error', { message })
      }
    })

    socket.on('chat:leave', async (payload = {}, ack) => {
      const threadId = payload.threadId || socket.data.activeThreadId
      if (threadId) {
        await socket.leave(chatRoom(threadId))
        emitPresenceToThread(socket, threadId, 'left')
        if (socket.data.activeThreadId === threadId) {
          socket.data.activeThreadId = null
        }
      }
      if (typeof ack === 'function') ack({ ok: true })
    })

    socket.on('chat:typing', (payload = {}) => {
      const threadId = payload.threadId || socket.data.activeThreadId
      if (!threadId) return
      socket.to(chatRoom(threadId)).emit('chat:typing', {
        threadId,
        userId: socket.user.id,
        name: socket.user.name,
        isTyping: Boolean(payload.isTyping),
      })
    })

    socket.on('chat:message', async (payload = {}, ack) => {
      try {
        const threadId = payload.threadId || socket.data.activeThreadId
        const message = payload.message || payload.text
        if (!threadId) throw new Error('threadId is required')

        const thread = await getThreadForUser(threadId, socket.user)
        if (!thread) throw new Error('Thread not found or access denied')

        const chatMessage = await persistTextMessage(
          socket.user,
          thread,
          message,
        )

        const eventPayload = { threadId, chatMessage }
        emitToChat(threadId, 'chat:message', eventPayload)
        // Also emit to self if not in room yet
        socket.emit('chat:message', eventPayload)

        if (thread.quoteRequestId) {
          emitToChat(threadId, 'quote:message', {
            quoteId: thread.quoteRequestId,
            chatMessage,
          })
        }

        if (typeof ack === 'function') ack({ ok: true, chatMessage })
      } catch (err) {
        const message = err.message || 'Failed to send message'
        if (typeof ack === 'function') {
          ack({ ok: false, message, code: err.code })
        }
        socket.emit('chat:error', { message, code: err.code })
      }
    })

    // Online status for other users
    socket.on('presence:get', (payload = {}, ack) => {
      const userIds = Array.isArray(payload.userIds) ? payload.userIds : []
      const result = userIds.map((id) => ({
        userId: id,
        online: isUserOnline(id),
      }))
      if (typeof ack === 'function') ack({ ok: true, users: result })
      else socket.emit('presence:status', { users: result })
    })

    socket.on('presence:list', (_payload, ack) => {
      const users = listOnlineUserIds().map((id) => ({
        userId: id,
        online: true,
      }))
      if (typeof ack === 'function') ack({ ok: true, users })
    })

    // ——— Backward-compatible quote:* events ———
    socket.on('quote:join', async (payload = {}, ack) => {
      try {
        const quoteId = payload.quoteId || payload.id
        if (!quoteId) throw new Error('quoteId is required')

        const thread = await openOrGetThread(socket.user, {
          type: 'QUOTE',
          quoteRequestId: quoteId,
        })
        await socket.join(chatRoom(thread.id))
        await socket.join(quoteRoom(quoteId))
        socket.data.activeThreadId = thread.id
        socket.data.activeQuoteId = quoteId

        if (typeof ack === 'function') {
          ack({
            ok: true,
            quoteId,
            threadId: thread.id,
            room: quoteRoom(quoteId),
          })
        }
        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          name: socket.user.name,
          status: 'joined',
        })
        emitPresenceToThread(socket, thread.id, 'joined')
      } catch (err) {
        const message = err.message || 'Failed to join quote room'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('quote:error', { message })
      }
    })

    socket.on('quote:leave', async (payload = {}, ack) => {
      const quoteId = payload.quoteId || socket.data.activeQuoteId
      const threadId = socket.data.activeThreadId
      if (quoteId) {
        await socket.leave(quoteRoom(quoteId))
        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          status: 'left',
        })
      }
      if (threadId) {
        await socket.leave(chatRoom(threadId))
        emitPresenceToThread(socket, threadId, 'left')
      }
      socket.data.activeQuoteId = null
      if (typeof ack === 'function') ack({ ok: true })
    })

    socket.on('quote:typing', (payload = {}) => {
      const quoteId = payload.quoteId || socket.data.activeQuoteId
      const threadId = socket.data.activeThreadId
      if (quoteId) {
        socket.to(quoteRoom(quoteId)).emit('quote:typing', {
          quoteId,
          userId: socket.user.id,
          name: socket.user.name,
          isTyping: Boolean(payload.isTyping),
        })
      }
      if (threadId) {
        socket.to(chatRoom(threadId)).emit('chat:typing', {
          threadId,
          userId: socket.user.id,
          name: socket.user.name,
          isTyping: Boolean(payload.isTyping),
        })
      }
    })

    socket.on('quote:message', async (payload = {}, ack) => {
      try {
        const quoteId = payload.quoteId || socket.data.activeQuoteId
        const message = payload.message || payload.text
        if (!quoteId) throw new Error('quoteId is required')
        if (!message || !String(message).trim()) {
          throw new Error('message is required')
        }

        // Ensure thread + participant rules
        const thread = await openOrGetThread(socket.user, {
          type: 'QUOTE',
          quoteRequestId: quoteId,
        })

        const result = await quoteService.sendMessage(
          socket.user,
          quoteId,
          { message: String(message).trim() },
          null,
        )

        // Attach thread id on message if service didn't
        const chatMessage = {
          ...result.body.chatMessage,
          chatThreadId: thread.id,
        }

        emitToChat(thread.id, 'chat:message', {
          threadId: thread.id,
          chatMessage,
        })

        if (typeof ack === 'function') {
          ack({ ok: true, chatMessage, threadId: thread.id })
        }
      } catch (err) {
        const message = err.message || 'Failed to send message'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('quote:error', { message, code: err.code || 'Error' })
      }
    })

    socket.on('disconnect', () => {
      markOffline(socket.user.id, socket.id)
      const stillOnline = isUserOnline(socket.user.id)

      const threadId = socket.data.activeThreadId
      if (threadId) {
        socket.to(chatRoom(threadId)).emit('chat:presence', {
          threadId,
          userId: socket.user.id,
          status: stillOnline ? 'left' : 'offline',
          online: stillOnline,
        })
      }
      const quoteId = socket.data.activeQuoteId
      if (quoteId) {
        socket.to(quoteRoom(quoteId)).emit('quote:presence', {
          quoteId,
          userId: socket.user.id,
          status: stillOnline ? 'left' : 'offline',
        })
      }

      if (!stillOnline) {
        io.emit('user:presence', {
          userId: socket.user.id,
          status: 'offline',
        })
      }
    })
  })
}

export default registerLiveChatSocket
