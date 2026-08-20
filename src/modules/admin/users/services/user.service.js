import prisma from '../../../../../lib/prisma.js'
import { openOrGetThread, persistTextMessage } from '../../../chat/threads.js'
import { emitToChat } from '../../../../socket/io.js'
import { formatAddressLine } from '../../../../shared/address.js'
import { httpError } from '../../../../shared/errors.js'
import { parsePagination, paginationMeta, searchFilter } from '../../../../shared/pagination.js'

const BUYER_ROLES = ['CUSTOMER', 'COMPANY']

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Only admins can manage users', 403, 'Forbidden')
  }
  return auth
}

function normalizeType(raw) {
  const s = String(raw || 'customer').trim().toLowerCase()
  return s === 'company' ? 'COMPANY' : 'CUSTOMER'
}

function normalizeStatusFilter(raw) {
  const s = String(raw || 'all')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (s === 'active') return 'ACTIVE'
  if (s === 'suspended') return 'SUSPENDED'
  return null
}

function statusLabel(status) {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'SUSPENDED') return 'Suspended'
  if (status === 'PENDING_VERIFICATION') return 'Pending Verification'
  if (status === 'BLOCKED') return 'Blocked'
  return status
}

function typeLabel(role) {
  if (role === 'COMPANY') return 'Company'
  return 'Customer'
}

function pickPrimaryAddress(user) {
  const bridges = user.addresses || []
  const ranked = [...bridges].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  const shipping = ranked.find((b) => String(b.addressType).toUpperCase() === 'SHIPPING')
  const billing = ranked.find((b) => String(b.addressType).toUpperCase() === 'BILLING')
  return shipping?.address || billing?.address || ranked[0]?.address || null
}

function mapListRow(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phoneNumber || null,
    email: user.email,
    type: typeLabel(user.role),
    status: statusLabel(user.status),
    statusCode: user.status,
    registered: user.createdAt.toISOString().slice(0, 10),
  }
}

function mapDetails(user) {
  const address = pickPrimaryAddress(user)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber || null,
    type: typeLabel(user.role),
    status: statusLabel(user.status),
    address: formatAddressLine(address),
    registered: user.createdAt.toISOString().slice(0, 10),
    emailVerified: user.emailVerified,
  }
}

async function findBuyerUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { in: BUYER_ROLES } },
    include: {
      addresses: {
        include: { address: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!user) throw httpError('User not found', 404, 'NotFound')
  return user
}

class AdminUserService {
  async stats(auth) {
    assertAdmin(auth)

    const [totalUsers, b2cCustomers, pendingVerification] = await Promise.all([
      prisma.user.count({ where: { role: { in: BUYER_ROLES } } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({
        where: {
          role: { in: BUYER_ROLES },
          status: 'PENDING_VERIFICATION',
        },
      }),
    ])

    return {
      status: 200,
      body: {
        stats: {
          totalUsers,
          b2cCustomers,
          pendingVerification,
        },
        message: 'User management stats fetched',
      },
    }
  }

  async list(auth, query) {
    assertAdmin(auth)

    const role = normalizeType(query.type)
    const statusFilter = normalizeStatusFilter(query.status)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })

    const and = [{ role }]
    if (statusFilter) and.push({ status: statusFilter })

    const searchOr = searchFilter(query.search, ['name', 'email', 'phoneNumber'])
    if (searchOr?.length) and.push({ OR: searchOr })

    const where = { AND: and }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return {
      status: 200,
      body: {
        users: rows.map(mapListRow),
        pagination: paginationMeta({ page, limit, total }),
        filters: {
          type: role === 'COMPANY' ? 'company' : 'customer',
          status: query.status || 'all',
          search: query.search || null,
        },
        message: 'Users fetched',
      },
    }
  }

  async getById(auth, userId) {
    assertAdmin(auth)
    const user = await findBuyerUser(userId)
    return {
      status: 200,
      body: {
        user: mapDetails(user),
        message: 'User details fetched',
      },
    }
  }

  async updateStatus(auth, userId, body) {
    assertAdmin(auth)
    if (userId === auth.id) {
      throw httpError('You cannot change your own status', 400, 'InvalidTarget')
    }

    await findBuyerUser(userId)

    const next = normalizeStatusFilter(body.status)
    if (!next) {
      throw httpError('Status must be active or suspended', 400, 'InvalidStatus')
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: next },
    })

    return {
      status: 200,
      body: {
        id: userId,
        status: statusLabel(next),
        statusCode: next,
        message: next === 'ACTIVE' ? 'User activated' : 'User suspended',
      },
    }
  }

  async remove(auth, userId) {
    assertAdmin(auth)
    if (userId === auth.id) {
      throw httpError('You cannot delete your own account', 400, 'InvalidTarget')
    }

    await findBuyerUser(userId)

    try {
      await prisma.user.delete({ where: { id: userId } })
    } catch (err) {
      if (err?.code === 'P2003') {
        throw httpError(
          'User cannot be deleted because related records exist (orders, chats, etc.)',
          409,
          'HasRelatedRecords',
        )
      }
      throw err
    }

    return {
      status: 200,
      body: {
        id: userId,
        message: 'User deleted',
      },
    }
  }

  async listMessages(auth, userId, query) {
    assertAdmin(auth)
    await findBuyerUser(userId)

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { id: true, name: true, role: true },
    })

    const thread = await openOrGetThread(adminUser, {
      type: 'ADMIN_SUPPORT',
      peerUserId: userId,
    })

    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 50,
      maxLimit: 100,
    })

    const where = { chatThreadId: thread.id }
    const [total, rows] = await Promise.all([
      prisma.chatMessage.count({ where }),
      prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take,
        select: {
          id: true,
          senderId: true,
          messageText: true,
          messageType: true,
          createdAt: true,
          sender: { select: { id: true, name: true, role: true } },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        threadId: thread.id,
        messages: rows.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender?.name || null,
          senderRole: m.sender?.role || null,
          message: m.messageText,
          messageType: m.messageType,
          createdAt: m.createdAt,
          isMine: m.senderId === auth.id,
        })),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Messages fetched',
      },
    }
  }

  async sendMessage(auth, userId, body) {
    assertAdmin(auth)
    await findBuyerUser(userId)

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { id: true, name: true, role: true },
    })

    const thread = await openOrGetThread(adminUser, {
      type: 'ADMIN_SUPPORT',
      peerUserId: userId,
    })

    const chatMessage = await persistTextMessage(adminUser, thread, body.message)

    emitToChat(thread.id, 'chat:message', {
      threadId: thread.id,
      chatMessage,
    })

    return {
      status: 201,
      body: {
        id: chatMessage.id,
        threadId: thread.id,
        message: 'Message sent',
      },
    }
  }
}

export default new AdminUserService()
