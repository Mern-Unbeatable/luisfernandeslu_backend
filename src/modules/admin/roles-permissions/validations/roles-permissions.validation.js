import { z } from 'zod'

const editRowSchema = z.object({
  id: z.string().trim().min(1),
  editEnabled: z.boolean(),
})

export const inviteStaffBodySchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['moderator', 'admin']).default('moderator'),
  edit: z.array(editRowSchema).optional(),
})

export const saveModeratorPermissionsBodySchema = z.object({
  edit: z.array(editRowSchema).min(1),
})
