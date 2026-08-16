/**
 * In-memory online presence (userId → Set of socket ids).
 */

/** @type {Map<string, Set<string>>} */
const online = new Map()

export function markOnline(userId, socketId) {
  if (!userId || !socketId) return
  let set = online.get(userId)
  if (!set) {
    set = new Set()
    online.set(userId, set)
  }
  set.add(socketId)
}

export function markOffline(userId, socketId) {
  if (!userId) return
  const set = online.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) online.delete(userId)
}

export function isUserOnline(userId) {
  const set = online.get(userId)
  return Boolean(set && set.size > 0)
}

export function listOnlineUserIds() {
  return [...online.keys()]
}

export default {
  markOnline,
  markOffline,
  isUserOnline,
  listOnlineUserIds,
}
