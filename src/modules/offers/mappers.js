import { absolutizeUrl } from '../../lib/requestUrl.js'
import { money, formatMoney } from '../../shared/money.js'
import { ordinal } from '../../shared/ordinal.js'
import { partyName } from '../../shared/party.js'

export const offerInstallmentsInclude = {
  installments: { orderBy: { installmentNumber: 'asc' } },
}

export const messageInclude = {
  sender: {
    select: {
      id: true,
      name: true,
      image: true,
      profile: { select: { companyName: true } },
    },
  },
  offer: {
    include: offerInstallmentsInclude,
  },
}

const STATUS_LABEL = {
  PENDING_RESPONSE: 'Pending Response',
  NEGOTIATING: 'Negotiation requested',
  ACCEPTED: 'Accepted',
  PAID: 'Paid',
}

export function mapOfferCard(offer) {
  const unit = offer.quantityUnit || 'bags'
  const installments = (offer.installments || []).map((row) => ({
    installmentNumber: row.installmentNumber,
    amount: money(row.amount),
    quantity: row.quantity,
    label: `${ordinal(row.installmentNumber)} Installment`,
    amountLabel: formatMoney(row.amount),
    quantityLabel: `${row.quantity} ${unit}`,
  }))

  const first = installments[0]
  const remaining = first
    ? Math.max(0, money(offer.totalPrice) - first.amount)
    : money(offer.totalPrice)
  const months = offer.installmentMonths || 0
  const monthly = months > 0 ? money(remaining / months) : null

  const pricing = [
    { label: 'Total Price', value: formatMoney(offer.totalPrice), icon: 'dollar' },
    { label: 'Installment', value: `${offer.installmentMonths} months`, icon: 'calendar' },
  ]
  for (const row of installments) {
    pricing.push({ label: row.label, value: row.amountLabel, icon: 'dollar' })
    pricing.push({ label: 'Quantity', value: row.quantityLabel })
  }

  return {
    id: offer.id,
    title: 'Offer Card',
    status: offer.status,
    statusLabel: STATUS_LABEL[offer.status] || offer.status,
    warehouseLocation: offer.warehouseLocation,
    product: offer.productName,
    productId: offer.productId,
    quantity: `${offer.totalQuantity} ${unit}`,
    totalQuantity: offer.totalQuantity,
    quantityUnit: unit,
    projectName: offer.projectName,
    address: offer.deliveryLocation,
    deliveryLocation: offer.deliveryLocation,
    unloadingType: offer.unloadingType,
    accessConditions: offer.accessConditions,
    totalPrice: money(offer.totalPrice),
    installmentMonths: offer.installmentMonths,
    installments,
    pricing,
    summary: {
      firstInstallment: first ? first.amountLabel : null,
      remainingBalance: formatMoney(remaining),
      note:
        monthly != null && months > 0
          ? `Pay ${formatMoney(monthly)}/month for ${months} months`
          : null,
    },
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  }
}

export function mapMessage(msg, viewerId, baseUrl) {
  const isMine = viewerId ? msg.senderId === viewerId : null
  return {
    id: msg.id,
    type: String(msg.messageType || 'TEXT').toLowerCase(),
    messageType: msg.messageType,
    text: msg.messageText,
    attachmentUrl: msg.attachmentUrl
      ? absolutizeUrl(msg.attachmentUrl, baseUrl)
      : null,
    sender: isMine == null ? undefined : isMine ? 'me' : 'them',
    senderId: msg.senderId,
    senderName: partyName(msg.sender),
    senderImage: msg.sender?.image || null,
    offer: msg.offer ? mapOfferCard(msg.offer) : null,
    createdAt: msg.createdAt,
    time: new Date(msg.createdAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }),
  }
}
