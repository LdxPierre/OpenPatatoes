import { healthSchema } from '@openpatatoes/shared'
import { useQuery } from '@tanstack/vue-query'
import { apiFetch } from '@/shared/api/api-fetch'

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiFetch('/health', { schema: healthSchema, signal }),
  })
}
