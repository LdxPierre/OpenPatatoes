import type { FastifyPluginAsync } from 'fastify'
import type { AppDependencies } from '../app.js'
import { loginRequestSchema } from '@openpatatoes/shared'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { clearSessionCookie, requireSession, SESSION_COOKIE, setSessionCookie } from '../auth/plugin.js'
import { createSession, revokeSession, sessionUserColumns } from '../auth/sessions.js'
import { opConnections, users } from '../db/schema.js'

// Vérifié quand l'identifiant est inconnu, pour que la durée de réponse ne révèle pas les comptes existants.
const dummyHash = hashPassword('openpatatoes-dummy-password')

export function authRoutes({ db, cookie }: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.post('/auth/login', async (request, reply) => {
      const body = loginRequestSchema.safeParse(request.body)
      if (!body.success)
        return reply.code(400).send({ error: 'invalid_request' })

      const [user] = await db
        .select({ ...sessionUserColumns, passwordHash: users.passwordHash })
        .from(users)
        .leftJoin(opConnections, eq(opConnections.userId, users.id))
        .where(eq(users.username, body.data.username))
      const passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash), body.data.password)
      if (!user || !passwordOk)
        return reply.code(401).send({ error: 'invalid_credentials' })

      const session = await createSession(db, user.id)
      setSessionCookie(reply, session.token, session.expiresAt, cookie)
      const { passwordHash: _, ...sessionUser } = user
      return { user: sessionUser }
    })

    app.post('/auth/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE]
      if (token)
        await revokeSession(db, token)
      clearSessionCookie(reply, cookie)
      return reply.code(204).send()
    })

    app.register(async (privateScope) => {
      privateScope.addHook('onRequest', requireSession(db, cookie))

      privateScope.get('/auth/me', async request => ({ user: request.user }))
    })
  }
}
