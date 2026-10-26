import type { FakeOp, FakeUser } from './support/fake-op.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password.js'
import { SESSION_COOKIE } from '../src/auth/plugin.js'
import { users } from '../src/db/schema.js'
import { buildTestApp, connectAs } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'
import { startFakeOp } from './support/fake-op.js'

const alice = { username: 'alice', password: 'mot-de-passe-alice' }

describe('activités d\'une tâche', () => {
  const db = createTestDatabase()
  let op: FakeOp
  let app: ReturnType<typeof buildTestApp>
  let opAlice: FakeUser
  let opBob: FakeUser
  let session: string

  beforeAll(async () => {
    op = await startFakeOp()
    app = buildTestApp(db, { opBaseUrl: op.url })
  })
  beforeEach(async () => {
    op.reset()
    await resetDatabase(db)
    await db.insert(users).values({ username: alice.username, passwordHash: await hashPassword(alice.password) })
    opAlice = op.addUser({ name: 'Alice OP', token: 'tok-alice' })
    opBob = op.addUser({ name: 'Bob OP', token: 'tok-bob' })
    op.addProject({
      id: 1,
      identifier: 'alpha',
      name: 'Alpha',
      memberIds: [opAlice.id, opBob.id],
    })
    op.addWorkPackage({ id: 10, projectId: 1, subject: 'Tâche' })
    session = await connectAs(app, alice, 'tok-alice')
  })
  afterAll(async () => {
    await app.close()
    await op.close()
    await db.$client.end()
  })

  function getActivities(taskId: number | string = 10) {
    return app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/activities`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  function postComment(payload: unknown, taskId: number | string = 10) {
    return app.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/activities`,
      cookies: { [SESSION_COOKIE]: session },
      payload: payload as object,
    })
  }

  describe('historique', () => {
    it('renvoie la création, les modifications et les commentaires, du plus ancien au plus récent, avec leur auteur', async () => {
      op.addActivity({ workPackageId: 10, userId: opBob.id, createdAt: '2026-10-01T08:00:00.000Z' })
      op.addActivity({
        workPackageId: 10,
        userId: opAlice.id,
        comment: 'Je **prends**',
        createdAt: '2026-10-02T09:30:00.000Z',
      })
      op.addActivity({
        workPackageId: 10,
        userId: opBob.id,
        details: ['Status changed from New to In progress', 'Remaining work set to 4.00 h'],
        createdAt: '2026-10-03T10:00:00.000Z',
      })

      const response = await getActivities()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        activities: [
          {
            id: expect.any(Number),
            author: { id: opBob.id, name: 'Bob OP' },
            createdAt: '2026-10-01T08:00:00.000Z',
            creation: true,
            comment: null,
            changes: [],
          },
          {
            id: expect.any(Number),
            author: { id: opAlice.id, name: 'Alice OP' },
            createdAt: '2026-10-02T09:30:00.000Z',
            creation: false,
            comment: '<p>Je **prends**</p>',
            changes: [],
          },
          {
            id: expect.any(Number),
            author: { id: opBob.id, name: 'Bob OP' },
            createdAt: '2026-10-03T10:00:00.000Z',
            creation: false,
            comment: null,
            changes: ['Status changed from New to In progress', 'Remaining work set to 4.00 h'],
          },
        ],
      })
    })

    it('omet les activités qui ne disent rien', async () => {
      op.addActivity({ workPackageId: 10, userId: opBob.id, createdAt: '2026-10-01T08:00:00.000Z' })
      op.addActivity({
        workPackageId: 10,
        userId: opBob.id,
        comment: '   ',
        createdAt: '2026-10-02T08:00:00.000Z',
      })

      const response = await getActivities()

      expect(response.json().activities).toEqual([
        expect.objectContaining({ creation: true }),
      ])
    })

    it('lit chaque auteur une seule fois', async () => {
      for (const day of [1, 2, 3]) {
        op.addActivity({
          workPackageId: 10,
          userId: opBob.id,
          comment: `Jour ${day}`,
          createdAt: `2026-10-0${day}T08:00:00.000Z`,
        })
      }
      // Une seconde lecture de Bob tomberait sur cette panne et le rendrait anonyme.
      op.interceptNext({
        path: `/api/v3/users/${opBob.id}`,
        status: 200,
        body: { _type: 'User', id: opBob.id, name: 'Bob OP' },
      })
      op.interceptNext({ path: `/api/v3/users/${opBob.id}`, status: 503 })

      const response = await getActivities()

      expect(response.json().activities.map((activity: { author: unknown }) => activity.author)).toEqual([
        { id: opBob.id, name: 'Bob OP' },
        { id: opBob.id, name: 'Bob OP' },
        { id: opBob.id, name: 'Bob OP' },
      ])
    })

    it('garde l\'historique lisible quand OP ne donne pas le nom d\'un auteur', async () => {
      op.addActivity({ workPackageId: 10, userId: opBob.id, comment: 'Bonjour' })
      op.interceptNext({ path: `/api/v3/users/${opBob.id}`, status: 403 })

      const response = await getActivities()

      expect(response.statusCode).toBe(200)
      expect(response.json().activities).toEqual([
        expect.objectContaining({ author: null, comment: '<p>Bonjour</p>' }),
      ])
    })

    it('assainit le HTML des commentaires : ni script, ni attribut on*, ni lien javascript', async () => {
      op.addActivity({
        workPackageId: 10,
        userId: opBob.id,
        comment: '<script>alert(1)</script><img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)" onclick="alert(4)">piège</a><b onmouseover="alert(5)">gras</b>',
      })

      const response = await getActivities()

      const comment: string = response.json().activities[0].comment
      expect(comment).not.toMatch(/<script/i)
      expect(comment).not.toMatch(/\son\w+=/i)
      expect(comment).not.toMatch(/javascript:/i)
      expect(comment).toContain('piège')
      expect(comment).toContain('<b>gras</b>')
    })

    it('fait pointer les liens et images relatifs vers l\'instance OP, dans un nouvel onglet', async () => {
      op.addActivity({
        workPackageId: 10,
        userId: opBob.id,
        comment: '<a href="/work_packages/12">#12</a> <img src="/api/v3/attachments/3/content" alt="capture">',
      })

      const response = await getActivities()

      expect(response.json().activities[0].comment).toBe(
        `<p><a href="${op.url}/work_packages/12" target="_blank" rel="noopener noreferrer">#12</a> <img src="${op.url}/api/v3/attachments/3/content" alt="capture" /></p>`,
      )
    })

    it('traite une tâche masquée par OP comme introuvable ou inaccessible', async () => {
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [],
      })
      op.addWorkPackage({ id: 20, projectId: 2, subject: 'Ailleurs' })

      const response = await getActivities(20)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })

    it('distingue OP indisponible d\'un refus d\'accès', async () => {
      op.interceptNext({ path: '/api/v3/work_packages/10/activities', status: 503 })

      const response = await getActivities()

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: 'op_unavailable' })
    })

    it('rejette une réponse OP non conforme au schéma attendu', async () => {
      op.interceptNext({
        path: '/api/v3/work_packages/10/activities',
        status: 200,
        body: {
          _type: 'Collection',
          _embedded: {
            elements: [
              { _type: 'Activity', id: 1 },
            ],
          },
          _links: {},
        },
      })

      const response = await getActivities()

      expect(response.statusCode).toBe(502)
      expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
    })

    it('refuse un identifiant de tâche invalide', async () => {
      const response = await getActivities('abc')

      expect(response.statusCode).toBe(400)
    })

    it('exige une session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/tasks/10/activities' })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('ajout d\'un commentaire', () => {
    it('enregistre le commentaire markdown dans OP, au nom de l\'utilisateur, et le renvoie', async () => {
      op.addActivity({ workPackageId: 10, userId: opBob.id, createdAt: '2026-10-01T08:00:00.000Z' })

      const response = await postComment({ comment: 'Fait, il reste **les tests**.' })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        activity: {
          id: expect.any(Number),
          author: { id: opAlice.id, name: 'Alice OP' },
          createdAt: expect.any(String),
          creation: false,
          comment: '<p>Fait, il reste **les tests**.</p>',
          changes: [],
        },
      })

      const inOp = await fetch(`${op.url}/api/v3/work_packages/10/activities`, {
        headers: op.authHeaders('tok-bob'),
      })
      expect((await inOp.json())._embedded.elements).toEqual([
        expect.objectContaining({ version: 1 }),
        expect.objectContaining({
          comment: expect.objectContaining({ raw: 'Fait, il reste **les tests**.' }),
          _links: expect.objectContaining({
            user: { href: `/api/v3/users/${opAlice.id}` },
          }),
        }),
      ])
    })

    it('ajoute le commentaire à la fin de l\'historique', async () => {
      op.addActivity({ workPackageId: 10, userId: opBob.id, createdAt: '2026-10-01T08:00:00.000Z' })

      await postComment({ comment: 'Nouveau' })
      const response = await getActivities()

      expect(response.json().activities).toEqual([
        expect.objectContaining({ creation: true }),
        expect.objectContaining({
          author: { id: opAlice.id, name: 'Alice OP' },
          comment: '<p>Nouveau</p>',
        }),
      ])
    })

    it('assainit le commentaire renvoyé', async () => {
      const response = await postComment({ comment: '<img src="x.png" onerror="alert(1)"><script>alert(2)</script>' })

      expect(response.statusCode).toBe(201)
      expect(response.json().activity.comment).not.toMatch(/<script|\son\w+=/i)
    })

    it('refuse un commentaire vide ou fait d\'espaces, sans rien envoyer à OP', async () => {
      for (const comment of ['', '   \n '])
        expect((await postComment({ comment })).statusCode).toBe(400)
      expect((await postComment({})).statusCode).toBe(400)

      expect((await getActivities()).json().activities).toEqual([])
    })

    it('renvoie le refus d\'OP avec son message', async () => {
      op.interceptNext({
        method: 'POST',
        path: '/api/v3/work_packages/10/activities',
        status: 422,
        body: { _type: 'Error', errorIdentifier: 'urn:openproject-org:api:v3:errors:PropertyConstraintViolation', message: 'Comment is too long.' },
      })

      const response = await postComment({ comment: 'Trop long' })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        error: 'op_rejected',
        message: expect.stringContaining('Comment is too long.'),
      })
    })

    it('affiche un refus de permission d\'OP comme un message clair', async () => {
      op.interceptNext({ method: 'POST', path: '/api/v3/work_packages/10/activities', status: 403 })

      const response = await postComment({ comment: 'Bonjour' })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ error: 'op_forbidden' })
    })

    it('distingue OP indisponible d\'un refus', async () => {
      op.interceptNext({ method: 'POST', path: '/api/v3/work_packages/10/activities', status: 503 })

      const response = await postComment({ comment: 'Bonjour' })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: 'op_unavailable' })
    })

    it('exige une session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/10/activities',
        payload: { comment: 'Bonjour' },
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
