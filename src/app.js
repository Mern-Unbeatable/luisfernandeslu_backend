import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth/auth.js'
import authRoutes from './modules/auth/routes/auth.routes.js'
import {
  categoryRoutes,
  subCategoryRoutes,
} from './modules/catalog/routes/catalog.routes.js'
import inventoryRoutes from './modules/inventory/routes/inventory.routes.js'
import productRoutes from './modules/products/routes/product.routes.js'
import promotionRoutes from './modules/promotions/routes/promotion.routes.js'
import adminRoutes from './modules/admin/routes/admin.routes.js'
import { UPLOAD_ROOT } from './modules/auth/upload.js'
import { notFoundHandler } from './middlewares/notFound.middleware.js'
import { globalErrorHandler } from './middlewares/globalError.middleware.js'
import { sendSuccess } from './utils/apiResponse.js'

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const baHandler = toNodeHandler(auth)

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
app.use('/api/inventory', inventoryRoutes)
app.use('/api/products', productRoutes)
app.use('/api/promotions', promotionRoutes)
app.use('/api/admin', adminRoutes)

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
