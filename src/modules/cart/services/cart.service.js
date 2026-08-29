import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { env } from '../../../config/env.js'
import { httpError } from '../../../shared/errors.js'
import { moneyNonNegative as money } from '../../../shared/money.js'
import { resolveVatRate } from '../../admin/settings/settings.store.js'

/** Flat env fee removed — shipping = distance × admin vehicle rate at checkout. */
const VAT_FIXED = env.vatFixed
const CURRENCY = env.currency

function moneyText(n) {
  return money(n).toFixed(2)
}

function unitPriceForBuyer(product, role) {
  if (role === 'company' && product.b2bPrice != null) {
    return money(product.b2bPrice)
  }
  return money(product.basePrice)
}

function productCatalogIds(product) {
  const ids = new Set()
  if (product?.categoryId) ids.add(product.categoryId)
  if (product?.category?.id) ids.add(product.category.id)
  if (product?.category?.parentCategoryId) {
    ids.add(product.category.parentCategoryId)
  }
  if (product?.category?.parentCategory?.id) {
    ids.add(product.category.parentCategory.id)
  }
  if (product?.category?.parentCategory?.parentCategoryId) {
    ids.add(product.category.parentCategory.parentCategoryId)
  }
  return ids
}

function mapCartItem(item, role, baseUrl, promoMeta = null) {
  const product = item.product
  const banner = (product.media || []).find((m) => m.isBanner)
  const unitPrice = unitPriceForBuyer(product, role)
  const quantity = item.quantity
  const originalSubtotal = money(unitPrice * quantity)
  const discountAmount = promoMeta?.discountAmount
    ? money(promoMeta.discountAmount)
    : 0
  const subtotal = money(originalSubtotal - discountAmount)
  const codes = Array.isArray(promoMeta?.codes) ? promoMeta.codes : []

  // compareAt only when base is higher than the buyer's unit price (e.g. company B2B)
  const compareAtPrice =
    money(product.basePrice) > unitPrice ? money(product.basePrice) : null

    return {
      id: item.id,
      productId: product.id,
      sellerId: product.sellerId,
      title: product.title,
      sku: product.sku,
      image: banner ? absolutizeUrl(banner.mediaUrl, baseUrl) : null,
      unit: product.unitOfMeasure || 'bag',
      quantity,
      unitPrice,
      unitPriceText: moneyText(unitPrice),
      compareAtPrice,
      compareAtPriceText: compareAtPrice != null ? moneyText(compareAtPrice) : null,
      subtotal,
      subtotalText: moneyText(subtotal),
      promo: {
        applied: discountAmount > 0,
        discountAmount,
        discountAmountText: moneyText(discountAmount),
        originalSubtotal,
        originalSubtotalText: moneyText(originalSubtotal),
        codes,
      },
    }
  }

function computeTotals(mappedItems, vatRate = 0) {
  const subtotalBeforeDiscount = money(
    mappedItems.reduce((sum, row) => sum + (row.promo?.originalSubtotal ?? row.subtotal), 0),
  )
  const discountAmount = money(
    mappedItems.reduce((sum, row) => sum + (row.promo?.discountAmount ?? 0), 0),
  )
  const subtotal = money(subtotalBeforeDiscount - discountAmount)
  const hasItems = mappedItems.length > 0
  // Shipping quoted at checkout (vehicle + distance × admin per-km).
  const shipping = 0
  const vat = hasItems
    ? vatRate > 0
      ? money((subtotal * Number(vatRate)) / 100)
      : money(VAT_FIXED)
    : 0

  return {
    subtotalBeforeDiscount,
    discount: discountAmount,
    subtotal,
    shipping,
    vat,
    total: hasItems ? money(subtotal + shipping + vat) : 0,
    currency: CURRENCY,
    itemCount: mappedItems.length,
    totalQuantity: mappedItems.reduce((sum, row) => sum + row.quantity, 0),
  }
}

/** Cart GET: shipping is 0 until checkout quote (vehicle + delivery address). */
function cartFees(mappedItems, vatRate = 0) {
  const hasItems = mappedItems.length > 0
  const rate = Number(vatRate) || 0
  return {
    shipping: 0,
    shippingQuoted: false,
    // When vatRate > 0, FE applies % on selected subtotal; `vat` is only the fixed fallback amount.
    vat: hasItems && rate <= 0 ? money(VAT_FIXED) : 0,
    vatRate: rate,
    currency: CURRENCY,
  }
}

