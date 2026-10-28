import { categoryTreeInclude } from '../../shared/catalog.js'

export const supplierProductInclude = {
  inventory: true,
  features: true,
  pricingTiers: { orderBy: { minQuantity: 'asc' } },
  media: { orderBy: { sortOrder: 'asc' } },
  promotions: {
    where: { approvalStatus: 'APPROVED' },
    orderBy: { endDate: 'desc' },
    take: 1,
  },
  category: categoryTreeInclude,
}

export const factoryProductInclude = {
  features: true,
  media: { orderBy: { sortOrder: 'asc' } },
  category: categoryTreeInclude,
}

// `eupagoExternKey` is read only to compute `purchasable`; mappers never expose it.
export const marketplaceListInclude = {
  inventory: true,
  media: { orderBy: { sortOrder: 'asc' } },
  pricingTiers: { select: { id: true }, take: 1 },
  seller: {
    select: {
      id: true,
      name: true,
      role: true,
      profile: { select: { companyName: true, eupagoExternKey: true } },
    },
  },
}

export const marketplaceDetailInclude = {
  inventory: true,
  media: { orderBy: { sortOrder: 'asc' } },
  features: true,
  pricingTiers: { orderBy: { minQuantity: 'asc' } },
  seller: {
    select: {
      id: true,
      name: true,
      profile: { select: { companyName: true, eupagoExternKey: true } },
    },
  },
  category: categoryTreeInclude,
  reviews: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      author: { select: { id: true, name: true } },
    },
  },
}

export const factoryCatalogListInclude = {
  media: { orderBy: { sortOrder: 'asc' } },
  seller: {
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      profile: { select: { companyName: true, logoUrl: true } },
    },
  },
  category: categoryTreeInclude,
}

export const factoryCatalogDetailInclude = {
  ...factoryCatalogListInclude,
  features: true,
}

export const inventoryListInclude = {
  inventory: true,
  category: categoryTreeInclude,
}

/** Sellers can only sell once an admin has approved their documents. */
export const approvedSellerWhere = {
  profile: { is: { verificationStatus: 'APPROVED' } },
}

/** Live supplier marketplace listing filter */
export function liveListingWhere() {
  return {
    approvalStatus: 'APPROVED',
    seller: { role: 'SUPPLIER', ...approvedSellerWhere },
    inventory: {
      is: {
        listedQuantity: { gt: 0 },
      },
    },
  }
}

export const factoryCatalogWhere = {
  approvalStatus: 'APPROVED',
  seller: { role: 'FACTORY', ...approvedSellerWhere },
}
