import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import PDFDocument from 'pdfkit'
import { currencySymbol, money as moneyValue } from '../money.js'
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

function money(n) {
  return `${currencySymbol()}${moneyValue(n).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`
}

export function buildInsurancePolicyPdf(data) {
  const fontPath = findUnicodeFont()
  const boldPath = findBoldFont()
  const dark = '#1F2937'
  const muted = '#6B7280'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: `Insurance ${data.type} ${data.policyNumber}` },
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    if (fontPath) doc.font(fontPath)
    const regular = fontPath || 'Helvetica'
    const bold = boldPath || 'Helvetica-Bold'
    const heading =
      data.type === 'civil' ? 'Civil Liability Insurance' : 'Cargo Liability Insurance'

    doc.font(bold).fontSize(18).fillColor(dark).text(heading)
    doc.moveDown(1)

    const rows = [
      ['Provider', data.provider],
      ['Policy number', data.policyNumber],
      ['Coverage', money(data.coverageAmount)],
      ['Start date', data.startDate || '—'],
      ['Expiry date', data.expiryDate],
      ['Status', data.status],
    ]
    for (const [label, value] of rows) {
      doc.font(bold).fontSize(10).fillColor(muted).text(label)
      doc.font(regular).fontSize(12).fillColor(dark).text(String(value || '—'))
      doc.moveDown(0.6)
    }

    doc.end()
  })
}

export default { buildInsurancePolicyPdf }
