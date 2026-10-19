import fs from 'node:fs'
import path from 'node:path'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError } from '../../../shared/errors.js'
import {
  parsePagination,
  paginationMeta,
} from '../../../shared/pagination.js'
import { UPLOAD_ROOT } from '../../../shared/storage.js'
import { resolveTransporter } from '../transporter.js'
import {
  CANCELABLE,
  mapBuyerOrderDetail,
  mapBuyerOrderListItem,
  mapBuyerInvoice,
  uiStatus,
} from '../buyer-order.mapper.js'

const listProductSelect = {
  id: true,
  title: true,
  shortDescription: true,
  longDescription: true,
  media: { orderBy: { sortOrder: 'asc' }, take: 3 },
}

const detailProductSelect = {
  id: true,
  title: true,
  sku: true,
  weightKg: true,
  unitOfMeasure: true,
  shortDescription: true,
  longDescription: true,
  media: { orderBy: { sortOrder: 'asc' }, take: 3 },
}

function assertBuyer(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  const role = String(auth.role || '').toLowerCase()
  if (role !== 'customer' && role !== 'company') {
    throw httpError('Only buyers can manage orders', 403, 'Forbidden')
  }
  return auth.id
}

function buyerWhere(customerId) {
  return { customerId }
}

function orderRefWhere(customerId, orderRef) {
  return {
    customerId,
    OR: [{ id: orderRef }, { orderNumber: orderRef }],
  }
}