function maxSellable(inventory) {
  return Math.floor(
    Math.min(
      Number(inventory?.listedQuantity ?? 0),
      Number(inventory?.currentStock ?? 0),
    ),
  )
}

const productCartSelect = {
  id: true,
  sellerId: true,
  title: true,
  sku: true,
  basePrice: true,
  b2bPrice: true,
  unitOfMeasure: true,
  approvalStatus: true,
  categoryId: true,
  category: {
    select: {
      id: true,
      parentCategoryId: true,
      parentCategory: {
        select: { id: true, parentCategoryId: true },
      },
    },
  },
  media: {
    where: { isBanner: true },
    take: 1,
    select: { mediaUrl: true, isBanner: true },
  },
  inventory: {
    select: { listedQuantity: true, currentStock: true },
  },
}

const itemInclude = {
  product: { select: productCartSelect },
}

const promoInclude = {
  applicableProducts: { select: { productId: true } },
  applicableCategories: { select: { categoryId: true } },
}

function ack(status, id, message) {
  return {
    status,
    body: { id, message },
  }
}

function assertPromoUsable(promo, role) {
  if (!promo) throw httpError('Promo code not found', 404, 'PromoNotFound')
  if (!promo.isActive) {
    throw httpError('Promo code is disabled', 400, 'PromoDisabled')
  }
  if (new Date(promo.expiryDate).getTime() < Date.now()) {
    throw httpError('Promo code has expired', 400, 'PromoExpired')
  }
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
    throw httpError('Promo code usage limit reached', 400, 'PromoLimitReached')
  }

  const audience = String(promo.applicableUsers || 'ALL').toUpperCase()
  if (audience === 'CUSTOMER' && role !== 'customer') {
    throw httpError(
      'This promo code is only for customers',
      403,
      'PromoAudienceMismatch',
    )
  }
  if (audience === 'COMPANY' && role !== 'company') {
    throw httpError(
      'This promo code is only for company users',
      403,
      'PromoAudienceMismatch',
    )
  }
}

function isProductEligible(product, promo) {
  const productIds = new Set(
    (promo.applicableProducts || []).map((b) => b.productId),
  )
  if (productIds.has(product.id)) return true

  const categoryIds = new Set(
    (promo.applicableCategories || []).map((b) => b.categoryId),
  )
  if (!categoryIds.size && !productIds.size) return false

  for (const id of productCatalogIds(product)) {
    if (categoryIds.has(id)) return true
  }
  return false
}

/**
 * Line discounts for one promo against original subtotals.
 * PERCENTAGE → each eligible line gets %.
 * FIXED_AMOUNT → pool split proportionally across eligible lines.
 */
function lineDiscountsForPromo(mappedBaseItems, itemsRaw, promo) {
  const eligibleIndexes = []
  itemsRaw.forEach((row, index) => {
    if (isProductEligible(row.product, promo)) eligibleIndexes.push(index)
  })
  if (!eligibleIndexes.length) return null

  const eligibleSubtotals = eligibleIndexes.map(
    (i) =>
      mappedBaseItems[i].promo?.originalSubtotal ?? mappedBaseItems[i].subtotal,
  )
  const eligibleSum = money(eligibleSubtotals.reduce((s, n) => s + n, 0))

  let lineDiscounts = eligibleIndexes.map(() => 0)

  if (promo.discountType === 'PERCENTAGE') {
    lineDiscounts = eligibleSubtotals.map((sub) =>
      money((sub * Number(promo.discountValue)) / 100),
    )
  } else {
    const pool = money(Math.min(Number(promo.discountValue), eligibleSum))
    let allocated = 0
    eligibleSubtotals.forEach((sub, idx) => {
      if (idx === eligibleSubtotals.length - 1) {
        lineDiscounts[idx] = money(pool - allocated)
      } else {
        const share = eligibleSum > 0 ? money((pool * sub) / eligibleSum) : 0
        lineDiscounts[idx] = share
        allocated = money(allocated + share)
      }
    })
  }

  const discountByIndex = new Map()
  eligibleIndexes.forEach((itemIndex, i) => {
    discountByIndex.set(itemIndex, lineDiscounts[i])
  })
  return discountByIndex
}

