import { z } from 'zod'

/** Projet OP, tel que l'app le montre. */
export const projectSchema = z.object({
  id: z.number().int(),
  identifier: z.string(),
  name: z.string(),
})

export type Project = z.infer<typeof projectSchema>

/** Réponse de `GET /api/projects` : les projets visibles avec le jeton OP de l'utilisateur. */
export const projectsResponseSchema = z.object({
  projects: z.array(projectSchema),
})

export type ProjectsResponse = z.infer<typeof projectsResponseSchema>

/** Réponse de `GET /api/projects/:id`. */
export const projectResponseSchema = z.object({
  project: projectSchema,
})

export type ProjectResponse = z.infer<typeof projectResponseSchema>
