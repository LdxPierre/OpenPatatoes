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

/** Type de tâche actif dans un projet. `isDefault` marque le type par défaut de l'instance OP. */
export const projectTypeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isDefault: z.boolean(),
})

export type ProjectType = z.infer<typeof projectTypeSchema>

/** Réponse de `GET /api/projects/:id/types` : les types de tâche actifs dans le projet, dans l'ordre d'OP. */
export const projectTypesResponseSchema = z.object({
  types: z.array(projectTypeSchema),
})

export type ProjectTypesResponse = z.infer<typeof projectTypesResponseSchema>
