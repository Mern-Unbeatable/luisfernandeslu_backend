import { initSocket } from './io.js'
import { registerLiveChatSocket } from './liveChat.js'

/**
 * Boot Socket.IO on the HTTP server.
 * @param {import('node:http').Server} httpServer
 */
export function setupSocket(httpServer) {
  const io = initSocket(httpServer)
  registerLiveChatSocket(io)
  console.log(
    'Socket.IO ready at path /socket.io (live chat: quote / transport / factory / admin)',
  )
  return io
}

export { getIO, emitToQuote, emitToChat, quoteRoom, chatRoom } from './io.js'
export default setupSocket
