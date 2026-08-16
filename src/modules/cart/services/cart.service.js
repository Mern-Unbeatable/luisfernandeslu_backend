import prisma from '../../../../lib/prisma.js'
import { AppError } from '../../../utils/AppError.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'

function httpError(message, status = 400, code = 'Error', details) {
  return new AppError(message, status, code, details)
}

const SHIPPING_FEE = Number(process.env.CART_SHIPPING_FEE || 20)
const VAT_FIXED = Number(process.env.CART_VAT_FIXED || 4)
const CURRENCY = process.env.CART_CURRENCY || 'EUR'

function money(n) {
  return Number(Number(n).toFixed(2))
}

function unitPriceForBuyer(product, role) {
  if (role === 'company' && product.b2bPrice != null) {
    return money(product.b2bPrice)
  }
  return money(product.basePrice)
}

function mapCartItem(item, role, baseUrl) {
  const product = item.product
  const banner = (product.media || []).find((m) => m.isBanner)
  const unitPrice = unitPriceForBuyer(product, role)
  const quantity = item.quantity

  return {
    id: item.id,
    productId: product.id,
    title: product.title,
    sku: product.sku,
    image: banner ? absolutizeUrl(banner.mediaUrl, baseUrl) : null,
    unitOfMeasure: product.unitOfMeasure || 'bag',
    compareAtPrice: money(product.basePrice),
    unitPrice,
    price: unitPrice,
    quantity,
    subtotal: money(unitPrice * quantity),
    companyPrice:
      role === 'company' && product.b2bPrice != null
        ? money(product.b2bPrice)
        : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function computeTotals(mappedItems, vatRate = 0) {
  const subtotal = money(
    mappedItems.reduce((sum, row) => sum + row.subtotal, 0),
  )
  const hasItems = mappedItems.length > 0
  const shipping = hasItems ? money(SHIPPING_FEE) : 0
  const vat = hasItems
    ? vatRate > 0
      ? money((subtotal * Number(vatRate)) / 100)
      : money(VAT_FIXED)
    : 0

  return {
    subtotal,
    shipping,
    vat,
    total: hasItems ? money(subtotal + shipping + vat) : 0,
    currency: CURRENCY,
    itemCount: mappedItems.length,
    totalQuantity: mappedItems.reduce((sum, row) => sum + row.quantity, 0),
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
  title: true,
  sku: true,
  basePrice: true,
  b2bPrice: true,
  unitOfMeasure: true,
  approvalStatus: true,
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

/** Mutation ACK — only id + message (success/statusCode added by sendSuccess) */
function ack(status, id, message) {
  return {
    status,
    body: { id, message },
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

  async loadCartPayload(cartId, role, vatRate, baseUrl) {
    const items = await prisma.cartItem.findMany({
      where: { cartId },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
    })
    const mapped = items.map((row) => mapCartItem(row, role, baseUrl))
    return {
      id: cartId,
      items: mapped,
      totals: computeTotals(mapped, vatRate),
    }
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
      user?.vatRate ?? 0,
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
}

export default new CartService()
