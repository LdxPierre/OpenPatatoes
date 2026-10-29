import { z } from 'zod'

/** Ressource OP désignée par son identifiant et son nom affiché (assigné, statut). */
export interface OpNamedRef {
  id: number
  name: string
}

/** Statut OP d'une tâche. `isClosed` vient d'OP : il classe un statut que l'app ne connaît pas. */
export interface TaskStatus extends OpNamedRef {
  isClosed: boolean
}

/**
 * Tâche dans l'arbre d'un projet : une ligne de la liste, avec ses sous-tâches.
 * Le type est écrit à la main, et non déduit du schéma : un schéma récursif a besoin
 * d'un type explicite.
 */
export interface TaskNode {
  id: number
  subject: string
  status: TaskStatus
  assignee: OpNamedRef | null
  children: TaskNode[]
}

const opNamedRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
})

const taskStatusSchema = opNamedRefSchema.extend({
  isClosed: z.boolean(),
})

export const taskNodeSchema: z.ZodType<TaskNode> = z.object({
  id: z.number().int(),
  subject: z.string(),
  status: taskStatusSchema,
  assignee: opNamedRefSchema.nullable(),
  get children() {
    return z.array(taskNodeSchema)
  },
})

/** Réponse de `GET /api/projects/:id/tasks` : les racines de l'arbre, dans l'ordre d'OP. */
export const taskTreeResponseSchema = z.object({
  tasks: z.array(taskNodeSchema),
})

export type TaskTreeResponse = z.infer<typeof taskTreeResponseSchema>

/** Tâche désignée par son identifiant et son titre : de quoi en afficher un lien. */
export const taskRefSchema = z.object({
  id: z.number().int(),
  subject: z.string(),
})

export type TaskRef = z.infer<typeof taskRefSchema>

/**
 * Détail d'une tâche, en lecture. Les durées sont en heures décimales, sans arrondi
 * (l'interface arrondit à l'affichage), et valent `null` si elles ne sont pas renseignées.
 * `spentHours` vaut aussi `null` si le jeton n'a pas le droit de voir le temps passé.
 * Les dates sont des jours au format ISO (`2026-10-31`), sans heure.
 * `parent` vaut `null` pour une tâche racine ou un parent invisible avec le jeton.
 * `lockVersion` est la version de la tâche dans OP, à renvoyer avec chaque modification.
 * `description` est le markdown d'OP, vide sans description, privé de ses éléments `<script>`
 * et de ses attributs d'événement (`onclick`…).
 */
export const taskDetailSchema = taskRefSchema.extend({
  lockVersion: z.number().int(),
  status: taskStatusSchema,
  type: opNamedRefSchema,
  priority: opNamedRefSchema.nullable(),
  assignee: opNamedRefSchema.nullable(),
  responsible: opNamedRefSchema.nullable(),
  estimatedHours: z.number().nullable(),
  remainingHours: z.number().nullable(),
  spentHours: z.number().nullable(),
  startDate: z.iso.date().nullable(),
  dueDate: z.iso.date().nullable(),
  version: opNamedRefSchema.nullable(),
  category: opNamedRefSchema.nullable(),
  parent: taskRefSchema.nullable(),
  description: z.string(),
})

export type TaskDetail = z.infer<typeof taskDetailSchema>

/** Réponse de `GET` et `PATCH /api/tasks/:id` : après une modification, la tâche telle qu'OP l'a enregistrée. */
export const taskDetailResponseSchema = z.object({
  task: taskDetailSchema,
})

export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>

/** Plus petite durée non nulle acceptée : une seconde. */
export const TASK_HOURS_MIN = 1 / 3600
/** Plus grande durée acceptée. Au-delà, le temps d'une tâche n'a plus de sens. */
export const TASK_HOURS_MAX = 100_000

/**
 * Temps saisi en heures décimales ; `null` efface la valeur dans OP.
 * Hors de `0` et de [`TASK_HOURS_MIN`, `TASK_HOURS_MAX`], la durée ISO 8601 écrite
 * vers OP ne relirait plus la même valeur.
 */
const taskHoursSchema = z
  .number()
  .refine(hours => hours === 0 || (hours >= TASK_HOURS_MIN && hours <= TASK_HOURS_MAX), 'durée hors limites')
  .nullable()
  .optional()

const opIdSchema = z.number().int().positive()

/**
 * Corps de `PATCH /api/tasks/:id`. Un champ absent reste inchangé, `null` le vide ;
 * au moins un champ doit être modifié. La description est du markdown ; une chaîne vide l'efface. L'état, le type et la priorité ne se vident pas :
 * OP les exige. `parentId` à `null` fait de la tâche une racine. `lockVersion` est celui de la tâche lue : OP refuse l'écriture si la tâche
 * a changé depuis.
 */
