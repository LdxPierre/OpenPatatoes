import type { z } from 'zod'

/**
 * Échec d'un appel à l'API. `status` vaut 0 si le serveur n'a pas répondu.
 * `code` reprend le champ `error` renvoyé par le serveur quand il existe, et `body`
 * le corps entier : certaines erreurs y ajoutent de quoi les afficher.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body?: unknown,
  ) {
    super(`API ${status} : ${code}`)
    this.name = 'ApiError'
  }
}

interface ApiFetchOptions<Schema extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Corps envoyé en JSON. */
  body?: unknown
  /** Schéma de la réponse. Sans schéma, la réponse est ignorée. */
  schema?: Schema
  signal?: AbortSignal
}

/** Appelle l'API (`/api/...`), avec le cookie de session, et valide la réponse. */
export async function apiFetch<Schema extends z.ZodType>(
  path: string,
  options: ApiFetchOptions<Schema> & { schema: Schema },
): Promise<z.infer<Schema>>
export async function apiFetch(path: string, options?: ApiFetchOptions<z.ZodType>): Promise<void>
export async function apiFetch(path: string, { method = 'GET', body, schema, signal }: ApiFetchOptions<z.ZodType> = {}) {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
      body: body === undefined
        ? undefined
        : JSON.stringify(body),
      signal,
    })
  }
  catch (error) {
    if (signal?.aborted)
      throw error
    throw new ApiError(0, 'network_error')
  }

  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok)
    throw new ApiError(response.status, errorCodeOf(payload), payload)
  if (!schema)
    return

  const parsed = schema.safeParse(payload)
  if (!parsed.success)
    throw new ApiError(response.status, 'invalid_response')
  return parsed.data
}

function errorCodeOf(payload: unknown) {
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string')
    return payload.error
  return 'unknown_error'
}
