import crypto from 'node:crypto'
import prisma from '../../../../lib/prisma.js'
import { sendOtpEmail } from '../../../lib/mail.js'

export const OTP_PURPOSE = {
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  PASSWORD_RESET: 'PASSWORD_RESET',
}

export const OTP_TTL_MS = 10 * 60 * 1000

function hashOtp(otp) {
  const secret = process.env.BETTER_AUTH_SECRET || 'otp-dev-secret'
  return crypto.createHmac('sha256', secret).update(String(otp)).digest('hex')
}

/** 5-digit OTP (registration + forgot password). Inclusive 10000–99999. */
function generateOtp() {
  return String(crypto.randomInt(10000, 100000))
}

export class OtpService {
  nextExpiry() {
    return new Date(Date.now() + OTP_TTL_MS)
  }

  /**
   * Persist OTP + send email.
   * @param {string} email
   * @param {string} purpose EMAIL_VERIFY | PASSWORD_RESET
   * @param {Date} [expiresAt]
   */
  async issueOtp(email, purpose, expiresAt = this.nextExpiry()) {
    const otp = generateOtp()
    const otpHash = hashOtp(otp)
    const normalized = String(email).trim().toLowerCase()

    await prisma.emailOtp.upsert({
      where: {
        email_purpose: { email: normalized, purpose },
      },
      create: {
        email: normalized,
        otpHash,
        purpose,
        expiresAt,
      },
      update: {
        otpHash,
        expiresAt,
      },
    })

    const mailPurpose =
      purpose === OTP_PURPOSE.PASSWORD_RESET ? 'reset' : 'verify'

    try {
      await sendOtpEmail(normalized, otp, mailPurpose)
    } catch (err) {
      console.error('[otp] email delivery failed:', err.message)
    }

    return { expiresAt }
  }

  /** Non-blocking queue — returns expiresAt immediately. */
  queueOtp(email, purpose) {
    const expiresAt = this.nextExpiry()
    void this.issueOtp(email, purpose, expiresAt).catch((err) => {
      console.error('[otp] failed to persist/send OTP:', err.message)
    })
    return { expiresAt }
  }

  queueEmailVerifyOtp(email) {
    return this.queueOtp(email, OTP_PURPOSE.EMAIL_VERIFY)
  }

  queuePasswordResetOtp(email) {
    return this.queueOtp(email, OTP_PURPOSE.PASSWORD_RESET)
  }

  async issueEmailVerifyOtp(email, expiresAt) {
    return this.issueOtp(email, OTP_PURPOSE.EMAIL_VERIFY, expiresAt)
  }

  /**
   * Verify OTP. By default deletes the record after success.
   * @param {{ keep?: boolean }} [options] keep=true → leave OTP for a follow-up reset step
   */
  async verifyOtp(email, otp, purpose, options = {}) {
    const normalized = String(email).trim().toLowerCase()
    const record = await prisma.emailOtp.findUnique({
      where: {
        email_purpose: { email: normalized, purpose },
      },
    })

    if (!record) {
      const err = new Error('No OTP found for this email. Request a new code.')
      err.status = 400
      err.code = 'OtpNotFound'
      throw err
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await prisma.emailOtp.delete({ where: { id: record.id } }).catch(() => {})
      const err = new Error('OTP expired. Request a new code.')
      err.status = 400
      err.code = 'OtpExpired'
      throw err
    }

    if (record.otpHash !== hashOtp(otp)) {
      const err = new Error('Invalid OTP')
      err.status = 400
      err.code = 'InvalidOtp'
      throw err
    }

    if (!options.keep) {
      await prisma.emailOtp.delete({ where: { id: record.id } })
    }

    return true
  }

  async verifyEmailOtp(email, otp) {
    return this.verifyOtp(email, otp, OTP_PURPOSE.EMAIL_VERIFY)
  }

  async verifyPasswordResetOtp(email, otp, options = {}) {
    return this.verifyOtp(email, otp, OTP_PURPOSE.PASSWORD_RESET, options)
  }

  async consumePasswordResetOtp(email) {
    const normalized = String(email).trim().toLowerCase()
    await prisma.emailOtp
      .delete({
        where: {
          email_purpose: {
            email: normalized,
            purpose: OTP_PURPOSE.PASSWORD_RESET,
          },
        },
      })
      .catch(() => {})
  }
}

export default new OtpService()
