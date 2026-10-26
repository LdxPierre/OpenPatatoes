import type { FakeOp, FakeUser } from './support/fake-op.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password.js'
import { SESSION_COOKIE } from '../src/auth/plugin.js'
import { users } from '../src/db/schema.js'
import { buildTestApp, connectAs } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'
import { FAKE_STATUSES, startFakeOp } from './support/fake-op.js'

const alice = { username: 'alice', password: 'mot-de-passe-alice' }

describe('détail d\'une tâche', () => {
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
    })
    session = await connectAs(app, alice, 'tok-alice')
  })
  afterAll(async () => {
    await app.close()
    await op.close()
    await db.$client.end()
  })

  function getTask(taskId: number | string) {
    return app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  it('affiche le temps estimé, le temps restant et le parent de la tâche', async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: 'Parent' })
    op.addWorkPackage({
      id: 11,
      projectId: 1,
      subject: 'Enfant',
      parentId: 10,
      estimatedTime: 'PT2H30M',
      remainingTime: 'PT45M',
    })

    const response = await getTask(11)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      task: {
        id: 11,
        subject: 'Enfant',
        lockVersion: 0,
        status: { id: FAKE_STATUSES.new.id, name: 'New', isClosed: false },
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
        parent: { id: 10, subject: 'Parent' },
      },
    })
  })

  it('renvoie les propriétés de la tâche', async () => {
    const opBob = op.addUser({ name: 'Bob OP', token: 'tok-bob' })
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      statusId: FAKE_STATUSES.inProgress.id,
      assigneeId: opAlice.id,
      responsibleId: opBob.id,
      spentTime: 'PT11H',
      startDate: '2026-10-06',
      dueDate: '2026-10-31',
      type: { id: 4, name: 'Feature' },
      priority: { id: 9, name: 'High' },
      version: { id: 2, name: 'POC 0.1' },
      category: { id: 3, name: 'Authentification' },
    })

    const response = await getTask(10)

    expect(response.statusCode).toBe(200)
    expect(response.json().task).toMatchObject({
      status: { id: FAKE_STATUSES.inProgress.id, name: 'In progress', isClosed: false },
      type: { id: 4, name: 'Feature' },
      priority: { id: 9, name: 'High' },
      assignee: { id: opAlice.id, name: 'Alice OP' },
      responsible: { id: opBob.id, name: 'Bob OP' },
      spentHours: 11,
      startDate: '2026-10-06',
      dueDate: '2026-10-31',
      version: { id: 2, name: 'POC 0.1' },
      category: { id: 3, name: 'Authentification' },
    })
  })

  it('dit si l\'état de la tâche est fermé, même pour un statut ajouté dans OP', async () => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Livrée',
      statusId: FAKE_STATUSES.delivered.id,
    })

    const response = await getTask(10)

    expect(response.json().task.status).toEqual({ id: FAKE_STATUSES.delivered.id, name: 'Delivered', isClosed: true })
  })

  it('reste lisible quand OP ne donne pas la liste des statuts, l\'état étant alors traité comme ouvert', async () => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      statusId: FAKE_STATUSES.closed.id,
    })
    op.interceptNext({ path: '/api/v3/statuses', status: 503 })

    const response = await getTask(10)

    expect(response.statusCode).toBe(200)
    expect(response.json().task.status).toEqual({ id: FAKE_STATUSES.closed.id, name: 'Closed', isClosed: false })
  })

  it('prend la date d\'un jalon comme début et comme échéance', async () => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Mise en production',
      date: '2026-11-15',
    })

    const response = await getTask(10)

    expect(response.json().task).toMatchObject({ startDate: '2026-11-15', dueDate: '2026-11-15' })
  })

  it('renvoie un temps passé nul quand OP le masque au jeton', async () => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      spentTime: null,
    })

    const response = await getTask(10)

    expect(response.statusCode).toBe(200)
    expect(response.json().task.spentHours).toBeNull()
  })

  it('renvoie des temps nuls et aucun parent pour une tâche racine sans estimation', async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: 'Racine' })

    const response = await getTask(10)

    expect(response.statusCode).toBe(200)
    expect(response.json().task).toMatchObject({ estimatedHours: null, remainingHours: null, parent: null })
  })

  it.each([
    ['PT0S', 0],
    ['PT8H', 8],
    ['PT1H15M', 1.25],
    ['PT90M', 1.5],
    ['PT1.5H', 1.5],
    ['PT0,25H', 0.25],
    ['PT20M', 20 / 60],
    ['PT1H0M36S', 1 + 36 / 3600],
    ['PT1H0,5M', 1 + 0.5 / 60],
    // OP 17 compte 24 h par jour : 26 h sont émises en `P1DT2H`.
    ['P1DT2H', 26],
    ['P1W', 168],
  ])('convertit la durée OP %s en %d heures décimales, sans arrondi', async (duration, hours) => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      estimatedTime: duration,
      remainingTime: duration,
    })

    const response = await getTask(10)

    expect(response.statusCode).toBe(200)
    const { estimatedHours, remainingHours } = response.json().task
    expect(estimatedHours).toBe(hours)
    expect(remainingHours).toBe(hours)
  })

  it.each([
    '2 heures',
    'P1M',
    'P1Y',
    'PT',
    'P',
    'PTH',
    'P1DT',
    '-PT1H',
    // Seule la dernière composante peut être décimale.
    'PT1.5H30M',
    // Les semaines ne se combinent pas avec d'autres composantes.
    'P1W2D',
  ])('rejette la durée OP non exploitable %s', async (duration) => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: 'Tâche',
      estimatedTime: duration,
    })

    const response = await getTask(10)

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
  })

  it('n\'affiche pas de parent quand OP le masque au jeton', async () => {
    op.interceptNext({
      path: '/api/v3/work_packages/11',
      status: 200,
      body: {
        _type: 'WorkPackage',
        id: 11,
        subject: 'Enfant d\'un parent invisible',
        lockVersion: 0,
        estimatedTime: null,
        remainingTime: null,
        _links: {
          status: { href: '/api/v3/statuses/1', title: 'New' },
          type: { href: '/api/v3/types/1', title: 'Task' },
          assignee: { href: null },
          parent: { href: null },
        },
      },
    })

    const response = await getTask(11)

    expect(response.statusCode).toBe(200)
    expect(response.json().task.parent).toBeNull()
  })

  it('traite une tâche masquée par OP comme introuvable ou inaccessible', async () => {
    op.addProject({
      id: 2,
      identifier: 'beta',
      name: 'Beta',
      memberIds: [],
    })
    op.addWorkPackage({ id: 20, projectId: 2, subject: 'Ailleurs' })

    const response = await getTask(20)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: 'op_not_found' })
  })

  it('affiche un refus d\'accès d\'OP comme un message clair', async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: 'Tâche' })
    op.interceptNext({ path: '/api/v3/work_packages/10', status: 403 })

    const response = await getTask(10)

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: 'op_forbidden' })
  })

  it('distingue OP indisponible d\'un refus d\'accès', async () => {
    op.interceptNext({ path: '/api/v3/work_packages/10', status: 503 })

    const response = await getTask(10)

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ error: 'op_unavailable' })
  })

  it('rejette une réponse OP non conforme au schéma attendu', async () => {
    op.interceptNext({
      path: '/api/v3/work_packages/10',
      status: 200,
      body: { _type: 'WorkPackage', id: 10 },
    })

    const response = await getTask(10)

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({ error: 'op_invalid_response' })
  })

  it('refuse un identifiant de tâche invalide', async () => {
    const response = await getTask('abc')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_request' })
  })

  it('exige une session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tasks/10' })

    expect(response.statusCode).toBe(401)
  })
})
