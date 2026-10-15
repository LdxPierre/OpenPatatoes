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

export const opProjectSchema = z
  .object({
    _type: z.literal('Project'),
    id: z.number().int(),
    identifier: z.string(),
    name: z.string(),
  })
  .transform(({ id, identifier, name }) => ({ id, identifier, name }))

export type OpProject = z.output<typeof opProjectSchema>

/** Page d'une collection HAL ; `nextByOffset` n'est présent que s'il reste des pages. */
export function opCollectionPageSchema<T extends z.ZodType>(element: T) {
  return z.object({
    _type: z.literal('Collection'),
    _embedded: z.object({
      elements: z.array(element),
    }),
    _links: z.object({
      nextByOffset: z.object({
        href: z.string(),
      }).optional(),
    }),
  })
}
