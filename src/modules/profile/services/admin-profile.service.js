import { hashPassword, verifyPassword } from 'better-auth/crypto'
import nodemailer from 'nodemailer'
import prisma from '../../../../lib/prisma.js'
import { absolutizeUrl } from '../../../lib/requestUrl.js'
import { httpError, notFound } from '../../../shared/errors.js'
import { getAdminStaffAccess } from '../../auth/staffAccess.js'
import {
  isValidExternKeyFormat,
  verifyExternKeyWithEupago,
} from '../../payments/seller-eupago.js'
import {
  clearUserAvatar,
  replaceUserAvatar,
} from '../../../shared/upload/user-avatar.js'
import { encryptText, decryptText } from '../../../shared/encryption.js'
import { invalidateMailTransporter } from '../../../lib/mail.js'

function assertAdmin(auth, message) {
  if (!auth?.id) throw httpError('Unauthorized', 401, 'Unauthorized')
  if (String(auth.role || '').toLowerCase() !== 'admin') {
    throw httpError(message, 403, 'Forbidden')
  }
  return auth.id
}

function mapProfile(user, baseUrl) {
  const companyName = user.profile?.companyName || user.name
  return {
    displayName: companyName,
    displayEmail: user.email,
    name: user.name,
    email: user.email,
    avatarUrl: user.image ? absolutizeUrl(user.image, baseUrl) : null,
    // EuPago secrets are write-only — never returned by GET
    iban: '',
    ibanPhone: '',
  }
}

async function loadUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'ADMIN' },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      image: true,
      profile: {
        select: {
          companyName: true,
        },
      },
    },
  })
  if (!user) throw notFound('Admin not found')
  return user
}

async function toBody(userId, baseUrl) {
  const user = await loadUser(userId)
  return {
    profile: mapProfile(user, baseUrl),
    message: 'Profile fetched',
  }
}

export class AdminProfileService {
  async get(auth, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can view this profile')
    const body = await toBody(adminId, baseUrl)
    return { status: 200, body }
  }

