import { z } from 'zod'

export const updateSupplierProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(6).optional(),
    phoneNumber: z.string().trim().min(6).optional(),
  })
  .refine((b) => b.name || b.email || b.phone || b.phoneNumber, {
    message: 'Provide at least one field to update',
  })

export const saveSupplierWarehousesBodySchema = z.object({
  warehouses: z
    .array(
      z.object({
        id: z.string().trim().min(1).optional(),
        label: z.string().trim().max(120).optional(),
        address: z.string().trim().min(1),
      }),
    )
    .min(1),
})

export const changeSupplierPasswordBodySchema = z
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

export const saveSupplierIbanBodySchema = z
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
