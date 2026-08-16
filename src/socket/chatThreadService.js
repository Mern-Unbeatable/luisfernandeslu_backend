/**
 * Chat thread helpers — create/get threads + persist messages (no REST).
 */

import prisma from '../../lib/prisma.js'
import { assertCanOpenThread, canAccessThread } from './chatRules.js'

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

/**
 * Open or reuse a thread based on type + context. Enforces chatRules.
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
    let thread = await prisma.chatThread.findFirst({
      where: { type: 'ORDER_TRANSPORT', orderId: meta.orderId },
      include: { participants: true },
    })
    if (!thread) {
      thread = await prisma.$transaction(async (tx) => {
        const created = await tx.chatThread.create({
          data: {
            type: 'ORDER_TRANSPORT',
            orderId: meta.orderId,
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

  if (type === 'FACTORY_SUPPLIER') {
    let thread = await prisma.chatThread.findFirst({
      where: { type: 'FACTORY_SUPPLIER', productId: meta.productId },
      include: { participants: true },
    })
    if (!thread) {
      thread = await prisma.$transaction(async (tx) => {
        const created = await tx.chatThread.create({
          data: {
            type: 'FACTORY_SUPPLIER',
            productId: meta.productId,
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

  if (type === 'ADMIN_SUPPORT') {
    let thread = await prisma.chatThread.findFirst({
      where: { type: 'ADMIN_SUPPORT', peerUserId: meta.peerUserId },
      include: { participants: true },
    })
    if (!thread) {
      thread = await prisma.$transaction(async (tx) => {
        const created = await tx.chatThread.create({
          data: {
            type: 'ADMIN_SUPPORT',
            peerUserId: meta.peerUserId,
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

  const err = new Error('Unsupported thread type')
  err.code = 'ChatTypeInvalid'
  throw err
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

export function mapThreadSummary(thread) {
  return {
    id: thread.id,
    type: thread.type,
    quoteRequestId: thread.quoteRequestId,
    orderId: thread.orderId,
    productId: thread.productId,
    peerUserId: thread.peerUserId,
    participantIds: (thread.participants || []).map((p) => p.userId),
  }
}

export default {
  openOrGetThread,
  getThreadForUser,
  persistTextMessage,
  mapThreadSummary,
}
