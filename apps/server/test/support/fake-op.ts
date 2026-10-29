import type { FastifyReply, FastifyRequest } from 'fastify'
import { Buffer } from 'node:buffer'
import Fastify from 'fastify'

/**
 * Faux serveur OpenProject (API v3, CE 17) pour les tests d'intégration.
 *
 * C'est le seul point de contact avec OP dans les tests : il tient un état en
 * mémoire (utilisateurs, projets) et répond au format HAL de l'API v3.
 */

const ERROR_URN = 'urn:openproject-org:api:v3:errors:'

export interface FakeUser {
  id: number
  name: string
  token: string
}

export interface FakeProject {
  id: number
  identifier: string
  name: string
  memberIds: number[]
  /** Type OP du projet ; `Project` si absent. Portefeuilles et programmes sont listés comme des projets. */
  type?: 'Project' | 'Program' | 'Portfolio'
  /** Types de tâche actifs dans le projet, dans cet ordre ; tous les types de l'instance si absent. */
  typeIds?: number[]
}

export interface FakeStatus {
  id: number
  name: string
  isClosed: boolean
}

/** Statuts disponibles sur l'instance factice. */
export const FAKE_STATUSES = {
  new: { id: 1, name: 'New', isClosed: false },
  inProgress: { id: 7, name: 'In progress', isClosed: false },
  closed: { id: 12, name: 'Closed', isClosed: true },
  /** Statut ajouté par un administrateur : inconnu de l'app, fermé dans OP. */
  delivered: { id: 15, name: 'Delivered', isClosed: true },
} as const satisfies Record<string, FakeStatus>

/** Ressource OP désignée par un lien HAL (type, priorité, version, catégorie). */
export interface FakeNamedRef {
  id: number
  name: string
}

/** Types de tâche du projet, proposés par le formulaire OP. */
export const FAKE_TYPES = {
  task: { id: 1, name: 'Task' },
  milestone: { id: 2, name: 'Milestone' },
  bug: { id: 7, name: 'Bug' },
} as const satisfies Record<string, FakeNamedRef>

/** Type par défaut de l'instance (`isDefault`), comme le type « Task » d'une installation d'OP. */
export const FAKE_DEFAULT_TYPE_ID: number = FAKE_TYPES.task.id

/** Priorités de l'instance, proposées par le formulaire OP. */
export const FAKE_PRIORITIES = {
  low: { id: 7, name: 'Low' },
  normal: { id: 8, name: 'Normal' },
  high: { id: 9, name: 'High' },
} as const satisfies Record<string, FakeNamedRef>

export interface FakeWorkPackage {
  id: number
  projectId: number
  subject: string
  lockVersion: number
  parentId: number | null
  assigneeId: number | null
  statusId: number
  /** Durées au format ISO 8601, comme dans OP (ex. `PT2H30M`). */
  estimatedTime: string | null
  remainingTime: string | null
  /** `null` : OP omet le champ, comme pour un jeton sans droit de voir le temps passé. */
  spentTime: string | null
  responsibleId: number | null
  /** Jours ISO (`2026-10-31`). Un jalon n'a que `date`. */
  startDate: string | null
  dueDate: string | null
  date?: string | null
  type: FakeNamedRef
  priority: FakeNamedRef
  version: FakeNamedRef | null
  category: FakeNamedRef | null
  description: string
  /** Statuts proposés par le formulaire OP pour cette tâche (transitions autorisées). */
  allowedStatusIds: number[]
}

export type NewFakeWorkPackage = Pick<FakeWorkPackage, 'id' | 'projectId' | 'subject'>
  & Partial<Omit<FakeWorkPackage, 'id' | 'projectId' | 'subject'>>

export interface FakeActivity {
  id: number
  workPackageId: number
  userId: number | null
  /** Commentaire markdown ; vide pour une activité sans commentaire. */
  comment: string
  /** Modifications, une phrase par champ, comme OP les rédige (`Status changed from New to Closed`). */
  details: string[]
  createdAt: string
}

interface State {
  users: FakeUser[]
  projects: FakeProject[]
  workPackages: FakeWorkPackage[]
  activities: FakeActivity[]
  nextUserId: number
  nextActivityId: number
}

