import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, vi } from 'vitest'
import { queryClient } from '@/shared/query-client'
import { fakeApi } from './fake-api'

// Les tests ne parlent jamais au serveur : `apiFetch` répond avec `fakeApi`.
vi.mock('@/shared/api/api-fetch', async importOriginal => ({
  ...await importOriginal<typeof import('@/shared/api/api-fetch')>(),
  apiFetch: vi.fn(),
}))

beforeEach(() => {
  fakeApi.reset()
  queryClient.clear()
})

enableAutoUnmount(afterEach)
