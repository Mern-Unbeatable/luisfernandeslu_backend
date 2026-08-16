import { initSocket } from './io.js'
import { registerQuoteChatSocket } from './quoteChat.js'

/**
 * Boot Socket.IO on the HTTP server.
 * @param {import('node:http').Server} httpServer
 */
export function setupSocket(httpServer) {
  const io = initSocket(httpServer)
  registerQuoteChatSocket(io)
  console.log('Socket.IO ready at path /socket.io (quote live chat)')
  return io
}

export { getIO, emitToQuote, quoteRoom } from './io.js'
export default setupSocket
