import { z } from 'zod'
import { VEHICLE_TYPE_IDS } from '../../admin/settings/catalog.js'

const uuid = z.string().uuid('Invalid id')

const addressInlineSchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  streetAddress: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  zipCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(1).max(120).default('Portugal'),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
})

const unloadingTypeSchema = z
  .string()
  .trim()
  .min(1, 'unloadingType is required')
  .refine((v) => VEHICLE_TYPE_IDS.includes(v), {
    message: `unloadingType must be one of: ${VEHICLE_TYPE_IDS.join(', ')}`,
  })

export const checkoutIdParamSchema = z.object({
  id: uuid,
})

const directBuySchema = z.object({
  productId: uuid,
  quantity: z.number().int().min(1),
})

export const directBuyQuoteBodySchema = z.object({
  directBuy: directBuySchema,
  promos: z.array(z.string()).optional(),
})

export const shippingQuoteBodySchema = z
  .object({
    cartItemIds: z.array(uuid).optional(),
    directBuy: directBuySchema.optional(),
    promos: z.array(z.string()).optional(),
    unloadingType: unloadingTypeSchema,
    shippingAddressId: uuid.optional(),
    shippingAddress: addressInlineSchema.optional(),
    billingAddressId: uuid.optional(),
    billingAddress: addressInlineSchema.optional(),
    sameAsBilling: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.cartItemIds?.length && !data.directBuy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide cartItemIds or directBuy',
        path: ['cartItemIds'],
      })
    }
    if (data.sameAsBilling) {
      if (!data.billingAddressId && !data.billingAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Provide billingAddressId or billingAddress when sameAsBilling',
          path: ['billingAddressId'],
        })
      }
      return
    }
    if (!data.shippingAddressId && !data.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide shippingAddressId, shippingAddress, or sameAsBilling',
        path: ['shippingAddressId'],
      })
    }
  })

export const placeCheckoutBodySchema = z
  .object({
    cartItemIds: z.array(uuid).optional(),
    directBuy: directBuySchema.optional(),
    promos: z.array(z.string()).optional(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email(),
    phone: z.string().trim().min(5).max(40),
    billingAddressId: uuid.optional(),
    billingAddress: addressInlineSchema.optional(),
    saveBillingAddress: z.boolean().optional().default(false),
    shippingAddressId: uuid.optional(),
    shippingAddress: addressInlineSchema.optional(),
    saveShippingAddress: z.boolean().optional().default(false),
    sameAsBilling: z.boolean().optional().default(false),
    projectName: z.string().trim().max(200).optional().nullable(),
    projectLocation: z.string().trim().max(500).optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    unloadingType: unloadingTypeSchema,
    unloadingLocationDescription: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable(),
    accessConditions: z.string().trim().max(500).optional().nullable(),
    additionalNotes: z.string().trim().max(2000).optional().nullable(),
    paymentMethod: z
      .enum(['multibanco', 'mbway', 'creditcard'])
      .optional()
      .default('multibanco'),
    mbwayPhone: z.string().trim().min(5).max(40).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.cartItemIds?.length && !data.directBuy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide cartItemIds or directBuy',
        path: ['cartItemIds'],
      })
    }
    if (!data.billingAddressId && !data.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide billingAddressId or billingAddress',
        path: ['billingAddressId'],
      })
    }
    if (
      !data.sameAsBilling &&
      !data.shippingAddressId &&
      !data.shippingAddress
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide shippingAddressId, shippingAddress, or sameAsBilling',
        path: ['shippingAddressId'],
      })
    }
    if (data.paymentMethod === 'mbway' && !data.mbwayPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mbwayPhone is required for MB WAY',
        path: ['mbwayPhone'],
      })
    }
  })
