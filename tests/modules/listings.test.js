import test from 'node:test'
import assert from 'node:assert/strict'
import {
  featureLines,
  b2bPriceFromDiscount,
  buildListingParts,
  supplierListingParts,
  factoryListingParts,
  uniqueProductSlug,
  rethrowSkuConflict,
} from '../../src/modules/listings/write.js'
import {
  stockAvailability,
  marketplaceAvailability,
  b2bDiscountPercent,
  dollarPriceLabel,
} from '../../src/modules/listings/read.js'
import { mapSupplierProduct } from '../../src/modules/listings/supplier.mapper.js'
import { mapFactoryProduct } from '../../src/modules/listings/factory.mapper.js'
import {
  resolveBuyerView,
  mapMarketplaceListProduct,
} from '../../src/modules/listings/marketplace.mapper.js'

test('featureLines splits, strips bullets, and drops blanks', () => {
  assert.deepEqual(featureLines('- strong\n• cheap\n\n3) local'), [
    'strong',
    'cheap',
    'local',
  ])
})

test('supplier listing parts compute b2b and bulk tiers', () => {
  const { sharedData, tierCreates, featureRows } = supplierListingParts(
    {
      title: 'Cement',
      warehouseLocation: 'Lisbon',
      factoryName: 'Acme',
      basePrice: 100,
      b2bDiscount: 10,
      minB2bQuantity: 20,
      feature: '- bagged',
      bulkEnabled: true,
      bulkOptions: [{ minQuantity: 10, maxQuantity: 50, price: 90 }],
    },
    {},
  )
  assert.equal(sharedData.b2bPrice, 90)
  assert.equal(sharedData.minB2bQuantity, 20)
  assert.equal(sharedData.marketplaceTier, 'WHOLESALE')
  assert.equal(sharedData.approvalStatus, 'PENDING_REVIEW')
  assert.equal(tierCreates.length, 1)
  assert.equal(featureRows[0].featureText, 'bagged')
})

test('factory listing parts stay retail with no b2b', () => {
  const { sharedData, tierCreates } = factoryListingParts(
    {
      title: 'Cement',
      warehouseLocation: 'Porto',
      basePrice: 80,
      b2bDiscount: 10,
      feature: '',
    },
    {},
    'Factory Lda',
  )
  assert.equal(sharedData.factoryName, 'Factory Lda')
  assert.equal(sharedData.b2bPrice, null)
  assert.equal(sharedData.minB2bQuantity, null)
  assert.equal(sharedData.marketplaceTier, 'RETAIL')
  assert.equal(tierCreates.length, 0)
})

test('b2bPriceFromDiscount is null when discount is zero', () => {
  assert.equal(b2bPriceFromDiscount(100, 0), null)
  assert.equal(b2bPriceFromDiscount(100, 25), 75)
})

test('stockAvailability uses warehouse thresholds', () => {
  assert.equal(stockAvailability(0).availability, 'OUT_OF_STOCK')
  assert.equal(stockAvailability(5, 10).availability, 'LOW_STOCK')
  assert.equal(stockAvailability(50, 10).availability, 'IN_STOCK')
})

test('marketplaceAvailability sells the overlap of listed and warehouse', () => {
  const result = marketplaceAvailability({
    inventory: { listedQuantity: 8, currentStock: 3, lowStockThreshold: 10 },
  })
  assert.equal(result.stock, 3)
  assert.equal(result.availability, 'LOW_STOCK')
})

test('uniqueProductSlug is stable in shape', () => {
  assert.match(uniqueProductSlug('Cimento 32,5'), /^cimento-32-5-[a-z0-9]+$/)
})

test('rethrowSkuConflict maps P2002', () => {
  assert.throws(
    () => rethrowSkuConflict({ code: 'P2002', meta: { target: ['sku'] } }),
    (err) => err.statusCode === 409 && err.code === 'SkuExists',
  )
  assert.throws(
    () =>
      rethrowSkuConflict(
        { code: 'P2002', meta: { target: ['slug'] } },
        { distinguishDuplicate: true },
      ),
    (err) => err.statusCode === 409 && err.code === 'Duplicate',
  )
})

