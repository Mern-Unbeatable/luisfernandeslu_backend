import { Server } from 'socket.io'
import { env, getCorsOrigins } from '../config/env.js'

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

export function disputeRoom(disputeId) {
  return `dispute:${disputeId}`
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
 * Emit to dispute room.
 */
export function emitToDispute(disputeId, event, payload) {
  if (!io || !disputeId) return
  io.to(disputeRoom(disputeId)).emit(event, payload)
}

/**
 * Attach Socket.IO to the HTTP server.
 */
export function initSocket(httpServer) {
  const apiPort = env.port
  const allowedOrigins = new Set([
    ...getCorsOrigins(),
    `http://localhost:${apiPort}`,
    `http://127.0.0.1:${apiPort}`,
  ])

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true)
        }
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true)
        }
        return callback(new Error(`Socket CORS blocked: ${origin}`))
      },
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
