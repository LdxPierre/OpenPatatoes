import { z } from 'zod'

/** Corps de `PUT /api/profile/op-connection`. Les espaces autour du jeton sont retirés. */
export const saveOpTokenRequestSchema = z.object({
  token: z.string().trim().min(1),
})

export type SaveOpTokenRequest = z.input<typeof saveOpTokenRequestSchema>

/** Réponse de `PUT` et `GET /api/profile/op-connection` : le compte OP du jeton. */
export const opConnectionResponseSchema = z.object({
  opUser: z.object({
    id: z.number().int(),
    name: z.string(),
  }),
})

export type OpConnectionResponse = z.infer<typeof opConnectionResponseSchema>
