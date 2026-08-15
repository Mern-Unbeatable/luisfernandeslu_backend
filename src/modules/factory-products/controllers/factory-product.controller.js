import factoryProductService from '../services/factory-product.service.js'
import { sendSuccess } from '../../../utils/apiResponse.js'
import { resolveRequestBaseUrl } from '../../../lib/requestUrl.js'

function sendResult(res, result) {
  const { message, ...data } = result.body || {}
  return sendSuccess(res, result.status, data, message)
}

export class FactoryProductController {
  async list(req, res, next) {
    try {
      const result = await factoryProductService.list(
        req.auth,
        req.query,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async getById(req, res, next) {
    try {
      const result = await factoryProductService.getById(
        req.auth,
        req.params.id,
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async generateAi(req, res, next) {
    try {
      const result = await factoryProductService.generateAi(req.auth, req.body)
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async create(req, res, next) {
    try {
      const result = await factoryProductService.create(
        req.auth,
        req.body,
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const result = await factoryProductService.update(
        req.auth,
        req.params.id,
        req.body,
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async resubmit(req, res, next) {
    try {
      const result = await factoryProductService.resubmit(
        req.auth,
        req.params.id,
        req.body || {},
        req.files || {},
        resolveRequestBaseUrl(req),
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async cancel(req, res, next) {
    try {
      const result = await factoryProductService.cancel(
        req.auth,
        req.params.id,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async remove(req, res, next) {
    try {
      const result = await factoryProductService.remove(
        req.auth,
        req.params.id,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }

  async downloadCsvTemplate(req, res, next) {
    try {
      const file = factoryProductService.getCsvTemplate()
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
      const file = await factoryProductService.getCategoryGuidePdf()
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
        return res.status(400).json({
          success: false,
          statusCode: 400,
          error: 'CsvRequired',
          message: 'Upload a CSV file in field "file"',
        })
      }
      const result = await factoryProductService.importCsv(
        req.auth,
        file.buffer,
      )
      return sendResult(res, result)
    } catch (err) {
      next(err)
    }
  }
}

export default new FactoryProductController()
