import { z } from 'zod'
import { LOGIN_ROLES, PUBLIC_ROLES } from '../../../auth/roles.js'

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v === '' ? undefined : v))

function withPasswordConfirm(schema) {
  return schema
    .extend({
      confirmPassword: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (
        data.confirmPassword !== undefined &&
        data.confirmPassword !== '' &&
        data.confirmPassword !== data.password
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmPassword'],
          message: 'Passwords do not match',
        })
      }
    })
}

export const roleParamSchema = z.object({
  role: z
    .string()
    .trim()
    .toLowerCase()
    .refine((role) => PUBLIC_ROLES.includes(role), {
      message: `Role must be one of: ${PUBLIC_ROLES.join(', ')}`,
    }),
})

export const loginRoleParamSchema = z.object({
  role: z
    .string()
    .trim()
    .toLowerCase()
    .refine((role) => LOGIN_ROLES.includes(role), {
      message: `Role must be one of: ${LOGIN_ROLES.join(', ')}`,
    }),
})

export const loginBodySchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
})

const otp5 = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'OTP must be a 5-digit code')

export const verifyOtpBodySchema = z.object({
  email: emailField,
  otp: otp5,
  role: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((role) => !role || role === 'customer' || role === 'company', {
      message: 'Role must be customer or company',
    }),
})

export const resendOtpBodySchema = z.object({
  email: emailField,
  role: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((role) => !role || role === 'customer' || role === 'company', {
      message: 'Role must be customer or company',
    }),
})

export const forgotPasswordBodySchema = z.object({
  email: emailField,
})

export const verifyResetOtpBodySchema = z.object({
  email: emailField,
  otp: otp5,
})

/** Prefer resetToken from verify-reset-otp; or email + otp. */
export const resetPasswordBodySchema = z
  .object({
    resetToken: z.string().trim().min(1).optional(),
    email: emailField.optional(),
    otp: otp5.optional(),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      })
    }
    if (data.resetToken) return
    if (!data.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Email is required when resetToken is not provided',
      })
    }
    if (!data.otp) {
      ctx.addIssue({
        code: 'custom',
        path: ['otp'],
        message: 'OTP is required when resetToken is not provided',
      })
    }
  })

export const customerRegisterSchema = withPasswordConfirm(
  z.object({
    fullName: z.string().trim().min(2, 'Full name is required'),
    email: emailField,
    password: passwordField,
    referenceCode: optionalString,
    affiliateCode: optionalString,
  }),
)

export const companyRegisterSchema = withPasswordConfirm(
  z.object({
    companyName: z.string().trim().min(2, 'Company name is required'),
    email: emailField,
    nif: z.string().trim().min(2, 'Company NIF is required'),
    password: passwordField,
    referenceCode: optionalString,
  }),
)

export const supplierRegisterSchema = withPasswordConfirm(
  z.object({
    companyName: z.string().trim().min(2, 'Company name is required'),
    email: emailField,
    phone: z.string().trim().min(6, 'Phone is required'),
    iban: optionalString,
    password: passwordField,
  }),
)

export const factoryRegisterSchema = withPasswordConfirm(
  z.object({
    factoryName: z.string().trim().min(2, 'Factory name is required'),
    email: emailField,
    phone: z.string().trim().min(6, 'Phone is required'),
    iban: optionalString,
    password: passwordField,
  }),
)

export const transporterRegisterSchema = withPasswordConfirm(
  z.object({
    fullName: z.string().trim().min(2, 'Name is required'),
    email: emailField,
    phone: z.string().trim().min(6, 'Phone is required'),
    iban: optionalString,
    password: passwordField,
  }),
)

export const affiliateRegisterSchema = withPasswordConfirm(
  z.object({
    fullName: z.string().trim().min(2, 'Full name is required'),
    email: emailField,
    phone: z.string().trim().min(6, 'Phone is required'),
    iban: optionalString,
    password: passwordField,
    affiliateCode: optionalString,
  }),
)

/** role → zod schema map */
export const registerSchemasByRole = {
  customer: customerRegisterSchema,
  company: companyRegisterSchema,
  supplier: supplierRegisterSchema,
  factory: factoryRegisterSchema,
  transporter: transporterRegisterSchema,
  affiliate: affiliateRegisterSchema,
}

export const FILE_FIELDS = [
  { name: 'companyCertificate', maxCount: 20 },
  { name: 'factoryCertificate', maxCount: 20 },
  { name: 'rcbe', maxCount: 20 },
  { name: 'ibanProof', maxCount: 20 },
  { name: 'idDocuments', maxCount: 20 },
  // Common Postman / client casing aliases (multer is case-sensitive)
  { name: 'IdDocuments', maxCount: 20 },
  { name: 'idDocument', maxCount: 20 },
  { name: 'addressProof', maxCount: 20 },
  { name: 'civilLiability', maxCount: 20 },
  { name: 'transporterCivilLiability', maxCount: 20 },
]