function emptyState(): State {
  return {
    users: [],
    projects: [],
    workPackages: [],
    activities: [],
    nextUserId: 1,
    nextActivityId: 1,
  }
}

const DEFAULT_PAGE_SIZE = 20

export interface Interception {
  /** Méthode HTTP visée ; toutes si absente. */
  method?: string
  /** Chemin exact visé (sans query string) ; tous si absent. */
  path?: string
  status: number
  /** Corps renvoyé ; par défaut, l'erreur OP correspondant au statut. */
  body?: unknown
}

/** Erreurs OP courantes, au format renvoyé par l'API v3. */
const OP_ERRORS: Record<number, [identifier: string, message: string]> = {
  401: ['Unauthenticated', 'You need to be authenticated to access this resource.'],
  403: ['MissingPermission', 'You are not authorized to access this resource.'],
  404: ['NotFound', 'The requested resource could not be found.'],
  409: ['UpdateConflict', 'Could not update the resource because of conflicting modifications.'],
}

export interface FakeOp {
  /** URL de base de l'instance (sans `/api/v3`). */
  url: string
  /** En-têtes d'authentification OP pour un jeton d'API (Basic `apikey:<jeton>`). */
  authHeaders: (token: string) => Record<string, string>
  addUser: (user: { name: string, token: string }) => FakeUser
  addProject: (project: FakeProject) => FakeProject
  addWorkPackage: (workPackage: NewFakeWorkPackage) => FakeWorkPackage
  /** Tâche de l'état du faux OP, à lire après une requête. */
  workPackage: (id: number) => FakeWorkPackage
  /** Simule une modification concurrente dans OP (incrémente `lockVersion`). */
  touchWorkPackage: (id: number) => void
  /**
   * La prochaine requête correspondante reçoit la réponse donnée au lieu du
   * comportement normal (401, 403, 503, corps non conforme...). Usage unique.
   */
  interceptNext: (interception: Interception) => void
  addActivity: (activity: Pick<FakeActivity, 'workPackageId'> & Partial<FakeActivity>) => FakeActivity
  /** Vide l'état entre deux tests. */
  reset: () => void
  close: () => Promise<void>
}

function apiError(reply: FastifyReply, status: number, identifier: string, message: string, extra: object = {}) {
  return reply.code(status).type('application/hal+json').send({
    _type: 'Error',
    errorIdentifier: `${ERROR_URN}${identifier}`,
    message,
    ...extra,
  })
}

/** Erreur 422 d'OP sur un attribut précis (`_embedded.details.attribute`). */
function constraintViolation(reply: FastifyReply, attribute: string, message: string) {
  return apiError(reply, 422, 'PropertyConstraintViolation', message, {
    _embedded: {
      details: { attribute },
    },
  })
}

/** Envoie l'erreur OP standard du statut ; sans équivalent OP (ex. 503), une page du proxy frontal. */
function sendOpError(reply: FastifyReply, status: number) {
  const opError = OP_ERRORS[status]
  if (opError)
    return apiError(reply, status, ...opError)
  return reply.code(status).type('text/html').send(`<html><body>${status}</body></html>`)
}

function sendInterception(reply: FastifyReply, { status, body }: Interception) {
  return body === undefined
    ? sendOpError(reply, status)
    : reply.code(status).send(body)
}

type CollectionQuery = Record<string, string | undefined>

/**
 * Collection paginée à la manière d'OP : `offset` est un numéro de page (à partir de 1),
 * et les liens `nextByOffset` / `previousByOffset` conservent les autres paramètres.
 * Certaines collections ont un type propre : OP renvoie `WorkPackageCollection` pour les tâches.
 */
function paginatedCollection<T>(all: T[], query: CollectionQuery, path: string, type = 'Collection') {
  const pageSize = Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE)
  const offset = Math.max(1, Number(query.offset) || 1)
  const elements = all.slice((offset - 1) * pageSize, offset * pageSize)
  const pageLink = (page: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined)
        params.set(key, value)
    }
    params.set('offset', String(page))
    params.set('pageSize', String(pageSize))
    return { href: `${path}?${params}` }
  }
  return {
    _type: type,
    total: all.length,
    count: elements.length,
    pageSize,
    offset,
    _embedded: { elements },
    _links: {
      self: pageLink(offset),
      ...(offset > 1 && {
        previousByOffset: pageLink(offset - 1),
      }),
      ...(offset * pageSize < all.length && {
        nextByOffset: pageLink(offset + 1),
      }),
    },
  }
}