  async update(auth, body = {}, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update this profile')
    const name = body.name != null ? String(body.name).trim() : undefined
    const email =
      body.email != null ? String(body.email).trim().toLowerCase() : undefined

    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: adminId } },
        select: { id: true },
      })
      if (clash) throw httpError('Email already in use', 409, 'Conflict')
    }

    const data = {}
    if (name) data.name = name
    if (email) data.email = email

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.user.update({ where: { id: adminId }, data })
      }
      if (name) {
        await tx.businessProfile.upsert({
          where: { userId: adminId },
          create: { userId: adminId, companyName: name },
          update: { companyName: name },
        })
      }
    })

    const next = await toBody(adminId, baseUrl)
    return { status: 200, body: { ...next, message: 'Profile updated' } }
  }

  async changePassword(auth, body = {}) {
    assertAdmin(auth, 'Only admins can change this password')
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    const confirm = body.confirmNewPassword ?? body.confirmPassword

    if (confirm != null && String(confirm) !== newPassword) {
      throw httpError('Password confirmation does not match', 400, 'ValidationError')
    }

    const account = await prisma.account.findFirst({
      where: { userId: auth.id, providerId: 'credential' },
      select: { id: true, password: true },
    })
    if (!account?.password) {
      throw httpError('No password account found', 400, 'NoCredentialAccount')
    }

    const ok = await verifyPassword({
      hash: account.password,
      password: currentPassword,
    })
    if (!ok) {
      throw httpError('Current password is incorrect', 400, 'InvalidPassword')
    }

    const hashed = await hashPassword(newPassword)
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    })
    await prisma.session.deleteMany({ where: { userId: auth.id } })

    return { status: 200, body: { message: 'Password changed successfully' } }
  }

  async saveIban(auth, body = {}, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update EuPago credentials')
    const staffAccess = await getAdminStaffAccess(adminId)
    if (!staffAccess.isFullAdmin) {
      throw httpError(
        'Moderators cannot update EuPago credentials',
        403,
        'Forbidden',
      )
    }

    const apiKey = String(
      body.eupagoApiKey ?? body.apiKey ?? body.ibanNumber ?? body.iban ?? '',
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

    if (apiKey) {
      await prisma.businessProfile.upsert({
        where: { userId: adminId },
        create: { userId: adminId, ibanNumber: apiKey },
        update: { ibanNumber: apiKey },
      })
    }

    if (externKey) {
      const current = await prisma.businessProfile.findUnique({
        where: { userId: adminId },
        select: { eupagoExternKey: true },
      })
      if (String(current?.eupagoExternKey || '').trim() !== externKey) {
        await verifyExternKeyWithEupago(externKey)
      }
      await prisma.businessProfile.upsert({
        where: { userId: adminId },
        create: { userId: adminId, eupagoExternKey: externKey },
        update: { eupagoExternKey: externKey },
      })
    }

    const next = await toBody(adminId, baseUrl)
    return {
      status: 200,
      body: { ...next, message: 'EuPago credentials saved' },
    }
  }

  async uploadAvatar(auth, files, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update avatar')
    await replaceUserAvatar(adminId, files)
    const next = await toBody(adminId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar updated' } }
  }

  async removeAvatar(auth, baseUrl) {
    const adminId = assertAdmin(auth, 'Only admins can update avatar')
    await clearUserAvatar(adminId)
    const next = await toBody(adminId, baseUrl)
    return { status: 200, body: { ...next, message: 'Avatar removed' } }
  }

  async getSmtp(auth) {
    const adminId = assertAdmin(auth, 'Only admins can view SMTP settings')
    const staffAccess = await getAdminStaffAccess(adminId)
    if (!staffAccess.isFullAdmin) {
      throw httpError('Moderators cannot view SMTP settings', 403, 'Forbidden')
    }

    const row = await prisma.systemSetting.findUnique({
      where: { key: 'admin.smtp_settings' },
      select: { value: true },
    })

    let config = null
    if (row?.value) {
      try {
        config = JSON.parse(row.value)
      } catch {}
    }

    return {
      status: 200,
      body: {
        smtp: {
          host: config?.host || 'smtp.gmail.com',
          port: config?.port ? Number(config.port) : 587,
          secure: config?.secure ?? false,
          user: config?.user || '',
          fromEmail: config?.fromEmail || config?.user || '',
          fromName: config?.fromName || 'Construpreço',
          hasPassword: Boolean(config?.pass),
        },
        message: 'SMTP settings fetched',
      },
    }
  }

  async saveSmtp(auth, body = {}) {
    const adminId = assertAdmin(auth, 'Only admins can update SMTP settings')
    const staffAccess = await getAdminStaffAccess(adminId)
    if (!staffAccess.isFullAdmin) {
      throw httpError('Moderators cannot update SMTP settings', 403, 'Forbidden')
    }

    const host = String(body.host || '').trim()
    const port = Number(body.port) || 587
    const secure = body.secure ?? (port === 465)
    const user = String(body.user || '').trim().toLowerCase()
    const fromEmail = String(body.fromEmail || body.user || '').trim().toLowerCase()
    const fromName = String(body.fromName || 'Construpreço').trim()
    const rawPass = String(body.pass || '').trim()

    const existingRow = await prisma.systemSetting.findUnique({
      where: { key: 'admin.smtp_settings' },
      select: { value: true },
    })

    let existing = null
    if (existingRow?.value) {
      try {
        existing = JSON.parse(existingRow.value)
      } catch {}
    }

    let encryptedPass = existing?.pass || ''
    if (rawPass) {
      encryptedPass = encryptText(rawPass)
    } else if (!encryptedPass) {
      throw httpError('Palavra-passe de aplicação é obrigatória', 400, 'ValidationError')
    }

    const payload = {
      host,
      port,
      secure,
      user,
      fromEmail,
      fromName,
      pass: encryptedPass,
      updatedAt: new Date().toISOString(),
    }

    await prisma.systemSetting.upsert({
      where: { key: 'admin.smtp_settings' },
      create: { key: 'admin.smtp_settings', value: JSON.stringify(payload) },
      update: { value: JSON.stringify(payload) },
    })

    invalidateMailTransporter()

    return {
      status: 200,
      body: {
        smtp: {
          host,
          port,
          secure,
          user,
          fromEmail,
          fromName,
          hasPassword: true,
        },
        message: 'Configurações de SMTP guardadas com sucesso',
      },
    }
  }

  async testSmtp(auth, body = {}) {
    const adminId = assertAdmin(auth, 'Only admins can test SMTP settings')
    const staffAccess = await getAdminStaffAccess(adminId)
    if (!staffAccess.isFullAdmin) {
      throw httpError('Moderators cannot test SMTP settings', 403, 'Forbidden')
    }

    const user = await prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true },
    })

    const toEmail = String(body.toEmail || user?.email || '').trim().toLowerCase()
    if (!toEmail) {
      throw httpError('Email de destino é obrigatório para teste', 400, 'ValidationError')
    }

    const row = await prisma.systemSetting.findUnique({
      where: { key: 'admin.smtp_settings' },
      select: { value: true },
    })

    if (!row?.value) {
      throw httpError('Guarde as configurações SMTP antes de enviar um email de teste', 400, 'NotConfigured')
    }

    const config = JSON.parse(row.value)
    const pass = decryptText(config.pass)
    if (!config.host || !config.user || !pass) {
      throw httpError('Credenciais SMTP incompletas', 400, 'IncompleteCredentials')
    }

    const testMailer = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port) || 587,
      secure: config.secure ?? (Number(config.port) === 465),
      auth: { user: config.user, pass },
      connectionTimeout: 10_000,
    })

    try {
      await testMailer.verify()
      const fromName = config.fromName || 'Construpreço'
      const fromEmail = config.fromEmail || config.user
      await testMailer.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject: 'Construpreço — Teste de Configuração SMTP',
        text: `Olá!\n\nEste é um email de teste enviado pelo marketplace Construpreço.\nA sua configuração SMTP (${config.host}) está a funcionar perfeitamente!\n\nAtenciosamente,\nEquipa Construpreço`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #1f2937; margin-bottom: 8px;">Construpreço</h2>
            <p style="color: #4b5563; font-size: 15px;">Olá,</p>
            <p style="color: #4b5563; font-size: 15px;">Este é um email de teste automático para confirmar a ligação SMTP do seu marketplace.</p>
            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0; border-radius: 6px;">
              <p style="color: #065f46; font-weight: bold; margin: 0;">✓ Configuração verificada com sucesso!</p>
              <p style="color: #047857; margin: 6px 0 0; font-size: 14px;">Servidor: <strong>${config.host}:${config.port}</strong> | Remetente: <strong>${fromEmail}</strong></p>
            </div>
            <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Marketplace Construpreço · Todos os direitos reservados.</p>
          </div>
        `,
      })

      return {
        status: 200,
        body: {
          success: true,
          message: `Email de teste enviado com sucesso para ${toEmail}!`,
        },
      }
    } catch (err) {
      console.error('[SMTP Test Error]:', err)
      const errMsg = err.code === 'EAUTH'
        ? 'Erro de autenticação SMTP: utilizador ou palavra-passe incorretos (se usar Gmail, utilize uma Palavra-passe de aplicação de 16 caracteres).'
        : `Falha na ligação SMTP: ${err.message}`
      throw httpError(errMsg, 400, 'SmtpTestFailed')
    }
  }
}

export default new AdminProfileService()
