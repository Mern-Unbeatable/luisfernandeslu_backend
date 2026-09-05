import { notFound, httpError } from '../../../shared/errors.js'

const GRAVEL_IMG =
  'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=400&q=80'
const ROOF_IMG =
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80'
const MARBLE_IMG =
  'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=200&q=80'
const GRANITE_IMG =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=200&q=80'
const EVIDENCE_1 =
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=300&q=80'
const EVIDENCE_2 =
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=300&q=80'

const clone = (value) => JSON.parse(JSON.stringify(value))

export const DISPUTE_STATUSES = ['pending', 'under_review', 'resolved']

const DEFAULT_DESCRIPTION =
  'The materials delivered show significant structural damage. The marble slabs have visible cracks, and the wooden beams are not cut to the specified dimensions.'

function chatPayload(id) {
  return { type: 'DISPUTE', disputeId: id }
}

function seedRow(partial) {
  return {
    image: MARBLE_IMG,
    title: partial.issue,
    highlight: partial.issue,
    description: DEFAULT_DESCRIPTION,
    seller: partial.supplier,
    orderDate: partial.registered,
    messageCount: 0,
    evidence: [EVIDENCE_1, EVIDENCE_2],
    items: [
      {
        id: `${partial.id}-item`,
        productName: 'Premium Marble Slabs',
        orderId: partial.orderId,
        reason: partial.issue,
        image: MARBLE_IMG,
      },
    ],
    createdAt: `${partial.registered}, 2:10 PM`,
    messages: partial.messages || [],
    ...partial,
  }
}

const state = {
  disputes: [
    seedRow({
      id: 'disp-001',
      orderId: 'ORD-5521',
      orderDate: '3/15/2024',
      status: 'under_review',
      title: 'Crushed Grey Stone Chips ba Grey Granite Gravel',
      highlight: 'Premium Grey Granite Gravel for Landscaping',
      description:
        'Premium grey granite gravel is a versatile and durable material ideal for landscaping, driveways, and decorative garden features.',
      image: GRAVEL_IMG,
      seller: 'Tech Haven',
      customer: 'Alex Johnson',
      supplier: 'Tech Haven',
      issue: 'Damaged Item',
      registered: '2026-05-01',
      messageCount: 4,
      items: [
        {
          id: 'di1',
          productName: 'Premium Marble Slabs',
          orderId: 'ORD-5521',
          reason: 'Damaged Item',
          image: MARBLE_IMG,
        },
        {
          id: 'di2',
          productName: 'Polished Granite Blocks',
          orderId: 'ORD-5521',
          reason: 'Damaged Item',
          image: GRANITE_IMG,
        },
      ],
      createdAt: '3/15/2024, 2:10 PM',
      messages: [
        {
          id: 'msg-001',
          senderId: 'buyer-001',
          author: 'Alex Johnson',
          roleLabel: 'Buyer',
          role: 'buyer',
          align: 'right',
          at: '04:30 PM',
          text: 'received the package today, but the headphones sound like something is loose inside.',
        },
        {
          id: 'msg-002',
          senderId: 'supp-001',
          author: 'Tech Haven',
          roleLabel: 'Seller',
          role: 'supplier',
          align: 'left',
          at: '09:45 PM',
          text: 'We are sorry to hear that. Could you please provide a video showing the rattling sound?',
        },
        {
          id: 'msg-003',
          senderId: 'buyer-001',
          author: 'Alex Johnson',
          roleLabel: 'Buyer',
          role: 'buyer',
          align: 'right',
          at: '03:10 PM',
          text: "I've uploaded photos of the box which was slightly crushed. I'll try to record the sound.",
        },
        {
          id: 'msg-004',
          senderId: 'admin-001',
          author: 'Tech Haven',
          roleLabel: 'Admin',
          role: 'admin',
          align: 'left',
          at: '09:45 PM',
          text: 'We are sorry to hear that. Could you please provide a video showing the rattling sound?',
        },
      ],
    }),
    seedRow({
      id: 'disp-002',
      orderId: 'ORD-5521',
      orderDate: '3/15/2024',
      status: 'pending',
      title: 'Crushed Grey Stone Chips ba Grey Granite Gravel',
      highlight: 'Premium Grey Granite Gravel for Landscaping',
      description:
        'Premium grey granite gravel is a versatile and durable material ideal for landscaping, driveways, and decorative garden features.',
      image: ROOF_IMG,
      seller: 'Tech Haven',
      customer: 'Leslie Alexander',
      supplier: 'Kathryn Murphy',
      issue: 'Late delivery - 5 days overdue',
      registered: '2026-04-30',
      messageCount: 1,
      createdAt: '3/15/2024, 2:10 PM',
    }),
    seedRow({
      id: 'disp-003',
      orderId: 'ORD-003',
      customer: 'Jerome Bell',
      supplier: 'Eleanor Pena',
      issue: 'Damaged goods received',
      status: 'resolved',
      registered: '2026-04-29',
    }),
    seedRow({
      id: 'disp-004',
      orderId: 'ORD-004',
      customer: 'Eleanor Pena',
      supplier: 'Floyd Miles',
      issue: 'Missing items in order',
      status: 'pending',
      registered: '2026-02-01',
    }),
    seedRow({
      id: 'disp-005',
      orderId: 'ORD-005',
      customer: 'Jacob Jones',
      supplier: 'Kristin Watson',
      issue: 'Quality does not match listing',
      status: 'under_review',
      registered: '2026-02-08',
    }),
    seedRow({
      id: 'disp-006',
      orderId: 'ORD-006',
      customer: 'Courtney Henry',
      supplier: 'Devon Lane',
      issue: 'Invoice amount mismatch',
      status: 'resolved',
      registered: '2026-02-14',
    }),
    seedRow({
      id: 'disp-007',
      orderId: 'ORD-007',
      customer: 'Brooklyn Simmons',
      supplier: 'Theresa Webb',
      issue: 'Packaging severely damaged',
      status: 'pending',
      registered: '2026-02-20',
    }),
  ],
}

