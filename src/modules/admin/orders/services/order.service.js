import prisma from '../../../../../lib/prisma.js'
import fs from 'node:fs'
import path from 'node:path'
import { httpError } from '../../../../shared/errors.js'
import { money } from '../../../../shared/money.js'
import { formatAddressLine } from '../../../../shared/address.js'
import { parsePagination, paginationMeta } from '../../../../shared/pagination.js'
import { companyDisplayName, partyName } from '../../../../shared/party.js'
import { absolutizeUrl } from '../../../../lib/requestUrl.js'
import { env } from '../../../../config/env.js'
import { UPLOAD_ROOT } from '../../../../shared/storage.js'
import { normalizeStatusFilter } from '../../../orders/status-rules.js'
import {
  factoryStatusLabel,
  normalizeFactoryStatusFilter,
} from '../../../orders/factory-status-rules.js'
import {
  mapProducts,
  mapBuyerContact,
  CURRENCY,
} from '../../../orders/mappers.js'
import {
  invoiceOrderInclude,
  renderInvoicePdf,
} from '../../../invoicing/generate.js'
import { ensureInvoice } from '../../../invoicing/pdf-store.js'
import {
  issueTaxInvoiceForOrder,
  mapTaxInvoice,
} from '../../../invoicing/tax-invoice.service.js'

function invoicePdfExists(pdfUrl) {
  if (!pdfUrl) return false
  const relative = String(pdfUrl).replace(/^https?:\/\/[^/]+/i, '')
  const marker = '/uploads/'
  const idx = relative.indexOf(marker)
  if (idx === -1) return false
  const disk = path.resolve(UPLOAD_ROOT, relative.slice(idx + marker.length))
  if (!disk.startsWith(path.resolve(UPLOAD_ROOT))) return false
  return fs.existsSync(disk)
}

const ADMIN_CANCEL_PREFIX = 'Cancelled by admin'

function assertAdmin(auth) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError('Only admins can manage orders', 403, 'Forbidden')
  }
  return auth
}

function normalizeTab(raw) {
  return String(raw || 'supplier').trim().toLowerCase() === 'factory'
    ? 'factory'
    : 'supplier'
}

const transporterUserSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  profile: { select: { companyName: true } },
}

function mapAdminShipment(shipment) {
  if (!shipment) return null

  const bid = shipment.auction?.bids?.[0]
  const transporterUser =
    bid?.transporter || shipment.vehicle?.transporter || null
  const vehicle = shipment.vehicle
  const displayName =
    companyDisplayName(transporterUser) || partyName(transporterUser) || null
  const vehicleLabel = vehicle
    ? [vehicle.vehicleType, vehicle.licensePlate].filter(Boolean).join(' · ')
    : null

  return {
    id: shipment.id,
    pickupAddressText: shipment.pickupAddressText,
    deliveryAddressText: shipment.deliveryAddressText,
    distanceKm: shipment.distanceKm ?? null,
    auction: shipment.auction
      ? {
          id: shipment.auction.id,
          auctionCode: shipment.auction.auctionCode,
          auctionStatus: shipment.auction.auctionStatus,
          expiresAt: shipment.auction.expiresAt,
        }
      : null,
    transporterId:
      transporterUser?.id ||
      bid?.transporterId ||
      vehicle?.transporterId ||
      null,
    transporterName: displayName,
    name: displayName,
    email: transporterUser?.email || null,
    phone: transporterUser?.phoneNumber || null,
    vehicle: vehicleLabel,
    initials: displayName
      ? displayName
          .split(/\s+/)
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : null,
  }
}

function normalizeCustomerType(raw) {
  const s = String(raw || 'all').trim().toLowerCase()
  if (s === 'company') return 'COMPANY'
  if (s === 'customer') return 'CUSTOMER'
  return null
}

function isFactoryOrder(order) {
  return (
    order?.orderSource === 'FACTORY_CONVERSION' ||
    String(order?.seller?.role || '').toUpperCase() === 'FACTORY'
  )
}

function isCancelledByAdmin(order) {
  return String(order?.cancellationReason || '')
    .toLowerCase()
    .startsWith(ADMIN_CANCEL_PREFIX.toLowerCase())
}

