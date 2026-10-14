import prisma from '../../../lib/prisma.js'
import { httpError } from '../../shared/errors.js'
import { createSplitPayment, isMockPayments } from './eupago.client.js'

/** EuPago extern keys are 4-char groups joined by dashes, e.g. 095c-09ad-5b40-605a-5859. */
const EXTERN_KEY_PATTERN = /^[a-z0-9]{4}(-[a-z0-9]{4}){3,4}$/i

const KEY_CHECK_AMOUNT = 1

export function isValidExternKeyFormat(value) {
  return EXTERN_KEY_PATTERN.test(String(value || '').trim())
}

function isExternKeyRejection(err) {
  const code = String(err?.code || err?.details?.code || '').toUpperCase()
  return code.includes('BENEFICIARY') || code.includes('EXTERN')
}

/**
 * Asks EuPago for an unpaid Multibanco reference that sends the full amount to
 * this extern key. Nothing is charged; the reference simply expires unpaid.
 * Only a key-specific rejection blocks the save — platform-side failures
 * (API key, network) must not stop sellers from saving their key.
 */
export async function verifyExternKeyWithEupago(externKey) {
  if (isMockPayments()) return { verified: false, skipped: true }

  try {
    await createSplitPayment({
      paymentMethod: 'multibanco',
      amount: KEY_CHECK_AMOUNT,
      identifier: `KEYCHECK-${Date.now()}`,
      beneficiaries: [{ externKey, amount: KEY_CHECK_AMOUNT }],
    })
    return { verified: true }
  } catch (err) {
    if (isExternKeyRejection(err)) {
      throw httpError(
        'EuPago did not accept this extern key. Copy it again from your EuPago backoffice.',
        400,
        'EupagoExternKeyRejected',
        { eupagoCode: err.code },
      )
    }
    console.warn('[eupago] extern key check skipped:', err?.code || err?.message)
    return { verified: false, skipped: true }
  }
}

/** True when a buyer can pay this seller (seller has an extern key, or payments are mocked). */
export function isSellerPayable(seller) {
  if (isMockPayments()) return true
  return Boolean(String(seller?.profile?.eupagoExternKey || '').trim())
}

export async function getSellerEupagoStatus(userId) {
  if (!userId) {
    return { hasApiKey: false, hasExternKey: false, configured: false }
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: { eupagoApiKey: true, eupagoExternKey: true },
  })

  const hasApiKey = Boolean(String(profile?.eupagoApiKey || '').trim())
  const hasExternKey = Boolean(String(profile?.eupagoExternKey || '').trim())

  return {
    hasApiKey,
    hasExternKey,
    configured: hasExternKey,
  }
}

export async function assertSellerEupagoConfigured(userId) {
  const status = await getSellerEupagoStatus(userId)
  if (status.configured) return status

  throw httpError(
    'Add your EuPago extern key in Profile before listing products on the website',
    400,
    'EupagoCredentialsRequired',
  )
}

export async function saveSellerEupagoCredentials(userId, body = {}) {
  const apiKey = String(
    body.eupagoApiKey ?? body.apiKey ?? body.iban ?? '',
  ).trim()
  const externKey = String(
    body.eupagoExternKey ?? body.externKey ?? body.ibanPhone ?? '',
  ).trim()

  if (!apiKey && !externKey) {
    throw httpError(
      'Provide API key or EuPago extern key',
      400,
      'ValidationError',
    )
  }
  if (externKey && !isValidExternKeyFormat(externKey)) {
    throw httpError(
      'Invalid EuPago extern key format. It should look like 095c-09ad-5b40-605a-5859',
      400,
      'EupagoExternKeyInvalid',
    )
  }

  if (externKey) {
    const current = await prisma.businessProfile.findUnique({
      where: { userId },
      select: { eupagoExternKey: true },
    })
    if (String(current?.eupagoExternKey || '').trim() !== externKey) {
      await verifyExternKeyWithEupago(externKey)
    }
  }

  await prisma.businessProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...(apiKey ? { eupagoApiKey: apiKey } : {}),
      ...(externKey ? { eupagoExternKey: externKey } : {}),
    },
    update: {
      ...(apiKey ? { eupagoApiKey: apiKey } : {}),
      ...(externKey ? { eupagoExternKey: externKey } : {}),
    },
  })

  return getSellerEupagoStatus(userId)
}
