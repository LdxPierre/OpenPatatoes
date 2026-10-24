import type { ProjectsResponse } from '@openpatatoes/shared'
import type { MaybeRefOrGetter } from 'vue'
import { projectResponseSchema, projectsResponseSchema } from '@openpatatoes/shared'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { apiFetch } from '@/shared/api/api-fetch'

/** Préfixe des clés de cache des projets et de ce qui leur appartient (tâches). */
export const projectsQueryKey = ['projects'] as const

/** Projets OP visibles avec le jeton de l'utilisateur connecté. */
export function useProjectsQuery() {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: ({ signal }) => apiFetch('/projects', { schema: projectsResponseSchema, signal }),
    select: data => data.projects,
  })
}

/** Un projet OP. Ouvert depuis la liste, son nom s'affiche tout de suite, avant la réponse d'OP. */
export function useProjectQuery(id: MaybeRefOrGetter<number>) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: computed(() => [
      ...projectsQueryKey,
      toValue(id),
    ]),
    queryFn: ({ signal }) => apiFetch(`/projects/${toValue(id)}`, { schema: projectResponseSchema, signal }),
    placeholderData: () => {
      const project = queryClient
        .getQueryData<ProjectsResponse>(projectsQueryKey)
        ?.projects
        .find(candidate => candidate.id === toValue(id))
      return project && { project }
    },
    select: data => data.project,
  })
}
