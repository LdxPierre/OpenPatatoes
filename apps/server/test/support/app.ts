import type { FastifyInstance } from 'fastify'
import type { AppDependencies } from '../../src/app.js'
import type { Database } from '../../src/db/client.js'
import { randomBytes } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { SESSION_COOKIE } from '../../src/auth/plugin.js'
import { createOpClient } from '../../src/op/client.js'
import { createTokenCipher } from '../../src/op/token-cipher.js'

/** URL d'une instance OP injoignable, pour les tests qui ne parlent pas à OP. */
const UNREACHABLE_OP_URL = 'http://127.0.0.1:9'

/** Construit l'application avec une clé de chiffrement propre au test et l'URL d'OP donnée. */
export function buildTestApp(
  db: Database,
  { opBaseUrl = UNREACHABLE_OP_URL, ...overrides }: Partial<AppDependencies> & { opBaseUrl?: string } = {},
) {
  return buildApp({
    db,
    cookie: { secure: false },
    op: createOpClient({ baseUrl: opBaseUrl }),
    tokenCipher: createTokenCipher(randomBytes(32)),
    ...overrides,
  })
}

interface Account {
  username: string
  password: string
}

/** Connecte le compte ; renvoie la valeur du cookie de session. */
export async function loginAs(app: FastifyInstance, account: Account): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: account })
  const cookie = login.cookies.find(c => c.name === SESSION_COOKIE)
  if (!cookie)
    throw new Error('cookie de session absent')
  return cookie.value
}

/** Connecte le compte et enregistre son jeton OP ; renvoie la valeur du cookie de session. */
export async function connectAs(app: FastifyInstance, account: Account, token: string): Promise<string> {
  const session = await loginAs(app, account)
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/profile/op-connection',
    cookies: { [SESSION_COOKIE]: session },
    payload: { token },
  })
  if (saved.statusCode !== 200)
    throw new Error(`jeton refusé : ${saved.body}`)
  return session
}
