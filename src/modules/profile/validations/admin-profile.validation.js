import { z } from 'zod'

export const updateAdminProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((b) => b.name || b.email, {
    message: 'Provide name or email',
  })

export const changeAdminPasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8).optional(),
    confirmNewPassword: z.string().min(8).optional(),
  })
  .superRefine((b, ctx) => {
    const confirm = b.confirmNewPassword ?? b.confirmPassword
    if (confirm != null && confirm !== b.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password confirmation does not match',
        path: ['confirmPassword'],
      })
    }
  })

export const saveAdminIbanBodySchema = z
  .object({
    iban: z.string().trim().optional(),
    ibanNumber: z.string().trim().optional(),
    apiKey: z.string().trim().optional(),
    eupagoApiKey: z.string().trim().optional(),
    ibanPhone: z.string().trim().min(1).optional(),
    eupagoExternKey: z.string().trim().min(1).optional(),
    externKey: z.string().trim().min(1).optional(),
  })
  .refine(
    (b) =>
      Boolean(b.iban?.trim()) ||
      Boolean(b.ibanNumber?.trim()) ||
      Boolean(b.apiKey?.trim()) ||
      Boolean(b.eupagoApiKey?.trim()) ||
      Boolean(b.ibanPhone?.trim()) ||
      Boolean(b.eupagoExternKey?.trim()) ||
      Boolean(b.externKey?.trim()),
    { message: 'Provide API key or EuPago extern key' },
  )

export const saveAdminSmtpBodySchema = z.object({
  host: z.string().trim().min(1, 'Servidor SMTP (Host) é obrigatório'),
  port: z.coerce.number().int().positive().default(587),
  secure: z.boolean().optional(),
  user: z.string().trim().email('Email válido é obrigatório para utilizador SMTP'),
  pass: z.string().trim().optional(),
  fromEmail: z.string().trim().email('Email de remetente válido').optional(),
  fromName: z.string().trim().optional(),
})

export const testAdminSmtpBodySchema = z.object({
  toEmail: z.string().trim().email('Email de destino válido é obrigatório').optional(),
  host: z.string().trim().optional(),
  port: z.coerce.number().int().positive().optional(),
  secure: z.boolean().optional(),
  user: z.string().trim().optional(),
  pass: z.string().trim().optional(),
  fromName: z.string().trim().optional(),
  fromEmail: z.string().trim().optional(),
})
