/**
 * @deprecated Import from `modules/chat/rules.js`. Kept so existing socket
 * and order imports keep working.
 */
export {
  CHAT_ROLES,
  normalizeRole,
  isAdmin,
  assertQuoteParticipantRole,
  resolveAssignedTransporterId,
  userIsParticipant,
  canAccessThread,
  assertCanOpenThread,
} from '../modules/chat/rules.js'

export { default } from '../modules/chat/rules.js'
