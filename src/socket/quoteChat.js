/**
 * @deprecated Use liveChat.js — kept so old imports do not break.
 * Quote events are registered inside registerLiveChatSocket.
 */
export { registerLiveChatSocket as registerQuoteChatSocket } from './liveChat.js'
export default function registerQuoteChatSocket() {
  throw new Error(
    'registerQuoteChatSocket is deprecated; use setupSocket → registerLiveChatSocket',
  )
}
