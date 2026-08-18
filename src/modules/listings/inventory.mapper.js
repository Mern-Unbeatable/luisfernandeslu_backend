import { publicSlug } from '../../shared/slug.js'
import { warehouseAvailability } from './read.js'

/** Supplier warehouse / inventory table row. */
export function mapInventoryProduct(product) {
  const stockInfo = warehouseAvailability(product)
  const path = product._categoryPath

  return {
    id: product.id,
    inventoryId: product.inventory?.id ?? null,
    name: product.title,
    sku: product.sku,
    price: product.basePrice,
    quantity: stockInfo.warehouseStock,
    warehouseStock: stockInfo.warehouseStock,
    listedQuantity: stockInfo.listedQuantity,
    remainingListable: stockInfo.remainingListable,
    unitOfMeasure: product.unitOfMeasure,
    factoryName: product.factoryName,
    warehouseLocation: product.warehouseLocation,
    lowStockThreshold: stockInfo.threshold,
    stockStatus: stockInfo.stockStatus,
    stockValue: Number((stockInfo.warehouseStock * product.basePrice).toFixed(2)),
    approvalStatus: product.approvalStatus,
    category: path
      ? {
          id: path.category.id,
          slug: publicSlug(path.category.slug),
          name: path.category.name,
        }
      : null,
    subCategory: path
      ? {
          id: path.subCategory.id,
          slug: publicSlug(path.subCategory.slug),
          name: path.subCategory.name,
        }
      : null,
    productType: path
      ? {
          id: path.productType.id,
          slug: publicSlug(path.productType.slug),
          name: path.productType.name,
        }
      : {
          id: product.categoryId,
          slug: null,
          name: product.category?.name ?? null,
        },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

export function attachInventoryCategoryPath(product) {
  const productType = product.category
  const subCategory = productType?.parentCategory
  const category = subCategory?.parentCategory
  product._categoryPath =
    category && subCategory && productType
      ? { category, subCategory, productType }
      : null
  return product
}
