/**
 * Chat thread helpers — create/get threads + persist generic text messages.
 */

import prisma from '../../../lib/prisma.js'
import { assertCanOpenThread, canAccessThread } from './rules.js'
import { mapThreadSummary } from './mappers.js'

export { mapThreadSummary } from './mappers.js'

async function syncParticipants(tx, threadId, userIds) {
  const unique = [...new Set(userIds.filter(Boolean))]
  for (const userId of unique) {
    await tx.chatThreadParticipant.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId },
      update: {},
    })
  }
}

async function findOrCreateTypedThread({ type, where, data, allowedUserIds }) {
  let thread = await prisma.chatThread.findFirst({
    where: { type, ...where },
    include: { participants: true },
  })
  if (!thread) {
    thread = await prisma.$transaction(async (tx) => {
      const created = await tx.chatThread.create({ data: { type, ...data } })
      await syncParticipants(tx, created.id, allowedUserIds)
      return tx.chatThread.findUniqueOrThrow({
        where: { id: created.id },
        include: { participants: true },
      })
    })
  } else {
    await prisma.$transaction((tx) =>
      syncParticipants(tx, thread.id, allowedUserIds),
    )
  }
  return thread
}

/**
 * Open or reuse a thread based on type + context. Enforces chat rules.
 */
export async function openOrGetThread(user, payload) {
  const gate = await assertCanOpenThread(user, payload)
  if (!gate.ok) {
    const err = new Error(gate.error || 'Access denied')
    err.code = 'ChatAccessDenied'
    throw err
  }

  const { type, allowedUserIds, meta } = gate

  if (type === 'QUOTE') {
    let thread = await prisma.chatThread.findUnique({
      where: { quoteRequestId: meta.quoteRequestId },
      include: { participants: true },
    })
    if (!thread) {
      thread = await prisma.$transaction(async (tx) => {
        const created = await tx.chatThread.create({
          data: {
            type: 'QUOTE',
            quoteRequestId: meta.quoteRequestId,
          },
        })
        await syncParticipants(tx, created.id, allowedUserIds)
        return tx.chatThread.findUniqueOrThrow({
          where: { id: created.id },
          include: { participants: true },
        })
      })
    } else {
      await prisma.$transaction((tx) =>
        syncParticipants(tx, thread.id, allowedUserIds),
      )
    }
    return thread
  }

  if (type === 'ORDER_TRANSPORT') {
    return findOrCreateTypedThread({
      type,
      where: { orderId: meta.orderId },
      data: { orderId: meta.orderId },
      allowedUserIds,
    })
  }

  if (type === 'FACTORY_SUPPLIER') {
    return findOrCreateTypedThread({
      type,
      where: {
        productId: meta.productId,
        participants: { some: { userId: allowedUserIds[1] } },
      },
      data: { productId: meta.productId },
      allowedUserIds,
    })
  }

  if (type === 'ADMIN_SUPPORT') {
    return findOrCreateTypedThread({
      type,
      where: { peerUserId: meta.peerUserId },
      data: { peerUserId: meta.peerUserId },
      allowedUserIds,
    })
  }

  const err = new Error('Unsupported thread type')
  err.code = 'ChatTypeInvalid'
  throw err
}

/**
 * Ensure a QUOTE thread exists inside an existing transaction
 * (REST sendMessage, offer pay). Does not re-check access rules.
 */
export async function ensureQuoteThread(tx, { quoteRequestId, buyerId, sellerId }) {
  let thread = await tx.chatThread.findUnique({
    where: { quoteRequestId },
    select: { id: true },
  })
  if (thread) return thread
  return tx.chatThread.create({
    data: {
      type: 'QUOTE',
      quoteRequestId,
      participants: {
        create: [{ userId: buyerId }, { userId: sellerId }],
      },
    },
    select: { id: true },
  })
}

export async function getThreadForUser(threadId, user) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { participants: true },
  })
  if (!thread) return null
  const ok = await canAccessThread(user, thread)
  if (!ok) return null
  return thread
}

export async function persistTextMessage(user, thread, text) {
  const messageText = String(text || '').trim()
  if (!messageText) {
    const err = new Error('message is required')
    err.code = 'MessageRequired'
    throw err
  }

  const row = await prisma.chatMessage.create({
    data: {
      senderId: user.id,
      chatThreadId: thread.id,
      quoteRequestId: thread.quoteRequestId || null,
      messageType: 'TEXT',
      messageText,
    },
    select: {
      id: true,
      senderId: true,
      chatThreadId: true,
      quoteRequestId: true,
      messageType: true,
      messageText: true,
      createdAt: true,
    },
  })

  return {
    ...row,
    sender: {
      id: user.id,
      name: user.name || null,
      role: user.role,
    },
  }
}

export default {
  openOrGetThread,
  getThreadForUser,
  persistTextMessage,
  mapThreadSummary,
  ensureQuoteThread,
}