function supplierStatusLabel(orderStatus, order = null) {
  if (orderStatus === 'NEW') return 'New'
  if (orderStatus === 'PENDING') return 'Pending'
  if (orderStatus === 'PROCESSING') return 'Processing'
  if (['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(orderStatus)) return 'Assigned'
  if (['DELIVERED', 'COMPLETED'].includes(orderStatus)) return 'Completed'
  if (orderStatus === 'CANCELLED') {
    return isCancelledByAdmin(order) ? 'Cancel by Admin' : 'Cancel'
  }
  return orderStatus
}

function displayStatusLabel(order, tab = null) {
  const factory = tab === 'factory' || (tab == null && isFactoryOrder(order))
  if (factory) {
    if (order.orderStatus === 'CANCELLED' && isCancelledByAdmin(order)) {
      return 'Cancel by Admin'
    }
    return factoryStatusLabel(order.orderStatus)
  }
  return supplierStatusLabel(order.orderStatus, order)
}

function customerTypeLabel(role) {
  if (role === 'COMPANY') return 'Company'
  if (role === 'CUSTOMER') return 'Customer'
  if (role === 'SUPPLIER') return 'Supplier'
  return role || 'Customer'
}

function normalizeAdminSupplierTargetStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'new') return 'NEW'
  if (s === 'pending') return 'PENDING'
  if (s === 'processing') return 'PROCESSING'
  if (s === 'assigned') return 'ASSIGNED'
  if (s === 'completed') return 'COMPLETED'
  if (s === 'cancel' || s === 'cancelled') return 'CANCELLED'
  return null
}

function normalizeAdminFactoryTargetStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
  if (s === 'in production' || s === 'inproduction') return 'IN_PRODUCTION'
  if (s === 'produced') return 'PRODUCED'
  if (s === 'ready') return 'READY'
  if (s === 'assigned') return 'ASSIGNED'
  if (s === 'completed') return 'COMPLETED'
  if (s === 'cancel' || s === 'cancelled') return 'CANCELLED'
  const upper = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (
    ['IN_PRODUCTION', 'PRODUCED', 'READY', 'ASSIGNED', 'COMPLETED', 'CANCELLED'].includes(
      upper,
    )
  ) {
    return upper
  }
  return null
}

function resolveCommission(order) {
  if (order.commission?.commissionAmount != null) {
    return money(order.commission.commissionAmount)
  }
  const rate = Number(order.seller?.vatRate || 0)
  if (rate > 0) return money((Number(order.grandTotal) * rate) / 100)
  return money(0)
}

function mapAdminOrderCard(order, tab) {
  const items = (order.orderLineItems || []).reduce(
    (sum, li) => sum + Number(li.quantity || 0),
    0,
  )
  const row = {
    id: order.id,
    orderId: order.orderNumber,
    customerName:
      companyDisplayName(order.customer) || partyName(order.customer) || null,
    items,
    total: money(order.grandTotal),
    commission: resolveCommission(order),
    status: displayStatusLabel(order, tab),
    date: order.createdAt.toISOString().slice(0, 10),
  }
  // Factory orders are supplier→factory — no customerType filter/column
  if (tab !== 'factory') {
    row.customerType = customerTypeLabel(order.customer?.role)
  }
  return row
}