/**
 * Comme OP, une liste de tâches sans paramètre `filters` ne contient que les tâches
 * ouvertes ; un filtre explicite (ex. `[]`) les renvoie toutes, sauf filtre `status: o`.
 */
function onlyOpenRequested(filters: string | undefined): boolean {
  if (filters === undefined)
    return true
  const parsed = JSON.parse(filters) as Array<Record<string, { operator?: string }>>
  return parsed.some(filter => filter.status?.operator === 'o')
}

function projectResource(project: FakeProject) {
  return {
    _type: project.type ?? 'Project',
    id: project.id,
    identifier: project.identifier,
    name: project.name,
    active: true,
    _links: {
      self: { href: `/api/v3/projects/${project.id}`, title: project.name },
    },
  }
}

function userResource(user: FakeUser) {
  return {
    _type: 'User',
    id: user.id,
    name: user.name,
    _links: {
      self: { href: `/api/v3/users/${user.id}`, title: user.name },
    },
  }
}

function findStatus(statusId: number): FakeStatus | undefined {
  return Object.values(FAKE_STATUSES).find(candidate => candidate.id === statusId)
}

function statusLink(statusId: number) {
  return { href: `/api/v3/statuses/${statusId}`, title: findStatus(statusId)?.name ?? 'Unknown' }
}

function statusResource(status: FakeStatus) {
  return {
    _type: 'Status',
    id: status.id,
    name: status.name,
    isClosed: status.isClosed,
    _links: {
      self: statusLink(status.id),
    },
  }
}

/** Extrait l'identifiant final d'un lien HAL (`/api/v3/users/3` → 3), `null` si le lien est vide. */
/** Lien HAL vers une ressource nommée ; `href: null` quand elle est vide, comme OP. */
function namedLink(collection: string, ref: FakeNamedRef | null) {
  return ref
    ? { href: `/api/v3/${collection}/${ref.id}`, title: ref.name }
    : { href: null }
}

function idFromHref(href: string | null): number | null {
  if (href === null)
    return null
  return Number(href.split('/').at(-1))
}

interface LinkPatch {
  href: string | null
}

interface WorkPackageCreation {
  subject?: string
  _links?: { type?: LinkPatch, parent?: LinkPatch }
}

interface WorkPackagePatch {
  lockVersion?: number
  subject?: string
  estimatedTime?: string | null
  remainingTime?: string | null
  description?: { raw: string }
  _links?: { assignee?: LinkPatch, status?: LinkPatch, type?: LinkPatch, priority?: LinkPatch, parent?: LinkPatch }
}

function tokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Basic '))
    return undefined
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const [login, ...rest] = decoded.split(':')
  return login === 'apikey'
    ? rest.join(':')
    : undefined
}

