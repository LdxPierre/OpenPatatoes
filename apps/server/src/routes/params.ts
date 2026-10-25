import { z } from 'zod'

/** Paramètre de route `:id` : identifiant OP strictement positif. */
export const idParamsSchema = z.object({
  // Au-delà des entiers sûrs, `Number` arrondirait l'identifiant et OP recevrait une autre ressource, ou `1e+21`.
  id: z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger),
})
