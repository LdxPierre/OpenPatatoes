import type { SaveOpTokenRequest, SessionUser } from '@openpatatoes/shared'
import { opConnectionResponseSchema } from '@openpatatoes/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { sessionQueryOptions } from '@/features/auth/session'
import { apiFetch } from '@/shared/api/api-fetch'

/** Enregistre le jeton OP après validation par OP, et renvoie le compte OP associé. */
export function useSaveOpTokenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SaveOpTokenRequest) =>
      apiFetch('/profile/op-connection', { method: 'PUT', body, schema: opConnectionResponseSchema }),
    onSuccess: () =>
      queryClient.setQueryData(
        sessionQueryOptions.queryKey,
        (user: SessionUser | null | undefined) => user && { ...user, opConnected: true },
      ),
  })
}
