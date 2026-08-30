/**
 * Rewrite legacy `/uploads/seed/*` media to public HTTPS URLs so remote API hosts
 * (without local seed files) still return working image links.
 *
 *   npm exec -- tsx src/scripts/fix-seed-media-urls.js
 */
import 'dotenv/config'
import prisma from '../../lib/prisma.js'
import { resolveSeedMediaUrl } from './seed-product-images.js'

async function main() {
  const rows = await prisma.productMedia.findMany({
    where: {
      OR: [
        { mediaUrl: { contains: '/uploads/seed/' } },
        { mediaUrl: { startsWith: 'uploads/seed/' } },
      ],
    },
    select: { id: true, mediaUrl: true, productId: true },
  })

  let updated = 0
  for (const row of rows) {
    const next = resolveSeedMediaUrl(row.mediaUrl)
    if (next === row.mediaUrl) continue
    await prisma.productMedia.update({
      where: { id: row.id },
      data: { mediaUrl: next },
    })
    updated += 1
  }

  // Also refresh sponsored banners that may already be broken absolute remote /uploads/seed
  const sponsored = await prisma.product.findMany({
    where: { isSponsored: true },
    include: { media: true },
  })
  for (const product of sponsored) {
    for (const media of product.media) {
      if (!/uploads\/seed/i.test(media.mediaUrl || '')) continue
      const next = resolveSeedMediaUrl(media.mediaUrl)
      if (next === media.mediaUrl) continue
      await prisma.productMedia.update({
        where: { id: media.id },
        data: { mediaUrl: next },
      })
      updated += 1
    }
  }

  console.log(`Updated ${updated} media URL(s)`)

  const sample = await prisma.product.findMany({
    where: { isSponsored: true },
    select: {
      title: true,
      media: {
        where: { isBanner: true },
        select: { mediaUrl: true },
        take: 1,
      },
    },
    take: 8,
  })
  for (const p of sample) {
    console.log(`- ${p.title}: ${p.media[0]?.mediaUrl || '(none)'}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
