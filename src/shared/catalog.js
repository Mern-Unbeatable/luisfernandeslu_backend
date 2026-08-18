import { publicSlug } from './slug.js'

/** Nested select covering the full category -> subCategory -> productType chain. */
export const categoryTreeSelect = {
  id: true,
  slug: true,
  name: true,
  parentCategoryId: true,
  parentCategory: {
    select: {
      id: true,
      slug: true,
      name: true,
      parentCategoryId: true,
      parentCategory: {
        select: { id: true, slug: true, name: true, parentCategoryId: true },
      },
    },
  },
}

/** Nested include for reading an already-loaded product's category chain. */
export const categoryTreeInclude = {
  include: { parentCategory: { include: { parentCategory: true } } },
}

export function mapCategoryNode(node) {
  if (!node) return null
  return { id: node.id, slug: publicSlug(node.slug), name: node.name }
}

/**
 * Raw category chain for a leaf node. A product attached above product-type
 * level shifts up, so `category` is always the highest known ancestor.
 */
export function categoryPathNodes(leaf) {
  if (!leaf) return { category: null, subCategory: null, productType: null }
  const parent = leaf.parentCategory
  const root = parent?.parentCategory
  if (root) return { category: root, subCategory: parent, productType: leaf }
  if (parent) return { category: parent, subCategory: leaf, productType: null }
  return { category: leaf, subCategory: null, productType: null }
}

/**
 * Raw category chain, but only when the product sits on a complete
 * category -> subCategory -> productType path; otherwise null.
 */
export function categoryPathStrict(product) {
  const leaf = product?.category
  if (!leaf?.parentCategory?.parentCategory) return null
  return {
    category: leaf.parentCategory.parentCategory,
    subCategory: leaf.parentCategory,
    productType: leaf,
  }
}

/**
 * Human-readable category/material pair used on invoices and order rows,
 * where `product.category` is normally the leaf product type.
 */
export function categoryLabels(category) {
  if (!category) return { category: null, material: null }
  const parent = category.parentCategory
  if (parent) {
    return { category: parent.name || null, material: category.name || null }
  }
  return { category: category.name || null, material: null }
}

/** Matches a product against any level of the category tree. */
export function categoryFilter(categoryId) {
  if (!categoryId) return null
  return [
    { categoryId },
    { category: { parentCategoryId: categoryId } },
    { category: { parentCategory: { parentCategoryId: categoryId } } },
  ]
}
