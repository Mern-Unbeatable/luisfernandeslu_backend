import { z } from 'zod'

export const transporterDashboardQuerySchema = z.object({
  /** thisYear | lastYear | 2026 */
  period: z.string().trim().optional().default('thisYear'),
})
