import type { FakeOp } from './support/fake-op.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FAKE_STATUSES, startFakeOp } from './support/fake-op.js'

/**
 * Tests de fumée du faux serveur OP : ils garantissent que l'outillage partagé
 * par les tests d'intégration rejoue fidèlement les comportements attendus d'OP.
 */
describe('faux serveur OP', () => {
  let op: FakeOp

  beforeAll(async () => {
    op = await startFakeOp()
  })
  beforeEach(() => op.reset())
  afterAll(() => op.close())

  const getAs = (token: string, path: string) =>
    fetch(`${op.url}${path}`, {
      headers: op.authHeaders(token),
    })

  const sendAs = (token: string, method: string, path: string, body: unknown) =>
    fetch(`${op.url}${path}`, {
      method,
      headers: {
        ...op.authHeaders(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

  describe('authentification et projets', () => {
    it('liste uniquement les projets dont l\'utilisateur du jeton est membre, en collection paginée', async () => {
      const alice = op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [alice.id],
      })
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [],
      })

      const response = await getAs('tok-alice', '/api/v3/projects')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body._type).toBe('Collection')
      expect(body).toMatchObject({ total: 1, count: 1, offset: 1 })
      expect(body._embedded.elements).toEqual([
        expect.objectContaining({
          _type: 'Project',
          id: 1,
          identifier: 'alpha',
          name: 'Alpha',
        }),
      ])
    })

    it('renvoie 401 pour un jeton inconnu', async () => {
      const response = await getAs('inconnu', '/api/v3/projects')

      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        _type: 'Error',
        errorIdentifier: 'urn:openproject-org:api:v3:errors:Unauthenticated',
      })
    })

    it('renvoie l\'utilisateur du jeton sur /users/me', async () => {
      op.addUser({ name: 'Alice', token: 'tok-alice' })

      const response = await getAs('tok-alice', '/api/v3/users/me')

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ _type: 'User', name: 'Alice' })
    })

    it('renvoie 404 sur un projet dont l\'utilisateur n\'est pas membre, comme OP qui en masque l\'existence', async () => {
      op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [],
      })

      const response = await getAs('tok-alice', '/api/v3/projects/2')

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        errorIdentifier: 'urn:openproject-org:api:v3:errors:NotFound',
      })
    })
  })

  describe('tâches', () => {
    beforeEach(() => {
      const alice = op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [alice.id],
      })
    })

    it('pagine les tâches d\'un projet avec offset (numéro de page), pageSize et lien vers la page suivante', async () => {
      for (let id = 1; id <= 5; id++) op.addWorkPackage({ id, projectId: 1, subject: `Tâche ${id}` })

      const response = await getAs('tok-alice', '/api/v3/projects/1/work_packages?offset=2&pageSize=2')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({
        total: 5,
        count: 2,
        pageSize: 2,
        offset: 2,
      })
      expect(body._embedded.elements.map((wp: { id: number }) => wp.id)).toEqual([3, 4])
      const next = await (await getAs('tok-alice', body._links.nextByOffset.href)).json()
      expect(next._embedded.elements.map((wp: { id: number }) => wp.id)).toEqual([5])
      expect(next._links.nextByOffset).toBeUndefined()
    })

    it('ne renvoie que les tâches ouvertes par défaut, et toutes avec un filtre vide', async () => {
      op.addWorkPackage({ id: 1, projectId: 1, subject: 'Ouverte' })
      op.addWorkPackage({
        id: 2,
        projectId: 1,
        subject: 'Fermée',
        statusId: FAKE_STATUSES.closed.id,
      })

      const byDefault = await getAs('tok-alice', '/api/v3/projects/1/work_packages')
      const unfiltered = await getAs('tok-alice', `/api/v3/projects/1/work_packages?filters=${encodeURIComponent('[]')}`)

      const ids = async (response: Response) =>
        (await response.json())._embedded.elements.map((wp: { id: number }) => wp.id)
      expect(await ids(byDefault)).toEqual([1])
      expect(await ids(unfiltered)).toEqual([1, 2])
    })

    it('renvoie une tâche au format HAL avec durées ISO 8601 et liens', async () => {
      const bob = op.addUser({ name: 'Bob', token: 'tok-bob' })
      op.addWorkPackage({ id: 10, projectId: 1, subject: 'Parent' })
      op.addWorkPackage({
        id: 11,
        projectId: 1,
        subject: 'Enfant',
        parentId: 10,
        assigneeId: bob.id,
        estimatedTime: 'PT2H30M',
        description: 'Du **markdown**',
      })

      const response = await getAs('tok-alice', '/api/v3/work_packages/11')

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        _type: 'WorkPackage',
        id: 11,
        subject: 'Enfant',
        lockVersion: 0,
        estimatedTime: 'PT2H30M',
        remainingTime: null,
        description: { format: 'markdown', raw: 'Du **markdown**' },
        _links: {
          project: { href: '/api/v3/projects/1' },
          parent: { href: '/api/v3/work_packages/10', title: 'Parent' },
          assignee: { href: `/api/v3/users/${bob.id}`, title: 'Bob' },
          status: { href: '/api/v3/statuses/1', title: 'New' },
        },
      })
    })

    it('renvoie 404 sur une tâche d\'un projet dont l\'utilisateur n\'est pas membre', async () => {
      op.addProject({
        id: 2,
        identifier: 'beta',
        name: 'Beta',
        memberIds: [],
      })
      op.addWorkPackage({ id: 20, projectId: 2, subject: 'Secret' })

      const response = await getAs('tok-alice', '/api/v3/work_packages/20')

      expect(response.status).toBe(404)
    })
  })

  describe('écriture d\'une tâche', () => {
    beforeEach(() => {
      const alice = op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [alice.id],
      })
      op.addWorkPackage({
        id: 1,
        projectId: 1,
        subject: 'Tâche',
        allowedStatusIds: [FAKE_STATUSES.new.id, FAKE_STATUSES.inProgress.id],
      })
    })

    const patch = (body: unknown) => sendAs('tok-alice', 'PATCH', '/api/v3/work_packages/1', body)

    it('applique la modification et incrémente lockVersion', async () => {
      const response = await patch({
        lockVersion: 0,
        remainingTime: 'PT1H',
        _links: {
          parent: { href: null },
        },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ lockVersion: 1, remainingTime: 'PT1H' })
    })

    it('renvoie un conflit 409 quand la tâche a été modifiée depuis le chargement', async () => {
      op.touchWorkPackage(1)

      const response = await patch({ lockVersion: 0, subject: 'Renommée' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        errorIdentifier: 'urn:openproject-org:api:v3:errors:UpdateConflict',
      })
    })

    it('expose les statuts autorisés dans le formulaire de la tâche', async () => {
      const response = await sendAs('tok-alice', 'POST', '/api/v3/work_packages/1/form', { lockVersion: 0 })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body._type).toBe('Form')
      expect(body._embedded.schema.status._embedded.allowedValues).toEqual([
        expect.objectContaining({ _type: 'Status', id: FAKE_STATUSES.new.id, name: 'New' }),
        expect.objectContaining({ _type: 'Status', id: FAKE_STATUSES.inProgress.id, name: 'In progress' }),
      ])
    })

    it('refuse une transition d\'état non autorisée', async () => {
      const response = await patch({
        lockVersion: 0,
        _links: {
          status: { href: `/api/v3/statuses/${FAKE_STATUSES.closed.id}` },
        },
      })

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        errorIdentifier: 'urn:openproject-org:api:v3:errors:PropertyConstraintViolation',
        _embedded: {
          details: { attribute: 'status' },
        },
      })
    })
  })

  describe('activités', () => {
    beforeEach(() => {
      const alice = op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [alice.id],
      })
      op.addWorkPackage({ id: 1, projectId: 1, subject: 'Tâche' })
    })

    it('ajoute un commentaire et le restitue dans les activités, du plus ancien au plus récent', async () => {
      op.addActivity({ workPackageId: 1, comment: 'Premier', createdAt: '2026-01-01T10:00:00Z' })

      const created = await sendAs('tok-alice', 'POST', '/api/v3/work_packages/1/activities', {
        comment: { raw: 'Second' },
      })
      expect(created.status).toBe(201)

      const response = await getAs('tok-alice', '/api/v3/work_packages/1/activities')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body._embedded.elements).toEqual([
        expect.objectContaining({
          _type: 'Activity::Comment',
          comment: expect.objectContaining({ raw: 'Premier' }),
        }),
        expect.objectContaining({
          _type: 'Activity::Comment',
          comment: expect.objectContaining({ raw: 'Second' }),
          _links: expect.objectContaining({
            user: expect.objectContaining({ title: 'Alice' }),
          }),
        }),
      ])
    })
  })

  describe('erreurs injectées', () => {
    beforeEach(() => {
      const alice = op.addUser({ name: 'Alice', token: 'tok-alice' })
      op.addProject({
        id: 1,
        identifier: 'alpha',
        name: 'Alpha',
        memberIds: [alice.id],
      })
    })

    it('simule OP indisponible (503) sur la prochaine requête correspondante uniquement', async () => {
      op.interceptNext({ method: 'GET', path: '/api/v3/projects', status: 503 })

      const other = await getAs('tok-alice', '/api/v3/users/me')
      const failed = await getAs('tok-alice', '/api/v3/projects')
      const recovered = await getAs('tok-alice', '/api/v3/projects')

      expect(other.status).toBe(200)
      expect(failed.status).toBe(503)
      expect(recovered.status).toBe(200)
    })

    it.each([
      [401, 'urn:openproject-org:api:v3:errors:Unauthenticated'],
      [403, 'urn:openproject-org:api:v3:errors:MissingPermission'],
    ])('simule une erreur %i au format OP malgré un jeton valide', async (status, errorIdentifier) => {
      op.interceptNext({ status })

      const response = await getAs('tok-alice', '/api/v3/projects/1')

      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ _type: 'Error', errorIdentifier })
    })

    it('renvoie un corps arbitraire, pour simuler une réponse non conforme au schéma', async () => {
      op.interceptNext({
        status: 200,
        body: { _type: 'Project', id: 'pas-un-nombre' },
      })

      const response = await getAs('tok-alice', '/api/v3/projects/1')

      expect(await response.json()).toEqual({ _type: 'Project', id: 'pas-un-nombre' })
    })
  })
})