test('supplier mapper: inventory-only approved product is a draft card', () => {
  const mapped = mapSupplierProduct(
    {
      id: 'p1',
      sku: 'SKU-1',
      title: 'Cement',
      warehouseLocation: 'Lisbon',
      factoryName: 'Acme',
      basePrice: 10,
      b2bPrice: 8,
      minB2bQuantity: 20,
      weightKg: 25,
      unitOfMeasure: 'bag',
      approvalStatus: 'APPROVED',
      inventory: { currentStock: 40, listedQuantity: 0, lowStockThreshold: 10 },
      media: [],
      features: [{ featureText: 'grey' }],
      pricingTiers: [],
      promotions: [],
      category: {
        id: 'pt',
        slug: 'x__type',
        name: 'Type',
        parentCategory: {
          id: 'sub',
          slug: 'x__sub',
          name: 'Sub',
          parentCategory: { id: 'root', slug: 'x__root', name: 'Root' },
        },
      },
    },
    'http://localhost:8080',
  )
  assert.equal(mapped.cardStatus, 'draft')
  assert.equal(mapped.quantity, 40)
  assert.equal(mapped.listedQuantity, 0)
  assert.equal(mapped.b2bDiscount, 20)
  assert.equal(mapped.priceLabel, dollarPriceLabel({ basePrice: 10, unitOfMeasure: 'bag', weightKg: 25 }))
  assert.equal(mapped.category.name, 'Root')
  assert.equal(mapped.productType.name, 'Type')
})

test('factory mapper: approved listing is active with no inventory', () => {
  const mapped = mapFactoryProduct(
    {
      id: 'p1',
      sku: 'SKU-1',
      title: 'Cement',
      warehouseLocation: 'Porto',
      factoryName: 'Factory',
      basePrice: 12,
      weightKg: 0,
      approvalStatus: 'APPROVED',
      media: [],
      features: [],
      category: null,
    },
    'http://localhost:8080',
  )
  assert.equal(mapped.status, 'active')
  assert.equal(mapped.hasInventory, false)
  assert.equal(mapped.priceLabel, '$12.00 Per bag')
})

test('marketplace list hides b2b from guests and shows it to companies', () => {
  const product = {
    id: 'p1',
    slug: 'abc__cement',
    title: 'Cement',
    longDescription: 'A'.repeat(200),
    basePrice: 10,
    b2bPrice: 8,
    minB2bQuantity: 5,
    unitOfMeasure: 'bag',
    weightKg: 25,
    isSponsored: true,
    media: [{ id: 'm1', mediaUrl: '/uploads/x.jpg', isBanner: true, sortOrder: 0 }],
    seller: { id: 's1', name: 'Shop', profile: { companyName: 'Shop Lda' } },
    category: null,
  }
  const guest = mapMarketplaceListProduct(
    product,
    'http://localhost:8080',
    resolveBuyerView(null),
  )
  assert.equal(guest.pricingView, 'retail')
  assert.equal(guest.b2bPrice, null)
  assert.equal(guest.badge.type, 'sponsored')
  assert.equal(guest.image, 'http://localhost:8080/uploads/x.jpg')
  assert.ok(guest.description.endsWith('...'))

  const company = mapMarketplaceListProduct(
    product,
    'http://localhost:8080',
    resolveBuyerView({ id: 'c1', role: 'COMPANY' }),
  )
  assert.equal(company.pricingView, 'company')
  assert.equal(company.b2bPrice, 8)
  assert.equal(company.minOrder, '5 bag')
})

test('b2bDiscountPercent is zero without a company price', () => {
  assert.equal(b2bDiscountPercent(10, null), 0)
  assert.equal(b2bDiscountPercent(0, 5), 0)
})

test('buildListingParts without flags matches a factory write', () => {
  const parts = buildListingParts(
    { title: 'X', warehouseLocation: 'Y', basePrice: 1 },
    {},
  )
  assert.equal(parts.sharedData.b2bPrice, null)
  assert.equal(parts.sharedData.marketplaceTier, 'RETAIL')
})