function findDispute(id) {
  return state.disputes.find((row) => row.id === id)
}

function buyerStats() {
  const rows = state.disputes
  return {
    total: rows.length,
    pendingAction: rows.filter((row) => row.status === 'pending').length,
    underReview: rows.filter((row) => row.status === 'under_review').length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
  }
}

function toBuyerListItem(row) {
  return {
    id: row.id,
    orderId: row.orderId,
    orderDate: row.orderDate || row.registered,
    status: row.status,
    title: row.title,
    highlight: row.highlight,
    description: row.description,
    image: row.image,
    seller: row.seller || row.supplier,
    messageCount: row.messageCount || 0,
  }
}

function toStaffListItem(row) {
  return {
    id: row.id,
    orderId: row.orderId,
    customer: row.customer,
    supplier: row.supplier,
    issue: row.issue,
    status: row.status,
    registered: row.registered,
  }
}

function toDetail(row) {
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    createdAt: row.createdAt,
    description: row.description,
    items: clone(row.items),
    evidence: clone(row.evidence),
    messages: clone(row.messages || []),
    chat: chatPayload(row.id),
  }
}

export function createBuyerDispute(auth, body, order) {
  const seq = String(state.disputes.length + 1).padStart(3, '0')
  const id = `disp-${seq}`
  const today = new Date()
  const registered = today.toISOString().slice(0, 10)
  const orderDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`
  const orderNumber = order.orderNumber
  const items = (order.items || []).map((item, index) => ({
    id: item.id || `${id}-item-${index + 1}`,
    productName: item.productName,
    orderId: orderNumber,
    reason: body.issueType,
    image: item.image,
  }))
  const first = items[0] || {}

  const row = {
    id,
    orderId: orderNumber,
    orderDate,
    status: 'pending',
    title: first.productName,
    highlight: first.productName,
    description: body.description,
    image: first.image,
    seller: order.seller,
    customer: auth?.name || 'Buyer',
    supplier: order.seller,
    issue: body.issueType,
    registered,
    messageCount: 0,
    evidence: body.evidence?.length ? clone(body.evidence) : [],
    items,
    createdAt: `${orderDate}, PM`,
    buyerId: auth?.id || null,
  }

  state.disputes.unshift(row)
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    createdAt: row.createdAt,
    description: row.description,
    evidence: clone(row.evidence),
    chat: chatPayload(row.id),
  }
}

export function getDispute(disputeId) {
  const row = findDispute(disputeId)
  if (!row) throw notFound('Dispute not found')
  return toDetail(row)
}

export function listBuyerDisputes() {
  return {
    stats: buyerStats(),
    disputes: state.disputes.map(toBuyerListItem),
  }
}

export function listStaffDisputes() {
  return { disputes: state.disputes.map(toStaffListItem) }
}

export function updateDisputeStatus(disputeId, status) {
  if (!DISPUTE_STATUSES.includes(status)) {
    throw httpError('Invalid dispute status', 400, 'ValidationError')
  }
  const row = findDispute(disputeId)
  if (!row) throw notFound('Dispute not found')
  row.status = status
  return toStaffListItem(row)
}

function formatMessageTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function addDisputeMessage(disputeId, { senderId, author, role, text, attachments = [] }) {
  const row = findDispute(disputeId)
  if (!row) throw notFound('Dispute not found')
  if (!row.messages) row.messages = []

  const isBuyerRole = role === 'customer' || role === 'company' || role === 'buyer'
  const isSupplierRole = role === 'supplier' || role === 'seller'
  const isStaffRole = role === 'admin'

  let roleLabel = 'Buyer'
  if (isSupplierRole) roleLabel = 'Seller'
  else if (isStaffRole) roleLabel = 'Admin'

  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    disputeId,
    senderId: senderId || 'unknown',
    author: author || (isStaffRole ? 'Admin' : isSupplierRole ? (row.supplier || 'Seller') : (row.customer || 'Buyer')),
    roleLabel,
    role: isBuyerRole ? 'buyer' : isSupplierRole ? 'supplier' : 'admin',
    align: isBuyerRole ? 'right' : 'left',
    at: formatMessageTime(),
    text: String(text || '').trim(),
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date().toISOString(),
  }

  row.messages.push(message)
  row.messageCount = row.messages.length
  return message
}

export function getDisputeMessages(disputeId) {
  const row = findDispute(disputeId)
  if (!row) throw notFound('Dispute not found')
  return clone(row.messages || [])
}

