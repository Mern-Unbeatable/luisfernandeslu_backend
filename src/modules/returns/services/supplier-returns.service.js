import {
  getSupplierReturn,
  listSupplierReturns,
  updateSupplierReturnStatus,
} from '../data/returns.store.js'

export class SupplierReturnsService {
  async list() {
    return { status: 200, body: listSupplierReturns() }
  }

  async getById(returnId) {
    return { status: 200, body: getSupplierReturn(returnId) }
  }

  async updateStatus(returnId, status) {
    return {
      status: 200,
      body: updateSupplierReturnStatus(returnId, status),
    }
  }
}

export default new SupplierReturnsService()
