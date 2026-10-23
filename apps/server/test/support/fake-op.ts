import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

/**
 * Faux serveur OpenProject (API v3, CE 17) pour les tests d'intégration.
 *
 * C'est le seul point de contact avec OP dans les tests : il tient un état en
 * mémoire (utilisateurs, projets) et répond au format HAL de l'API v3.
 */

const ERROR_URN = "urn:openproject-org:api:v3:errors:";

export interface FakeUser {
  id: number;
  name: string;
  token: string;
}

export interface FakeProject {
  id: number;
  identifier: string;
  name: string;
  memberIds: number[];
}

export interface FakeStatus {
  id: number;
  name: string;
  isClosed: boolean;
}

/** Statuts disponibles sur l'instance factice. */
export const FAKE_STATUSES = {
  new: { id: 1, name: "New", isClosed: false },
  inProgress: { id: 7, name: "In progress", isClosed: false },
  closed: { id: 12, name: "Closed", isClosed: true },
} as const satisfies Record<string, FakeStatus>;

export interface FakeWorkPackage {
  id: number;
  projectId: number;
  subject: string;
  lockVersion: number;
  parentId: number | null;
  assigneeId: number | null;
  statusId: number;
  /** Durées au format ISO 8601, comme dans OP (ex. `PT2H30M`). */
  estimatedTime: string | null;
  remainingTime: string | null;
  description: string;
  /** Statuts proposés par le formulaire OP pour cette tâche (transitions autorisées). */
  allowedStatusIds: number[];
}

export type NewFakeWorkPackage = Pick<FakeWorkPackage, "id" | "projectId" | "subject"> &
  Partial<Omit<FakeWorkPackage, "id" | "projectId" | "subject">>;

export interface FakeActivity {
  id: number;
  workPackageId: number;
  userId: number | null;
  comment: string;
  createdAt: string;
}

interface State {
  users: FakeUser[];
  projects: FakeProject[];
  workPackages: FakeWorkPackage[];
  activities: FakeActivity[];
  nextUserId: number;
  nextActivityId: number;
}

const emptyState = (): State => ({
  users: [],
  projects: [],
  workPackages: [],
  activities: [],
  nextUserId: 1,
  nextActivityId: 1,
});

const DEFAULT_PAGE_SIZE = 20;

export interface Interception {
  /** Méthode HTTP visée ; toutes si absente. */
  method?: string;
  /** Chemin exact visé (sans query string) ; tous si absent. */
  path?: string;
  status: number;
  /** Corps renvoyé ; par défaut, l'erreur OP correspondant au statut. */
  body?: unknown;
}

/** Erreurs OP courantes, au format renvoyé par l'API v3. */
const OP_ERRORS: Record<number, [identifier: string, message: string]> = {
  401: ["Unauthenticated", "You need to be authenticated to access this resource."],
  403: ["MissingPermission", "You are not authorized to access this resource."],
  404: ["NotFound", "The requested resource could not be found."],
  409: ["UpdateConflict", "Could not update the resource because of conflicting modifications."],
};

export interface FakeOp {
  /** URL de base de l'instance (sans `/api/v3`). */
  url: string;
  /** En-têtes d'authentification OP pour un jeton d'API (Basic `apikey:<jeton>`). */
  authHeaders(token: string): Record<string, string>;
  addUser(user: { name: string; token: string }): FakeUser;
  addProject(project: FakeProject): FakeProject;
  addWorkPackage(workPackage: NewFakeWorkPackage): FakeWorkPackage;
  /** Simule une modification concurrente dans OP (incrémente `lockVersion`). */
  touchWorkPackage(id: number): void;
  /**
   * La prochaine requête correspondante reçoit la réponse donnée au lieu du
   * comportement normal (401, 403, 503, corps non conforme...). Usage unique.
   */
  interceptNext(interception: Interception): void;
  addActivity(activity: Pick<FakeActivity, "workPackageId" | "comment"> & Partial<FakeActivity>): FakeActivity;
  /** Vide l'état entre deux tests. */
  reset(): void;
  close(): Promise<void>;
}

