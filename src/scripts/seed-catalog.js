/**
 * Seed Category hierarchy (3 levels) with Portuguese names.
 * IDs/slugs align with frontend productCategories.js for later client switchover.
 *
 * Usage: pnpm seed:catalog
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prisma from '../../lib/prisma.js'
import { CATALOG_PT } from '../data/catalog.pt.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const enPath = path.resolve(__dirname, '../data/_en_categories.json')

function assertShape(en, pt) {
  if (en.length !== pt.length) {
    throw new Error(
      `Category count mismatch: EN=${en.length} PT=${pt.length}`,
    )
  }
  for (let i = 0; i < en.length; i++) {
    const eSubs = en[i].subcategories
    const pSubs = pt[i].subcategories
    if (eSubs.length !== pSubs.length) {
      throw new Error(
        `Subcategory count mismatch at ${en[i].id}: EN=${eSubs.length} PT=${pSubs.length}`,
      )
    }
    for (let j = 0; j < eSubs.length; j++) {
      const eTypes = eSubs[j].productTypes
      const pTypes = pSubs[j].types
      if (eTypes.length !== pTypes.length) {
        throw new Error(
          `Type count mismatch at ${eSubs[j].id}: EN=${eTypes.length} PT=${pTypes.length}`,
        )
      }
    }
  }
}

async function main() {
  if (!fs.existsSync(enPath)) {
    throw new Error(
      `Missing ${enPath}. Run: node src/scripts/_extract-en-categories.mjs`,
    )
  }

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
  assertShape(en, CATALOG_PT)

  let categories = 0
  let subcategories = 0
  let types = 0

  for (let i = 0; i < en.length; i++) {
    const enCat = en[i]
    const ptCat = CATALOG_PT[i]

    const category = await prisma.category.upsert({
      where: { slug: enCat.id },
      create: {
        slug: enCat.id,
        name: ptCat.name,
        parentCategoryId: null,
      },
      update: {
        name: ptCat.name,
        parentCategoryId: null,
      },
    })
    categories += 1

    for (let j = 0; j < enCat.subcategories.length; j++) {
      const enSub = enCat.subcategories[j]
      const ptSub = ptCat.subcategories[j]
      // Prefix slug with category to keep uniqueness if needed
      const subSlug = `${enCat.id}__${enSub.id}`

      const subcategory = await prisma.category.upsert({
        where: { slug: subSlug },
        create: {
          slug: subSlug,
          name: ptSub.name,
          parentCategoryId: category.id,
        },
        update: {
          name: ptSub.name,
          parentCategoryId: category.id,
        },
      })
      subcategories += 1

      for (let k = 0; k < enSub.productTypes.length; k++) {
        const enType = enSub.productTypes[k]
        const ptTypeName = ptSub.types[k]
        const typeSlug = `${subSlug}__${enType.id}`

        await prisma.category.upsert({
          where: { slug: typeSlug },
          create: {
            slug: typeSlug,
            name: ptTypeName,
            parentCategoryId: subcategory.id,
          },
          update: {
            name: ptTypeName,
            parentCategoryId: subcategory.id,
          },
        })
        types += 1
      }
    }
  }

  console.log(
    `Catalog seeded (PT names): ${categories} categories, ${subcategories} subcategories, ${types} product types`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
