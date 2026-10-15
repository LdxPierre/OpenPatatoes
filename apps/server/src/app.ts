import type { FastifyInstance } from 'fastify'
import type { SessionCookieOptions } from './auth/plugin.js'
import type { Database } from './db/client.js'
import type { OpClient } from './op/client.js'
import type { TokenCipher } from './op/token-cipher.js'
import cookiePlugin from '@fastify/cookie'
import Fastify from 'fastify'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { opConnectionRoutes } from './routes/op-connection.js'
import { projectRoutes } from './routes/projects.js'
import { taskRoutes } from './routes/tasks.js'

export interface AppDependencies {
  db: Database
  cookie: SessionCookieOptions
  op: OpClient
  tokenCipher: TokenCipher
}

export interface AppOptions {
  logger?: boolean
}

export function buildApp(deps: AppDependencies, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false })

  app.decorateRequest('user', null)
  app.register(cookiePlugin)
  app.register(healthRoutes(deps), { prefix: '/api' })
  app.register(authRoutes(deps), { prefix: '/api' })
  app.register(opConnectionRoutes(deps), { prefix: '/api' })
  app.register(projectRoutes(deps), { prefix: '/api' })
  app.register(taskRoutes(deps), { prefix: '/api' })

  return app
}
