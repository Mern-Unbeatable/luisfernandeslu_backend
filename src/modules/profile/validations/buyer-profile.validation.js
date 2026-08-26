import { z } from 'zod'

const optionalTrim = z.string().trim().optional()

export const updateBuyerAccountBodySchema = z.object({
  firstName: optionalTrim,
  lastName: optionalTrim,
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: optionalTrim,
  phoneNumber: optionalTrim,
  region: optionalTrim,
  state: optionalTrim,
  city: optionalTrim,
  zipCode: optionalTrim,
  address: optionalTrim,
  streetAddress: optionalTrim,
  /** When true with multipart PATCH, clears avatar */
  removeAvatar: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
})

export const changeBuyerPasswordBodySchema = z
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

export const saveBuyerIbanBodySchema = z
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

export const saveBuyerAddressBodySchema = z.object({
  firstName: optionalTrim,
  lastName: optionalTrim,
  companyName: optionalTrim,
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: optionalTrim,
  phoneNumber: optionalTrim,
  region: optionalTrim,
  state: optionalTrim,
  city: optionalTrim,
  zipCode: optionalTrim,
  address: optionalTrim,
  streetAddress: optionalTrim,
  country: optionalTrim,
})
