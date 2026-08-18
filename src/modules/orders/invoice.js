import { downloadSupplierOrderInvoice } from '../invoicing/generate.js'

export { invoiceOrderInclude } from '../invoicing/generate.js'

/**
 * Order-detail "Download invoice". Callers keep their customerName / total
 * functions so PDF math does not silently change.
 */
export async function downloadSupplierInvoice({
  sellerId,
  where,
  baseUrl,
  customerName,
  total,
  includeChatPlan = false,
}) {
  return downloadSupplierOrderInvoice({
    sellerId,
    where,
    baseUrl,
    payloadOptions: {
      includeInstallments: includeChatPlan,
      customerName,
      total,
    },
  })
}
