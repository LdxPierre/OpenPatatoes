import type { OpError } from './errors.js'
import type { OpProject, OpStatus, OpUser, OpWorkPackage, OpWorkPackageDetail } from './schemas.js'
import { Buffer } from 'node:buffer'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { z } from 'zod'
import {

  OpForbiddenError,
  OpInvalidResponseError,
  OpNotFoundError,
  OpUnauthenticatedError,
  OpUnavailableError,
} from './errors.js'
import {
  opCollectionPageSchema,
  opProjectSchema,
  opStatusSchema,
  opUserSchema,
  opWorkPackageDetailSchema,
  opWorkPackageSchema,
} from './schemas.js'

const REQUEST_TIMEOUT_MS = 10_000
/** Taille des pages demandées à OP pour les collections. */
const PAGE_SIZE = 100
/** Les projets comptent des milliers de tâches : de plus grandes pages limitent les allers-retours. OP plafonne à sa propre limite. */
const WORK_PACKAGE_PAGE_SIZE = 1000

/** Accès à l'API OP au nom d'un utilisateur, avec son seul jeton. */
export interface OpApi {
  getCurrentUser: () => ResultAsync<OpUser, OpError>
  /** Tous les projets visibles avec le jeton, toutes pages confondues. */
  listProjects: () => ResultAsync<OpProject[], OpError>
  getProject: (id: number) => ResultAsync<OpProject, OpError>
  /** Toutes les tâches du projet, fermées comprises, toutes pages confondues, triées par identifiant. */
  listProjectWorkPackages: (projectId: number) => ResultAsync<OpWorkPackage[], OpError>
  /** Tous les statuts de l'instance, avec leur caractère fermé. */
  listStatuses: () => ResultAsync<OpStatus[], OpError>
  /** Une tâche, durées converties en heures décimales. */
  getWorkPackage: (id: number) => ResultAsync<OpWorkPackageDetail, OpError>
}

/** Seule couche qui parle à l'API OP. Elle n'a pas de jeton propre : chaque appel passe par `withToken`. */
export interface OpClient {
  withToken: (token: string) => OpApi
}

export interface OpClientOptions {
  /** URL de l'instance, sans `/api/v3`. */
  baseUrl: string
}

function errorForStatus(status: number): OpError {
  if (status === 401)
    return new OpUnauthenticatedError()
  if (status === 403)
    return new OpForbiddenError()
  if (status === 404)
    return new OpNotFoundError()
  if (status >= 500)
    return new OpUnavailableError(`statut HTTP ${status}`)
  return new OpInvalidResponseError(`statut HTTP ${status}`)
}

export function createOpClient({ baseUrl }: OpClientOptions): OpClient {
  const instanceUrl = baseUrl.replace(/\/+$/, '')
  const apiRoot = `${instanceUrl}/api/v3`
  const instanceOrigin = new URL(instanceUrl).origin

  return {
    withToken(token) {
      const authorization = `Basic ${Buffer.from(`apikey:${token}`).toString('base64')}`

      /** `label` identifie la ressource dans les messages d'erreur, sans query string. */
      const getUrl = <T>(url: string, label: string, schema: z.ZodType<T>): ResultAsync<T, OpError> =>
        ResultAsync.fromPromise(
          fetch(url, {
            headers: { authorization, accept: 'application/hal+json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
          cause => new OpUnavailableError(cause instanceof Error
            ? cause.message
            : 'requête impossible'),
        )
          .andThen((response) => {
            if (!response.ok)
              return errAsync(errorForStatus(response.status))
            return ResultAsync.fromPromise(
              response.json() as Promise<unknown>,
              () => new OpInvalidResponseError('corps JSON illisible'),
            )
          })
          .andThen((body) => {
            const parsed = schema.safeParse(body)
            return parsed.success
              ? okAsync(parsed.data)
              : errAsync(new OpInvalidResponseError(`${label} : ${z.prettifyError(parsed.error)}`))
          })

      const get = <T>(path: string, schema: z.ZodType<T>) => getUrl(`${apiRoot}${path}`, path, schema)

      /** Suit les liens `nextByOffset` d'une collection jusqu'à la dernière page. */
      const getAll = <T>(
        path: string,
        element: z.ZodType<T>,
        { pageSize = PAGE_SIZE, query = {} }: { pageSize?: number, query?: Record<string, string> } = {},
      ): ResultAsync<T[], OpError> => {
        const pageSchema = opCollectionPageSchema(element)
        const fetchFrom = (url: string, previous: T[]): ResultAsync<T[], OpError> =>
          getUrl(url, path, pageSchema).andThen((page) => {
            const elements = [
              ...previous,
              ...page._embedded.elements,
            ]
            const next = page._links.nextByOffset
            // Une page vide qui annonce une suite bouclerait sans fin.
            if (!next || page._embedded.elements.length === 0)
              return okAsync(elements)
            const nextUrl = new URL(next.href, instanceUrl)
            // Le jeton ne doit jamais partir vers un autre hôte que l'instance OP.
            if (nextUrl.origin !== instanceOrigin)
              return errAsync(new OpInvalidResponseError(`${path} : lien de page hors de l'instance`))
            return fetchFrom(nextUrl.toString(), elements)
          })
        const params = new URLSearchParams({
          ...query,
          pageSize: String(pageSize),
        })
        return fetchFrom(`${apiRoot}${path}?${params}`, [])
      }

      return {
        getCurrentUser: () => get('/users/me', opUserSchema),
        listProjects: () => getAll('/projects', opProjectSchema),
        getProject: id => get(`/projects/${id}`, opProjectSchema),
        listProjectWorkPackages: projectId =>
          getAll(`/projects/${projectId}/work_packages`, opWorkPackageSchema, {
            pageSize: WORK_PACKAGE_PAGE_SIZE,
            // Sans filtre explicite, OP ne renvoie que les tâches ouvertes.
            query: {
              filters: '[]',
              sortBy: JSON.stringify([
                ['id', 'asc'],
              ]),
            },
          }),
        listStatuses: () => getAll('/statuses', opStatusSchema),
        getWorkPackage: id => get(`/work_packages/${id}`, opWorkPackageDetailSchema),
      }
    },
  }
}