function statusFilter(raw) {
  if (!raw || raw === 'all') return null
  const s = String(raw).trim().toLowerCase()
  if (s === 'processing') {
    return {
      in: [
        'NEW',
        'PENDING',
        'PROCESSING',
        'IN_PRODUCTION',
        'PRODUCED',
        'READY',
      ],
    }
  }
  if (s === 'shipped') {
    return { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
  }
  if (s === 'delivered') return { in: ['DELIVERED', 'COMPLETED'] }
  if (s === 'cancelled' || s === 'cancel') return 'CANCELLED'
  const upper = String(raw).trim().toUpperCase()
  return upper || null
}

function resolvePdfDiskPath(pdfUrl) {
  const cleaned = String(pdfUrl || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/uploads\/?/i, '')
  if (!cleaned || cleaned.includes('..')) return null
  return path.join(UPLOAD_ROOT, cleaned)
}

class BuyerOrderService {
  async list(auth, query, baseUrl) {
    const customerId = assertBuyer(auth)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })
    const where = buyerWhere(customerId)
    const status = statusFilter(query.status)
    if (status) where.orderStatus = status

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          createdAt: true,
          orderLineItems: {
            take: 1,
            orderBy: { id: 'asc' },
            select: {
              product: { select: listProductSelect },
            },
          },
          invoices: {
            where: { audience: 'CUSTOMER' },
            take: 1,
            select: { id: true, pdfUrl: true },
          },
        },
      }),
    ])

    return {
      status: 200,
      body: {
        orders: orders.map((o) => mapBuyerOrderListItem(o, baseUrl)),
        pagination: paginationMeta({ page, limit, total }),
        message: 'Orders fetched',
      },
    }
  }

  async getById(auth, orderRef, baseUrl) {
    const customerId = assertBuyer(auth)
    const order = await this.#loadDetail(customerId, orderRef)
    const transporter = await resolveTransporter(order, {
      includeVehicle: true,
    })

    return {
      status: 200,
      body: {
        order: mapBuyerOrderDetail(order, baseUrl, transporter),
        message: 'Order details fetched',
      },
    }
  }

  async track(auth, orderRef, baseUrl) {
    const customerId = assertBuyer(auth)
    const order = await this.#loadDetail(customerId, orderRef)
    const transporter = await resolveTransporter(order, {
      includeVehicle: true,
    })
    const detail = mapBuyerOrderDetail(order, baseUrl, transporter)

    return {
      status: 200,
      body: {
        order: {
          id: detail.id,
          orderNumber: detail.orderNumber,
          status: detail.status,
          orderStatus: detail.orderStatus,
          driver: detail.driver,
          timeline: detail.timeline,
          deliveryOtp: detail.deliveryOtp,
          shippingAddress: detail.shippingAddress,
        },
        message: 'Order tracking fetched',
      },
    }
  }

  async cancel(auth, orderRef, body) {
    const customerId = assertBuyer(auth)
    const reason = String(body?.reason || '').trim()
    if (reason.length < 3) {
      throw httpError(
        'Cancellation reason is required',
        400,
        'ValidationError',
      )
    }

    const order = await prisma.order.findFirst({
      where: orderRefWhere(customerId, orderRef),
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        cancellationReason: true,
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    if (!CANCELABLE.has(order.orderStatus)) {
      throw httpError(
        'Order cannot be cancelled in current status',
        400,
        'InvalidTransition',
        { current: order.orderStatus },
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'CANCELLED',
          cancellationReason: reason,
        },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          cancellationReason: true,
          updatedAt: true,
        },
      })
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'CANCELLED',
          note: reason,
        },
      })
      return row
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: uiStatus(updated.orderStatus),
        orderStatus: updated.orderStatus,
        cancellationReason: updated.cancellationReason,
        message: 'Order cancelled',
      },
    }
  }

  async getInvoice(auth, orderRef, baseUrl) {
    const customerId = assertBuyer(auth)
    const order = await prisma.order.findFirst({
      where: orderRefWhere(customerId, orderRef),
      select: {
        id: true,
        orderNumber: true,
        invoices: {
          where: { audience: 'CUSTOMER' },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            pdfUrl: true,
          },
        },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const invoice = order.invoices?.[0]
    if (!invoice?.pdfUrl) {
      throw httpError(
        'Invoice is not available for this order yet',
        404,
        'InvoiceNotFound',
      )
    }

    return {
      status: 200,
      body: {
        invoice: mapBuyerInvoice(invoice, baseUrl),
        message: 'Invoice fetched',
      },
    }
  }

  async downloadInvoice(auth, orderRef, baseUrl) {
    const customerId = assertBuyer(auth)
    const order = await prisma.order.findFirst({
      where: orderRefWhere(customerId, orderRef),
      select: {
        id: true,
        orderNumber: true,
        invoices: {
          where: { audience: 'CUSTOMER' },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            pdfUrl: true,
          },
        },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const invoice = order.invoices?.[0]
    if (!invoice?.pdfUrl) {
      throw httpError(
        'Invoice is not available for this order yet',
        404,
        'InvoiceNotFound',
      )
    }

    const diskPath = resolvePdfDiskPath(invoice.pdfUrl)
    if (!diskPath || !fs.existsSync(diskPath)) {
      throw httpError(
        'Invoice file not found',
        404,
        'InvoiceFileMissing',
      )
    }

    const buffer = fs.readFileSync(diskPath)
    const filename = `${invoice.invoiceNumber || order.orderNumber}.pdf`.replace(
      /[^\w.-]/g,
      '_',
    )

    return {
      status: 200,
      file: {
        buffer,
        filename,
        contentType: 'application/pdf',
      },
      body: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          pdfUrl: absolutizeUrl(invoice.pdfUrl, baseUrl),
          issueDate: invoice.issueDate,
        },
        message: 'Invoice ready',
      },
    }
  }

  async #loadDetail(customerId, orderRef) {
    const order = await prisma.order.findFirst({
      where: orderRefWhere(customerId, orderRef),
      include: {
        customer: {
          select: { id: true, name: true, phoneNumber: true },
        },
        checkoutSession: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        shippingAddress: true,
        orderLineItems: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPriceLocked: true,
            totalPriceLocked: true,
            product: { select: detailProductSelect },
          },
        },
        invoices: {
          where: { audience: 'CUSTOMER' },
          take: 1,
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            pdfUrl: true,
          },
        },
        taxInvoice: {
          select: { status: true, sequenceNumber: true, atcud: true, permalink: true, finalizedAt: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { status: true, note: true, createdAt: true },
        },
        shipment: {
          select: {
            id: true,
            tripStartedAt: true,
            vehicle: {
              select: {
                licensePlate: true,
                transporterId: true,
                transporter: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phoneNumber: true,
                  },
                },
              },
            },
            trackingEvents: {
              orderBy: { timestamp: 'asc' },
              select: {
                id: true,
                statusText: true,
                timestamp: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    })

    if (!order) throw httpError('Order not found', 404, 'NotFound')
    return order
  }
}

export default new BuyerOrderService()