function apiError(reply: FastifyReply, status: number, identifier: string, message: string, extra: object = {}) {
  return reply.code(status).type("application/hal+json").send({
    _type: "Error",
    errorIdentifier: `${ERROR_URN}${identifier}`,
    message,
    ...extra,
  });
}

/** Erreur 422 d'OP sur un attribut précis (`_embedded.details.attribute`). */
function constraintViolation(reply: FastifyReply, attribute: string, message: string) {
  return apiError(reply, 422, "PropertyConstraintViolation", message, {
    _embedded: { details: { attribute } },
  });
}

/** Envoie l'erreur OP standard du statut ; sans équivalent OP (ex. 503), une page du proxy frontal. */
function sendOpError(reply: FastifyReply, status: number) {
  const opError = OP_ERRORS[status];
  if (opError) return apiError(reply, status, ...opError);
  return reply.code(status).type("text/html").send(`<html><body>${status}</body></html>`);
}

function sendInterception(reply: FastifyReply, { status, body }: Interception) {
  return body === undefined ? sendOpError(reply, status) : reply.code(status).send(body);
}

type CollectionQuery = Record<string, string | undefined>;

/**
 * Collection paginée à la manière d'OP : `offset` est un numéro de page (à partir de 1),
 * et les liens `nextByOffset` / `previousByOffset` conservent les autres paramètres.
 */
function paginatedCollection<T>(all: T[], query: CollectionQuery, path: string) {
  const pageSize = Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE);
  const offset = Math.max(1, Number(query.offset) || 1);
  const elements = all.slice((offset - 1) * pageSize, offset * pageSize);
  const pageLink = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value);
    params.set("offset", String(page));
    params.set("pageSize", String(pageSize));
    return { href: `${path}?${params}` };
  };
  return {
    _type: "Collection",
    total: all.length,
    count: elements.length,
    pageSize,
    offset,
    _embedded: { elements },
    _links: {
      self: pageLink(offset),
      ...(offset > 1 && { previousByOffset: pageLink(offset - 1) }),
      ...(offset * pageSize < all.length && { nextByOffset: pageLink(offset + 1) }),
    },
  };
}

/**
 * Comme OP, une liste de tâches sans paramètre `filters` ne contient que les tâches
 * ouvertes ; un filtre explicite (ex. `[]`) les renvoie toutes, sauf filtre `status: o`.
 */
function onlyOpenRequested(filters: string | undefined): boolean {
  if (filters === undefined) return true;
  const parsed = JSON.parse(filters) as Array<Record<string, { operator?: string }>>;
  return parsed.some((filter) => filter.status?.operator === "o");
}

function projectResource(project: FakeProject) {
  return {
    _type: "Project",
    id: project.id,
    identifier: project.identifier,
    name: project.name,
    active: true,
    _links: { self: { href: `/api/v3/projects/${project.id}`, title: project.name } },
  };
}

function userResource(user: FakeUser) {
  return {
    _type: "User",
    id: user.id,
    name: user.name,
    _links: { self: { href: `/api/v3/users/${user.id}`, title: user.name } },
  };
}

const findStatus = (statusId: number): FakeStatus | undefined =>
  Object.values(FAKE_STATUSES).find((candidate) => candidate.id === statusId);

function statusLink(statusId: number) {
  return { href: `/api/v3/statuses/${statusId}`, title: findStatus(statusId)?.name ?? "Unknown" };
}

function statusResource(status: FakeStatus) {
  return {
    _type: "Status",
    id: status.id,
    name: status.name,
    isClosed: status.isClosed,
    _links: { self: statusLink(status.id) },
  };
}

/** Extrait l'identifiant final d'un lien HAL (`/api/v3/users/3` → 3), `null` si le lien est vide. */
function idFromHref(href: string | null): number | null {
  if (href === null) return null;
  return Number(href.split("/").at(-1));
}

