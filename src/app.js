import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth/auth.js'
import authRoutes from './modules/auth/routes/auth.routes.js'
import {
  categoryRoutes,
  subCategoryRoutes,
} from './modules/catalog/routes/catalog.routes.js'
import marketplaceRoutes from './modules/marketplace/routes/marketplace.routes.js'
import quoteRoutes from './modules/quotes/routes/quote.routes.js'
import marketplaceQuoteRoutes from './modules/quotes/routes/marketplace-quote.routes.js'
import cartRoutes from './modules/cart/routes/cart.routes.js'
import addressRoutes from './modules/addresses/routes/address.routes.js'
import checkoutRoutes from './modules/checkout/routes/checkout.routes.js'
import inventoryRoutes from './modules/inventory/routes/inventory.routes.js'
import productRoutes from './modules/products/routes/product.routes.js'
import adminUserRoutes from './modules/admin/users/routes/user.routes.js'
import adminSupplierRoutes from './modules/admin/suppliers/routes/supplier.routes.js'
import adminFactoryRoutes from './modules/admin/factories/routes/factory.routes.js'
import adminTransporterRoutes from './modules/admin/transporters/routes/transporter.routes.js'
import adminAuctionRoutes from './modules/admin/auctions/routes/auction.routes.js'
import adminOrderRoutes from './modules/admin/orders/routes/order.routes.js'
import productAdminRoutes from './modules/products/routes/admin.routes.js'
import factoryProductRoutes from './modules/listings/routes/factory-product.routes.js'
import promotionRoutes from './modules/promotions/routes/promotion.routes.js'
import promotionProductRoutes from './modules/promotions/routes/supplier-product.routes.js'
import promotionAdminRoutes from './modules/promotions/routes/admin.routes.js'
import promoCodeRoutes from './modules/promo-codes/routes/promo-code.routes.js'
import supplierCustomerOrderRoutes from './modules/orders/routes/customer-order.routes.js'
import supplierCompanyOrderRoutes from './modules/orders/routes/company-order.routes.js'
import supplierDocumentRoutes from './modules/invoicing/routes/document.routes.js'
import supplierFactoryCatalogRoutes from './modules/listings/routes/factory-catalog.routes.js'
import supplierFactoryOrderRoutes from './modules/orders/routes/supplier-factory-order.routes.js'
import factoryOrderRoutes from './modules/orders/routes/factory-order.routes.js'
import factoryOfferRoutes from './modules/offers/routes/factory-offer.routes.js'
import erpApiKeysRoutes from './modules/supplier-erp/routes/api-keys.routes.js'
import supplierErpInventoryRoutes from './modules/supplier-erp/routes/inventory-erp.routes.js'
import supplierAuctionRoutes from './modules/auctions/routes/supplier-auction.routes.js'
import factoryAuctionRoutes from './modules/auctions/routes/factory-auction.routes.js'
import transporterAuctionRoutes from './modules/auctions/routes/transporter-auction.routes.js'
import transporterDeliveryRoutes from './modules/auctions/routes/transporter-delivery.routes.js'
import buyerOrderRoutes from './modules/orders/routes/buyer-order.routes.js'
import { UPLOAD_ROOT } from './shared/storage.js'
import { notFoundHandler } from './middlewares/notFound.middleware.js'
import { globalErrorHandler } from './middlewares/globalError.middleware.js'
import { sendSuccess } from './utils/apiResponse.js'
import { env } from './config/env.js'

const frontendUrl = env.frontendUrl
const baHandler = toNodeHandler(auth)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

app.set('trust proxy', 1)

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

/**
 * Better Auth handler for /api/auth/*
 * Skip custom endpoints handled by authRoutes.
 */
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/auth')) return next()
  if (
    req.path.startsWith('/api/auth/register') ||
    req.path.startsWith('/api/auth/login') ||
    req.path === '/api/auth/logout' ||
    req.path === '/api/auth/me' ||
    req.path === '/api/auth/verify-otp' ||
    req.path === '/api/auth/resend-otp' ||
    req.path === '/api/auth/forgot-password' ||
    req.path === '/api/auth/verify-reset-otp' ||
    req.path === '/api/auth/reset-password'
  ) {
    return next()
  }
  return baHandler(req, res)
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/uploads', express.static(UPLOAD_ROOT))

app.use('/api/auth', authRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/subcategories', subCategoryRoutes)
app.use('/api/marketplace/products', marketplaceRoutes)
app.use('/api/marketplace/products', marketplaceQuoteRoutes)
app.use('/api/quotes', quoteRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/addresses', addressRoutes)
app.use('/api/checkout', checkoutRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/products', productRoutes)
app.use('/api/products', promotionProductRoutes)
app.use('/api/factory/products', factoryProductRoutes)
app.use('/api/promotions', promotionRoutes)
app.use('/api/promo-codes', promoCodeRoutes)
app.use('/api/supplier/customer-orders', supplierCustomerOrderRoutes)
app.use('/api/supplier/company-orders', supplierCompanyOrderRoutes)
app.use('/api/supplier/documents', supplierDocumentRoutes)
app.use('/api/supplier/factory-products', supplierFactoryCatalogRoutes)
app.use('/api/supplier/factory-orders', supplierFactoryOrderRoutes)
app.use('/api/factory/orders', factoryOrderRoutes)
app.use('/api/supplier/erp/api-keys', erpApiKeysRoutes)
app.use('/api/supplier/erp/inventory', supplierErpInventoryRoutes)
app.use('/api/supplier/auctions', supplierAuctionRoutes)
app.use('/api/factory/auctions', factoryAuctionRoutes)
app.use('/api/transporter/auctions', transporterAuctionRoutes)
app.use('/api/transporter/deliveries', transporterDeliveryRoutes)
app.use('/api/customer/orders', buyerOrderRoutes)
app.use('/api/factory-offers', factoryOfferRoutes)
app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/suppliers', adminSupplierRoutes)
app.use('/api/admin/factories', adminFactoryRoutes)
app.use('/api/admin/transporters', adminTransporterRoutes)
app.use('/api/admin/auctions', adminAuctionRoutes)
app.use('/api/admin/orders', adminOrderRoutes)
app.use('/api/admin', productAdminRoutes)
app.use('/api/admin', promotionAdminRoutes)

app.get('/live-chat-tester.html', (req, res) => {
  return res.sendFile(
    path.resolve(__dirname, '../live-chat-tester.html'),
  )
})

app.get('/', (req, res) => {
  return sendSuccess(
    res,
    200,
    {
      status: 'OK',
      version: '1.0.0',
      Email: 'shanjidahmed66@gmail.com',
      timestamp: new Date().toISOString(),
    },
    'Welcome to the API',
  )
})

app.get('/health', (req, res) => {
  return sendSuccess(
    res,
    200,
    {
      status: 'OK',
      timestamp: new Date().toISOString(),
    },
    'Server is running',
  )
})

app.use(notFoundHandler)
app.use(globalErrorHandler)

export default app
