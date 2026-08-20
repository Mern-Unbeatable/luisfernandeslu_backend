import prisma from '../../../../lib/prisma.js'
import { auth } from '../../../auth/auth.js'
import {
  defaultStatusForRole,
  requiresEmailOtp,
  toUserRole,
} from '../../../auth/roles.js'
import {
  normalizeMulterFiles,
  relocateUploads,
  urlsJsonForField,
} from '../upload.js'
import { formatProfileForResponse } from '../../../lib/requestUrl.js'
import { signAccessToken, signPasswordResetToken, extractBearerToken, verifyAccessToken } from '../../../lib/jwt.js'
import { httpError } from '../../../shared/errors.js'
import { env } from '../../../config/env.js'
import otpService, { OTP_PURPOSE } from './otp.service.js'
import { fromNodeHeaders } from 'better-auth/node'
import { APIError } from 'better-auth/api'
import { hashPassword } from 'better-auth/crypto'

function groupFiles(files = []) {
  const byField = {}
  for (const file of normalizeMulterFiles(files)) {
    const key = file.fieldname
    if (!byField[key]) byField[key] = []
    byField[key].push(file)
  }
  return byField
}

function buildProfileData(roleEnum, body, filesByField) {
  const companyName =
    body.companyName || body.factoryName || body.fullName || null

  const companyCert =
    urlsJsonForField(filesByField, 'companyCertificate') ||
    urlsJsonForField(filesByField, 'factoryCertificate')

  const roleKey = String(roleEnum || '').toLowerCase()
  let verificationStatus = 'PENDING_REVIEW'
  if (roleKey === 'customer' || roleKey === 'company') {
    verificationStatus = 'UNVERIFIED'
  } else if (roleKey === 'affiliate') {
    // Affiliate is auto-approved on register (no admin review)
    verificationStatus = 'APPROVED'
  }

  return {
    companyName,
    nifNumber: body.nif || null,
    ibanNumber: body.iban || null,
    companyCertificateUrl: companyCert,
    commercialRegistrationUrl: urlsJsonForField(filesByField, 'rcbe'),
    ibanProofUrl: urlsJsonForField(filesByField, 'ibanProof'),
    idDocumentUrl: urlsJsonForField(filesByField, 'idDocuments'),
    addressProofUrl: urlsJsonForField(filesByField, 'addressProof'),
    insuranceDocumentUrl: urlsJsonForField(filesByField, 'civilLiability'),
    transporterInsuranceUrl: urlsJsonForField(
      filesByField,
      'transporterCivilLiability',
    ),
    verificationStatus,
  }
}

function displayName(roleParam, body) {
  return (
    body.fullName ||
    body.companyName ||
    body.factoryName ||
    body.email?.split('@')[0] ||
    roleParam
  )
}

function shouldCreateProfile(roleParam, profileData) {
  return (
    Boolean(profileData.nifNumber) ||
    Boolean(profileData.ibanNumber) ||
    Boolean(profileData.companyCertificateUrl) ||
    Boolean(profileData.commercialRegistrationUrl) ||
    Boolean(profileData.ibanProofUrl) ||
    Boolean(profileData.idDocumentUrl) ||
    Boolean(profileData.addressProofUrl) ||
    Boolean(profileData.insuranceDocumentUrl) ||
    Boolean(profileData.transporterInsuranceUrl) ||
    (roleParam !== 'customer' && Boolean(profileData.companyName))
  )
}

const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  phoneNumber: true,
  image: true,
  emailVerified: true,
}

function emailAlreadyRegistered() {
  return httpError(
    'An account with this email already exists',
    409,
    'EmailExists',
  )
}

/**
 * Better Auth with autoSignIn:false returns a synthetic user (fake id) when
 * the email already exists, instead of throwing. Confirm the row is real.
 */
async function resolveCreatedUser(email, returnedUser) {
  const dbUser = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    select: userPublicSelect,
  })

  if (!dbUser) {
    throw httpError('User was not created', 500, 'SignupFailed')
  }

  if (returnedUser?.id && returnedUser.id !== dbUser.id) {
    throw emailAlreadyRegistered()
  }

  return dbUser
}

