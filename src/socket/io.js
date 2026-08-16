import { Server } from 'socket.io'

/** @type {import('socket.io').Server | null} */
let io = null

export function getIO() {
  return io
}

/**
 * Emit to quote room. Safe no-op if socket not ready.
 * @param {string} quoteId
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToQuote(quoteId, event, payload) {
  if (!io || !quoteId) return
  io.to(quoteRoom(quoteId)).emit(event, payload)
}

export function quoteRoom(quoteId) {
  return `quote:${quoteId}`
}

/**
 * Attach Socket.IO to the HTTP server (live quote chat).
 * @param {import('node:http').Server} httpServer
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

  // Auth + quote chat handlers registered lazily to avoid circular imports
  return io
}

export default {
  initSocket,
  getIO,
  emitToQuote,
  quoteRoom,
}
