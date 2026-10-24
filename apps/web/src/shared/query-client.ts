import { QueryClient } from '@tanstack/vue-query'
import { opErrorRecovery } from './api/op-error'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un refus ou un jeton inutilisable ne changera pas en réessayant ; une panne réseau ou d'OP, peut-être.
      retry: (failureCount, error) => opErrorRecovery(error) === 'retry' && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})
