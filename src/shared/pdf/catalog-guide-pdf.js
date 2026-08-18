import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import PDFDocument from 'pdfkit'
import prisma from '../../../lib/prisma.js'

function findUnicodeFont() {
  const candidates = [
    // Windows
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    // macOS
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    // Linux
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    path.join(os.homedir(), '.fonts', 'DejaVuSans.ttf'),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

/**
 * Build a printable guide: Category → Subcategory → Product types
 * (exact names to copy into the product CSV).
 */
export async function buildCategoryGuidePdf() {
  const roots = await prisma.category.findMany({
    where: { parentCategoryId: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      subCategories: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          subCategories: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          },
        },
      },
    },
  })

  const fontPath = findUnicodeFont()

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: 'A4',
      info: {
        Title: 'CONSTRUPRECO — CSV Category Guide',
        Author: 'CONSTRUPRECO',
      },
    })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    if (fontPath) {
      doc.registerFont('Body', fontPath)
      doc.font('Body')
    }

    doc.fontSize(16).text('CONSTRUPRECO — CSV Category Guide', { underline: true })
    doc.moveDown(0.4)
    doc.fontSize(10).fillColor('#333333').text(
      'Use these exact names in your product CSV columns: category, subCategory, productType. Copy-paste to avoid spelling mistakes. Save the CSV as UTF-8.',
      { align: 'left' },
    )
    doc.moveDown(0.3)
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(`Generated: ${new Date().toISOString().slice(0, 10)}`)
    doc.moveDown(0.8)
    doc.fillColor('#000000')

    if (!roots.length) {
      doc.fontSize(11).text('No categories found. Run: pnpm seed:catalog')
      doc.end()
      return
    }

    for (const category of roots) {
      doc.fontSize(12).fillColor('#C45C26').text(`CATEGORY: ${category.name}`)
      doc.fillColor('#000000')
      doc.moveDown(0.25)

      const subs = category.subCategories || []
      if (!subs.length) {
        doc.fontSize(9).fillColor('#666666').text('  (no subcategories)', { indent: 10 })
        doc.fillColor('#000000')
        doc.moveDown(0.4)
        continue
      }

      for (const sub of subs) {
        doc.fontSize(10).text(`  Subcategory: ${sub.name}`, { indent: 8 })
        const types = sub.subCategories || []
        if (!types.length) {
          doc.fontSize(8).fillColor('#666666').text('    — (no product types)', { indent: 16 })
          doc.fillColor('#000000')
        } else {
          for (const type of types) {
            doc.fontSize(8).text(`    • ${type.name}`, { indent: 16 })
          }
        }
        doc.moveDown(0.2)
      }
      doc.moveDown(0.45)
    }

    doc.end()
  })
}

export default { buildCategoryGuidePdf }
