import type { ProjectResponse, ProjectsResponse, TaskTreeResponse } from '@openpatatoes/shared'
import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import { z } from 'zod'
import { currentUserId, requireSession } from '../auth/plugin.js'
import { opApiForUser } from '../op/connections.js'
import { buildTaskTree } from '../tasks/hierarchy.js'
import { sendOpRouteError } from './op-errors.js'

const projectParamsSchema = z.object({
  // Au-delà des entiers sûrs, `Number` arrondirait l'identifiant et OP recevrait un autre projet, ou `1e+21`.
  id: z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger),
})

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
      const params = projectParamsSchema.safeParse(request.params)
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
      const params = projectParamsSchema.safeParse(request.params)
      if (!params.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const result = await opApiForUser(deps, currentUserId(request)).andThen(api =>
        api.listProjectWorkPackages(params.data.id),
      )
      return result.match(
        workPackages => ({
          tasks: buildTaskTree(workPackages),
        }) satisfies TaskTreeResponse,
        error => sendOpRouteError(reply, error),
      )
    })
  }
}
