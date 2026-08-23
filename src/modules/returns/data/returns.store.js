import { notFound, conflict, httpError } from '../../../shared/errors.js'

const PAINT_IMG =
  'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=200&q=80'
const BLOCK_IMG =
  'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=200&q=80'
const GLASS_IMG =
  'https://images.unsplash.com/photo-1545127398-14699f92334b?auto=format&fit=crop&w=200&q=80'
const BRICK_IMG = '/images/categories/red_bricks_real.png'
const EVIDENCE_IMG =
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=200&q=80'
const RETURN_PRODUCT_IMG =
  'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=200&q=80'

const clone = (value) => JSON.parse(JSON.stringify(value))

const SUPPLIER_STATUSES = [
  'pending',
  'under_review',
  'approved',
  'rejected',
  'item_received',
  'inspection_progress',
  'inspection_pass',
  'inspection_rejected',
]

const state = {
  orders: [
    {
      id: 'ord-101',
      orderNumber: 'ord-101',
      date: '4/1/2026',
      status: 'delivered',
      itemCount: 2,
      thumbnails: [PAINT_IMG, BLOCK_IMG],
    },
    {
      id: 'ord-102',
      orderNumber: 'ord-102',
      date: '3/28/2026',
      status: 'delivered',
      itemCount: 1,
      thumbnails: [BLOCK_IMG],
    },
  ],
  orderDetails: {
    'ord-101': {
      id: 'ord-101',
      orderNumber: 'ord-101',
      placedDate: '4/1/2026',
      status: 'delivered',
      items: [
        {
          id: 'li-1',
          title: 'Automatic Corner Paint Roller',
          quantity: 1,
          price: '€299.99',
          image: PAINT_IMG,
          returnId: 'ret-002',
        },
        {
          id: 'li-2',
          title: 'Precast Concrete Building Blocks',
          quantity: 1,
          price: '€299.99',
          image: BLOCK_IMG,
        },
      ],
    },
    'ord-102': {
      id: 'ord-102',
      orderNumber: 'ord-102',
      placedDate: '3/28/2026',
      status: 'delivered',
      items: [
        {
          id: 'li-3',
          title: 'Precast Concrete Building Blocks',
          quantity: 2,
          price: '€199.50',
          image: BLOCK_IMG,
        },
      ],
    },
  },
  buyerReturns: [
    {
      id: 'ret-001',
      displayId: 'ret-001',
      title: 'Tempered Glass Panels',
      reason: 'Damaged',
      status: 'pending',
      updatedAt: '4/8/2026',
      image: GLASS_IMG,
    },
    {
      id: 'ret-002',
      displayId: 'ret-002',
      title: 'Automatic Corner Paint Roller',
      reason: 'Damaged',
      status: 'under_review',
      updatedAt: '4/8/2026',
      image: PAINT_IMG,
    },
    {
      id: 'ret-003',
      displayId: 'ret-003',
      title: 'Premium Red Clay Bricks',
      reason: 'Damaged',
      status: 'pending',
      updatedAt: '4/8/2026',
      image: BRICK_IMG,
    },
  ],
  buyerReturnDetails: {
    'ret-001': {
      id: 'ret-001',
      displayId: 'ret-001',
      status: 'pending',
      submittedOn: '4/5/2026',
      reason: 'Damaged',
      description:
        'The top glass panel arrived with a visible crack along the edge, and the surface has multiple scratches that make it unsafe for installation.',
      evidence: [EVIDENCE_IMG],
      product: {
        title: 'Tempered Glass Panels',
        orderId: 'ord-101',
        image: GLASS_IMG,
      },
      timeline: [{ status: 'pending', date: '4/5/2026, PM', actor: 'BUYER' }],
    },
    'ret-002': {
      id: 'ret-002',
      displayId: 'ret-002',
      status: 'under_review',
      submittedOn: '4/3/2026',
      reason: 'Damaged',
      description:
        'Several bricks in the shipment were chipped and unusable for the exterior wall we are building.',
      evidence: [BRICK_IMG],
      product: {
        title: 'Automatic Corner Paint Roller',
        orderId: 'ord-101',
        image: PAINT_IMG,
      },
      timeline: [
        { status: 'under_review', date: '4/4/2026, PM', actor: 'SELLER' },
        { status: 'pending', date: '4/3/2026, PM', actor: 'BUYER' },
      ],
    },
  },
  supplierReturns: [
    {
      id: 'ret-2024-001',
      returnId: 'RET-2024-001',
      orderId: 'ORD-2024-001',
      customerName: 'Rahim Uddin',
      customerEmail: 'rahim@example.com',
      productName: 'Premium Cotton T-Shirt',
      reason: 'Damaged Product',
      requestDate: '1/20/2026',
      status: 'item_received',
    },
    {
      id: 'ret-2024-002',
      returnId: 'RET-2024-002',
      orderId: 'ORD-2024-002',
      customerName: 'Karim Hassan',
      customerEmail: 'karim@example.com',
      productName: 'Portland Cement',
      reason: 'Wrong Item',
      requestDate: '2/15/2026',
      status: 'inspection_pass',
    },
    {
      id: 'ret-2024-003',
      returnId: 'RET-2024-003',
      orderId: 'ORD-2024-003',
      customerName: 'Sultana Begum',
      customerEmail: 'sultana@example.com',
      productName: 'Wireless Earbuds',
      reason: 'Not as Described',
      requestDate: '3/20/2026',
      status: 'under_review',
    },
    {
      id: 'ret-2024-004',
      returnId: 'RET-2024-004',
      orderId: 'ORD-2024-004',
      customerName: 'Ahmed Khan',
      customerEmail: 'ahmed@example.com',
      productName: 'Steel Rebar Bundle',
      reason: 'Damaged Product',
      requestDate: '4/02/2026',
      status: 'inspection_progress',
    },
    {
      id: 'ret-2024-005',
      returnId: 'RET-2024-005',
      orderId: 'ORD-2024-005',
      customerName: 'Fatima Ali',
      customerEmail: 'fatima@example.com',
      productName: 'Clay Bricks',
      reason: 'Size Issue',
      requestDate: '4/10/2026',
      status: 'pending',
    },
    {
      id: 'ret-2024-006',
      returnId: 'RET-2024-006',
      orderId: 'ORD-2024-006',
      customerName: 'Nadia Rahman',
      customerEmail: 'nadia@example.com',
      productName: 'Roofing Sheets',
      reason: 'Quality Issue',
      requestDate: '4/18/2026',
      status: 'rejected',
    },
    {
      id: 'ret-2024-007',
      returnId: 'RET-2024-007',
      orderId: 'ORD-2024-007',
      customerName: 'Imran Chowdhury',
      customerEmail: 'imran@example.com',
      productName: 'PVC Piping',
      reason: 'Damaged Product',
      requestDate: '5/01/2026',
      status: 'approved',
    },
    {
      id: 'ret-2024-008',
      returnId: 'RET-2024-008',
      orderId: 'ORD-2024-008',
      customerName: 'Layla Ahmed',
      customerEmail: 'layla@example.com',
      productName: 'Fine Sand Bulk Load',
      reason: 'Wrong Item',
      requestDate: '5/08/2026',
      status: 'inspection_rejected',
    },
  ],
  supplierReturnDetails: {
    'ret-2024-001': {
      id: 'ret-2024-001',
      returnId: 'RET-2024-001',
      orderId: 'ORD-2024-001',
      receivedDate: '2024-06-01',
      status: 'item_received',
      reason: 'Damaged Product',
      description:
        'The cement arrived with visible tears near the collar and sleeve. One cement has a large stain that cannot be washed off.',
      refundAccountNumber: '123456789012',
      refundAmount: '€1,200',
      products: [
        {
          id: 'rp-1',
          name: 'Portland Cement',
          sku: 'TSH-COT-L-WHT',
          quantity: 1,
          price: '€1,200',
          image: RETURN_PRODUCT_IMG,
        },
      ],
      evidence: [
        EVIDENCE_IMG,
        'https://images.unsplash.com/photo-1545127398-14699f92334b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=800&q=80',
      ],
      customer: {
        id: 'CUST-001',
        name: 'Rahim Uddin',
        email: 'rahim@example.com',
        phone: '01712345678',
        address: '42, Mirpur Road, Dhaka 1216',
        avatarColor: '#3B82F6',
      },
      orderSummary: {
        orderId: 'ORD-2024-001',
        itemCount: 1,
        requestDate: '2024-06-01',
        totalValue: '€2,400',
      },
    },
  },
}

