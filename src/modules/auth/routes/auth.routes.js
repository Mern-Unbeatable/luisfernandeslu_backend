import { Router } from 'express'
import authController from '../controllers/auth.controller.js'
import { upload } from '../upload.js'
import {
  FILE_FIELDS,
  forgotPasswordBodySchema,
  loginBodySchema,
  loginRoleParamSchema,
  registerSchemasByRole,
  resendOtpBodySchema,
  resetPasswordBodySchema,
  roleParamSchema,
  verifyOtpBodySchema,
  verifyResetOtpBodySchema,
} from '../validations/auth.validation.js'
import {
  validate,
  validateRegisterBody,
} from '../../../middlewares/validate.middleware.js'
import { requireAccessToken } from '../../../middlewares/auth.middleware.js'

class AuthRoutes {
  constructor() {
    this.router = Router()
    this.initRoutes()
  }

  initRoutes() {
    this.router.post(
      '/register/:role',
      upload.fields(FILE_FIELDS),
      validate(roleParamSchema, 'params'),
      validateRegisterBody(registerSchemasByRole),
      (req, res, next) => authController.registerByRole(req, res, next),
    )

    this.router.post(
      '/login/:role',
      validate(loginRoleParamSchema, 'params'),
      validate(loginBodySchema, 'body'),
      (req, res, next) => authController.loginByRole(req, res, next),
    )

    this.router.post(
      '/verify-otp',
      validate(verifyOtpBodySchema, 'body'),
      (req, res, next) => authController.verifyEmailOtp(req, res, next),
    )

    this.router.post(
      '/resend-otp',
      validate(resendOtpBodySchema, 'body'),
      (req, res, next) => authController.resendEmailOtp(req, res, next),
    )

    this.router.post(
      '/forgot-password',
      validate(forgotPasswordBodySchema, 'body'),
      (req, res, next) => authController.forgotPassword(req, res, next),
    )

    this.router.post(
      '/verify-reset-otp',
      validate(verifyResetOtpBodySchema, 'body'),
      (req, res, next) => authController.verifyResetOtp(req, res, next),
    )

    this.router.post(
      '/reset-password',
      validate(resetPasswordBodySchema, 'body'),
      (req, res, next) => authController.resetPassword(req, res, next),
    )

    this.router.post('/logout', (req, res, next) =>
      authController.logout(req, res, next),
    )

    // Shared middleware — reusable on any module route
    this.router.get(
      '/me',
      requireAccessToken,
      (req, res, next) => authController.getMe(req, res, next),
    )
  }

  getRoutes() {
    return this.router
  }
}

export default new AuthRoutes().getRoutes()
