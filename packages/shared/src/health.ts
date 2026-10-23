import { z } from 'zod'

/** Réponse de `GET /api/health` quand l'API et la base répondent (sinon 503). */
export const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
})

export type Health = z.infer<typeof healthSchema>