function displayDate(date = new Date()) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}

function supplierStats() {
  const rows = state.supplierReturns
  return {
    total: rows.length,
    pendingReview: rows.filter((row) => row.status === 'pending').length,
    approved: rows.filter((row) => row.status === 'approved').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
  }
}

function buyerDetailFromList(row) {
  return {
    id: row.id,
    displayId: row.displayId,
    status: row.status,
    submittedOn: row.updatedAt,
    reason: row.reason,
    description: '',
    evidence: row.image ? [row.image] : [],
    product: {
      title: row.title,
      orderId: '',
      image: row.image,
    },
    timeline: [{ status: row.status, date: row.updatedAt, actor: 'BUYER' }],
  }
}

function supplierDetailFromList(row) {
  const template = state.supplierReturnDetails['ret-2024-001']
  return {
    id: row.id,
    returnId: row.returnId,
    orderId: row.orderId,
    receivedDate: row.requestDate,
    status: row.status,
    reason: row.reason,
    description: template.description,
    refundAccountNumber: template.refundAccountNumber,
    refundAmount: template.refundAmount,
    products: [
      {
        id: `rp-${row.id}`,
        name: row.productName,
        sku: 'SKU-001',
        quantity: 1,
        price: template.refundAmount,
        image: RETURN_PRODUCT_IMG,
      },
    ],
    evidence: clone(template.evidence),
    customer: {
      ...template.customer,
      name: row.customerName,
      email: row.customerEmail,
    },
    orderSummary: {
      orderId: row.orderId,
      itemCount: 1,
      requestDate: row.requestDate,
      totalValue: template.orderSummary.totalValue,
    },
  }
}

