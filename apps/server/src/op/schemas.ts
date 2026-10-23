import { z } from 'zod'

/**
 * Schémas Zod des réponses de l'API OP v3 (HAL). Ils ne retiennent que les champs
 * utilisés et projettent la réponse vers les types de l'application.
 */

export const opUserSchema = z
  .object({
    _type: z.literal('User'),
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ id, name }) => ({ id, name }))

export type OpUser = z.output<typeof opUserSchema>
