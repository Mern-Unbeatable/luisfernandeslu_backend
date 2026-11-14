import express, { Router } from 'express'
import { z } from 'zod'
import filesService from './files.service.js'
import { validate } from '../../middlewares/validate.middleware.js'
import { requireAccessToken } from '../../middlewares/auth.middleware.js'
import { sendServiceResult } from '../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../lib/requestUrl.js'
import {
  UPLOAD_ROOT,
  isPrivateUploadKey,
  isR2Enabled,
  normalizeUploadKey,
  r2PublicUrl,
  r2SignedUrl,
  verifyLocalSignature,
} from '../../shared/storage.js'

const signedUrlQuerySchema = z.object({ url: z.string().trim().min(1).max(2000) })

/** Mounted at `/api/files`. */
export const filesRoutes = Router()
filesRoutes.get(
  '/signed-url',
  requireAccessToken,
  validate(signedUrlQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      return sendServiceResult(
        res,
        await filesService.signedUrl(req.auth, req.query.url, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  },
)

const serveLocal = express.static(UPLOAD_ROOT, {
  setHeaders(res) {
    if (res.req.uploadPrivate) res.setHeader('Cache-Control', 'private, no-store')
  },
})

/**
 * Mounted at `/uploads`. Local files are served from disk; anything missing is
 * redirected to R2. Private folders need a signed link from `/api/files/signed-url`.
 */
export const uploadsRoutes = Router()
uploadsRoutes.use((req, res, next) => {
  let key
  try {
    key = normalizeUploadKey(decodeURIComponent(req.path))
  } catch {
    key = null
  }
  if (!key) return res.status(404).end()
  req.uploadKey = key
  req.uploadPrivate = isPrivateUploadKey(key)
  if (
    req.uploadPrivate &&
    !verifyLocalSignature(key, req.query.exp, req.query.sig)
  ) {
    return res.status(403).json({
      success: false,
      message: 'This file needs a signed link',
      error: 'Forbidden',
    })
  }
  next()
})
uploadsRoutes.use(serveLocal)
uploadsRoutes.use(async (req, res, next) => {
  if (!isR2Enabled()) return res.status(404).end()
  try {
    if (req.uploadPrivate) {
      res.set('Cache-Control', 'private, no-store')
      return res.redirect(302, await r2SignedUrl(req.uploadKey))
    }
    res.set('Cache-Control', 'public, max-age=86400')
    return res.redirect(302, r2PublicUrl(req.uploadKey))
  } catch (err) {
    next(err)
  }
})
