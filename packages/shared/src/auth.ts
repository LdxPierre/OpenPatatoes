import { z } from 'zod'

/** Corps de `POST /api/auth/login`. */
export const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>

export const sessionUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
  /** Un jeton OP est enregistré (sans garantie qu'OP l'accepte encore). */
  opConnected: z.boolean(),
})

export type SessionUser = z.infer<typeof sessionUserSchema>

/** Réponse de `POST /api/auth/login` et de `GET /api/auth/me` (401 sans session). */
export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
})
