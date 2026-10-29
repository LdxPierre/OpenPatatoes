import type { FakeOp, FakeUser } from './support/fake-op.js'
import { TASK_SUBJECT_MAX_LENGTH } from '@openpatatoes/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password.js'
import { SESSION_COOKIE } from '../src/auth/plugin.js'
import { users } from '../src/db/schema.js'
import { buildTestApp, connectAs } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'
import { FAKE_STATUSES, FAKE_TYPES, startFakeOp } from './support/fake-op.js'

const alice = { username: 'alice', password: 'mot-de-passe-alice' }

describe('création d\'une tâche', () => {
  const db = createTestDatabase()
  let op: FakeOp
  let app: ReturnType<typeof buildTestApp>
  let opAlice: FakeUser
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
    op.addProject({
      id: 1,
      identifier: 'alpha',
      name: 'Alpha',
      memberIds: [opAlice.id],
      typeIds: [FAKE_TYPES.bug.id, FAKE_TYPES.task.id],
    })
    op.addProject({
      id: 2,
      identifier: 'beta',
      name: 'Beta',
      memberIds: [],
    })
    op.addWorkPackage({ id: 10, projectId: 1, subject: 'Racine' })
    session = await connectAs(app, alice, 'tok-alice')
  })
  afterAll(async () => {
    await app.close()
    await op.close()
    await db.$client.end()
  })

  function createTask(payload: unknown, projectId: number | string = 1) {
    return app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      cookies: { [SESSION_COOKIE]: session },
      payload: payload as object,
    })
  }

  function getTypes(projectId: number | string = 1) {
    return app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/types`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  describe('types du projet', () => {
    it('renvoie les types actifs du projet, dans l\'ordre d\'OP, avec le type par défaut', async () => {
      const response = await getTypes()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        types: [
          { id: FAKE_TYPES.bug.id, name: 'Bug', isDefault: false },
          { id: FAKE_TYPES.task.id, name: 'Task', isDefault: true },
        ],
      })
    })

    it('traite un projet masqué par OP comme introuvable', async () => {
      const response = await getTypes(2)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })

    it('refuse un identifiant de projet invalide', async () => {
      const response = await getTypes('abc')

      expect(response.statusCode).toBe(400)
    })

    it('exige une session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/projects/1/types' })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('création', () => {
    it('crée la tâche dans OP avec son type et son titre, et la renvoie complète', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.bug.id, subject: 'Corriger la connexion', parentId: null })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        task: {
          id: 11,
          subject: 'Corriger la connexion',
          lockVersion: 0,
          status: { id: FAKE_STATUSES.new.id, name: 'New', isClosed: false },
          type: { id: FAKE_TYPES.bug.id, name: 'Bug' },
          priority: { id: 8, name: 'Normal' },
          assignee: null,
          responsible: null,
          estimatedHours: null,
          remainingHours: null,
          spentHours: null,
          startDate: null,
          dueDate: null,
          version: null,
          category: null,
          parent: null,
          description: '',
        },
      })
      expect(op.workPackage(11)).toMatchObject({
        projectId: 1,
        subject: 'Corriger la connexion',
        type: FAKE_TYPES.bug,
        parentId: null,
      })
    })

    it('crée la tâche sous le parent choisi : elle apparaît dans l\'arbre du projet', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Sous-tâche', parentId: 10 })

      expect(response.statusCode).toBe(201)
      expect(response.json().task.parent).toEqual({ id: 10, subject: 'Racine' })
      const tree = await app.inject({
        method: 'GET',
        url: '/api/projects/1/tasks',
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(tree.json().tasks).toEqual([
        expect.objectContaining({
          id: 10,
          children: [
            expect.objectContaining({ id: 11, subject: 'Sous-tâche', children: [] }),
          ],
        }),
      ])
    })

    it('crée la tâche au nom de l\'utilisateur du jeton', async () => {
      await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: null })

      const activities = await app.inject({
        method: 'GET',
        url: '/api/tasks/11/activities',
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(activities.json().activities).toEqual([
        expect.objectContaining({
          creation: true,
          author: { id: opAlice.id, name: 'Alice OP' },
        }),
      ])
    })

    it('enregistre le titre sans les espaces qui l\'entourent', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: '  Préparer la démo \n', parentId: null })

      expect(response.statusCode).toBe(201)
      expect(op.workPackage(11).subject).toBe('Préparer la démo')
    })

    it.each([
      [
        'un titre vide',
        { typeId: FAKE_TYPES.task.id, subject: '', parentId: null },
      ],
      [
        'un titre fait d\'espaces',
        { typeId: FAKE_TYPES.task.id, subject: '   ', parentId: null },
      ],
      [
        'un titre trop long',
        {
          typeId: FAKE_TYPES.task.id,
          subject: 'a'.repeat(TASK_SUBJECT_MAX_LENGTH + 1),
          parentId: null,
        },
      ],
      [
        'un type absent',
        { subject: 'Tâche', parentId: null },
      ],
      [
        'un type invalide',
        { typeId: 0, subject: 'Tâche', parentId: null },
      ],
      [
        'un parent absent',
        { typeId: FAKE_TYPES.task.id, subject: 'Tâche' },
      ],
      [
        'un champ inconnu',
        {
          typeId: FAKE_TYPES.task.id,
          subject: 'Tâche',
          parentId: null,
          statusId: 1,
        },
      ],
    ])('refuse %s sans écrire dans OP', async (_case, payload) => {
      const response = await createTask(payload)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'invalid_request' })
      expect(() => op.workPackage(11)).toThrow()
    })

    it('renvoie le refus d\'OP pour un type inactif dans le projet', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.milestone.id, subject: 'Jalon', parentId: null })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({
        error: 'op_rejected',
        message: 'OpenProject a refusé la création : Type is not set to one of the allowed values.',
      })
    })

    it('renvoie le refus d\'OP pour un parent inexistant', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: 99 })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({ error: 'op_rejected', message: 'OpenProject a refusé la création : Parent does not exist.' })
    })

    it('signale qu\'OP refuse la création à l\'utilisateur', async () => {
      op.interceptNext({ method: 'POST', path: '/api/v3/projects/1/work_packages', status: 403 })

      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: null })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ error: 'op_forbidden' })
    })

    it('traite un projet masqué par OP comme introuvable', async () => {
      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: null }, 2)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })

    it('distingue OP indisponible d\'un refus', async () => {
      op.interceptNext({ method: 'POST', path: '/api/v3/projects/1/work_packages', status: 503 })

      const response = await createTask({ typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: null })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ error: 'op_unavailable' })
    })

    it('exige une session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/1/tasks',
        payload: { typeId: FAKE_TYPES.task.id, subject: 'Tâche', parentId: null },
      })

      expect(response.statusCode).toBe(401)
      expect(() => op.workPackage(11)).toThrow()
    })
  })
})
