import type { ProjectResponse, ProjectsResponse, ProjectTypesResponse, TaskDetailResponse, TaskTreeResponse } from '@openpatatoes/shared'
import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import { newTaskSchema } from '@openpatatoes/shared'
import { ResultAsync } from 'neverthrow'
import { currentUserId, requireSession } from '../auth/plugin.js'
import { opApiForUser } from '../op/connections.js'
import { buildTaskTree } from '../tasks/hierarchy.js'
import { withClosedStatus } from '../tasks/status.js'
import { sendOpRouteError } from './op-errors.js'
import { idParamsSchema } from './params.js'

/** Projets OP visibles avec le jeton de l'utilisateur connecté. */
export function projectRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook('onRequest', requireSession(deps.db, deps.cookie))

    app.get('/projects', async (request, reply) => {
      const result = await opApiForUser(deps, currentUserId(request)).andThen(api => api.listProjects())
      return result.match(
        projects => ({ projects }) satisfies ProjectsResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /** Ouverture d'un projet : sert d'en-tête à sa vue de tâches. */
    app.get('/projects/:id', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api => api.getProject(params.data.id))
      return result.match(
        project => ({ project }) satisfies ProjectResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /** Arbre des tâches du projet, construit depuis une seule liste OP (toutes pages suivies). */
    app.get('/projects/:id/tasks', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      // Les statuts disent lesquels sont fermés : le lien d'état d'une tâche ne le dit pas.
      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        ResultAsync.combine([
          api.listProjectWorkPackages(params.data.id),
          api.listStatuses(),
        ]),
      )
      return result.match(
        ([workPackages, statuses]) => ({
          tasks: buildTaskTree(workPackages, statuses),
        }) satisfies TaskTreeResponse,
        error => sendOpRouteError(reply, error),
      )
    })

    /**
     * Crée une tâche dans le projet, avec son type, son titre et son parent ; renvoie la tâche
     * telle qu'OP l'a enregistrée. C'est OP qui vérifie que le type et le parent conviennent au projet :
     * un refus renvoie son message (422).
     */
    app.post('/projects/:id/tasks', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      const task = newTaskSchema.safeParse(request.body)
      if (!params.success || !task.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        withClosedStatus(api, api.createWorkPackage(params.data.id, task.data)),
      )
      if (result.isOk())
        return reply.code(201).send({ task: result.value } satisfies TaskDetailResponse)
      if (result.error._tag === 'OpRejected') {
        return reply.code(422).send({
          error: 'op_rejected',
          message: `OpenProject a refusé la création : ${result.error.reasons.join(' ')}`,
        })
      }
      return sendOpRouteError(reply, result.error)
    })

    /** Types de tâche actifs dans le projet : ceux qu'une nouvelle tâche peut prendre. */
    app.get('/projects/:id/types', async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api => api.listProjectTypes(params.data.id))
      return result.match(
        types => ({ types }) satisfies ProjectTypesResponse,
        error => sendOpRouteError(reply, error),
      )
    })
  }
}
