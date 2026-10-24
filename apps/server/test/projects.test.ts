import type { FakeOp, FakeUser } from './support/fake-op.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password.js'
import { SESSION_COOKIE } from '../src/auth/plugin.js'
import { users } from '../src/db/schema.js'
import { buildTestApp } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'
import { startFakeOp } from './support/fake-op.js'

const alice = { username: 'alice', password: 'mot-de-passe-alice' }
const bob = { username: 'bob', password: 'mot-de-passe-bob' }

describe('projets', () => {
  const db = createTestDatabase()
  let op: FakeOp
  let app: ReturnType<typeof buildTestApp>
  let opAlice: FakeUser
  let opBob: FakeUser

  beforeAll(async () => {
    op = await startFakeOp()
    app = buildTestApp(db, { opBaseUrl: op.url })
  })
  beforeEach(async () => {
    op.reset()
    await resetDatabase(db)
    for (const account of [alice, bob]) {
      await db.insert(users).values({ username: account.username, passwordHash: await hashPassword(account.password) })
    }
    opAlice = op.addUser({ name: 'Alice OP', token: 'tok-alice' })
    opBob = op.addUser({ name: 'Bob OP', token: 'tok-bob' })
  })
  afterAll(async () => {
    await app.close()
    await op.close()
    await db.$client.end()
  })

  async function loginAs(account: { username: string, password: string }): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: account })
    const cookie = response.cookies.find(c => c.name === SESSION_COOKIE)
    if (!cookie)
      throw new Error('cookie de session absent')
    return cookie.value
  }

  /** Connecte le compte et enregistre son jeton OP. */
  async function connectAs(account: { username: string, password: string }, token: string): Promise<string> {
    const session = await loginAs(account)
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

  function get(session: string, url: string) {
    return app.inject({
      method: 'GET',
      url,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  describe('liste', () => {
    it('ne renvoie que les projets accessibles avec le jeton de l\'utilisateur', async () => {
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [opAlice.id],
      })
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [opBob.id],
      })
      op.addProject({
        id: 3,
        identifier: 'gamma',
        name: 'Gamma',
        memberIds: [opAlice.id, opBob.id],
      })
      const aliceSession = await connectAs(alice, 'tok-alice')
      const bobSession = await connectAs(bob, 'tok-bob')

      const aliceView = await get(aliceSession, '/api/projects')
      const bobView = await get(bobSession, '/api/projects')

      expect(aliceView.statusCode).toBe(200)
      expect(aliceView.json()).toEqual({
        projects: [
          { id: 1, identifier: 'alpha', name: 'Alpha' },
          { id: 3, identifier: 'gamma', name: 'Gamma' },
        ],
      })
      expect(bobView.json()).toEqual({
        projects: [
          { id: 2, identifier: 'beta', name: 'Beta' },
          { id: 3, identifier: 'gamma', name: 'Gamma' },
        ],
      })
    })

    it('suit toutes les pages de l\'API OP', async () => {
      const count = 250
      for (let id = 1; id <= count; id++) {
        op.addProject({
          id,
          identifier: `projet-${id}`,
          name: `Projet ${id}`,
          memberIds: [opAlice.id],
        })
      }
      const session = await connectAs(alice, 'tok-alice')

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(200)
      const ids = response.json().projects.map((project: { id: number }) => project.id)
      expect(ids).toEqual(Array.from({ length: count }, (_, index) => index + 1))
    })

    it('s\'arrête sur une page vide qui annonce une suite', async () => {
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({
        path: '/api/v3/projects',
        status: 200,
        body: {
          _type: 'Collection',
          _embedded: { elements: [] },
          _links: {
            nextByOffset: { href: '/api/v3/projects?offset=2&pageSize=100' },
          },
        },
      })

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ projects: [] })
    })

    it('refuse de suivre un lien de page hors de l\'instance OP', async () => {
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({
        path: '/api/v3/projects',
        status: 200,
        body: {
          _type: 'Collection',
          _embedded: {
            elements: [
              {
                _type: 'Project',
                id: 1,
                identifier: 'alpha',
                name: 'Alpha',
              },
            ],
          },
          _links: {
            nextByOffset: { href: 'https://ailleurs.example/api/v3/projects?offset=2&pageSize=100' },
          },
        },
      })

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(502)
      expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
    })

    it('renvoie une liste vide si aucun projet n\'est accessible', async () => {
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [opBob.id],
      })
      const session = await connectAs(alice, 'tok-alice')

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ projects: [] })
    })

    it('exige une session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/projects' })

      expect(response.statusCode).toBe(401)
    })

    it('signale l\'absence de jeton OP', async () => {
      const session = await loginAs(alice)

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ error: 'op_not_connected' })
    })

    it('distingue OP indisponible d\'un refus d\'accès', async () => {
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({ path: '/api/v3/projects', status: 503 })

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: 'op_unavailable' })
    })

    it('rejette une réponse OP non conforme au schéma attendu', async () => {
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({
        path: '/api/v3/projects',
        status: 200,
        body: {
          _type: 'Collection',
          _embedded: {
            elements: [
              { _type: 'Project', id: 'un' },
            ],
          },
          _links: {},
        },
      })

      const response = await get(session, '/api/projects')

      expect(response.statusCode).toBe(502)
      expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
    })
  })

  describe('ouverture', () => {
    it('renvoie le projet demandé', async () => {
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [opAlice.id],
      })
      const session = await connectAs(alice, 'tok-alice')

      const response = await get(session, '/api/projects/1')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        project: { id: 1, identifier: 'alpha', name: 'Alpha' },
      })
    })

    it('affiche un refus d\'accès d\'OP comme un message clair, distinct d\'une erreur serveur', async () => {
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [opAlice.id],
      })
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({ path: '/api/v3/projects/1', status: 403 })

      const response = await get(session, '/api/projects/1')

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ error: 'op_forbidden' })
    })

    it('traite un projet masqué par OP comme introuvable ou inaccessible', async () => {
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [opBob.id],
      })
      const session = await connectAs(alice, 'tok-alice')

      const response = await get(session, '/api/projects/2')

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })

    it('distingue OP indisponible d\'un refus d\'accès', async () => {
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [opAlice.id],
      })
      const session = await connectAs(alice, 'tok-alice')
      op.interceptNext({ path: '/api/v3/projects/1', status: 503 })

      const response = await get(session, '/api/projects/1')

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: 'op_unavailable' })
    })

    it('refuse un identifiant de projet invalide ou trop grand sans interroger OP', async () => {
      const session = await connectAs(alice, 'tok-alice')

      for (const id of [
        'abc',
        '0',
        '-1',
        '1.5',
        '9007199254740993',
        '1'.repeat(22),
      ]) {
        const response = await get(session, `/api/projects/${id}`)
        expect(response.statusCode).toBe(400)
        expect(response.json()).toMatchObject({ error: 'invalid_request' })
      }
    })

    it('exige une session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/projects/1' })

      expect(response.statusCode).toBe(401)
    })
  })
})
