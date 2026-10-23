import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import { sql } from 'drizzle-orm'

export function healthRoutes({ db }: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/health', async (_request, reply) => {
      try {
        await db.execute(sql`SELECT 1`)
        return { status: 'ok', database: 'ok' }
      }
      catch {
        return reply.code(503).send({ status: 'degraded', database: 'unavailable' })
      }
    })
  }
}
