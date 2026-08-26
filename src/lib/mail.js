import nodemailer from 'nodemailer'
import { env, isProduction } from '../config/env.js'

let transporter = null

const PLACEHOLDER_HOSTS = new Set([
  'smtp.example.com',
  'example.com',
  'localhost',
])

export function smtpConfigured() {
  const { host, user, pass } = env.smtp
  if (!host || !user || !pass) return false
  if (PLACEHOLDER_HOSTS.has(host.toLowerCase())) return false
  return true
}

function getTransporter() {
  if (transporter) return transporter
  if (!smtpConfigured()) return null

  const { host, user, pass, port, secure } = env.smtp

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure || port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  })

  return transporter
}

/**
 * Send email. Falls back to console when SMTP is missing/placeholder.
 * Errors are logged clearly so OTP failures are visible in the server log.
 */
export async function sendMail({ to, subject, text, html }) {
  const from = env.smtp.from
  const mailer = getTransporter()

  if (!mailer) {
    console.info(
      `[mail:dev] SMTP not configured (check SMTP_HOST). OTP for ${to}:\n${text}`,
    )
    return { queued: true, mode: 'console' }
  }

  try {
    const info = await mailer.sendMail({ from, to, subject, text, html })
    console.info(`[mail] sent to ${to} messageId=${info.messageId}`)
    return { queued: true, mode: 'smtp', messageId: info.messageId }
  } catch (err) {
    console.error('[mail] send failed:', err.message)
    // Still log OTP in dev so testing is not blocked
    if (!isProduction) {
      console.info(`[mail:fallback] OTP for ${to}:\n${text}`)
    }
    throw err
  }
}

export function sendOtpEmail(email, otp, purpose = 'verify') {
  const subject =
    purpose === 'reset'
      ? 'Your CONSTRUPRECO password reset code'
      : 'Your CONSTRUPRECO verification code'

  const text = `Your verification code is ${otp}. It expires in 10 minutes.`
  const html = `
    <div style="font-family:sans-serif;max-width:420px">
      <h2>CONSTRUPRECO</h2>
      <p>${purpose === 'reset' ? 'Password reset code:' : 'Your verification code:'}</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${otp}</p>
      <p style="color:#666">Expires in 10 minutes. If you did not request this, ignore this email.</p>
    </div>
  `

  return sendMail({ to: email, subject, text, html })
}

export function sendDeliveryOtpEmail(email, otp, orderNumber) {
  const subject = `Delivery verification code for ${orderNumber}`
  const text = `Your 4-digit delivery verification code for order ${orderNumber} is ${otp}. Share it with the transporter to confirm delivery.`
  const html = `
    <div style="font-family:sans-serif;max-width:420px">
      <h2>CONSTRUPRECO</h2>
      <p>Delivery verification code for order <strong>${orderNumber}</strong>:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${otp}</p>
      <p style="color:#666">Share this code with the transporter to confirm delivery. You can also see it in your dashboard.</p>
    </div>
  `
  return sendMail({ to: email, subject, text, html })
}

export function sendStaffInviteEmail({
  email,
  roleLabel,
  loginUrl,
  temporaryPassword,
}) {
  const subject = `You're invited to CONSTRUPRECO as ${roleLabel}`
  const passwordLine = temporaryPassword
    ? `Temporary password: ${temporaryPassword}`
    : 'Use your existing password to sign in.'
  const text = [
    `You have been invited to CONSTRUPRECO as ${roleLabel}.`,
    `Login: ${loginUrl}`,
    passwordLine,
    'Change your password after first login.',
  ].join('\n')
  const html = `
    <div style="font-family:sans-serif;max-width:480px">
      <h2>CONSTRUPRECO</h2>
      <p>You have been invited as <strong>${roleLabel}</strong>.</p>
      <p><a href="${loginUrl}">${loginUrl}</a></p>
      ${
        temporaryPassword
          ? `<p>Temporary password: <strong>${temporaryPassword}</strong></p>`
          : `<p>Use your existing password to sign in.</p>`
      }
      <p style="color:#666">Change your password after first login.</p>
    </div>
  `
  return sendMail({ to: email, subject, text, html })
}

export default { sendMail, sendOtpEmail, sendDeliveryOtpEmail, sendStaffInviteEmail, smtpConfigured }
