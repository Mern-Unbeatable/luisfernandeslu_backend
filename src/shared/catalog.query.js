import prisma from '../../lib/prisma.js'
import { httpError } from './errors.js'
import { categoryTreeSelect } from './catalog.js'

/**
 * Loads the three-level path for a product type. Returns null when the id is
 * not a leaf productType whose grandparent is a root category.
 */
export async function resolveCategoryPath(productTypeId, client = prisma) {
  const productType = await client.category.findUnique({
    where: { id: productTypeId },
    select: categoryTreeSelect,
  })

  if (!productType?.parentCategory?.parentCategory) return null
  const subCategory = productType.parentCategory
  const category = subCategory.parentCategory
  if (category.parentCategoryId !== null) return null
  return { category, subCategory, productType }
}

/** Ensures body.categoryId / subCategoryId / productTypeId form a real chain. */
export async function assertCategoryPath(body, client = prisma) {
  const path = await resolveCategoryPath(body.productTypeId, client)
  if (!path) throw httpError('Invalid product type', 400, 'InvalidProductType')
  if (path.category.id !== body.categoryId) {
    throw httpError(
      'productTypeId does not belong to categoryId',
      400,
      'CategoryMismatch',
    )
  }
  if (path.subCategory.id !== body.subCategoryId) {
    throw httpError(
      'productTypeId does not belong to subCategoryId',
      400,
      'SubCategoryMismatch',
    )
  }
  return path
}

/**
 * Resolve catalog path from human-readable names (CSV).
 * Supplier uploads use 400 for unknown names; factory uploads use 404.
 */
export async function resolveCategoryPathByNames(
  { category, subCategory, productType },
  { notFoundStatus = 400, client = prisma } = {},
) {
  const categoryName = String(category || '').trim().normalize('NFC')
  const subName = String(subCategory || '').trim().normalize('NFC')
  const typeName = String(productType || '').trim().normalize('NFC')

  if (!categoryName || !subName || !typeName) {
    throw httpError(
      'category, subCategory and productType names are required',
      400,
      'CategoryNamesRequired',
    )
  }

  const root = await client.category.findFirst({
    where: {
      name: { equals: categoryName, mode: 'insensitive' },
      parentCategoryId: null,
    },
    select: { id: true, name: true },
  })
  if (!root) {
    throw httpError(
      `Category not found: "${categoryName}"`,
      notFoundStatus,
      'CategoryNotFound',
    )
  }

  const sub = await client.category.findFirst({
    where: {
      name: { equals: subName, mode: 'insensitive' },
      parentCategoryId: root.id,
    },
    select: { id: true, name: true },
  })
  if (!sub) {
    throw httpError(
      `Subcategory not found under "${root.name}": "${subName}"`,
      notFoundStatus,
      'SubCategoryNotFound',
    )
  }

  const leaf = await client.category.findFirst({
    where: {
      name: { equals: typeName, mode: 'insensitive' },
      parentCategoryId: sub.id,
    },
    select: { id: true, name: true },
  })
  if (!leaf) {
    throw httpError(
      `Product type not found under "${sub.name}": "${typeName}"`,
      notFoundStatus,
      'ProductTypeNotFound',
    )
  }

  return {
    categoryId: root.id,
    subCategoryId: sub.id,
    productTypeId: leaf.id,
  }
}
