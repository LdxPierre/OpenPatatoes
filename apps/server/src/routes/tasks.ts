import type { TaskAllowedValuesResponse, TaskAssigneesResponse, TaskDetail, TaskDetailResponse, TaskRejectedResponse } from '@openpatatoes/shared'
import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import type { OpApi } from '../op/client.js'
import type { OpError } from '../op/errors.js'
import type { OpWorkPackageDetail } from '../op/schemas.js'
import { taskChangesSchema } from '@openpatatoes/shared'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { currentUserId, requireSession } from '../auth/plugin.js'
import { opApiForUser } from '../op/connections.js'
import { wouldCreateCycle } from '../tasks/hierarchy.js'
import { sendOpRouteError } from './op-errors.js'
import { idParamsSchema } from './params.js'

/**
 * Complète la tâche lue dans OP avec le caractère fermé de son statut : le lien d'état
 * d'une tâche ne le dit pas, seuls les statuts le donnent. Sans eux, la tâche reste
 * lisible : son état est alors traité comme ouvert.
 */
function withClosedStatus(api: OpApi, workPackage: ResultAsync<OpWorkPackageDetail, OpError>): ResultAsync<TaskDetail, OpError> {
  return ResultAsync.combine([
    workPackage,
    api.listStatuses().orElse(() => okAsync([])),
  ]).map(([task, statuses]) => ({
    ...task,
    status: {
      ...task.status,
      isClosed: statuses.find(status => status.id === task.status.id)?.isClosed ?? false,
    },
  }))
}

/** Parent d'une tâche ; `null` pour une tâche introuvable ou invisible avec le jeton : la remontée s'y arrête. */
function parentIdOf(api: OpApi, id: number): ResultAsync<number | null, OpError> {
  return api.getWorkPackage(id)
    .map(task => task.parent?.id ?? null)
    .orElse(error => error._tag === 'OpNotFound'
      ? okAsync(null)
      : errAsync(error))
}

/** Tâches OP lues et modifiées avec le jeton de l'utilisateur connecté. */
export function taskRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook('onRequest', requireSession(deps.db, deps.cookie))

    /** Détail d'une tâche en lecture : propriétés, temps en heures décimales et parent dans la hiérarchie. */
    app.get('/tasks/:id', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        withClosedStatus(api, api.getWorkPackage(params.data.id)),
      )
      return result.match(
        task => ({ task }) satisfies TaskDetailResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /**
     * Modifie le temps estimé, le temps restant, l'assigné, l'état, le type, la priorité ou le parent ;
     * renvoie la tâche telle qu'OP l'a enregistrée. Un parent qui créerait un cycle est refusé avant
     * d'écrire dans OP, quelle que soit l'interface. Un refus renvoie aussi l'état réel de la tâche,
     * pour que l'interface annule sa modification.
     */
    app.patch('/tasks/:id', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      const changes = taskChangesSchema.safeParse(request.body)
      if (!params.success || !changes.success)
        return reply.code(400).send({ error: 'invalid_request' })
      const { id } = params.data

      const api = await opApiForUser(deps, currentUserId(request))
      if (api.isErr())
        return sendOpRouteError(reply, api.error)

      /** Refus : avec l'état réel de la tâche, ou sans s'il n'a pas pu être relu. */
      const reject = async (rejection: Omit<TaskRejectedResponse, 'task'>) => {
        const current = await withClosedStatus(api.value, api.value.getWorkPackage(id))
        return reply.code(422).send({
          ...rejection,
          ...(current.isOk() && { task: current.value }),
        } satisfies TaskRejectedResponse)
      }

      const { parentId } = changes.data
      if (parentId != null) {
        const cycle = await wouldCreateCycle(id, parentId, ancestor => parentIdOf(api.value, ancestor))
        if (cycle.isErr())
          return sendOpRouteError(reply, cycle.error)
        if (cycle.value) {
          return reject({
            error: 'task_parent_cycle',
            message: parentId === id
              ? 'Une tâche ne peut pas être son propre parent.'
              : 'Ce parent est une sous-tâche de la tâche : la tâche ne peut pas devenir la sous-tâche de ses propres sous-tâches.',
          })
        }
      }

      const updated = await withClosedStatus(api.value, api.value.updateWorkPackage(id, changes.data))
      if (updated.isOk())
        return { task: updated.value } satisfies TaskDetailResponse
      if (updated.error._tag !== 'OpRejected')
        return sendOpRouteError(reply, updated.error)
      return reject({ error: 'op_rejected', message: updated.error.message })
    })

    /** Utilisateurs à qui la tâche peut être assignée. */
    app.get('/tasks/:id/assignees', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        api.listAvailableAssignees(params.data.id),
      )
      return result.match(
        assignees => ({ assignees }) satisfies TaskAssigneesResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /** États, types et priorités qu'OP accepte pour la tâche : les transitions d'état viennent de son formulaire. */
    app.get('/tasks/:id/allowed-values', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      // Le formulaire exige la version actuelle de la tâche : elle est relue juste avant.
      const { id } = params.data
      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        api.getWorkPackage(id).andThen(task => api.getWorkPackageForm(id, task.lockVersion)),
      )
      return result.match(
        allowedValues => allowedValues satisfies TaskAllowedValuesResponse,
        error => sendOpRouteError(reply, error),
      )
    })
  }
}
