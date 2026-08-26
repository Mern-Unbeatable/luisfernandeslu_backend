import rolesPermissionsService from '../services/roles-permissions.service.js'
import { sendServiceResult } from '../../../../utils/apiResponse.js'

export class AdminRolesPermissionsController {
  async get(req, res, next) {
    try {
      return sendServiceResult(res, await rolesPermissionsService.get(req.auth))
    } catch (err) {
      next(err)
    }
  }

  async saveModeratorPermissions(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await rolesPermissionsService.saveModeratorPermissions(
          req.auth,
          req.body,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  async invite(req, res, next) {
    try {
      return sendServiceResult(
        res,
        await rolesPermissionsService.invite(req.auth, req.body),
      )
    } catch (err) {
      next(err)
    }
  }
}

export default new AdminRolesPermissionsController()
