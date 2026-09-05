import { offerInstallmentsInclude } from './mappers.js'

export { offerInstallmentsInclude }

export function installmentsFromBody(installments) {
  return (installments || []).map((row, index) => ({
    installmentNumber: index + 1,
    amount: row.price,
    quantity: row.quantity,
  }))
}

/**
 * Shared QuoteOffer create payload. Contexts pass the relation keys
 * (`quoteRequestId` vs `chatThreadId` + `buyerId`).
 */
export function offerCreateData(body, {
  createdById,
  productId,
  productName,
  quoteRequestId,
  chatThreadId,
  buyerId,
}) {
  return {
    ...(quoteRequestId ? { quoteRequestId } : {}),
    ...(chatThreadId ? { chatThreadId } : {}),
    ...(buyerId ? { buyerId } : {}),
    createdById,
    productId,
    warehouseLocation: body.warehouseLocation.trim(),
    productName: String(productName).trim(),
    totalQuantity: body.totalQuantity,
    quantityUnit: body.quantityUnit || 'bags',
    projectName: (body.projectName || 'N/A').trim(),
    deliveryLocation: body.deliveryLocation.trim(),
    unloadingType: body.unloadingType.trim(),
    accessConditions: body.accessConditions.trim(),
    totalPrice: body.totalPrice,
    installmentMonths: body.installmentMonths,
    status: 'PENDING_RESPONSE',
    installments: {
      create: installmentsFromBody(body.installments),
    },
  }
}

export const offerCreateInclude = offerInstallmentsInclude
