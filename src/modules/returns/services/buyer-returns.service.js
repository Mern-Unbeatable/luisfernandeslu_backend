import {
  createBuyerReturn,
  getBuyerOrder,
  getBuyerReturn,
  listBuyerOrders,
  listBuyerReturns,
} from '../data/returns.store.js'

export class BuyerReturnsService {
  async listOrders() {
    return { status: 200, body: { orders: listBuyerOrders() } }
  }

  async getOrder(orderId) {
    return { status: 200, body: getBuyerOrder(orderId) }
  }

  async listRequests() {
    return { status: 200, body: { returns: listBuyerReturns() } }
  }

  async getRequest(returnId) {
    return { status: 200, body: getBuyerReturn(returnId) }
  }

  async createRequest(auth, body) {
    return { status: 201, body: createBuyerReturn(auth, body) }
  }
}

export default new BuyerReturnsService()
