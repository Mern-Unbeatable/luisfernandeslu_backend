import productService from '../services/product.service.js'
import { sendError, sendServiceResult } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

export class ProductController {
  async lookupBySku(req, res, next) {
    try {
      const result = await productService.lookupBySku(
        req.auth,
        req.query.sku,
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async list(req, res, next) {
    try {
      const result = await productService.list(
        req.auth,
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      const result = await productService.getById(
        req.auth,
        req.params.id,
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async generateAi(req, res, next) {
    try {
      const result = await productService.generateAi(req.auth, req.body)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      const result = await productService.create(
        req.auth,
        req.body,
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const result = await productService.update(
        req.auth,
        req.params.id,
        req.body,
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async resubmit(req, res, next) {
    try {
      const result = await productService.resubmit(
        req.auth,
        req.params.id,
        req.body || {},
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async cancelListing(req, res, next) {
    try {
      const result = await productService.cancelListing(req.auth, req.params.id)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async downloadCsvTemplate(req, res, next) {
    try {
      const file = productService.getCsvTemplate()
      res.setHeader('Content-Type', file.contentType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`,
      )
      res.setHeader('X-CSV-Headers', file.headers.join(','))
      return res.status(200).send(file.body)
    } catch (err) {
      next(err)
    }
  }

  async downloadCategoryGuidePdf(req, res, next) {
    try {
      const file = await productService.getCategoryGuidePdf()
      res.setHeader('Content-Type', file.contentType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`,
      )
      return res.status(200).send(file.body)
    } catch (err) {
      next(err)
    }
  }

  async importCsv(req, res, next) {
    try {
      const file = req.file
      if (!file?.buffer) {
        return sendError(res, 400, 'Upload a CSV file in field "file"', {
          error: 'CsvRequired',
        })
      }
      const result = await productService.importCsv(req.auth, file.buffer)
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async adminList(req, res, next) {
    try {
      const result = await productService.adminList(
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendServiceResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async adminGetById(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await productService.adminGetById(req.params.id, resolveRequestBaseUrl(req)),
      )
    } catch (err) {
      next(err)
    }
  }

  async adminModerate(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await productService.adminModerate(req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new ProductController()
