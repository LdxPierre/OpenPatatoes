import type { TaskDetailResponse } from '@openpatatoes/shared'
import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import { okAsync, ResultAsync } from 'neverthrow'
import { currentUserId, requireSession } from '../auth/plugin.js'
import { opApiForUser } from '../op/connections.js'
import { sendOpRouteError } from './op-errors.js'
import { idParamsSchema } from './params.js'

/** Tâches OP lues avec le jeton de l'utilisateur connecté. */
export function taskRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook('onRequest', requireSession(deps.db, deps.cookie))

    /** Détail d'une tâche en lecture : propriétés, temps en heures décimales et parent dans la hiérarchie. */
    app.get('/tasks/:id', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      // Les statuts disent lesquels sont fermés : le lien d'état d'une tâche ne le dit pas.
      // Sans eux, la tâche reste lisible : son état est alors traité comme ouvert.
      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        ResultAsync.combine([
          api.getWorkPackage(params.data.id),
          api.listStatuses().orElse(() => okAsync([])),
        ]),
      )
      return result.match(
        ([task, statuses]) => ({
          task: {
            ...task,
            status: {
              ...task.status,
              isClosed: statuses.find(status => status.id === task.status.id)?.isClosed ?? false,
            },
          },
        }) satisfies TaskDetailResponse,
        error => sendOpRouteError(reply, error),
      )
    })
  }
}
