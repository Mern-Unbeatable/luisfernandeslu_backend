import { Server } from 'socket.io'

/** @type {import('socket.io').Server | null} */
let io = null

export function getIO() {
  return io
}

export function quoteRoom(quoteId) {
  return `quote:${quoteId}`
}

export function chatRoom(threadId) {
  return `chat:${threadId}`
}

/**
 * Emit to quote room. Safe no-op if socket not ready.
 */
export function emitToQuote(quoteId, event, payload) {
  if (!io || !quoteId) return
  io.to(quoteRoom(quoteId)).emit(event, payload)
}

/**
 * Emit to chat thread room.
 */
export function emitToChat(threadId, event, payload) {
  if (!io || !threadId) return
  io.to(chatRoom(threadId)).emit(event, payload)
}

/**
 * Attach Socket.IO to the HTTP server.
 */
export function initSocket(httpServer) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  })

  return io
}

export default {
  initSocket,
  getIO,
  emitToQuote,
  emitToChat,
  quoteRoom,
  chatRoom,
}
