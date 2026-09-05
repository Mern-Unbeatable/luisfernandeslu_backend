import { z } from 'zod'

export const assistantChatSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
})
