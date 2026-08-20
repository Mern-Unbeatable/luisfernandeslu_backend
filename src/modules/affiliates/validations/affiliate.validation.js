import { z } from 'zod'

export const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export const listEarningsQuerySchema = listClientsQuerySchema

export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    email: z.string().trim().email().optional(),
    phoneNumber: z.string().trim().min(6).optional(),
    phone: z.string().trim().min(6).optional(),
  })
  .refine((b) => b.name || b.email || b.phoneNumber || b.phone, {
    message: 'Provide at least one field to update',
  })

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmNewPassword: z.string().min(8).optional(),
    confirmPassword: z.string().min(8).optional(),
    password: z.string().min(8).optional(),
  })
  .superRefine((b, ctx) => {
    const next = b.newPassword || b.password
    if (!next || next.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password must be at least 8 characters',
        path: ['newPassword'],
      })
    }
    const confirm = b.confirmNewPassword ?? b.confirmPassword
    if (confirm != null && confirm !== next) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password confirmation does not match',
        path: ['confirmNewPassword'],
      })
    }
  })

export const saveIbanBodySchema = z.object({
  ibanNumber: z.string().trim().min(5).optional(),
  iban: z.string().trim().min(5).optional(),
  linkedPhoneNumber: z.string().trim().min(6).optional(),
  phoneNumber: z.string().trim().min(6).optional(),
  phone: z.string().trim().min(6).optional(),
  businessName: z.string().trim().min(2).optional(),
  companyName: z.string().trim().min(2).optional(),
}).refine((b) => b.ibanNumber || b.iban, {
  message: 'ibanNumber is required',
})

export const withdrawBodySchema = z.object({
  amount: z.coerce.number().positive(),
  accountNumber: z.string().trim().min(5).optional(),
  iban: z.string().trim().min(5).optional(),
  businessName: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  routingNumber: z.string().trim().optional(),
})
