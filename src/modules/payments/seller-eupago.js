import prisma from '../../../lib/prisma.js'
import { httpError } from '../../shared/errors.js'

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
    configured: hasApiKey && hasExternKey,
  }
}

export async function assertSellerEupagoConfigured(userId) {
  const status = await getSellerEupagoStatus(userId)
  if (status.configured) return status

  throw httpError(
    'Add your EuPago API key and extern key in Profile before listing products on the website',
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