export class AuthService {
  /**
   * Role-based signup via Better Auth + BusinessProfile.
   * Optimized for remote DB: fewer round-trips, no auto-session, OTP queued.
   */
  async registerByRole({ roleParam, body, files, headers, baseUrl }) {
    const role = toUserRole(roleParam)
    const name = displayName(roleParam, body)
    const phoneNumber = body.phone || body.phoneNumber || null
    // Email OTP ONLY for customer/company email+password signup.
    const needsOtp = requiresEmailOtp(roleParam)
    const refCode = body.referenceCode || body.affiliateCode
    const nodeHeaders = fromNodeHeaders(headers)
    const publicBase =
      baseUrl || env.apiUrl
    const email = String(body.email).trim().toLowerCase()

    const already = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (already) throw emailAlreadyRegistered()

    let signup
    try {
      // OTP path: skip returnHeaders (no session cookies to forward)
      signup = await auth.api.signUpEmail({
        body: {
          email,
          password: body.password,
          name,
          role,
          phoneNumber: phoneNumber || undefined,
        },
        headers: nodeHeaders,
        ...(needsOtp ? {} : { returnHeaders: true }),
      })
    } catch (err) {
      if (err instanceof APIError) {
        const duplicate =
          err.statusCode === 422 ||
          /already exists|duplicate/i.test(String(err.message || ''))
        if (duplicate) throw emailAlreadyRegistered()
        throw httpError(
          err.message || 'Signup failed',
          err.statusCode || 400,
          err.status || 'AuthError',
        )
      }
      throw err
    }

    const payload = signup?.response ?? signup
    const returnedUser = payload?.user ?? payload
    const user = await resolveCreatedUser(email, returnedUser)
    const userId = user.id

    const status = defaultStatusForRole(roleParam)
    const emailVerified = needsOtp ? false : true

    // --- Fast path: customer/company with no files / no referral ---
    // Hook already set status + emailVerified. Only queue OTP (non-blocking).
    const fileList = normalizeMulterFiles(files)
    const hasFiles = fileList.length > 0
    if (needsOtp && !hasFiles && !refCode) {
      const { expiresAt } = otpService.queueEmailVerifyOtp(body.email)
      return {
        status: 201,
        cookies: [],
        body: {
          user: {
            id: userId,
            email: user.email,
            name: user.name,
            role: roleParam,
            status: user.status || status,
            phoneNumber: user.phoneNumber ?? phoneNumber,
            emailVerified: user.emailVerified ?? emailVerified,
          },
          profile: null,
          requiresEmailVerification: true,
          otpExpiresAt: expiresAt,
          message:
            'Registration successful. Check your email for the OTP to verify your account before login.',
        },
      }
    }

    // --- Full path: documents / referral / non-OTP roles ---
    const relocated = relocateUploads(roleParam, userId, fileList)
    const filesByField = groupFiles(relocated)
    const profileData = buildProfileData(role, body, filesByField)
    const createProfile = shouldCreateProfile(roleParam, profileData)

    const parallel = []

    if (refCode) {
      parallel.push(
        prisma.user
          .findFirst({
            where: { referralCode: String(refCode).trim() },
            select: { id: true },
          })
          .then((referrer) =>
            referrer
              ? prisma.user.update({
                  where: { id: userId },
                  data: { referredById: referrer.id },
                  select: { id: true },
                })
              : null,
          ),
      )
    }

    if (createProfile) {
      parallel.push(
        prisma.businessProfile
          .upsert({
            where: { userId },
            create: { userId, ...profileData },
            update: profileData,
          })
          .catch((err) => {
            if (err?.code === 'P2003') throw emailAlreadyRegistered()
            throw err
          }),
      )
    }

    let otpExpiresAt = null
    if (needsOtp) {
      // Non-blocking OTP (same as fast path)
      const issued = otpService.queueEmailVerifyOtp(body.email)
      otpExpiresAt = issued.expiresAt
    }

    const results = parallel.length ? await Promise.all(parallel) : []
    let profile = createProfile
      ? results[refCode ? 1 : 0] || null
      : null

    // If profile upsert didn't run but we built data, still format from memory
    if (!profile && createProfile) {
      profile = { userId, ...profileData }
    }

    const profileResponse = formatProfileForResponse(
      profile,
      publicBase,
      roleParam,
    )

    // Non-OTP roles: issue access token (no cookie auth for API clients)
    let accessToken = null
    if (!needsOtp) {
      // Keep Better Auth credential account in sync; ignore cookie session
      try {
        await auth.api.signInEmail({
          body: { email: body.email, password: body.password },
          headers: nodeHeaders,
        })
      } catch {
        // Account exists; token still issued below
      }

      accessToken = signAccessToken({
        id: userId,
        email: user.email,
        name: user.name,
        role: roleParam,
        status: user.status || status,
      })
    }

    return {
      status: 201,
      cookies: [],
      body: {
        accessToken,
        tokenType: accessToken ? 'Bearer' : null,
        user: {
          id: userId,
          email: user.email,
          name: user.name,
          role: roleParam,
          status: user.status || status,
          phoneNumber: user.phoneNumber ?? phoneNumber,
          emailVerified: user.emailVerified ?? emailVerified,
        },
        profile: profileResponse,
        requiresEmailVerification: needsOtp,
        otpExpiresAt,
        message: needsOtp
          ? 'Registration successful. Check your email for the OTP to verify your account before login.'
          : 'Registration successful',
      },
    }
  }

