/**
 * Factory product CSV — category/sub/type as text names (no inventory quantity).
 */
import {
  parseCsv,
  toCsv,
  decodeCsvBuffer,
} from '../../products/services/product-csv.js'

export { parseCsv, decodeCsvBuffer }

export const FACTORY_CSV_HEADERS = [
  'sku',
  'title',
  'warehouseLocation',
  'category',
  'subCategory',
  'productType',
  'basePrice',
  'weightKg',
  'description',
  'feature',
  'additionalInfo',
  'specifications',
  'bannerImageUrl',
  'imageUrls',
]

export const FACTORY_CSV_DEMO_ROWS = [
  {
    sku: 'FAC-CEM-001',
    title: 'Portland Cement Concrete',
    warehouseLocation: 'Factory Warehouse A',
    category: 'Cimentos, Argamassas & Betões',
    subCategory: 'Cimentos',
    productType: 'Cimento Portland Comum (CEM I)',
    basePrice: '570.00',
    weightKg: '50',
    description: 'High quality factory cement for construction.',
    feature: 'High Strength;Smooth Workability',
    additionalInfo: 'Store in dry conditions.',
    specifications: 'Type: CEM I | Weight: 50kg',
    bannerImageUrl: 'https://example.com/images/cement-banner.jpg',
    imageUrls: 'https://example.com/images/cement-1.jpg',
  },
]

export function buildFactoryCsvTemplate() {
  return toCsv(FACTORY_CSV_HEADERS, FACTORY_CSV_DEMO_ROWS)
}

export default {
  parseCsv,
  decodeCsvBuffer,
  buildFactoryCsvTemplate,
  FACTORY_CSV_HEADERS,
}