class AdminOrderService {
  buildWhere(query) {
    const tab = normalizeTab(query.tab)
    const search = String(query.search || '').trim()
    const and = []

    if (tab === 'factory') {
      and.push({
        OR: [
          { orderSource: 'FACTORY_CONVERSION' },
          { seller: { role: 'FACTORY' } },
        ],
      })
      const statusFilter = normalizeFactoryStatusFilter(query.status)
      if (statusFilter) and.push({ orderStatus: statusFilter })
    } else {
      and.push({
        seller: { role: 'SUPPLIER' },
        orderSource: { in: ['DIRECT_CART', 'QUOTE_CONVERSION'] },
        customer: { role: { in: ['CUSTOMER', 'COMPANY', 'SUPPLIER'] } },
      })
      const customerType = normalizeCustomerType(query.customerType)
      if (customerType) and.push({ customer: { role: customerType } })
      const statusFilter = normalizeStatusFilter(query.status)
      if (statusFilter) and.push({ orderStatus: statusFilter })
    }

    if (search) {
      and.push({
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { customer: { email: { contains: search, mode: 'insensitive' } } },
          {
            customer: {
              profile: { companyName: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      })
    }

    return { AND: and }
  }

  async list(auth, query) {
    assertAdmin(auth)
    const tab = normalizeTab(query.tab)
    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
    })
    const where = this.buildWhere(query)

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          orderSource: true,
          cancellationReason: true,
          grandTotal: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              role: true,
              profile: { select: { companyName: true } },
            },
          },
          seller: { select: { role: true, vatRate: true } },
          commission: { select: { commissionAmount: true } },
          orderLineItems: { select: { quantity: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    const filters = {
      tab,
      status: String(query.status || 'all').toLowerCase(),
      search: query.search || null,
    }
    if (tab === 'supplier') {
      filters.customerType = String(query.customerType || 'all').toLowerCase()
    }

    return {
      status: 200,
      body: {
        orders: rows.map((o) => mapAdminOrderCard(o, tab)),
        pagination: paginationMeta({ page, limit, total }),
        filters,
        message: 'Orders fetched',
      },
    }
  }

  async getById(auth, orderId, baseUrl) {
    assertAdmin(auth)
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true,
            profile: { select: { companyName: true } },
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true,
            vatRate: true,
            profile: { select: { companyName: true } },
          },
        },
        shippingAddress: true,
        billingAddress: true,
        project: { select: { id: true, projectName: true, location: true } },
        commission: {
          select: { commissionAmount: true, status: true, affiliateId: true },
        },
        invoices: {
          where: { audience: 'CUSTOMER' },
          take: 1,
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            pdfUrl: true,
            issueDate: true,
            audience: true,
          },
        },
        checkoutSession: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            paymentStatus: true,
          },
        },
        taxInvoice: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { status: true, note: true, createdAt: true },
        },
        orderLineItems: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                sku: true,
                weightKg: true,
                unitOfMeasure: true,
                specifications: true,
                warehouseLocation: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    parentCategory: {
                      select: {
                        id: true,
                        name: true,
                        parentCategory: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        shipment: {
          select: {
            id: true,
            pickupAddressText: true,
            deliveryAddressText: true,
            distanceKm: true,
            vehicle: {
              select: {
                licensePlate: true,
                vehicleType: true,
                transporterId: true,
                transporter: { select: transporterUserSelect },
              },
            },
            auction: {
              select: {
                id: true,
                auctionCode: true,
                auctionStatus: true,
                expiresAt: true,
                bids: {
                  where: { status: 'ACCEPTED' },
                  take: 1,
                  select: {
                    transporterId: true,
                    transporter: { select: transporterUserSelect },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!order) throw httpError('Order not found', 404, 'NotFound')

    // Fast path: reuse existing PDF. Generate only when missing (one-time cost).
    let invoiceRow = order.invoices?.[0] || null
    if (
      order.orderStatus !== 'NEW' &&
      (!invoiceRow?.pdfUrl || !invoicePdfExists(invoiceRow.pdfUrl))
    ) {
      try {
        const full = await prisma.order.findFirst({
          where: { id: order.id },
          include: {
            ...invoiceOrderInclude,
            invoices: { where: { audience: 'CUSTOMER' }, take: 1 },
          },
        })
        if (full?.sellerId) {
          const ensured = await ensureInvoice(full, 'CUSTOMER')
          if (ensured.pdfUrl && invoicePdfExists(ensured.pdfUrl)) {
            invoiceRow = ensured
          } else {
            const file = await renderInvoicePdf(
              full,
              ensured,
              { showShippingVat: true, totalMode: 'grand' },
              { sellerId: full.sellerId },
            )
            invoiceRow = {
              id: ensured.id,
              invoiceNumber: ensured.invoiceNumber,
              issueDate: ensured.issueDate,
              audience: 'CUSTOMER',
              pdfUrl: file.publicPath,
            }
          }
        }
      } catch (err) {
        console.error('[admin orders] invoice pdf:', err.message)
      }
    }

    const factory = isFactoryOrder(order)
    const products = mapProducts(order.orderLineItems)
    const invoiceMapped = invoiceRow
      ? {
          id: invoiceRow.id,
          invoiceNumber: invoiceRow.invoiceNumber,
          issueDate: invoiceRow.issueDate,
          pdfUrl: invoiceRow.pdfUrl
            ? absolutizeUrl(invoiceRow.pdfUrl, baseUrl || env.apiUrl)
            : null,
        }
      : null
    const details = {
      id: order.id,
      orderId: order.orderNumber,
      tab: factory ? 'factory' : 'supplier',
      status: displayStatusLabel(order),
      statusCode: order.orderStatus,
      date: order.createdAt.toISOString().slice(0, 10),
      createdAt: order.createdAt,
      currency: CURRENCY,
      totals: {
        subTotal: money(order.subTotal),
        vatAmount: money(order.vatAmount),
        shippingFee: money(order.shippingFee),
        discountAmount: money(order.discountAmount),
        grandTotal: money(order.grandTotal),
        commission: resolveCommission(order),
      },
      customer: mapBuyerContact(
        order,
        companyDisplayName(order.customer) || partyName(order.customer),
      ),
      seller: {
        id: order.seller?.id || null,
        name: companyDisplayName(order.seller) || partyName(order.seller) || null,
        email: order.seller?.email || null,
        phone: order.seller?.phoneNumber || null,
        role: order.seller?.role || null,
      },
      shippingAddress: formatAddressLine(order.shippingAddress),
      billingAddress: formatAddressLine(order.billingAddress),
      project: order.project,
      products,
      invoice: invoiceMapped,
      paymentStatus: order.checkoutSession?.paymentStatus || null,
      taxInvoice: mapTaxInvoice(order.taxInvoice),
      shipment: mapAdminShipment(order.shipment),
      statusHistory: order.statusHistory.map((h) => ({
        status: factory
          ? h.status === 'CANCELLED' && /cancelled by admin/i.test(h.note || '')
            ? 'Cancel by Admin'
            : factoryStatusLabel(h.status)
          : supplierStatusLabel(h.status, { cancellationReason: h.note }),
        statusCode: h.status,
        note: h.note,
        createdAt: h.createdAt,
      })),
      cancellationReason: order.cancellationReason || null,
      cancelledByAdmin: isCancelledByAdmin(order),
    }
    if (!factory) {
      details.customerType = customerTypeLabel(order.customer?.role)
    }

    return {
      status: 200,
      body: {
        order: details,
        message: 'Order details fetched',
      },
    }
  }

  async updateStatus(auth, orderId, body) {
    assertAdmin(auth)

    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        orderSource: true,
        cancellationReason: true,
        seller: { select: { role: true } },
      },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const factory = isFactoryOrder(order)
    const nextStatus = factory
      ? normalizeAdminFactoryTargetStatus(body.status)
      : normalizeAdminSupplierTargetStatus(body.status)

    if (!nextStatus) {
      throw httpError(
        factory
          ? 'Factory status must be in_production, produced, ready, assigned, completed, or cancel'
          : 'Supplier status must be new, pending, processing, assigned, completed, or cancel',
        400,
        'InvalidStatus',
      )
    }

    if (order.orderStatus === nextStatus) {
      return {
        status: 200,
        body: {
          id: order.id,
          orderId: order.orderNumber,
          status: displayStatusLabel(order),
          message: 'Order status unchanged',
        },
      }
    }

    const reason = String(body.reason || '').trim()
    const adminCancel = nextStatus === 'CANCELLED'
    const cancelReason = adminCancel
      ? reason
        ? `${ADMIN_CANCEL_PREFIX}: ${reason}`
        : ADMIN_CANCEL_PREFIX
      : null

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: nextStatus,
          ...(adminCancel ? { cancellationReason: cancelReason } : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          orderSource: true,
          cancellationReason: true,
          seller: { select: { role: true } },
        },
      })
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: nextStatus,
          note: adminCancel
            ? cancelReason
            : `Admin changed status to ${displayStatusLabel({ ...row, orderStatus: nextStatus })}`,
        },
      })
      return row
    })

    return {
      status: 200,
      body: {
        id: updated.id,
        orderId: updated.orderNumber,
        status: displayStatusLabel(updated),
        cancelledByAdmin: isCancelledByAdmin(updated),
        message: adminCancel ? 'Order cancelled by admin' : 'Order status updated',
      },
    }
  }

  async adminDelete(auth, orderId) {
    assertAdmin(auth)
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      select: { id: true, orderNumber: true },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    await prisma.$transaction(async (tx) => {
      await tx.returnRequest.deleteMany({ where: { orderId: order.id } })
      await tx.dispute.deleteMany({ where: { orderId: order.id } })
      await tx.commissionTransaction.deleteMany({ where: { orderId: order.id } })
      await tx.order.delete({ where: { id: order.id } })
    })

    return {
      status: 200,
      body: {
        id: order.id,
        orderId: order.orderNumber,
        message: 'Order deleted',
      },
    }
  }

  /** Issue, retry, or finalize the InvoiceXpress invoice for a paid order. */
  async issueTaxInvoice(auth, orderId) {
    assertAdmin(auth)
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      select: { id: true, orderNumber: true },
    })
    if (!order) throw httpError('Order not found', 404, 'NotFound')

    const row = await issueTaxInvoiceForOrder(order.id)
    return {
      status: 200,
      body: {
        orderId: order.orderNumber,
        taxInvoice: mapTaxInvoice(row),
        message:
          row.status === 'FINALIZED'
            ? 'Invoice issued and reported to the Tax Authority'
            : 'Draft invoice created in InvoiceXpress',
      },
    }
  }
}

export default new AdminOrderService()