  /**
   * Role-aware email/password login.
   * Customer/company must verify email OTP first.
   */
  async loginByRole({ roleParam, body, headers, baseUrl }) {
    const expectedRole = toUserRole(roleParam)
    const publicBase =
      baseUrl || env.apiUrl

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        ...userPublicSelect,
        profile: true,
      },
    })

    if (!existing) {
      throw httpError('Invalid email', 401, 'InvalidEmail')
    }

    if (existing.role !== expectedRole) {
      throw httpError(
        `This account is registered as ${String(existing.role).toLowerCase()}, not ${roleParam}`,
        403,
        'WrongRole',
      )
    }

    if (existing.status === 'BLOCKED' || existing.status === 'SUSPENDED') {
      throw httpError(
        `Account is ${String(existing.status).toLowerCase()}`,
        403,
        'AccountDisabled',
      )
    }

    if (requiresEmailOtp(roleParam) && !existing.emailVerified) {
      // Resend OTP without blocking the error response
      otpService.queueEmailVerifyOtp(existing.email)
      throw httpError(
        'Email not verified. We sent a new OTP to your email.',
        403,
        'EmailNotVerified',
      )
    }

    let signIn
    try {
      signIn = await auth.api.signInEmail({
        body: {
          email: body.email,
          password: body.password,
        },
        headers: fromNodeHeaders(headers),
      })
    } catch (err) {
      if (err instanceof APIError) {
        throw httpError(
          'Invalid password',
          err.statusCode || 401,
          'InvalidPassword',
        )
      }
      throw err
    }

    const payload = signIn?.user ? signIn : signIn?.response ?? signIn
    const user = payload?.user ?? existing
    const role = roleParam

    const accessToken = signAccessToken({
      id: existing.id,
      email: user.email || existing.email,
      name: user.name || existing.name,
      role,
      status: existing.status,
    })

    return {
      status: 200,
      cookies: [],
      body: {
        accessToken,
        tokenType: 'Bearer',
        user: {
          id: existing.id,
          email: user.email || existing.email,
          name: user.name || existing.name,
          role,
          status: existing.status,
          phoneNumber: existing.phoneNumber,
          image: existing.image,
          emailVerified: existing.emailVerified,
        },
        profile: formatProfileForResponse(
          existing.profile,
          publicBase,
          role,
        ),
        message: 'Login successful',
      },
    }
  }

  /**
   * Verify email OTP for customer/company after register.
   * Marks emailVerified + ACTIVE; client then logs in.
   */
  async verifyEmailOtp({ email, otp, role }) {
    const existing = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: userPublicSelect,
    })

    if (!existing) {
      throw httpError('User not found', 404, 'UserNotFound')
    }

    if (role && toUserRole(role) !== existing.role) {
      throw httpError('Role does not match this account', 403, 'WrongRole')
    }

    if (!requiresEmailOtp(String(existing.role).toLowerCase())) {
      throw httpError(
        'OTP verification is only for customer and company accounts',
        400,
        'OtpNotRequired',
      )
    }

    if (existing.emailVerified) {
      return {
        status: 200,
        body: {
          user: {
            id: existing.id,
            email: existing.email,
            name: existing.name,
            role: String(existing.role).toLowerCase(),
            status: existing.status,
            emailVerified: true,
          },
          message: 'Email already verified. You can log in.',
        },
      }
    }

    await otpService.verifyEmailOtp(existing.email, otp)

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        emailVerified: true,
        status: 'ACTIVE',
      },
      select: userPublicSelect,
    })

    return {
      status: 200,
      body: {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: String(updated.role).toLowerCase(),
          status: updated.status,
          emailVerified: true,
        },
        message: 'Email verified successfully. You can now log in.',
      },
    }
  }

  async resendEmailOtp({ email, role }) {
    const existing = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: userPublicSelect,
    })

    if (!existing) {
      // Avoid email enumeration — same generic success
      return {
        status: 200,
        body: { message: 'If the account exists, a new OTP was sent.' },
      }
    }

    if (role && toUserRole(role) !== existing.role) {
      throw httpError('Role does not match this account', 403, 'WrongRole')
    }

    if (!requiresEmailOtp(String(existing.role).toLowerCase())) {
      throw httpError(
        'OTP is only for customer and company accounts',
        400,
        'OtpNotRequired',
      )
    }

    if (existing.emailVerified) {
      return {
        status: 200,
        body: { message: 'Email already verified. You can log in.' },
      }
    }

    const issued = otpService.queueEmailVerifyOtp(existing.email)

    return {
      status: 200,
      body: {
        message: 'OTP sent to your email',
        otpExpiresAt: issued.expiresAt,
      },
    }
  }

  /**
   * Step 1 — Forgot password: send 5-digit OTP to email.
   * Always returns the same message (no email enumeration).
   */
  async forgotPassword({ email }) {
    const normalized = String(email).trim().toLowerCase()
    const existing = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true },
    })

    // Always return same shape (no email enumeration via otpExpiresAt)
    const otpExpiresAt = otpService.nextExpiry()
    if (existing) {
      otpService.queuePasswordResetOtp(normalized)
    }

    return {
      status: 200,
      body: {
        message:
          'If an account exists for this email, a 5-digit code has been sent.',
        otpExpiresAt,
      },
    }
  }

  /**
   * Step 2 — Verify forgot-password OTP (does not consume; reset will).
   */
  async verifyResetOtp({ email, otp }) {
    const normalized = String(email).trim().toLowerCase()
    const existing = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true },
    })

    if (!existing) {
      throw httpError('Invalid email or OTP', 400, 'InvalidOtp')
    }

    await otpService.verifyPasswordResetOtp(normalized, otp, { keep: true })

    const resetToken = signPasswordResetToken({
      id: existing.id,
      email: existing.email,
    })

    return {
      status: 200,
      body: {
        resetToken,
        email: existing.email,
        message: 'OTP verified. You can now set a new password.',
      },
    }
  }

  /**
   * Step 3 — Reset password.
   * Accepts either { email, otp, password } or { resetToken, password }.
   */
  async resetPassword(body) {
    let userId = null
    let email = null
    let consumeOtpAfter = false

    if (body.resetToken) {
      let payload
      try {
        payload = verifyAccessToken(body.resetToken)
      } catch {
        throw httpError('Invalid or expired reset token', 400, 'InvalidResetToken')
      }
      if (payload.role !== 'password_reset') {
        throw httpError('Invalid reset token', 400, 'InvalidResetToken')
      }
      userId = payload.id || payload.sub
      email = payload.email
      consumeOtpAfter = true
    } else {
      email = String(body.email || '')
        .trim()
        .toLowerCase()
      await otpService.verifyPasswordResetOtp(email, body.otp)
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      })
      if (!existing) {
        throw httpError('Invalid email or OTP', 400, 'InvalidOtp')
      }
      userId = existing.id
    }

    const hashed = await hashPassword(body.password)

    const updated = await prisma.account.updateMany({
      where: {
        userId,
        providerId: 'credential',
      },
      data: {
        password: hashed,
      },
    })

    if (!updated.count) {
      throw httpError(
        'No password account found for this user. Try social login or contact support.',
        400,
        'NoCredentialAccount',
      )
    }

    if (consumeOtpAfter) {
      await otpService.consumePasswordResetOtp(email)
    }

    await prisma.session.deleteMany({ where: { userId } })

    return {
      status: 200,
      body: {
        message: 'Password reset successful. You can now log in.',
      },
    }
  }

  async logout(_headers) {
    // Stateless JWT — client discards accessToken. No server session to clear.
    return {
      status: 200,
      cookies: [],
      body: { message: 'Logged out successfully. Discard the access token on the client.' },
    }
  }

  async getMe(headers, baseUrl) {
    const publicBase =
      baseUrl || env.apiUrl

    const token = extractBearerToken(headers)
    if (!token) {
      throw httpError(
        'Access token required. Send Authorization: Bearer <token>',
        401,
        'Unauthorized',
      )
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch (err) {
      throw httpError(
        err.name === 'TokenExpiredError'
          ? 'Access token expired'
          : 'Invalid access token',
        401,
        'Unauthorized',
      )
    }

    const userId = payload.id || payload.sub
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userPublicSelect,
        profile: true,
      },
    })

    if (!dbUser) {
      throw httpError('User not found', 401, 'Unauthorized')
    }

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: String(dbUser.role).toLowerCase(),
        status: dbUser.status,
        phoneNumber: dbUser.phoneNumber,
        image: dbUser.image,
        emailVerified: dbUser.emailVerified,
      },
      profile: formatProfileForResponse(
        dbUser.profile || null,
        publicBase,
        dbUser.role,
      ),
    }
  }
}

export default new AuthService()
