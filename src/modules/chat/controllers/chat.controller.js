import prisma from '../../../../lib/prisma.js'
import { mapThreadSummary } from '../mappers.js'
import { getThreadForUser } from '../threads.js'
import { isUserOnline } from '../../../socket/chatPresence.js'

export default {
  async listThreads(req, res, next) {
    try {
      const user = req.user
      const limit = Number(req.query.limit) || 20
      const page = Math.max(1, Number(req.query.page) || 1)
      const skip = (page - 1) * limit

      const participations = await prisma.chatThreadParticipant.findMany({
        where: { userId: user.id },
        select: { threadId: true },
      })

      const threadIds = participations.map((p) => p.threadId)

      const [total, threads] = await Promise.all([
        prisma.chatThread.count({
          where: { id: { in: threadIds } },
        }),
        prisma.chatThread.findMany({
          where: { id: { in: threadIds } },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    image: true,
                    profile: {
                      select: { companyName: true },
                    },
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
      ])

      res.status(200).json({
        success: true,
        data: {
          threads: threads.map((thread) => mapThreadSummary(thread, isUserOnline)),
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (err) {
      next(err)
    }
  },

  async listMessages(req, res, next) {
    try {
      const user = req.user
      const { threadId } = req.params
      const limit = Number(req.query.limit) || 50
      const cursor = req.query.cursor // For cursor-based pagination if needed

      // Verify user has access to thread
      const thread = await getThreadForUser(threadId, user)
      if (!thread) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Thread not found or access denied',
        })
      }

      const where = { chatThreadId: threadId }
      if (cursor) {
        where.id = { lt: cursor } // Assuming we want messages before the cursor
      }

      const { mapMessage, messageInclude } = await import('../../offers/mappers.js')
      const { absolutizeUrl } = await import('../../../lib/requestUrl.js')
      
      const baseUrl = absolutizeUrl('/', req)
      
      const messages = await prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: messageInclude,
      })

      const reversed = messages.reverse()

      res.status(200).json({
        success: true,
        data: {
          messages: reversed.map(m => mapMessage(m, user.id, baseUrl)), // Return mapped in chronological order
        },
      })
    } catch (err) {
      next(err)
    }
  },
}