/**
 * Stack multiple promos. Each code is calculated on original line totals,
 * then discounts are summed per line (capped at originalSubtotal).
 */
function applyPromosToItems(mappedBaseItems, itemsRaw, promos, role, baseUrl) {
  const usable = []
  for (const promo of promos || []) {
    try {
      assertPromoUsable(promo, role)
      usable.push(promo)
    } catch {
      // skip expired/disabled codes silently on GET
    }
  }

  const perLine = itemsRaw.map(() => ({ total: 0, codes: [] }))

  for (const promo of usable) {
    const discountByIndex = lineDiscountsForPromo(
      mappedBaseItems,
      itemsRaw,
      promo,
    )
    if (!discountByIndex) continue

    discountByIndex.forEach((amount, index) => {
      if (!amount) return
      perLine[index].total = money(perLine[index].total + amount)
      perLine[index].codes.push({
        code: promo.code,
        discountAmount: amount,
        discountAmountText: moneyText(amount),
      })
    })
  }

  const mapped = itemsRaw.map((row, index) => {
    const original =
      mappedBaseItems[index].promo?.originalSubtotal ??
      mappedBaseItems[index].subtotal
    const discountAmount = money(Math.min(perLine[index].total, original))
    // If capped, keep code breakdown but scale is already per-code on original;
    // total is capped so UI total stays valid.
    return mapCartItem(row, role, baseUrl, {
      discountAmount,
      codes: perLine[index].codes,
    })
  })

  return {
    mapped,
    appliedPromos: usable.map((p) => ({
      id: p.id,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue,
    })),
  }
}

function assertPromoMatchesCart(mappedBaseItems, itemsRaw, promo) {
  const discountByIndex = lineDiscountsForPromo(
    mappedBaseItems,
    itemsRaw,
    promo,
  )
  if (!discountByIndex) {
    throw httpError(
      'No cart products match this promo code',
      400,
      'PromoNoMatch',
    )
  }
}

class CartService {
  assertBuyer(auth) {
    if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
    const role = String(auth.role || '').toLowerCase()
    if (role !== 'customer' && role !== 'company') {
      throw httpError(
        'Only customer or company can manage cart',
        403,
        'Forbidden',
      )
    }
    return role
  }

