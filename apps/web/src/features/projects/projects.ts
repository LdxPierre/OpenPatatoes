import { projectsResponseSchema } from '@openpatatoes/shared'
import { useQuery } from '@tanstack/vue-query'
import { apiFetch } from '@/shared/api/api-fetch'

/** Projets OP visibles avec le jeton de l'utilisateur connecté. */
export function useProjectsQuery() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => apiFetch('/projects', { schema: projectsResponseSchema, signal }),
    select: data => data.projects,
  })
}
