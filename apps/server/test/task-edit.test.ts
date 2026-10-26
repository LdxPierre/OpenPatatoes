import type { FakeOp, FakeUser, FakeWorkPackage } from './support/fake-op.js'
import { TASK_HOURS_MAX, TASK_HOURS_MIN } from '@openpatatoes/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password.js'
import { SESSION_COOKIE } from '../src/auth/plugin.js'
import { users } from '../src/db/schema.js'
import { buildTestApp, connectAs } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'
import { FAKE_PRIORITIES, FAKE_STATUSES, FAKE_TYPES, startFakeOp } from './support/fake-op.js'

const alice = { username: 'alice', password: 'mot-de-passe-alice' }

describe('édition d\'une tâche', () => {
  const db = createTestDatabase()
  let op: FakeOp
  let app: ReturnType<typeof buildTestApp>
  let opAlice: FakeUser
  let opBob: FakeUser
  let task: FakeWorkPackage
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
    task = op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      statusId: FAKE_STATUSES.closed.id,
      estimatedTime: 'PT8H',
      remainingTime: 'PT4H',
    })
    session = await connectAs(app, alice, 'tok-alice')
  })
  afterAll(async () => {
    await app.close()
    await op.close()
    await db.$client.end()
  })

  /** `payload` en texte : un JSON écrit à la main, que `JSON.stringify` ne produirait pas (`-0`). */
  function patchTask(taskId: number | string, payload: object | string) {
    return app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      cookies: { [SESSION_COOKIE]: session },
      headers: { 'content-type': 'application/json' },
      payload,
    })
  }

  function getTask(taskId: number) {
    return app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  it('enregistre le temps estimé et le temps restant, et renvoie la tâche complète à jour', async () => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 2.5, remainingHours: 0.75 })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      task: {
        id: 10,
        subject: 'Tâche',
        lockVersion: 1,
        status: { id: FAKE_STATUSES.closed.id, name: 'Closed', isClosed: true },
        type: { id: 1, name: 'Task' },
        priority: { id: 8, name: 'Normal' },
        assignee: null,
        responsible: null,
        estimatedHours: 2.5,
        remainingHours: 0.75,
        spentHours: 0,
        startDate: null,
        dueDate: null,
        version: null,
        category: null,
        parent: null,
      },
    })
  })

  it.each([
    [2.5, 'PT2.5H'],
    [8, 'PT8H'],
    [0, 'PT0H'],
    [1 / 3, 'PT0.3333333333333333H'],
    [TASK_HOURS_MIN, 'PT0.0002777777777777778H'],
    [TASK_HOURS_MAX, 'PT100000H'],
  ])('convertit %s heures décimales en durée ISO 8601 %s à l\'écriture', async (hours, duration) => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: hours, remainingHours: hours })

    expect(response.statusCode).toBe(200)
    expect(task.estimatedTime).toBe(duration)
    expect(task.remainingTime).toBe(duration)
    // Le faux OP conserve la durée telle quelle : on vérifie que notre conversion est sans perte.
    expect(response.json().task).toMatchObject({ estimatedHours: hours, remainingHours: hours })
  })

  it('écrit -0 heure comme une durée nulle valide', async () => {
    const response = await patchTask(10, '{"lockVersion":0,"estimatedHours":-0}')

    expect(response.statusCode).toBe(200)
    expect(task.estimatedTime).toBe('PT0H')
  })

  it('ne modifie que les champs envoyés', async () => {
    const response = await patchTask(10, { lockVersion: 0, remainingHours: 1 })

    expect(response.statusCode).toBe(200)
    expect(task.estimatedTime).toBe('PT8H')
    expect(task.remainingTime).toBe('PT1H')
  })

  it('efface un temps mis à null', async () => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: null })

    expect(response.statusCode).toBe(200)
    expect(task.estimatedTime).toBeNull()
    expect(response.json().task.estimatedHours).toBeNull()
  })

  it('assigne la tâche à un membre du projet', async () => {
    const response = await patchTask(10, { lockVersion: 0, assigneeId: opBob.id })

    expect(response.statusCode).toBe(200)
    expect(task.assigneeId).toBe(opBob.id)
    expect(response.json().task.assignee).toEqual({ id: opBob.id, name: 'Bob OP' })
  })

  it('retire l\'assigné de la tâche', async () => {
    task.assigneeId = opAlice.id

    const response = await patchTask(10, { lockVersion: 0, assigneeId: null })

    expect(response.statusCode).toBe(200)
    expect(task.assigneeId).toBeNull()
    expect(response.json().task.assignee).toBeNull()
  })

  it('change l\'état vers une transition permise, avec son caractère fermé', async () => {
    const response = await patchTask(10, { lockVersion: 0, statusId: FAKE_STATUSES.inProgress.id })

    expect(response.statusCode).toBe(200)
    expect(task.statusId).toBe(FAKE_STATUSES.inProgress.id)
    expect(response.json().task.status).toEqual({ id: FAKE_STATUSES.inProgress.id, name: 'In progress', isClosed: false })
  })

  it('renvoie le refus d\'OP et l\'état réel quand la transition d\'état n\'est pas permise', async () => {
    task.allowedStatusIds = [FAKE_STATUSES.new.id]

    const response = await patchTask(10, { lockVersion: 0, statusId: FAKE_STATUSES.inProgress.id })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      error: 'op_rejected',
      message: 'OpenProject a refusé la modification : Status is invalid because no valid transition exists.',
      task: {
        lockVersion: 0,
        status: { id: FAKE_STATUSES.closed.id, name: 'Closed', isClosed: true },
      },
    })
    expect(task.statusId).toBe(FAKE_STATUSES.closed.id)
  })

  it('change le type et la priorité de la tâche', async () => {
    const response = await patchTask(10, { lockVersion: 0, typeId: FAKE_TYPES.bug.id, priorityId: FAKE_PRIORITIES.high.id })

    expect(response.statusCode).toBe(200)
    expect(task.type).toEqual(FAKE_TYPES.bug)
    expect(task.priority).toEqual(FAKE_PRIORITIES.high)
    expect(response.json().task).toMatchObject({
      type: { id: FAKE_TYPES.bug.id, name: 'Bug' },
      priority: { id: FAKE_PRIORITIES.high.id, name: 'High' },
    })
  })

  it('renvoie le refus d\'OP quand le type n\'est pas permis', async () => {
    const response = await patchTask(10, { lockVersion: 0, typeId: 99 })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      error: 'op_rejected',
      task: {
        type: { id: FAKE_TYPES.task.id, name: 'Task' },
      },
    })
  })

  describe('parent', () => {
    /** Hiérarchie : 10 › 11 › 12, et 20 à part. */
    beforeEach(() => {
      op.addWorkPackage({
        id: 11,
        projectId: 1,
        subject: 'Enfant',
        parentId: 10,
      })
      op.addWorkPackage({
        id: 12,
        projectId: 1,
        subject: 'Petit-enfant',
        parentId: 11,
      })
      op.addWorkPackage({ id: 20, projectId: 1, subject: 'Autre racine' })
    })

    it('donne un nouveau parent à la tâche', async () => {
      const response = await patchTask(11, { lockVersion: 0, parentId: 20 })

      expect(response.statusCode).toBe(200)
      expect(op.workPackage(11).parentId).toBe(20)
      expect(response.json().task.parent).toEqual({ id: 20, subject: 'Autre racine' })
    })

    it('fait de la tâche une racine', async () => {
      const response = await patchTask(12, { lockVersion: 0, parentId: null })

      expect(response.statusCode).toBe(200)
      expect(op.workPackage(12).parentId).toBeNull()
      expect(response.json().task.parent).toBeNull()
    })

    it.each([
      ['elle-même', 10, 'Une tâche ne peut pas être son propre parent.'],
      ['sa sous-tâche', 11, 'Ce parent est l\'une de ses sous-tâches : une tâche ne peut pas devenir la sous-tâche de ses propres sous-tâches.'],
      ['une sous-tâche de sa sous-tâche', 12, 'Ce parent est l\'une de ses sous-tâches : une tâche ne peut pas devenir la sous-tâche de ses propres sous-tâches.'],
    ])('refuse pour parent %s, sans rien écrire dans OP', async (_case, parentId, message) => {
      const response = await patchTask(10, { lockVersion: 0, parentId })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        error: 'task_parent_cycle',
        message,
        task: { id: 10, lockVersion: 0, parent: null },
      })
      expect(task.lockVersion).toBe(0)
      expect(task.parentId).toBeNull()
    })

    it('accepte un parent pris dans une boucle déjà présente dans OP, sans boucler', async () => {
      op.addWorkPackage({
        id: 30,
        projectId: 1,
        subject: 'Boucle A',
        parentId: 31,
      })
      op.addWorkPackage({
        id: 31,
        projectId: 1,
        subject: 'Boucle B',
        parentId: 30,
      })

      const response = await patchTask(10, { lockVersion: 0, parentId: 30 })

      expect(response.statusCode).toBe(200)
      expect(task.parentId).toBe(30)
    })

    it('laisse OP juger un parent introuvable', async () => {
      const response = await patchTask(10, { lockVersion: 0, parentId: 99 })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        error: 'op_rejected',
        message: 'OpenProject a refusé la modification : Parent does not exist.',
      })
    })

    it('n\'écrit rien si un ancêtre du parent ne peut pas être lu', async () => {
      op.interceptNext({ method: 'GET', path: '/api/v3/work_packages/11', status: 503 })

      const response = await patchTask(20, { lockVersion: 0, parentId: 12 })

      expect(response.statusCode).toBe(503)
      expect(op.workPackage(20).lockVersion).toBe(0)
    })

    it('refuse un parent mis à 0', async () => {
      const response = await patchTask(10, { lockVersion: 0, parentId: 0 })

      expect(response.statusCode).toBe(400)
    })
  })

  it('renvoie le refus d\'OP avec son message et l\'état réel complet de la tâche, sans rien modifier', async () => {
    const outsider = op.addUser({ name: 'Externe', token: 'tok-externe' })

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 3, assigneeId: outsider.id })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      error: 'op_rejected',
      message: 'OpenProject a refusé la modification : Assignee is not set to one of the allowed values.',
      task: {
        id: 10,
        lockVersion: 0,
        status: { id: FAKE_STATUSES.closed.id, name: 'Closed', isClosed: true },
        estimatedHours: 8,
        remainingHours: 4,
        assignee: null,
      },
    })
    const reloaded = await getTask(10)
    expect(reloaded.json().task).toMatchObject({ lockVersion: 0, estimatedHours: 8, assignee: null })
  })

  it('signale le refus d\'OP même si la tâche ne peut pas être relue', async () => {
    op.interceptNext({
      method: 'PATCH',
      path: '/api/v3/work_packages/10',
      status: 422,
      body: {
        _type: 'Error',
        errorIdentifier: 'urn:openproject-org:api:v3:errors:PropertyConstraintViolation',
        message: 'Work must be greater than or equal to 0.',
      },
    })
    op.interceptNext({ method: 'GET', path: '/api/v3/work_packages/10', status: 503 })

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1 })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      error: 'op_rejected',
      message: 'OpenProject a refusé la modification : Work must be greater than or equal to 0.',
    })
  })

  it('restitue chaque message quand OP refuse plusieurs champs', async () => {
    op.interceptNext({
      method: 'PATCH',
      path: '/api/v3/work_packages/10',
      status: 422,
      body: {
        _type: 'Error',
        errorIdentifier: 'urn:openproject-org:api:v3:errors:MultipleErrors',
        message: 'Multiple field constraints have been violated.',
        _embedded: {
          errors: [
            { _type: 'Error', message: 'Work must be greater than or equal to 0.' },
            { _type: 'Error', message: 'Remaining work must be less than or equal to Work.' },
          ],
        },
      },
    })

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1, remainingHours: 2 })

    expect(response.statusCode).toBe(422)
    expect(response.json().message).toBe(
      'OpenProject a refusé la modification : Work must be greater than or equal to 0. Remaining work must be less than or equal to Work.',
    )
  })

  it.each([
    [
      'sans lockVersion',
      { estimatedHours: 2 },
    ],
    [
      'sans champ modifié',
      { lockVersion: 0 },
    ],
    [
      'avec un temps négatif',
      { lockVersion: 0, estimatedHours: -1 },
    ],
    [
      'avec un temps sous une seconde',
      { lockVersion: 0, estimatedHours: TASK_HOURS_MIN / 2 },
    ],
    [
      'avec un temps au-delà du maximum',
      { lockVersion: 0, remainingHours: TASK_HOURS_MAX + 1 },
    ],
    [
      'avec un temps non numérique',
      { lockVersion: 0, remainingHours: '2h' },
    ],
    [
      'avec un assigné invalide',
      { lockVersion: 0, assigneeId: 0 },
    ],
    [
      'avec un état vide',
      { lockVersion: 0, statusId: null },
    ],
    [
      'avec un type invalide',
      { lockVersion: 0, typeId: 0 },
    ],
    [
      'avec une priorité vide',
      { lockVersion: 0, priorityId: null },
    ],
    [
      'avec un champ inconnu',
      { lockVersion: 0, subject: 'Renommée' },
    ],
  ])('refuse une modification %s', async (_case, payload) => {
    const response = await patchTask(10, payload)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_request' })
    expect(task.lockVersion).toBe(0)
  })

  it('traite une tâche masquée par OP comme introuvable ou inaccessible', async () => {
    op.addProject({
      id: 2,
      identifier: 'beta',
      name: 'Beta',
      memberIds: [],
    })
    op.addWorkPackage({ id: 20, projectId: 2, subject: 'Ailleurs' })

    const response = await patchTask(20, { lockVersion: 0, estimatedHours: 1 })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: 'op_not_found' })
  })

  it('affiche un refus de permission d\'OP comme un message clair', async () => {
    op.interceptNext({ method: 'PATCH', path: '/api/v3/work_packages/10', status: 403 })

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1 })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: 'op_forbidden' })
  })

  it('distingue OP indisponible d\'un refus', async () => {
    op.interceptNext({ method: 'PATCH', path: '/api/v3/work_packages/10', status: 503 })

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1 })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ error: 'op_unavailable' })
  })

  it('exige une session', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/10',
      payload: { lockVersion: 0 },
    })

    expect(response.statusCode).toBe(401)
  })

  describe('assignés possibles', () => {
    function getAssignees(taskId: number) {
      return app.inject({
        method: 'GET',
        url: `/api/tasks/${taskId}/assignees`,
        cookies: { [SESSION_COOKIE]: session },
      })
    }

    it('liste les utilisateurs qu\'OP accepte comme assignés de la tâche', async () => {
      op.addUser({ name: 'Externe', token: 'tok-externe' })

      const response = await getAssignees(10)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        assignees: [
          { id: opAlice.id, name: 'Alice OP' },
          { id: opBob.id, name: 'Bob OP' },
        ],
      })
    })

    it('ignore les groupes et utilisateurs fictifs, assignables dans OP mais pas ici', async () => {
      op.interceptNext({
        path: '/api/v3/work_packages/10/available_assignees',
        status: 200,
        body: {
          _type: 'Collection',
          _embedded: {
            elements: [
              { _type: 'User', id: opAlice.id, name: 'Alice OP' },
              { _type: 'Group', id: 50, name: 'Équipe' },
              { _type: 'PlaceholderUser', id: 51, name: 'À recruter' },
            ],
          },
          _links: {},
        },
      })

      const response = await getAssignees(10)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        assignees: [
          { id: opAlice.id, name: 'Alice OP' },
        ],
      })
    })

    it('traite une tâche masquée par OP comme introuvable ou inaccessible', async () => {
      const response = await getAssignees(99)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })
  })

  describe('valeurs permises', () => {
    function getAllowedValues(taskId: number) {
      return app.inject({
        method: 'GET',
        url: `/api/tasks/${taskId}/allowed-values`,
        cookies: { [SESSION_COOKIE]: session },
      })
    }

    it('liste les transitions d\'état, les types et les priorités du formulaire OP de la tâche', async () => {
      task.allowedStatusIds = [FAKE_STATUSES.closed.id, FAKE_STATUSES.inProgress.id]
      // Le formulaire exige la version actuelle : la tâche a déjà été modifiée.
      op.touchWorkPackage(10)

      const response = await getAllowedValues(10)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        statuses: [
          { id: FAKE_STATUSES.closed.id, name: 'Closed', isClosed: true },
          { id: FAKE_STATUSES.inProgress.id, name: 'In progress', isClosed: false },
        ],
        types: [
          { id: FAKE_TYPES.task.id, name: 'Task' },
          { id: FAKE_TYPES.milestone.id, name: 'Milestone' },
          { id: FAKE_TYPES.bug.id, name: 'Bug' },
        ],
        priorities: [
          { id: FAKE_PRIORITIES.low.id, name: 'Low' },
          { id: FAKE_PRIORITIES.normal.id, name: 'Normal' },
          { id: FAKE_PRIORITIES.high.id, name: 'High' },
        ],
      })
      // Lire le formulaire ne modifie pas la tâche.
      expect(task.lockVersion).toBe(1)
    })

    it('ne propose aucune valeur pour un champ qu\'OP ne laisse pas modifier', async () => {
      const field = (allowedValues: object[]) => ({
        writable: false,
        _embedded: { allowedValues },
      })
      op.interceptNext({
        method: 'POST',
        path: '/api/v3/work_packages/10/form',
        status: 200,
        body: {
          _type: 'Form',
          _embedded: {
            schema: {
              status: field([
                {
                  _type: 'Status',
                  id: 1,
                  name: 'New',
                  isClosed: false,
                },
              ]),
              type: field([
                { _type: 'Type', id: 1, name: 'Task' },
              ]),
              priority: {
                writable: true,
                _embedded: {
                  allowedValues: [
                    { _type: 'Priority', id: 8, name: 'Normal' },
                  ],
                },
              },
            },
          },
        },
      })

      const response = await getAllowedValues(10)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        statuses: [],
        types: [],
        priorities: [
          { id: 8, name: 'Normal' },
        ],
      })
    })

    it('rejette un formulaire OP non conforme', async () => {
      op.interceptNext({
        method: 'POST',
        path: '/api/v3/work_packages/10/form',
        status: 200,
        body: { _type: 'Form', _embedded: {} },
      })

      const response = await getAllowedValues(10)

      expect(response.statusCode).toBe(502)
      expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
    })

    it('traite une tâche masquée par OP comme introuvable ou inaccessible', async () => {
      const response = await getAllowedValues(99)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: 'op_not_found' })
    })
  })
})
