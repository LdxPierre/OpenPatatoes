import type { SessionUser } from '@openpatatoes/shared'
import type { z } from 'zod'
import { vi } from 'vitest'
import { apiFetch } from '@/shared/api/api-fetch'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Réponse simulée ; lever une `ApiError` simule un échec. */
type Handler = (body: unknown) => unknown

interface FakeCall {
  method: Method
  path: string
  body: unknown
}

const handlers = new Map<string, Handler>()

/**
 * API simulée derrière `apiFetch`. Les réponses passent par le schéma de l'appel,
 * comme les vraies : une simulation non conforme fait échouer le test.
 */
export const fakeApi = {
  calls: [] as FakeCall[],

  on(method: Method, path: string, handler: Handler) {
    handlers.set(`${method} ${path}`, handler)
  },

  /** Session ouverte ; par défaut, un utilisateur avec un jeton OP. */
  signedIn(user: Partial<SessionUser> = {}): SessionUser {
    const sessionUser = {
      id: 'u1',
      username: 'alice',
      isAdmin: false,
      opConnected: true,
      ...user,
    }
    fakeApi.on('GET', '/auth/me', () => ({ user: sessionUser }))
    return sessionUser
  },

  reset() {
    handlers.clear()
    fakeApi.calls = []
    // Interrogée par l'accueil, où mènent beaucoup de redirections.
    fakeApi.on('GET', '/projects', () => ({ projects: [] }))
    vi.mocked(apiFetch).mockImplementation(fakeFetch as typeof apiFetch)
  },
}

async function fakeFetch(
  path: string,
  { method = 'GET', body, schema }: { method?: Method, body?: unknown, schema?: z.ZodType } = {},
) {
  fakeApi.calls.push({ method, path, body })
  const handler = handlers.get(`${method} ${path}`)
  if (!handler)
    throw new Error(`Appel non simulé : ${method} ${path}`)
  const payload = await handler(body)
  return schema?.parse(payload)
}
