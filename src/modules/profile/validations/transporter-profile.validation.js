import { z } from 'zod'

export const updateTransporterProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    fullName: z.string().trim().min(2).optional(),
    phone: z.string().trim().min(6).optional(),
    phoneNumber: z.string().trim().min(6).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((b) => b.name || b.fullName || b.phone || b.phoneNumber, {
    message: 'Provide at least one field to update',
  })

export const changeTransporterPasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    newPassword: z.string().min(8).optional(),
    confirmPassword: z.string().min(8),
  })
  .superRefine((b, ctx) => {
    const next = b.password ?? b.newPassword
    if (!next) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'password is required',
        path: ['password'],
      })
      return
    }
    if (b.confirmPassword !== next) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password confirmation does not match',
        path: ['confirmPassword'],
      })
    }
  })

export const saveTransporterIbanBodySchema = z
  .object({
    iban: z.string().trim().min(5).optional(),
    ibanNumber: z.string().trim().min(5).optional(),
    ibanPhone: z.string().trim().min(6).optional(),
    phone: z.string().trim().min(6).optional(),
    phoneNumber: z.string().trim().min(6).optional(),
  })
  .refine((b) => b.iban || b.ibanNumber, {
    message: 'iban is required',
  })