export const taskChangesSchema = z
  .strictObject({
    lockVersion: z.number().int().nonnegative(),
    estimatedHours: taskHoursSchema,
    remainingHours: taskHoursSchema,
    assigneeId: opIdSchema.nullable().optional(),
    statusId: opIdSchema.optional(),
    typeId: opIdSchema.optional(),
    priorityId: opIdSchema.optional(),
    parentId: opIdSchema.nullable().optional(),
    description: z.string().optional(),
  })
  .refine(
    ({ lockVersion: _, ...changes }) => Object.values(changes).some(value => value !== undefined),
    'aucun champ à modifier',
  )

export type TaskChanges = z.infer<typeof taskChangesSchema>

/**
 * Réponse de `PATCH /api/tasks/:id` quand la modification n'est pas enregistrée. En 422, elle est
 * refusée par OP (`op_rejected`, `message` reprend celui d'OP) ou par l'app, avant OP, pour un parent
 * qui créerait un cycle (`task_parent_cycle`). En 409 (`op_conflict`), la tâche a été modifiée dans OP
 * depuis sa lecture : le `lockVersion` envoyé est périmé. `task` est l'état réel de la tâche, pour
 * annuler l'affichage optimiste ; il manque si la tâche n'a pas pu être relue. Les codes
 * `op_token_invalid` et `op_not_connected` partagent ces statuts : c'est `error` qui distingue les cas.
 */
export const taskRejectedResponseSchema = z.object({
  error: z.enum(['op_rejected', 'op_conflict', 'task_parent_cycle']),
  message: z.string(),
  task: taskDetailSchema.optional(),
})

export type TaskRejectedResponse = z.infer<typeof taskRejectedResponseSchema>

/** Réponse de `GET /api/tasks/:id/assignees` : les utilisateurs à qui la tâche peut être assignée. */
export const taskAssigneesResponseSchema = z.object({
  assignees: z.array(opNamedRefSchema),
})

export type TaskAssigneesResponse = z.infer<typeof taskAssigneesResponseSchema>

/**
 * Réponse de `GET /api/tasks/:id/allowed-values` : les valeurs qu'OP accepte pour la tâche,
 * avec le jeton de l'utilisateur. Les états sont les transitions permises depuis l'état actuel.
 * Une liste vide : OP ne laisse pas modifier ce champ.
 */
export const taskAllowedValuesResponseSchema = z.object({
  statuses: z.array(taskStatusSchema),
  types: z.array(opNamedRefSchema),
  priorities: z.array(opNamedRefSchema),
})

export type TaskAllowedValuesResponse = z.infer<typeof taskAllowedValuesResponseSchema>

/**
 * Visite chaque tâche des arbres donnés, à tous les niveaux. Le parcours est itératif :
 * une hiérarchie profonde ne fait pas déborder la pile.
 */
export function forEachTask(roots: TaskNode[], visit: (task: TaskNode) => void) {
  const stack = [...roots]
  for (let task = stack.pop(); task; task = stack.pop()) {
    visit(task)
    stack.push(...task.children)
  }
}

/**
 * Activité d'une tâche dans OP : un commentaire, des modifications, ou les deux.
 * `comment` est le HTML rendu par OP, assaini par le serveur ; `null` sans commentaire.
 * `changes` décrit chaque modification en une phrase d'OP, en texte brut.
 * `creation` marque la création de la tâche, qui n'a ni commentaire ni modification.
 * `author` vaut `null` si OP ne donne pas son nom au jeton.
 */
export const taskActivitySchema = z.object({
  id: z.number().int(),
  author: opNamedRefSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  creation: z.boolean(),
  comment: z.string().nullable(),
  changes: z.array(z.string()),
})

export type TaskActivity = z.infer<typeof taskActivitySchema>

/** Réponse de `GET /api/tasks/:id/activities` : l'historique de la tâche, du plus ancien au plus récent. */
export const taskActivitiesResponseSchema = z.object({
  activities: z.array(taskActivitySchema),
})

export type TaskActivitiesResponse = z.infer<typeof taskActivitiesResponseSchema>

/** Plus long commentaire accepté, en caractères. */
export const TASK_COMMENT_MAX_LENGTH = 100_000

/** Corps de `POST /api/tasks/:id/activities` : un commentaire en markdown, non vide. */
export const taskCommentSchema = z.strictObject({
  comment: z.string().trim().min(1).max(TASK_COMMENT_MAX_LENGTH),
})

export type TaskComment = z.infer<typeof taskCommentSchema>

/** Réponse de `POST /api/tasks/:id/activities` : le commentaire tel qu'OP l'a enregistré. */
export const taskActivityResponseSchema = z.object({
  activity: taskActivitySchema,
})

export type TaskActivityResponse = z.infer<typeof taskActivityResponseSchema>
