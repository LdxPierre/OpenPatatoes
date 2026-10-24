import type { LoginRequest, SessionUser } from '@openpatatoes/shared'
import { sessionResponseSchema } from '@openpatatoes/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ApiError, apiFetch } from '@/shared/api/api-fetch'

/** Utilisateur connecté, ou `null` sans session valide. */
export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async ({ signal }): Promise<SessionUser | null> => {
    try {
      const { user } = await apiFetch('/auth/me', { schema: sessionResponseSchema, signal })
      return user
    }
    catch (error) {
      if (error instanceof ApiError && error.status === 401)
        return null
      throw error
    }
  },
  staleTime: Infinity,
})

export function useSessionQuery() {
  return useQuery(sessionQueryOptions)
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: LoginRequest) =>
      apiFetch('/auth/login', { method: 'POST', body: credentials, schema: sessionResponseSchema }),
    onSuccess: ({ user }) => queryClient.setQueryData(sessionQueryOptions.queryKey, user),
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    // Rien de l'utilisateur précédent ne doit rester en cache.
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(sessionQueryOptions.queryKey, null)
    },
  })
}
