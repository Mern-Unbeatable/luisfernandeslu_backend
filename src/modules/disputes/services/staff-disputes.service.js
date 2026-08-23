import {
  getDispute,
  listStaffDisputes,
  updateDisputeStatus,
} from '../data/disputes.store.js'

export class StaffDisputesService {
  async list() {
    return { status: 200, body: listStaffDisputes() }
  }

  async getById(disputeId) {
    return { status: 200, body: getDispute(disputeId) }
  }

  async updateStatus(disputeId, status) {
    return { status: 200, body: updateDisputeStatus(disputeId, status) }
  }
}

export default new StaffDisputesService()
