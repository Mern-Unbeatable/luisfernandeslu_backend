import auctionService from '../services/auction.service.js'
import { sendServiceResult } from '../../../utils/apiResponse.js'

class AuctionController {
  async getCreateInfoForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getCreateInfoForSupplier(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async createForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.createForSupplier(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async listActiveForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForSupplier(req.auth, 'active', req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listAssignedForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForSupplier(req.auth, 'assigned', req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getActiveForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getForSupplier(req.auth, req.params.id, 'active'),
      )
    } catch (err) {
      next(err)
    }
  }

  async getAssignedForSupplier(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getForSupplier(req.auth, req.params.id, 'assigned'),
      )
    } catch (err) {
      next(err)
    }
  }

  async listForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForTransporter(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listForAdmin(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForAdmin(req.auth, req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getForTransporter(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async bidForTransporter(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.bidForTransporter(req.auth, req.params.id, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async getFactoryCreateInfo(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getFactoryCreateInfo(req.auth, req.params.orderId),
      )
    } catch (err) {
      next(err)
    }
  }

  async createFactoryAuction(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.createFactoryAuction(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }

  async confirmFactoryAuctionPayment(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.confirmFactoryAuctionPayment(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async declineFactoryAuctionPayment(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.declineFactoryAuctionPayment(req.auth, req.params.id),
      )
    } catch (err) {
      next(err)
    }
  }

  async listActiveForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForFactory(req.auth, 'active', req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async listAssignedForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.listForFactory(req.auth, 'assigned', req.query),
      )
    } catch (err) {
      next(err)
    }
  }

  async getActiveForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getForFactory(req.auth, req.params.id, 'active'),
      )
    } catch (err) {
      next(err)
    }
  }

  async getAssignedForFactory(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await auctionService.getForFactory(req.auth, req.params.id, 'assigned'),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AuctionController()
