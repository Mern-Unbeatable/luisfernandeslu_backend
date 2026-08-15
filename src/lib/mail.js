import nodemailer from 'nodemailer'

let transporter = null
let transporterVerified = false

const PLACEHOLDER_HOSTS = new Set([
  'smtp.example.com',
  'example.com',
  'localhost',
])

export function smtpConfigured() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = String(process.env.SMTP_PASS || '').trim()
  if (!host || !user || !pass) return false
  if (PLACEHOLDER_HOSTS.has(host.toLowerCase())) return false
  return true
}

function getTransporter() {
  if (transporter) return transporter
  if (!smtpConfigured()) return null

  const host = String(process.env.SMTP_HOST).trim()
  const user = String(process.env.SMTP_USER).trim()
  // Gmail app passwords may be pasted with spaces
  const pass = String(process.env.SMTP_PASS).replace(/\s+/g, '')
  const port = Number(process.env.SMTP_PORT || 587)
  const secure =
    String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  return transporter
}

/**
 * Send email. Falls back to console when SMTP is missing/placeholder.
 * Errors are logged clearly so OTP failures are visible in the server log.
 */
export async function sendMail({ to, subject, text, html }) {
  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'no-reply@construpreco.local'
  const mailer = getTransporter()

  if (!mailer) {
    console.info(
      `[mail:dev] SMTP not configured (check SMTP_HOST). OTP for ${to}:\n${text}`,
    )
    return { queued: true, mode: 'console' }
  }

  try {
    if (!transporterVerified) {
      await mailer.verify()
      transporterVerified = true
      console.info(`[mail] SMTP ready (${process.env.SMTP_HOST})`)
    }

    const info = await mailer.sendMail({ from, to, subject, text, html })
    console.info(`[mail] sent to ${to} messageId=${info.messageId}`)
    return { queued: true, mode: 'smtp', messageId: info.messageId }
  } catch (err) {
    console.error('[mail] send failed:', err.message)
    // Still log OTP in dev so testing is not blocked
    if (process.env.NODE_ENV !== 'production') {
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

export default { sendMail, sendOtpEmail, smtpConfigured }
