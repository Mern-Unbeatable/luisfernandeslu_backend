/**
 * Minimal CSV parse/serialize (RFC4180-ish) — no extra dependency.
 */

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let i = 0
  let inQuotes = false
  const input = String(text || '').replace(/^\uFEFF/, '')

  while (i < input.length) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((c) => String(c).trim() !== '')) rows.push(row)
      row = []
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  row.push(field)
  if (row.some((c) => String(c).trim() !== '')) rows.push(row)

  if (!rows.length) return { headers: [], records: [] }

  const headers = rows[0].map((h) => String(h).trim())
  const records = rows.slice(1).map((cols, index) => {
    const obj = { __row: index + 2 }
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] != null ? String(cols[idx]).trim() : ''
    })
    return obj
  })

  return { headers, records }
}

export function escapeCsvField(value) {
  const s = value == null ? '' : String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','))
  }
  return `${lines.join('\n')}\n`
}

/**
 * Product CSV columns — category / subCategory / productType are display names (text),
 * not UUIDs. Backend resolves them against the catalog.
 */
export const PRODUCT_CSV_HEADERS = [
  'sku',
  'title',
  'warehouseLocation',
  'category',
  'subCategory',
  'productType',
  'quantity',
  'basePrice',
  'b2bDiscount',
  'minB2bQuantity',
  'weightKg',
  'factoryName',
  'description',
  'feature',
  'additionalInfo',
  'specifications',
  'bulkEnabled',
  'bulkOptions',
  'bannerImageUrl',
  'imageUrls',
]

export const PRODUCT_CSV_DEMO_ROWS = [
  {
    sku: 'CEM-I-001',
    title: 'Portland Cement Quick Set',
    warehouseLocation: 'Main Warehouse',
    category: 'Cimentos, Argamassas & Betões',
    subCategory: 'Cimentos',
    productType: 'Cimento Portland Comum (CEM I)',
    quantity: '10',
    basePrice: '115',
    b2bDiscount: '10',
    minB2bQuantity: '50',
    weightKg: '50',
    factoryName: 'Cimpor',
    description: 'High-strength building cement suitable for construction.',
    feature: 'High Strength;Smooth Workability',
    additionalInfo: 'Store in dry conditions.',
    specifications: 'Type: CEM I | Weight: 50kg',
    bulkEnabled: 'false',
    bulkOptions: '',
    bannerImageUrl: 'https://example.com/images/cement-banner.jpg',
    imageUrls:
      'https://example.com/images/cement-1.jpg;https://example.com/images/cement-2.jpg',
  },
  {
    sku: 'CEM-I-002',
    title: 'Portland Cement Standard',
    warehouseLocation: 'Main Warehouse',
    category: 'Cimentos, Argamassas & Betões',
    subCategory: 'Cimentos',
    productType: 'Cimento Portland Composto (CEM II)',
    quantity: '20',
    basePrice: '120',
    b2bDiscount: '0',
    minB2bQuantity: '',
    weightKg: '50',
    factoryName: 'Cimpor',
    description: 'Reliable cement for everyday construction needs.',
    feature: 'Durable;Consistent Quality',
    additionalInfo: '',
    specifications: 'Type: CEM II',
    bulkEnabled: 'true',
    bulkOptions:
      '[{"minQuantity":1,"maxQuantity":20,"price":18.22},{"minQuantity":30,"maxQuantity":40,"price":32.22}]',
    bannerImageUrl: '',
    imageUrls: '',
  },
]

export function buildProductCsvTemplate() {
  return toCsv(PRODUCT_CSV_HEADERS, PRODUCT_CSV_DEMO_ROWS)
}

/**
 * Decode CSV bytes from Excel / editors.
 * Excel (Windows) often saves ANSI/Windows-1252 → "ões" becomes "�es" if forced as UTF-8.
 */
export function decodeCsvBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '')
  if (!buf.length) return ''

  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8')
  }
  // UTF-16 LE BOM
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le')
  }

  const asUtf8 = buf.toString('utf8')
  if (!asUtf8.includes('\uFFFD')) return asUtf8

  // Replacement chars → treat as Windows-1252 / Latin-1
  return buf.toString('latin1')
}

export default {
  parseCsv,
  toCsv,
  buildProductCsvTemplate,
  decodeCsvBuffer,
  PRODUCT_CSV_HEADERS,
}
