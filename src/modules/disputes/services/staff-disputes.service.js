import {
  getDispute,
  listStaffDisputes,
  updateDisputeStatus,
} from '../data/disputes.store.js'
import { emitToDispute } from '../../../socket/io.js'

export class StaffDisputesService {
  async list() {
    return { status: 200, body: listStaffDisputes() }
  }

  async getById(disputeId) {
    return { status: 200, body: getDispute(disputeId) }
  }

  async updateStatus(disputeId, status) {
    const updated = updateDisputeStatus(disputeId, status)
    emitToDispute(disputeId, 'dispute:status', { disputeId, status })
    return { status: 200, body: updated }
  }
}

export default new StaffDisputesService()
