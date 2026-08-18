import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import PDFDocument from 'pdfkit'

function findUnicodeFont() {
  const candidates = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    path.join(os.homedir(), '.fonts', 'DejaVuSans.ttf'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function findBoldFont() {
  const candidates = [
    'C:\\Windows\\Fonts\\arialbd.ttf',
    'C:\\Windows\\Fonts\\seguisb.ttf',
    'C:\\Windows\\Fonts\\calibrib.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function money(n, currency = 'EUR') {
  const v = Number(Number(n || 0).toFixed(2))
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `
  return `${symbol}${v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(d) {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function paymentLabel(method) {
  const m = String(method || '').toUpperCase()
  if (m === 'MULTIBANCO') return 'Multibanco'
  if (m === 'MBWAY') return 'MB WAY'
  if (m === 'CREDITCARD') return 'Credit Card'
  return method || 'Online Payment'
}

function ordinalInstallment(n) {
  const num = Number(n) || 0
  const mod100 = num % 100
  if (mod100 >= 11 && mod100 <= 13) return `${num}th Installment`
  switch (num % 10) {
    case 1:
      return `${num}st Installment`
    case 2:
      return `${num}nd Installment`
    case 3:
      return `${num}rd Installment`
    default:
      return `${num}th Installment`
  }
}

/**
 * Supplier / system invoice PDF (no logo).
 * @param {object} data
 */
export async function buildSupplierInvoicePdf(data) {
  const fontPath = findUnicodeFont()
  const boldPath = findBoldFont()

  const accent = '#5BA3D9'
  const muted = '#6B7280'
  const dark = '#1F2937'
  const line = '#E5E7EB'
  const greenFg = '#047857'
  const totalColor = '#E8A838'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: data.seller?.companyName || 'CONSTRUPRECO',
      },
    })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const bodyFont = fontPath ? 'Body' : 'Helvetica'
    const boldFont = boldPath ? 'Bold' : fontPath ? 'Body' : 'Helvetica-Bold'
    if (fontPath) doc.registerFont('Body', fontPath)
    if (boldPath) doc.registerFont('Bold', boldPath)

    const pageW = doc.page.width
    const left = 48
    const right = pageW - 48
    const contentW = right - left

    // ——— Header: seller address only (left) + INVOICE meta (right) ———
    let y = 48
    doc.font(bodyFont).fontSize(9).fillColor(muted)

    const sellerAddress = data.seller?.address || null
    if (sellerAddress) {
      doc.text(sellerAddress, left, y, { width: contentW * 0.48 })
    }

    doc
      .font(boldFont)
      .fontSize(28)
      .fillColor(accent)
      .text('INVOICE', left + contentW * 0.52, y, {
        width: contentW * 0.48,
        align: 'right',
      })

    const metaX = left + contentW * 0.52
    let metaY = y + 36
    const metaRows = [
      ['Invoice Number', data.invoiceNumber],
      ['Invoice Date', fmtDate(data.issueDate)],
    ]
    metaRows.forEach(([label, value]) => {
      doc.font(bodyFont).fontSize(9).fillColor(muted).text(label, metaX, metaY, {
        width: contentW * 0.22,
      })
      doc
        .font(boldFont)
        .fontSize(10)
        .fillColor(dark)
        .text(String(value), metaX + contentW * 0.22, metaY, {
          width: contentW * 0.26,
          align: 'right',
        })
      metaY += 16
    })

    const leftHeaderH = sellerAddress
      ? doc.heightOfString(sellerAddress, { width: contentW * 0.48 })
      : 0
    y = Math.max(y + leftHeaderH, metaY) + 28
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor(line)
      .lineWidth(1)
      .stroke()
    y += 24

    // ——— Customer + Order details ———
    const colW = contentW / 2 - 12
    doc.font(boldFont).fontSize(11).fillColor(accent).text('Customer Details', left, y)
    doc.font(boldFont).fontSize(11).fillColor(accent).text('Order Details', left + colW + 24, y)
    y += 18

    const custY = y
    doc.font(boldFont).fontSize(11).fillColor(dark).text(data.customer?.name || '—', left, custY)
    let cy = custY + 16
    doc.font(bodyFont).fontSize(9).fillColor(muted)
    if (data.customer?.email) {
      doc.text(data.customer.email, left, cy, { width: colW })
      cy += 14
    }
    if (data.customer?.phone) {
      doc.text(data.customer.phone, left, cy, { width: colW })
      cy += 14
    }
    if (data.customer?.address) {
      doc.text(data.customer.address, left, cy, { width: colW })
      cy += 28
    }

    let oy = custY
    const orderMeta = [
      ['Order ID', data.orderNumber],
      ['Order Date', fmtDate(data.orderDate)],
      ['Payment Method', paymentLabel(data.paymentMethod)],
    ]
    orderMeta.forEach(([label, value]) => {
      doc.font(bodyFont).fontSize(9).fillColor(muted).text(label, left + colW + 24, oy)
      doc
        .font(boldFont)
        .fontSize(10)
        .fillColor(dark)
        .text(String(value), left + colW + 24 + 100, oy, { width: colW - 100 })
      oy += 16
    })

    y = Math.max(cy, oy) + 16

    // ——— Items ———
    doc.font(boldFont).fontSize(12).fillColor(accent).text('Items', left, y)
    y += 18

    const cols = {
      product: left,
      qty: left + contentW * 0.52,
      unit: left + contentW * 0.64,
      total: left + contentW * 0.8,
    }
    const colWidths = {
      product: contentW * 0.5,
      qty: contentW * 0.1,
      unit: contentW * 0.14,
      total: contentW * 0.18,
    }

    doc.roundedRect(left, y, contentW, 22, 4).fill('#F3F4F6')
    doc.font(boldFont).fontSize(9).fillColor(muted)
    doc.text('Product / Service', cols.product + 8, y + 6, { width: colWidths.product })
    doc.text('Quantity', cols.qty, y + 6, { width: colWidths.qty, align: 'right' })
    doc.text('Unit Price', cols.unit, y + 6, { width: colWidths.unit, align: 'right' })
    doc.text('Total', cols.total, y + 6, { width: colWidths.total, align: 'right' })
    y += 28

    const currency = data.currency || 'EUR'
    const items = data.items || []
    items.forEach((item, idx) => {
      if (y > doc.page.height - 160) {
        doc.addPage()
        y = 48
      }
      doc.font(bodyFont).fontSize(10).fillColor(dark)
      doc.text(item.title || 'Item', cols.product + 8, y, {
        width: colWidths.product - 8,
      })
      const rowH = Math.max(18, doc.heightOfString(item.title || 'Item', {
        width: colWidths.product - 8,
      }))
      doc.text(String(item.quantity ?? 0), cols.qty, y, {
        width: colWidths.qty,
        align: 'right',
      })
      doc.text(money(item.unitPrice, currency), cols.unit, y, {
        width: colWidths.unit,
        align: 'right',
      })
      doc
        .font(boldFont)
        .text(money(item.total, currency), cols.total, y, {
          width: colWidths.total,
          align: 'right',
        })
      y += rowH + 8
      if (idx < items.length - 1) {
        doc
          .moveTo(left, y)
          .lineTo(right, y)
          .strokeColor(line)
          .lineWidth(0.5)
          .stroke()
        y += 8
      }
    })

    y += 20

    // ——— Installment schedule (chat / quote orders only) ———
    const installments = Array.isArray(data.installments) ? data.installments : []
    if (installments.length) {
      if (y > doc.page.height - 180) {
        doc.addPage()
        y = 48
      }

      doc
        .font(boldFont)
        .fontSize(12)
        .fillColor(accent)
        .text('Installment Schedule', left, y)
      y += 18

      if (data.paymentPlan) {
        const planBits = [
          data.paymentPlan.termMonths
            ? `Term: ${data.paymentPlan.termMonths} months`
            : null,
          data.paymentPlan.downPayment != null
            ? `Down payment: ${money(data.paymentPlan.downPayment, currency)}`
            : null,
          data.paymentPlan.remainingBalance != null
            ? `Remaining: ${money(data.paymentPlan.remainingBalance, currency)}`
            : null,
        ].filter(Boolean)
        if (planBits.length) {
          doc.font(bodyFont).fontSize(9).fillColor(muted).text(planBits.join('  ·  '), left, y, {
            width: contentW,
          })
          y += 16
        }
      }

      doc.roundedRect(left, y, contentW, 22, 4).fill('#F3F4F6')
      doc.font(boldFont).fontSize(9).fillColor(muted)
      doc.text('Installment', left + 8, y + 6, { width: contentW * 0.34 })
      doc.text('Due Date', left + contentW * 0.36, y + 6, {
        width: contentW * 0.22,
      })
      doc.text('Status', left + contentW * 0.58, y + 6, {
        width: contentW * 0.16,
      })
      doc.text('Amount', left + contentW * 0.74, y + 6, {
        width: contentW * 0.24,
        align: 'right',
      })
      y += 28

      installments.forEach((inst, idx) => {
        if (y > doc.page.height - 80) {
          doc.addPage()
          y = 48
        }
        const label =
          inst.title ||
          ordinalInstallment(inst.installmentNumber || idx + 1)
        doc.font(bodyFont).fontSize(10).fillColor(dark)
        doc.text(label, left + 8, y, { width: contentW * 0.34 })
        doc.text(fmtDate(inst.dueDate), left + contentW * 0.36, y, {
          width: contentW * 0.22,
        })
        doc.text(String(inst.status || 'PENDING'), left + contentW * 0.58, y, {
          width: contentW * 0.16,
        })
        doc
          .font(boldFont)
          .text(money(inst.amount, currency), left + contentW * 0.74, y, {
            width: contentW * 0.24,
            align: 'right',
          })
        y += 18
        if (idx < installments.length - 1) {
          doc
            .moveTo(left, y)
            .lineTo(right, y)
            .strokeColor(line)
            .lineWidth(0.5)
            .stroke()
          y += 8
        }
      })

      y += 20
    }

    // ——— Summary ———
    const sumX = left + contentW * 0.52
    const sumW = contentW * 0.48
    const labelW = sumW * 0.55
    const valueW = sumW * 0.45

    const rows = [
      data.showShippingVat
        ? ['Subtotal', money(data.subtotal, currency), dark]
        : null,
      data.discount > 0
        ? ['Discount', `-${money(data.discount, currency)}`, greenFg]
        : null,
      data.showShippingVat
        ? ['Shipping', money(data.shipping, currency), dark]
        : null,
      data.showShippingVat && Number(data.vat) > 0
        ? ['VAT', money(data.vat, currency), dark]
        : null,
    ].filter(Boolean)

    rows.forEach(([label, value, color]) => {
      doc.font(bodyFont).fontSize(10).fillColor(muted).text(label, sumX, y, {
        width: labelW,
      })
      doc
        .font(bodyFont)
        .fontSize(10)
        .fillColor(color)
        .text(value, sumX + labelW, y, { width: valueW, align: 'right' })
      y += 18
    })

    y += 6
    doc
      .moveTo(sumX, y)
      .lineTo(right, y)
      .strokeColor(line)
      .lineWidth(1)
      .stroke()
    y += 12

    doc.font(boldFont).fontSize(12).fillColor(dark).text('Total', sumX, y, {
      width: labelW,
    })
    doc
      .font(boldFont)
      .fontSize(16)
      .fillColor(totalColor)
      .text(money(data.total, currency), sumX + labelW, y - 2, {
        width: valueW,
        align: 'right',
      })

    doc.end()
  })
}

export default { buildSupplierInvoicePdf }