export async function startFakeOp(): Promise<FakeOp> {
  let state = emptyState()
  const app = Fastify({ logger: false })

  const usersByRequest = new WeakMap<FastifyRequest, FakeUser>()
  let interceptions: Interception[] = []

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]
    const index = interceptions.findIndex(
      candidate =>
        (candidate.method === undefined || candidate.method === request.method)
        && (candidate.path === undefined || candidate.path === path),
    )
    const interception = interceptions[index]
    if (interception) {
      interceptions.splice(index, 1)
      return sendInterception(reply, interception)
    }

    const token = tokenFrom(request)
    const user = state.users.find(candidate => candidate.token === token)
    if (!user) {
      return sendOpError(reply, 401)
    }
    usersByRequest.set(request, user)
  })

  const currentUser = (request: FastifyRequest) => {
    const user = usersByRequest.get(request)
    if (!user)
      throw new Error('Requête non authentifiée')
    return user
  }

  const userLink = (userId: number | null) => {
    const user = state.users.find(candidate => candidate.id === userId)
    return user
      ? { href: `/api/v3/users/${user.id}`, title: user.name }
      : { href: null }
  }

  const workPackageLink = (workPackageId: number | null) => {
    const workPackage = state.workPackages.find(candidate => candidate.id === workPackageId)
    return workPackage
      ? { href: `/api/v3/work_packages/${workPackage.id}`, title: workPackage.subject }
      : { href: null }
  }

  const workPackageResource = (workPackage: FakeWorkPackage) => {
    const project = state.projects.find(candidate => candidate.id === workPackage.projectId)
    return {
      _type: 'WorkPackage',
      id: workPackage.id,
      subject: workPackage.subject,
      lockVersion: workPackage.lockVersion,
      estimatedTime: workPackage.estimatedTime,
      // OP omet `remainingTime` quand il n'est pas renseigné.
      ...(workPackage.remainingTime !== null && { remainingTime: workPackage.remainingTime }),
      ...(workPackage.spentTime !== null && { spentTime: workPackage.spentTime }),
      ...(workPackage.date === undefined
        ? { startDate: workPackage.startDate, dueDate: workPackage.dueDate }
        : { date: workPackage.date }),
      description: { format: 'markdown', raw: workPackage.description, html: `<p>${workPackage.description}</p>` },
      _links: {
        self: { href: `/api/v3/work_packages/${workPackage.id}`, title: workPackage.subject },
        project: { href: `/api/v3/projects/${workPackage.projectId}`, title: project?.name },
        parent: workPackageLink(workPackage.parentId),
        assignee: userLink(workPackage.assigneeId),
        responsible: userLink(workPackage.responsibleId),
        status: statusLink(workPackage.statusId),
        type: namedLink('types', workPackage.type),
        priority: namedLink('priorities', workPackage.priority),
        version: namedLink('versions', workPackage.version),
        category: namedLink('categories', workPackage.category),
        activities: { href: `/api/v3/work_packages/${workPackage.id}/activities` },
      },
    }
  }

  const addWorkPackage: FakeOp['addWorkPackage'] = (workPackage) => {
    const created: FakeWorkPackage = {
      lockVersion: 0,
      parentId: null,
      assigneeId: null,
      statusId: FAKE_STATUSES.new.id,
      estimatedTime: null,
      remainingTime: null,
      spentTime: 'PT0S',
      responsibleId: null,
      startDate: null,
      dueDate: null,
      type: FAKE_TYPES.task,
      priority: FAKE_PRIORITIES.normal,
      version: null,
      category: null,
      description: '',
      allowedStatusIds: Object.values(FAKE_STATUSES).map(status => status.id),
      ...workPackage,
    }
    state.workPackages.push(created)
    return created
  }

  const isMember = (project: FakeProject, user: FakeUser) => project.memberIds.includes(user.id)

  /**
   * Résout un projet visible par l'utilisateur, ou envoie 404. Comme OP, un projet
   * invisible est indiscernable d'un projet inexistant ; le 403 s'obtient par `interceptNext`.
   */
  const accessibleProject = (request: FastifyRequest, reply: FastifyReply, id: number) => {
    const project = state.projects.find(candidate => candidate.id === id)
    if (project && isMember(project, currentUser(request)))
      return project
    sendOpError(reply, 404)
    return undefined
  }

  app.get('/api/v3/users/me', async request => userResource(currentUser(request)))

  app.get<{ Params: { id: string } }>('/api/v3/users/:id', async (request, reply) => {
    const user = state.users.find(candidate => candidate.id === Number(request.params.id))
    if (!user)
      return sendOpError(reply, 404)
    return userResource(user)
  })

  app.get<{ Querystring: CollectionQuery }>('/api/v3/statuses', async request =>
    paginatedCollection(Object.values(FAKE_STATUSES).map(statusResource), request.query, '/api/v3/statuses'))

  app.get<{ Querystring: CollectionQuery }>('/api/v3/projects', async (request) => {
    const user = currentUser(request)
    const visible = state.projects.filter(project => isMember(project, user))
    return paginatedCollection(visible.map(projectResource), request.query, '/api/v3/projects')
  })

  app.get<{ Params: { id: string } }>('/api/v3/projects/:id', async (request, reply) => {
    const project = accessibleProject(request, reply, Number(request.params.id))
    if (!project)
      return reply
    return projectResource(project)
  })

  app.get<{ Params: { id: string }, Querystring: CollectionQuery }>(
    '/api/v3/projects/:id/work_packages',
    async (request, reply) => {
      const project = accessibleProject(request, reply, Number(request.params.id))
      if (!project)
        return reply
      const onlyOpen = onlyOpenRequested(request.query.filters)
      const workPackages = state.workPackages
        .filter(workPackage => workPackage.projectId === project.id)
        .filter(workPackage => !onlyOpen || !findStatus(workPackage.statusId)?.isClosed)
        .map(workPackageResource)
      return paginatedCollection(workPackages, request.query, `/api/v3/projects/${project.id}/work_packages`, 'WorkPackageCollection')
    },
  )

  /** Résout une tâche dont le projet est accessible, ou envoie l'erreur OP correspondante. */
  const accessibleWorkPackage = (request: FastifyRequest, reply: FastifyReply, id: number) => {
    const workPackage = state.workPackages.find(candidate => candidate.id === id)
    if (!workPackage) {
      sendOpError(reply, 404)
      return undefined
    }
    if (!accessibleProject(request, reply, workPackage.projectId))
      return undefined
    return workPackage
  }

  app.get<{ Params: { id: string } }>('/api/v3/work_packages/:id', async (request, reply) => {
    const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
    if (!workPackage)
      return reply
    return workPackageResource(workPackage)
  })

  app.patch<{ Params: { id: string }, Body: WorkPackagePatch }>(
    '/api/v3/work_packages/:id',
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
      if (!workPackage)
        return reply
      const { body } = request

      if (body.lockVersion !== workPackage.lockVersion) {
        return sendOpError(reply, 409)
      }

      const statusHref = body._links?.status?.href
      const statusId = statusHref === undefined
        ? workPackage.statusId
        : idFromHref(statusHref)
      if (statusId === null || (statusId !== workPackage.statusId && !workPackage.allowedStatusIds.includes(statusId))) {
        return constraintViolation(reply, 'status', 'Status is invalid because no valid transition exists.')
      }

      // Comme OP, le type et la priorité se changent, mais ne se vident pas.
      const typeLink = body._links?.type
      const type = typeLink && Object.values(FAKE_TYPES).find(candidate => candidate.id === idFromHref(typeLink.href))
      if (typeLink && !type)
        return constraintViolation(reply, 'type', 'Type is not set to one of the allowed values.')
      const priorityLink = body._links?.priority
      const priority = priorityLink && Object.values(FAKE_PRIORITIES).find(candidate => candidate.id === idFromHref(priorityLink.href))
      if (priorityLink && !priority)
        return constraintViolation(reply, 'priority', 'Priority is not set to one of the allowed values.')

      const parentHref = body._links?.parent?.href
      if (parentHref) {
        const parentId = idFromHref(parentHref)
        if (!state.workPackages.some(candidate => candidate.id === parentId))
          return constraintViolation(reply, 'parent', 'Parent does not exist.')
      }

      const assigneeHref = body._links?.assignee?.href
      if (assigneeHref) {
        const project = state.projects.find(candidate => candidate.id === workPackage.projectId)
        const assigneeId = idFromHref(assigneeHref)
        if (!project?.memberIds.includes(assigneeId ?? -1) || !state.users.some(user => user.id === assigneeId))
          return constraintViolation(reply, 'assignee', 'Assignee is not set to one of the allowed values.')
      }

      if (body.subject !== undefined)
        workPackage.subject = body.subject
      if (body.estimatedTime !== undefined)
        workPackage.estimatedTime = body.estimatedTime
      if (body.remainingTime !== undefined)
        workPackage.remainingTime = body.remainingTime
      if (body.description !== undefined)
        workPackage.description = body.description.raw
      if (body._links?.assignee)
        workPackage.assigneeId = idFromHref(body._links.assignee.href)
      if (body._links?.parent)
        workPackage.parentId = idFromHref(body._links.parent.href)
      if (type)
        workPackage.type = type
      if (priority)
        workPackage.priority = priority
      workPackage.statusId = statusId
      workPackage.lockVersion += 1

      return workPackageResource(workPackage)
    },
  )

  /** Comme OP, seuls les membres du projet de la tâche peuvent en être assignés. */
  app.get<{ Params: { id: string }, Querystring: CollectionQuery }>(
    '/api/v3/work_packages/:id/available_assignees',
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
      if (!workPackage)
        return reply
      const project = state.projects.find(candidate => candidate.id === workPackage.projectId)
      const assignees = state.users.filter(user => project?.memberIds.includes(user.id)).map(userResource)
      return paginatedCollection(assignees, request.query, `/api/v3/work_packages/${workPackage.id}/available_assignees`)
    },
  )

  app.post<{ Params: { id: string }, Body: WorkPackagePatch }>('/api/v3/work_packages/:id/form', async (request, reply) => {
    const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
    if (!workPackage)
      return reply
    // Comme OP 17, le formulaire de modification exige la version actuelle de la tâche.
    if (request.body?.lockVersion !== workPackage.lockVersion)
      return sendOpError(reply, 409)
    const allowedStatuses = workPackage.allowedStatusIds.flatMap(id => findStatus(id) ?? [])
    const namedField = (type: string, collection: string, allowed: FakeNamedRef[]) => ({
      type,
      name: type,
      required: true,
      writable: true,
      _embedded: {
        allowedValues: allowed.map(ref => ({
          _type: type,
          ...ref,
          _links: {
            self: namedLink(collection, ref),
          },
        })),
      },
      _links: {
        allowedValues: allowed.map(ref => namedLink(collection, ref)),
      },
    })
    return {
      _type: 'Form',
      _embedded: {
        payload: workPackageResource(workPackage),
        schema: {
          _type: 'Schema',
          status: {
            type: 'Status',
            name: 'Status',
            required: true,
            writable: true,
            _embedded: {
              allowedValues: allowedStatuses.map(statusResource),
            },
            _links: {
              allowedValues: allowedStatuses.map(status => statusLink(status.id)),
            },
          },
          type: namedField('Type', 'types', Object.values(FAKE_TYPES)),
          priority: namedField('Priority', 'priorities', Object.values(FAKE_PRIORITIES)),
        },
        validationErrors: {},
      },
      _links: {
        self: { href: `/api/v3/work_packages/${workPackage.id}/form` },
      },
    }
  })

  /**
   * Comme OP 17, le lien vers l'auteur n'a pas de titre : son nom se lit à part. Le HTML
   * du commentaire reprend le markdown sans l'échapper, comme si OP laissait passer du HTML
   * dangereux. La version est le rang de l'activité dans l'historique de la tâche, 1 pour sa création.
   */
  const activityResource = (activity: FakeActivity) => ({
    _type: activity.comment
      ? 'Activity::Comment'
      : 'Activity',
    id: activity.id,
    version: state.activities.filter(candidate => candidate.workPackageId === activity.workPackageId).indexOf(activity) + 1,
    comment: {
      format: 'markdown',
      raw: activity.comment,
      html: activity.comment
        ? `<p>${activity.comment}</p>`
        : '',
    },
    details: activity.details.map(detail => ({ format: 'custom', raw: detail, html: `<p>${detail}</p>` })),
    internal: false,
    createdAt: activity.createdAt,
    updatedAt: activity.createdAt,
    _links: {
      self: { href: `/api/v3/activities/${activity.id}` },
      workPackage: { href: `/api/v3/work_packages/${activity.workPackageId}` },
      user: { href: `/api/v3/users/${activity.userId ?? 0}` },
    },
  })

  const addActivity: FakeOp['addActivity'] = (activity) => {
    const created: FakeActivity = {
      id: state.nextActivityId,
      userId: null,
      comment: '',
      details: [],
      createdAt: new Date().toISOString(),
      ...activity,
    }
    state.nextActivityId = Math.max(state.nextActivityId, created.id) + 1
    state.activities.push(created)
    return created
  }

  app.get<{ Params: { id: string }, Querystring: CollectionQuery }>(
    '/api/v3/work_packages/:id/activities',
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
      if (!workPackage)
        return reply
      const activities = state.activities
        .filter(activity => activity.workPackageId === workPackage.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
        .map(activityResource)
      return paginatedCollection(activities, request.query, `/api/v3/work_packages/${workPackage.id}/activities`)
    },
  )

  app.post<{ Params: { id: string }, Body: { comment?: { raw?: string } } }>(
    '/api/v3/work_packages/:id/activities',
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id))
      if (!workPackage)
        return reply
      const raw = request.body.comment?.raw
      if (!raw)
        return constraintViolation(reply, 'comment', 'Comment can\'t be blank.')
      const activity = addActivity({ workPackageId: workPackage.id, comment: raw, userId: currentUser(request).id })
      return reply.code(201).send(activityResource(activity))
    },
  )

  /** Types actifs dans le projet ; un type hors du projet n'est pas permis à ses tâches. */
  const projectTypes = (project: FakeProject) => {
    const all: FakeNamedRef[] = Object.values(FAKE_TYPES)
    return project.typeIds
      ? project.typeIds.flatMap(id => all.find(type => type.id === id) ?? [])
      : all
  }

  app.get<{ Params: { id: string }, Querystring: CollectionQuery }>(
    '/api/v3/projects/:id/types',
    async (request, reply) => {
      const project = accessibleProject(request, reply, Number(request.params.id))
      if (!project)
        return reply
      const types = projectTypes(project).map((type, index) => ({
        _type: 'Type',
        ...type,
        color: '#1A67A3',
        position: index + 1,
        isDefault: type.id === FAKE_DEFAULT_TYPE_ID,
        isMilestone: type.id === FAKE_TYPES.milestone.id,
        _links: {
          self: namedLink('types', type),
        },
      }))
      return paginatedCollection(types, request.query, `/api/v3/projects/${project.id}/types`)
    },
  )

  /**
   * Comme OP, la tâche créée prend l'état et la priorité par défaut, sans assigné, et son
   * historique commence par sa création, au nom de l'utilisateur du jeton.
   */
  app.post<{ Params: { id: string }, Body: WorkPackageCreation }>(
    '/api/v3/projects/:id/work_packages',
    async (request, reply) => {
      const project = accessibleProject(request, reply, Number(request.params.id))
      if (!project)
        return reply
      const { subject, _links } = request.body
      if (!subject?.trim())
        return constraintViolation(reply, 'subject', 'Subject can\'t be blank.')
      const type = projectTypes(project).find(candidate => candidate.id === idFromHref(_links?.type?.href ?? null))
      if (!type)
        return constraintViolation(reply, 'type', 'Type is not set to one of the allowed values.')
      const parentId = idFromHref(_links?.parent?.href ?? null)
      if (parentId !== null && !state.workPackages.some(candidate => candidate.id === parentId))
        return constraintViolation(reply, 'parent', 'Parent does not exist.')

      const created = addWorkPackage({
        id: Math.max(0, ...state.workPackages.map(candidate => candidate.id)) + 1,
        projectId: project.id,
        subject,
        type,
        parentId,
        spentTime: null,
      })
      addActivity({ workPackageId: created.id, userId: currentUser(request).id })
      return reply.code(201).send(workPackageResource(created))
    },
  )

  const workPackage = (id: number) => {
    const found = state.workPackages.find(candidate => candidate.id === id)
    if (!found)
      throw new Error(`Tâche factice ${id} inconnue`)
    return found
  }

  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (address === null || typeof address === 'string')
    throw new Error('Adresse du faux OP inattendue')

  return {
    url: `http://127.0.0.1:${address.port}`,
    authHeaders: token => ({
      authorization: `Basic ${Buffer.from(`apikey:${token}`).toString('base64')}`,
    }),
    addUser: ({ name, token }) => {
      const user = { id: state.nextUserId, name, token }
      state.nextUserId += 1
      state.users.push(user)
      return user
    },
    addProject: (project) => {
      state.projects.push(project)
      return project
    },
    addWorkPackage,
    workPackage,
    touchWorkPackage: (id) => {
      workPackage(id).lockVersion += 1
    },
    addActivity,
    interceptNext: (interception) => {
      interceptions.push(interception)
    },
    reset: () => {
      state = emptyState()
      interceptions = []
    },
    close: () => app.close(),
  }
}
