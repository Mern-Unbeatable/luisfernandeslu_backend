import { z } from 'zod'

const uuid = z.string().uuid('Invalid id')

export const categoryIdParamSchema = z.object({
  categoryId: uuid,
})

export const subCategoryIdParamSchema = z.object({
  subCategoryId: uuid,
})