  async getOrCreateCart(userId) {
    const existing = await prisma.cart.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    })
    if (existing) return existing
    try {
      return await prisma.cart.create({
        data: { userId },
        select: { id: true, userId: true },
      })
    } catch (err) {
      if (err?.code === 'P2002') {
        return prisma.cart.findUniqueOrThrow({
          where: { userId },
          select: { id: true, userId: true },
        })
      }
      throw err
    }
  }

  async loadCartPromos(cartId) {
    const links = await prisma.cartPromoCode.findMany({
      where: { cartId },
      orderBy: { appliedAt: 'asc' },
      include: {
        promoCode: { include: promoInclude },
      },
    })
    return links.map((l) => l.promoCode).filter(Boolean)
  }

  buildCartPayload(cartId, itemsRaw, role, vatRate, baseUrl, promos) {
    const baseMapped = itemsRaw.map((row) => mapCartItem(row, role, baseUrl))

    if (!promos?.length) {
      return {
        id: cartId,
        promos: [],
        items: baseMapped,
        fees: cartFees(baseMapped, vatRate),
      }
    }

    const { mapped, appliedPromos } = applyPromosToItems(
      baseMapped,
      itemsRaw,
      promos,
      role,
      baseUrl,
    )

    return {
      id: cartId,
      promos: appliedPromos,
      items: mapped,
      fees: cartFees(mapped, vatRate),
    }
  }

  async loadCartPayload(cartId, role, vatRate, baseUrl) {
    const [items, promos] = await Promise.all([
      prisma.cartItem.findMany({
        where: { cartId },
        include: itemInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.loadCartPromos(cartId),
    ])
    return this.buildCartPayload(cartId, items, role, vatRate, baseUrl, promos)
  }

  async resolveVatRate(userVat) {
    return resolveVatRate(userVat)
  }

  async getCart(auth, baseUrl) {
    const role = this.assertBuyer(auth)

    const [cart, user] = await Promise.all([
      this.getOrCreateCart(auth.id),
      prisma.user.findUnique({
        where: { id: auth.id },
        select: { vatRate: true },
      }),
    ])

    const payload = await this.loadCartPayload(
      cart.id,
      role,
      await this.resolveVatRate(user?.vatRate),
      baseUrl,
    )

    return {
      status: 200,
      body: {
        cart: payload,
        message: 'Cart fetched',
      },
    }
  }

  async applyPromoCode(auth, body, baseUrl) {
    const role = this.assertBuyer(auth)
    const code = String(body.code || '').trim()
    if (!code) throw httpError('Promo code is required', 400, 'CodeRequired')

    const [cart, user, promo] = await Promise.all([
      this.getOrCreateCart(auth.id),
      prisma.user.findUnique({
        where: { id: auth.id },
        select: { vatRate: true },
      }),
      prisma.promoCode.findFirst({
        where: { code: { equals: code, mode: 'insensitive' } },
        include: promoInclude,
      }),
    ])

    assertPromoUsable(promo, role)

    const existingLink = await prisma.cartPromoCode.findUnique({
      where: {
        cartId_promoCodeId: { cartId: cart.id, promoCodeId: promo.id },
      },
      select: { cartId: true },
    })
    if (existingLink) {
      throw httpError('Promo code already applied', 409, 'PromoAlreadyApplied')
    }

    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
    })
    if (!items.length) {
      throw httpError('Cart is empty', 400, 'EmptyCart')
    }

    const baseMapped = items.map((row) => mapCartItem(row, role, baseUrl))
    const cartSubtotal = money(
      baseMapped.reduce((s, r) => s + r.subtotal, 0),
    )
    if (cartSubtotal < Number(promo.minOrderAmount || 0)) {
      throw httpError(
        `Minimum order amount is ${promo.minOrderAmount}`,
        400,
        'MinOrderNotMet',
        { minOrderAmount: promo.minOrderAmount, cartSubtotal },
      )
    }

    assertPromoMatchesCart(baseMapped, items, promo)

    await prisma.cartPromoCode.create({
      data: { cartId: cart.id, promoCodeId: promo.id },
    })

    const promos = await this.loadCartPromos(cart.id)
    const payload = this.buildCartPayload(
      cart.id,
      items,
      role,
      await this.resolveVatRate(user?.vatRate),
      baseUrl,
      promos,
    )

    return {
      status: 200,
      body: {
        message: 'Promo code applied',
        cart: payload,
      },
    }
  }

  async removePromoCode(auth, body, baseUrl) {
    const role = this.assertBuyer(auth)
    const code = body?.code != null ? String(body.code).trim() : ''

    const [cart, user] = await Promise.all([
      this.getOrCreateCart(auth.id),
      prisma.user.findUnique({
        where: { id: auth.id },
        select: { vatRate: true },
      }),
    ])

    if (code) {
      const promo = await prisma.promoCode.findFirst({
        where: { code: { equals: code, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!promo) {
        throw httpError('Promo code not found', 404, 'PromoNotFound')
      }
      await prisma.cartPromoCode.deleteMany({
        where: { cartId: cart.id, promoCodeId: promo.id },
      })
    } else {
      await prisma.cartPromoCode.deleteMany({ where: { cartId: cart.id } })
    }

    const payload = await this.loadCartPayload(
      cart.id,
      role,
      await this.resolveVatRate(user?.vatRate),
      baseUrl,
    )

    return {
      status: 200,
      body: {
        message: code ? 'Promo code removed' : 'All promo codes removed',
        cart: payload,
      },
    }
  }

  async addItem(auth, body) {
    this.assertBuyer(auth)
    const quantity = Math.max(1, Number(body.quantity) || 1)
    const productId = body.productId

    const [product, cart] = await Promise.all([
      prisma.product.findFirst({
        where: {
          id: productId,
          approvalStatus: 'APPROVED',
          inventory: { is: { listedQuantity: { gt: 0 } } },
        },
        select: {
          id: true,
          inventory: {
            select: { listedQuantity: true, currentStock: true },
          },
        },
      }),
      this.getOrCreateCart(auth.id),
    ])

    if (!product) {
      throw httpError('Product not found or not available', 404, 'NotFound')
    }

    const maxQty = maxSellable(product.inventory)
    if (maxQty < 1) {
      throw httpError('Product is out of stock', 400, 'OutOfStock')
    }

    const item = await prisma.cartItem.upsert({
      where: {
        cartId_productId: { cartId: cart.id, productId: product.id },
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity,
      },
      update: {
        quantity: { increment: quantity },
      },
      select: { id: true, quantity: true },
    })

    if (item.quantity > maxQty) {
      const previous = item.quantity - quantity
      if (previous < 1) {
        await prisma.cartItem.delete({ where: { id: item.id } })
      } else {
        await prisma.cartItem.update({
          where: { id: item.id },
          data: { quantity: previous },
        })
      }
      throw httpError(
        `Only ${maxQty} unit(s) available`,
        400,
        'InsufficientStock',
        { maxQuantity: maxQty, requested: item.quantity },
      )
    }

    const created = item.quantity === quantity
    return ack(
      created ? 201 : 200,
      item.id,
      created ? 'Product added to cart' : 'Cart item quantity updated',
    )
  }

  async updateItem(auth, itemId, body) {
    this.assertBuyer(auth)
    const cart = await this.getOrCreateCart(auth.id)

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: {
        id: true,
        quantity: true,
        product: {
          select: {
            inventory: {
              select: { listedQuantity: true, currentStock: true },
            },
          },
        },
      },
    })
    if (!item) throw httpError('Cart item not found', 404, 'NotFound')

    const maxQty = maxSellable(item.product.inventory)

    let nextQty = item.quantity
    if (body.action === 'increase') nextQty = item.quantity + 1
    else if (body.action === 'decrease') nextQty = item.quantity - 1
    else if (body.quantity != null) nextQty = Number(body.quantity)

    if (nextQty < 1) {
      await prisma.cartItem.delete({ where: { id: item.id } })
      return ack(200, item.id, 'Item removed from cart')
    }

    if (maxQty > 0 && nextQty > maxQty) {
      throw httpError(
        `Only ${maxQty} unit(s) available`,
        400,
        'InsufficientStock',
        { maxQuantity: maxQty, requested: nextQty },
      )
    }

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: nextQty },
      select: { id: true },
    })

    return ack(200, item.id, 'Cart quantity updated')
  }

  async removeItem(auth, itemId) {
    this.assertBuyer(auth)
    const cart = await this.getOrCreateCart(auth.id)

    const deleted = await prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    })
    if (!deleted.count) {
      throw httpError('Cart item not found', 404, 'NotFound')
    }

    return ack(200, itemId, 'Item removed from cart')
  }

  /**
   * Price a subset of cart lines (checkout preview / place).
   */
  async priceSelection(userId, role, cartItemIds, vatRate, baseUrl) {
    const ids = [...new Set((cartItemIds || []).map(String))]
    if (!ids.length) {
      throw httpError('Select at least one cart item', 400, 'EmptySelection')
    }

    const cart = await prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!cart) {
      throw httpError('Cart is empty', 400, 'EmptyCart')
    }

    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id, id: { in: ids } },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
    })

    if (items.length !== ids.length) {
      throw httpError(
        'One or more cart items were not found',
        400,
        'InvalidCartItems',
      )
    }

    for (const row of items) {
      if (row.product.approvalStatus !== 'APPROVED') {
        throw httpError(
          `Product ${row.product.title} is not available`,
          400,
          'ProductUnavailable',
        )
      }
      const maxQty = maxSellable(row.product.inventory)
      if (row.quantity > maxQty) {
        throw httpError(
          `Only ${maxQty} unit(s) available for ${row.product.title}`,
          400,
          'InsufficientStock',
          { productId: row.product.id, maxQuantity: maxQty },
        )
      }
    }

    const promos = await this.loadCartPromos(cart.id)
    const baseMapped = items.map((row) => mapCartItem(row, role, baseUrl))
    const { mapped, appliedPromos } = applyPromosToItems(
      baseMapped,
      items,
      promos,
      role,
      baseUrl,
    )

    return {
      cartId: cart.id,
      itemsRaw: items,
      items: mapped,
      promos: appliedPromos,
      totals: computeTotals(mapped, vatRate),
    }
  }
}

export default new CartService()