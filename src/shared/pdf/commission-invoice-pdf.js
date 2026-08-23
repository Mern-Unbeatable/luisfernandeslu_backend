import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import PDFDocument from 'pdfkit'
import { currencySymbol, money as moneyValue } from '../money.js'
import { env } from '../../config/env.js'

function findUnicodeFont() {
  const candidates = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    path.join(os.homedir(), '.fonts', 'DejaVuSans.ttf'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function findBoldFont() {
  const candidates = [
    'C:\\Windows\\Fonts\\arialbd.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function money(n, currency = env.currency) {
  return `${currencySymbol(currency) || `${currency} `}${moneyValue(n).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`
}

export function buildCommissionInvoicePdf(data) {
  const fontPath = findUnicodeFont()
  const boldPath = findBoldFont()
  const currency = data.currency || env.currency
  const dark = '#1F2937'
  const muted = '#6B7280'
  const line = '#E5E7EB'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: `Commission Invoice ${data.id}` },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    if (fontPath) doc.font(fontPath)
    const regular = fontPath || 'Helvetica'
    const bold = boldPath || 'Helvetica-Bold'

    doc.font(bold).fontSize(18).fillColor(dark).text('Commission Invoice')
    doc.moveDown(0.3)
    doc.font(regular).fontSize(10).fillColor(muted).text(data.id)
    doc.moveDown(1.2)

    const rows = [
      ['Invoice ID', data.id],
      ['Type', data.type],
      ['Order ID', data.orderId],
      ['Party', data.partyName],
      ['Role', data.role],
      ['Customer', data.customer],
      ['Date', data.date],
      ['Order total', money(data.orderTotal, currency)],
      ['Commission rate', `${data.commissionPercent}%`],
      ['Commission amount', money(data.amount, currency)],
      ['Party payout', money(data.partyPayout, currency)],
    ]

    for (const [label, value] of rows) {
      const y = doc.y
      doc.font(regular).fontSize(10).fillColor(muted).text(label, 48, y, { width: 160 })
      doc.font(bold).fontSize(10).fillColor(dark).text(String(value ?? '—'), 220, y, {
        width: 320,
      })
      doc.moveDown(0.55)
    }

    doc.moveDown(0.8)
    doc
      .strokeColor(line)
      .lineWidth(1)
      .moveTo(48, doc.y)
      .lineTo(547, doc.y)
      .stroke()
    doc.moveDown(0.8)
    doc
      .font(regular)
      .fontSize(9)
      .fillColor(muted)
      .text(
        `Admin commission = order total × ${data.commissionPercent}%.`,
        48,
        doc.y,
        { width: 500 },
      )

    doc.end()
  })
}

export default { buildCommissionInvoicePdf }