export function listBuyerOrders() {
  return clone(state.orders)
}

export function getBuyerOrder(orderId) {
  const order = state.orderDetails[orderId]
  if (!order) throw notFound('Order not found')
  return clone(order)
}

export function listBuyerReturns() {
  return clone(state.buyerReturns)
}

export function getBuyerReturn(returnId) {
  const detail = state.buyerReturnDetails[returnId]
  if (detail) return clone(detail)
  const row = state.buyerReturns.find((item) => item.id === returnId)
  if (!row) throw notFound('Return request not found')
  return buyerDetailFromList(row)
}

export function createBuyerReturn(auth, body) {
  const order = state.orderDetails[body.orderId]
  if (!order) throw notFound('Order not found')

  const item = order.items.find((row) => row.id === body.itemId)
  if (!item) throw notFound('Order item not found')
  if (item.returnId) {
    throw conflict('A return request already exists for this item')
  }

  const next = state.buyerReturns.length + 1
  const id = `ret-${String(next).padStart(3, '0')}`
  const updatedAt = displayDate()

  const listRow = {
    id,
    displayId: id,
    title: item.title,
    reason: body.reason,
    status: 'pending',
    updatedAt,
    image: item.image,
  }

  const detail = {
    id,
    displayId: id,
    status: 'pending',
    submittedOn: updatedAt,
    reason: body.reason,
    description: body.description,
    evidence: body.evidence?.length ? clone(body.evidence) : [],
    product: {
      title: item.title,
      orderId: order.orderNumber,
      image: item.image,
    },
    timeline: [{ status: 'pending', date: `${updatedAt}, PM`, actor: 'BUYER' }],
  }

  item.returnId = id
  state.buyerReturns.unshift(listRow)
  state.buyerReturnDetails[id] = detail

  const supplierRow = {
    id,
    returnId: id.toUpperCase(),
    orderId: order.orderNumber,
    customerName: auth?.name || 'Buyer',
    customerEmail: auth?.email || '',
    productName: item.title,
    reason: body.reason,
    requestDate: updatedAt,
    status: 'pending',
  }
  state.supplierReturns.unshift(supplierRow)
  state.supplierReturnDetails[id] = {
    ...supplierDetailFromList(supplierRow),
    description: body.description,
    refundAccountNumber: body.refundAccount || '',
    refundAmount: item.price,
    products: [
      {
        id: item.id,
        name: item.title,
        sku: '',
        quantity: item.quantity,
        price: item.price,
        image: item.image,
      },
    ],
    evidence: body.evidence?.length ? clone(body.evidence) : [],
    orderSummary: {
      orderId: order.orderNumber,
      itemCount: order.itemCount || order.items.length,
      requestDate: updatedAt,
      totalValue: item.price,
    },
  }

  return clone(detail)
}

export function listSupplierReturns() {
  return {
    stats: supplierStats(),
    returns: clone(state.supplierReturns),
  }
}

export function getSupplierReturn(returnId) {
  const detail = state.supplierReturnDetails[returnId]
  if (detail) {
    const row = state.supplierReturns.find((item) => item.id === returnId)
    return clone({ ...detail, status: row?.status || detail.status })
  }
  const row = state.supplierReturns.find((item) => item.id === returnId)
  if (!row) throw notFound('Return request not found')
  return supplierDetailFromList(row)
}

export function updateSupplierReturnStatus(returnId, status) {
  if (!SUPPLIER_STATUSES.includes(status)) {
    throw httpError('Invalid return status', 400, 'ValidationError')
  }

  const row = state.supplierReturns.find((item) => item.id === returnId)
  if (!row) throw notFound('Return request not found')

  row.status = status
  if (state.supplierReturnDetails[returnId]) {
    state.supplierReturnDetails[returnId].status = status
  }

  const buyerRow = state.buyerReturns.find((item) => item.id === returnId)
  if (buyerRow) buyerRow.status = status
  if (state.buyerReturnDetails[returnId]) {
    state.buyerReturnDetails[returnId].status = status
  }

  return clone(row)
}

export { SUPPLIER_STATUSES }
