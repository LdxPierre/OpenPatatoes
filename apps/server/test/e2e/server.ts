import type { FakeProject, Interception, NewFakeWorkPackage } from '../support/fake-op.js'
import process from 'node:process'
import { hashPassword } from '../../src/auth/password.js'
import { createDatabase } from '../../src/db/client.js'
import { users } from '../../src/db/schema.js'
import { buildTestApp, connectAs } from '../support/app.js'
import { recreateDatabase, resetDatabase } from '../support/database.js'
import { startFakeOp } from '../support/fake-op.js'

/**
 * Serveur des tests de bout en bout (`apps/e2e`) : l'app réelle, sur une base PostgreSQL
 * dédiée, face au faux OpenProject des tests d'intégration.
 *
 * Chaque test décrit son scénario par `POST /api/__e2e/reset`, qui vide la base et le faux OP
 * puis les remplit. Cette route n'existe que dans ce serveur.
 */

/**
 * Scénario d'un test. Les utilisateurs OP reçoivent les identifiants 1, 2… dans l'ordre.
 * `apps/e2e/tests/fixtures.ts` en déclare la partie utilisée par les tests.
 */
interface Scenario {
  accounts?: Array<{ username: string, password: string, isAdmin?: boolean, opToken?: string }>
  op?: {
    users?: Array<{ name: string, token: string }>
    projects?: FakeProject[]
    workPackages?: NewFakeWorkPackage[]
    /** Réponses imposées aux prochaines requêtes correspondantes (`interceptNext`). */
    interceptions?: Interception[]
  }
}

const databaseUrl = process.env.E2E_DATABASE_URL
  ?? 'postgres://openpatatoes:openpatatoes@localhost:55432/openpatatoes_e2e'
const port = Number(process.env.E2E_API_PORT ?? 3100)

await recreateDatabase(databaseUrl)

const db = createDatabase(databaseUrl)
const op = await startFakeOp()
const app = buildTestApp(db, { opBaseUrl: op.url })

app.post<{ Body: Scenario }>('/api/__e2e/reset', async (request, reply) => {
  const { accounts = [], op: opScenario = {} } = request.body ?? {}
  op.reset()
  await resetDatabase(db)

  opScenario.users?.forEach(user => op.addUser(user))
  opScenario.projects?.forEach(project => op.addProject(project))
  opScenario.workPackages?.forEach(workPackage => op.addWorkPackage(workPackage))
  opScenario.interceptions?.forEach(interception => op.interceptNext(interception))

  for (const { username, password, isAdmin = false, opToken } of accounts) {
    await db.insert(users).values({ username, passwordHash: await hashPassword(password), isAdmin })
    if (opToken)
      await connectAs(app, { username, password }, opToken)
  }
  return reply.code(204).send()
})

async function shutdown() {
  await app.close()
  await op.close()
  await db.$client.end()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port, host: '127.0.0.1' })