interface LinkPatch {
  href: string | null;
}

interface WorkPackagePatch {
  lockVersion?: number;
  subject?: string;
  estimatedTime?: string | null;
  remainingTime?: string | null;
  description?: { raw: string };
  _links?: { assignee?: LinkPatch; status?: LinkPatch; parent?: LinkPatch };
}

function tokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) return undefined;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const [login, ...rest] = decoded.split(":");
  return login === "apikey" ? rest.join(":") : undefined;
}

export async function startFakeOp(): Promise<FakeOp> {
  let state = emptyState();
  const app = Fastify({ logger: false });

  const usersByRequest = new WeakMap<FastifyRequest, FakeUser>();
  let interceptions: Interception[] = [];

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    const index = interceptions.findIndex(
      (candidate) =>
        (candidate.method === undefined || candidate.method === request.method) &&
        (candidate.path === undefined || candidate.path === path),
    );
    const interception = interceptions[index];
    if (interception) {
      interceptions.splice(index, 1);
      return sendInterception(reply, interception);
    }

    const token = tokenFrom(request);
    const user = state.users.find((candidate) => candidate.token === token);
    if (!user) {
      return sendOpError(reply, 401);
    }
    usersByRequest.set(request, user);
  });

  const currentUser = (request: FastifyRequest) => {
    const user = usersByRequest.get(request);
    if (!user) throw new Error("Requête non authentifiée");
    return user;
  };

  const userLink = (userId: number | null) => {
    const user = state.users.find((candidate) => candidate.id === userId);
    return user ? { href: `/api/v3/users/${user.id}`, title: user.name } : { href: null };
  };

  const workPackageLink = (workPackageId: number | null) => {
    const workPackage = state.workPackages.find((candidate) => candidate.id === workPackageId);
    return workPackage
      ? { href: `/api/v3/work_packages/${workPackage.id}`, title: workPackage.subject }
      : { href: null };
  };

  const workPackageResource = (workPackage: FakeWorkPackage) => {
    const project = state.projects.find((candidate) => candidate.id === workPackage.projectId);
    return {
      _type: "WorkPackage",
      id: workPackage.id,
      subject: workPackage.subject,
      lockVersion: workPackage.lockVersion,
      estimatedTime: workPackage.estimatedTime,
      remainingTime: workPackage.remainingTime,
      description: { format: "markdown", raw: workPackage.description, html: `<p>${workPackage.description}</p>` },
      _links: {
        self: { href: `/api/v3/work_packages/${workPackage.id}`, title: workPackage.subject },
        project: { href: `/api/v3/projects/${workPackage.projectId}`, title: project?.name },
        parent: workPackageLink(workPackage.parentId),
        assignee: userLink(workPackage.assigneeId),
        status: statusLink(workPackage.statusId),
        activities: { href: `/api/v3/work_packages/${workPackage.id}/activities` },
      },
    };
  };

  const isMember = (project: FakeProject, user: FakeUser) => project.memberIds.includes(user.id);

  /**
   * Résout un projet visible par l'utilisateur, ou envoie 404. Comme OP, un projet
   * invisible est indiscernable d'un projet inexistant ; le 403 s'obtient par `interceptNext`.
   */
  const accessibleProject = (request: FastifyRequest, reply: FastifyReply, id: number) => {
    const project = state.projects.find((candidate) => candidate.id === id);
    if (project && isMember(project, currentUser(request))) return project;
    sendOpError(reply, 404);
    return undefined;
  };

  app.get("/api/v3/users/me", async (request) => userResource(currentUser(request)));

  app.get<{ Querystring: CollectionQuery }>("/api/v3/projects", async (request) => {
    const user = currentUser(request);
    const visible = state.projects.filter((project) => isMember(project, user));
    return paginatedCollection(visible.map(projectResource), request.query, "/api/v3/projects");
  });

  app.get<{ Params: { id: string } }>("/api/v3/projects/:id", async (request, reply) => {
    const project = accessibleProject(request, reply, Number(request.params.id));
    if (!project) return reply;
    return projectResource(project);
  });

  app.get<{ Params: { id: string }; Querystring: CollectionQuery }>(
    "/api/v3/projects/:id/work_packages",
    async (request, reply) => {
      const project = accessibleProject(request, reply, Number(request.params.id));
      if (!project) return reply;
      const onlyOpen = onlyOpenRequested(request.query.filters);
      const workPackages = state.workPackages
        .filter((workPackage) => workPackage.projectId === project.id)
        .filter((workPackage) => !onlyOpen || !findStatus(workPackage.statusId)?.isClosed)
        .map(workPackageResource);
      return paginatedCollection(workPackages, request.query, `/api/v3/projects/${project.id}/work_packages`);
    },
  );

  /** Résout une tâche dont le projet est accessible, ou envoie l'erreur OP correspondante. */
  const accessibleWorkPackage = (request: FastifyRequest, reply: FastifyReply, id: number) => {
    const workPackage = state.workPackages.find((candidate) => candidate.id === id);
    if (!workPackage) {
      sendOpError(reply, 404);
      return undefined;
    }
    if (!accessibleProject(request, reply, workPackage.projectId)) return undefined;
    return workPackage;
  };

  app.get<{ Params: { id: string } }>("/api/v3/work_packages/:id", async (request, reply) => {
    const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
    if (!workPackage) return reply;
    return workPackageResource(workPackage);
  });

  app.patch<{ Params: { id: string }; Body: WorkPackagePatch }>(
    "/api/v3/work_packages/:id",
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
      if (!workPackage) return reply;
      const { body } = request;

      if (body.lockVersion !== workPackage.lockVersion) {
        return sendOpError(reply, 409);
      }

      const statusHref = body._links?.status?.href;
      const statusId = statusHref === undefined ? workPackage.statusId : idFromHref(statusHref);
      if (statusId === null || (statusId !== workPackage.statusId && !workPackage.allowedStatusIds.includes(statusId))) {
        return constraintViolation(reply, "status", "Status is invalid because no valid transition exists.");
      }

      const assigneeHref = body._links?.assignee?.href;
      if (assigneeHref) {
        const project = state.projects.find((candidate) => candidate.id === workPackage.projectId);
        const assigneeId = idFromHref(assigneeHref);
        if (!project?.memberIds.includes(assigneeId ?? -1) || !state.users.some((user) => user.id === assigneeId)) {
          return constraintViolation(reply, "assignee", "Assignee is not set to one of the allowed values.");
        }
      }

      if (body.subject !== undefined) workPackage.subject = body.subject;
      if (body.estimatedTime !== undefined) workPackage.estimatedTime = body.estimatedTime;
      if (body.remainingTime !== undefined) workPackage.remainingTime = body.remainingTime;
      if (body.description !== undefined) workPackage.description = body.description.raw;
      if (body._links?.assignee) workPackage.assigneeId = idFromHref(body._links.assignee.href);
      if (body._links?.parent) workPackage.parentId = idFromHref(body._links.parent.href);
      workPackage.statusId = statusId;
      workPackage.lockVersion += 1;

      return workPackageResource(workPackage);
    },
  );

  /** Comme OP, seuls les membres du projet de la tâche peuvent en être assignés. */
  app.get<{ Params: { id: string }; Querystring: CollectionQuery }>(
    "/api/v3/work_packages/:id/available_assignees",
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
      if (!workPackage) return reply;
      const project = state.projects.find((candidate) => candidate.id === workPackage.projectId);
      const assignees = state.users.filter((user) => project?.memberIds.includes(user.id)).map(userResource);
      return paginatedCollection(assignees, request.query, `/api/v3/work_packages/${workPackage.id}/available_assignees`);
    },
  );

  app.post<{ Params: { id: string } }>("/api/v3/work_packages/:id/form", async (request, reply) => {
    const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
    if (!workPackage) return reply;
    const allowedStatuses = workPackage.allowedStatusIds.flatMap((id) => findStatus(id) ?? []);
    return {
      _type: "Form",
      _embedded: {
        payload: workPackageResource(workPackage),
        schema: {
          _type: "Schema",
          status: {
            type: "Status",
            name: "Status",
            required: true,
            writable: true,
            _embedded: { allowedValues: allowedStatuses.map(statusResource) },
            _links: { allowedValues: allowedStatuses.map((status) => statusLink(status.id)) },
          },
        },
        validationErrors: {},
      },
      _links: { self: { href: `/api/v3/work_packages/${workPackage.id}/form` } },
    };
  });

  const activityResource = (activity: FakeActivity) => ({
    _type: "Activity::Comment",
    id: activity.id,
    comment: { format: "markdown", raw: activity.comment, html: `<p>${activity.comment}</p>` },
    details: [],
    createdAt: activity.createdAt,
    _links: {
      self: { href: `/api/v3/activities/${activity.id}` },
      workPackage: { href: `/api/v3/work_packages/${activity.workPackageId}` },
      user: userLink(activity.userId),
    },
  });

  const addActivity: FakeOp["addActivity"] = (activity) => {
    const created: FakeActivity = {
      id: state.nextActivityId,
      userId: null,
      createdAt: new Date().toISOString(),
      ...activity,
    };
    state.nextActivityId = Math.max(state.nextActivityId, created.id) + 1;
    state.activities.push(created);
    return created;
  };

  app.get<{ Params: { id: string }; Querystring: CollectionQuery }>(
    "/api/v3/work_packages/:id/activities",
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
      if (!workPackage) return reply;
      const activities = state.activities
        .filter((activity) => activity.workPackageId === workPackage.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
        .map(activityResource);
      return paginatedCollection(activities, request.query, `/api/v3/work_packages/${workPackage.id}/activities`);
    },
  );

  app.post<{ Params: { id: string }; Body: { comment?: { raw?: string } } }>(
    "/api/v3/work_packages/:id/activities",
    async (request, reply) => {
      const workPackage = accessibleWorkPackage(request, reply, Number(request.params.id));
      if (!workPackage) return reply;
      const raw = request.body.comment?.raw;
      if (!raw) return constraintViolation(reply, "comment", "Comment can't be blank.");
      const activity = addActivity({ workPackageId: workPackage.id, comment: raw, userId: currentUser(request).id });
      return reply.code(201).send(activityResource(activity));
    },
  );

  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("Adresse du faux OP inattendue");

  return {
    url: `http://127.0.0.1:${address.port}`,
    authHeaders: (token) => ({
      authorization: `Basic ${Buffer.from(`apikey:${token}`).toString("base64")}`,
    }),
    addUser: ({ name, token }) => {
      const user = { id: state.nextUserId, name, token };
      state.nextUserId += 1;
      state.users.push(user);
      return user;
    },
    addProject: (project) => {
      state.projects.push(project);
      return project;
    },
    addWorkPackage: (workPackage) => {
      const created: FakeWorkPackage = {
        lockVersion: 0,
        parentId: null,
        assigneeId: null,
        statusId: FAKE_STATUSES.new.id,
        estimatedTime: null,
        remainingTime: null,
        description: "",
        allowedStatusIds: Object.values(FAKE_STATUSES).map((status) => status.id),
        ...workPackage,
      };
      state.workPackages.push(created);
      return created;
    },
    touchWorkPackage: (id) => {
      const workPackage = state.workPackages.find((candidate) => candidate.id === id);
      if (!workPackage) throw new Error(`Tâche factice ${id} inconnue`);
      workPackage.lockVersion += 1;
    },
    addActivity,
    interceptNext: (interception) => {
      interceptions.push(interception);
    },
    reset: () => {
      state = emptyState();
      interceptions = [];
    },
    close: () => app.close(),
  };
}
