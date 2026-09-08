import { z } from 'zod'

const editRowSchema = z.object({
  id: z.string().trim().min(1),
  editEnabled: z.boolean(),
})

export const inviteStaffBodySchema = z.object({
  email: z.string().trim().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  // Only moderators can be created from this screen
  role: z.literal('moderator').default('moderator'),
  edit: z.array(editRowSchema).optional(),
})

export const saveModeratorPermissionsBodySchema = z.object({
  edit: z.array(editRowSchema).min(1),
})
