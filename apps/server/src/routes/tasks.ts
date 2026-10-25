import type { TaskAssigneesResponse, TaskDetail, TaskDetailResponse, TaskRejectedResponse } from '@openpatatoes/shared'
import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import type { OpApi } from '../op/client.js'
import type { OpError } from '../op/errors.js'
import type { OpWorkPackageDetail } from '../op/schemas.js'
import { taskChangesSchema } from '@openpatatoes/shared'
import { okAsync, ResultAsync } from 'neverthrow'
import { currentUserId, requireSession } from '../auth/plugin.js'
import { opApiForUser } from '../op/connections.js'
import { sendOpRouteError } from './op-errors.js'
import { idParamsSchema } from './params.js'

/**
 * Complète la tâche lue dans OP avec le caractère fermé de son statut : le lien d'état
 * d'une tâche ne le dit pas, seuls les statuts le donnent. Sans eux, la tâche reste
 * lisible : son état est alors traité comme ouvert.
 */
function taskDetail(api: OpApi, workPackage: ResultAsync<OpWorkPackageDetail, OpError>): ResultAsync<TaskDetail, OpError> {
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
        taskDetail(api, api.getWorkPackage(params.data.id)),
      )
      return result.match(
        task => ({ task }) satisfies TaskDetailResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /**
     * Modifie le temps estimé, le temps restant ou l'assigné ; renvoie la tâche telle qu'OP l'a enregistrée.
     * Un refus d'OP renvoie aussi l'état réel de la tâche, pour que l'interface annule sa modification.
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

      const updated = await taskDetail(api.value, api.value.updateWorkPackage(id, changes.data))
      if (updated.isOk())
        return { task: updated.value } satisfies TaskDetailResponse
      if (updated.error._tag !== 'OpRejected')
        return sendOpRouteError(reply, updated.error)

      // Sans relecture possible, le refus reste signalé ; l'interface rechargera la tâche.
      const current = await taskDetail(api.value, api.value.getWorkPackage(id))
      if (current.isErr())
        return sendOpRouteError(reply, updated.error)
      return reply.code(422).send({
        error: 'op_rejected',
        message: updated.error.message,
        task: current.value,
      } satisfies TaskRejectedResponse)
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
  }
}
