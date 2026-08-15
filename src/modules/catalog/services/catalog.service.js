import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'

function publicSlug(slug) {
  if (!slug) return slug
  const parts = String(slug).split('__')
  return parts[parts.length - 1]
}

function mapCategory(row, extra = {}) {
  return {
    id: row.id,
    slug: publicSlug(row.slug),
    name: row.name,
    thumbnailUrl: row.thumbnailUrl ?? null,
    ...extra,
  }
}

export class CatalogService {
  async getCategories() {
    const rows = await prisma.category.findMany({
      where: { parentCategoryId: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        thumbnailUrl: true,
      },
    })

    return {
      status: 200,
      body: {
        categories: rows.map((r) => mapCategory(r)),
        message: 'Categories fetched',
      },
    }
  }

  async getSubCategories(categoryId) {
    const parent = await prisma.category.findFirst({
      where: { id: categoryId, parentCategoryId: null },
      select: { id: true },
    })
    if (!parent) {
      throw new AppError('Category not found', 404, 'CategoryNotFound')
    }

    const rows = await prisma.category.findMany({
      where: { parentCategoryId: categoryId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        thumbnailUrl: true,
        parentCategoryId: true,
      },
    })

    return {
      status: 200,
      body: {
        categoryId,
        subCategories: rows.map((r) =>
          mapCategory(r, { categoryId: r.parentCategoryId }),
        ),
        message: 'Subcategories fetched',
      },
    }
  }

  async getProductTypes(subCategoryId) {
    const parent = await prisma.category.findFirst({
      where: {
        id: subCategoryId,
        parentCategoryId: { not: null },
      },
      select: {
        id: true,
        parentCategoryId: true,
        parentCategory: { select: { parentCategoryId: true } },
      },
    })

    // Subcategory must be level-2 (its parent is a root category)
    if (!parent || parent.parentCategory?.parentCategoryId !== null) {
      throw new AppError('Subcategory not found', 404, 'SubCategoryNotFound')
    }

    const rows = await prisma.category.findMany({
      where: { parentCategoryId: subCategoryId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        thumbnailUrl: true,
        parentCategoryId: true,
      },
    })

    return {
      status: 200,
      body: {
        subCategoryId,
        productTypes: rows.map((r) =>
          mapCategory(r, { subCategoryId: r.parentCategoryId }),
        ),
        message: 'Product types fetched',
      },
    }
  }
}

export default new CatalogService()
