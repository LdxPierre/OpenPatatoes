import { z } from 'zod'

/** Paramètre de route `:id` : identifiant OP strictement positif. */
export const idParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/).transform(Number),
})
