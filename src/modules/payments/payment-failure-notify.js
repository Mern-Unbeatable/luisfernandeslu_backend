import prisma from '../../../lib/prisma.js'
import { sendMail } from '../../lib/mail.js'
import { env } from '../../config/env.js'

/** EuPago codes that point at a seller's extern key rather than at the platform. */
const SELLER_KEY_CODES = new Set(['BENEFICIARY_INVALID'])

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sellerLabel(seller) {
  return seller?.profile?.companyName || seller?.name || seller?.email || 'Seller'
}

function formatAmount(amount) {
  return `${Number(amount || 0).toFixed(2)} EUR`
}

function sellerMail({ seller, checkoutNumber, amount, code, sellerKeyIssue }) {
  const profileUrl = `${env.frontendUrl}/${seller.role === 'FACTORY' ? 'factory' : 'supplier'}/profile`
  const subject = `Payment failed for your products (${checkoutNumber})`
  const action = sellerKeyIssue
    ? 'EuPago rejected the payment because a beneficiary extern key is invalid. Please check that the EuPago extern key in your Profile is correct.'
    : 'The payment was rejected by EuPago. Construpreço is reviewing the issue; no action is needed from you right now.'

  const text = [
    `Hello ${sellerLabel(seller)},`,
    '',
    `A buyer tried to pay for your products, but the payment failed.`,
    `Checkout: ${checkoutNumber}`,
    `Amount: ${formatAmount(amount)}`,
    `EuPago code: ${code}`,
    '',
    action,
    sellerKeyIssue ? `Profile: ${profileUrl}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2>CONSTRUPRECO</h2>
      <p>Hello ${escapeHtml(sellerLabel(seller))},</p>
      <p>A buyer tried to pay for your products, but the payment failed.</p>
      <p>
        Checkout: <strong>${escapeHtml(checkoutNumber)}</strong><br/>
        Amount: <strong>${escapeHtml(formatAmount(amount))}</strong><br/>
        EuPago code: <strong>${escapeHtml(code)}</strong>
      </p>
      <p>${escapeHtml(action)}</p>
      ${sellerKeyIssue ? `<p><a href="${escapeHtml(profileUrl)}">Open your Profile</a></p>` : ''}
    </div>
  `
  return { to: seller.email, subject, text, html }
}

function adminMail({ to, sellers, buyer, checkoutNumber, amount, paymentMethod, code, reason }) {
  const subject = `Payment failed: ${checkoutNumber} (${code})`
  const sellerLines = sellers.map(
    (s) => `${sellerLabel(s)} <${s.email}> (${s.role}) extern key: ${s.profile?.eupagoExternKey || 'missing'}`,
  )
  const buyerLine = buyer ? `${buyer.name || ''} <${buyer.email}> (${buyer.role})` : 'Unknown'

  const text = [
    'A payment was rejected by EuPago.',
    `Checkout: ${checkoutNumber}`,
    `Amount: ${formatAmount(amount)}`,
    `Method: ${paymentMethod}`,
    `EuPago code: ${code}`,
    `Message: ${reason}`,
    `Buyer: ${buyerLine}`,
    'Sellers:',
    ...sellerLines.map((line) => `- ${line}`),
  ].join('\n')

  const html = `
    <div style="font-family:sans-serif;max-width:620px">
      <h2>CONSTRUPRECO</h2>
      <p>A payment was rejected by EuPago.</p>
      <p>
        Checkout: <strong>${escapeHtml(checkoutNumber)}</strong><br/>
        Amount: <strong>${escapeHtml(formatAmount(amount))}</strong><br/>
        Method: ${escapeHtml(paymentMethod)}<br/>
        EuPago code: <strong>${escapeHtml(code)}</strong><br/>
        Message: ${escapeHtml(reason)}<br/>
        Buyer: ${escapeHtml(buyerLine)}
      </p>
      <p>Sellers:</p>
      <ul>${sellerLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </div>
  `
  return { to, subject, text, html }
}

/**
 * Emails the sellers involved and every admin when EuPago rejects a payment.
 * Never throws: a notification problem must not change the payment response.
 */
export async function notifyPaymentFailure({
  sellerIds = [],
  buyerId,
  checkoutNumber,
  amount,
  paymentMethod,
  error,
}) {
  try {
    const code = error?.code || 'EupagoError'
    const reason = error?.message || 'Payment provider error'
    const sellerKeyIssue = SELLER_KEY_CODES.has(code)

    const [sellers, buyer, admins] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: [...new Set(sellerIds)].filter(Boolean) } },
        select: {
          email: true,
          name: true,
          role: true,
          profile: { select: { companyName: true, eupagoExternKey: true } },
        },
      }),
      buyerId
        ? prisma.user.findUnique({
            where: { id: buyerId },
            select: { email: true, name: true, role: true },
          })
        : null,
      prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true },
      }),
    ])

    const mails = [
      ...sellers
        .filter((s) => s.email)
        .map((seller) =>
          sellerMail({ seller, checkoutNumber, amount, code, sellerKeyIssue }),
        ),
      ...admins
        .filter((a) => a.email)
        .map((a) =>
          adminMail({
            to: a.email,
            sellers,
            buyer,
            checkoutNumber,
            amount,
            paymentMethod: String(paymentMethod || 'multibanco').toLowerCase(),
            code,
            reason,
          }),
        ),
    ]

    const results = await Promise.allSettled(mails.map((mail) => sendMail(mail)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) {
      console.error(`[payment-failure-notify] ${failed} of ${mails.length} emails failed`)
    }
  } catch (err) {
    console.error('[payment-failure-notify]', err.message)
  }
}
