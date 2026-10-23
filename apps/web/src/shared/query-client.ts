import { QueryClient } from '@tanstack/vue-query'
import { ApiError } from './api/api-fetch'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une erreur 4xx ne changera pas en réessayant ; une panne réseau ou un 5xx, peut-être.
      retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})

function isClientError(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}
