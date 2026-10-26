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
 * au moins un champ doit être modifié. L'état, le type et la priorité ne se vident pas :
 * OP les exige. `lockVersion` est celui de la tâche lue : OP refuse l'écriture si la tâche
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
  })
  .refine(
    ({ lockVersion: _, ...changes }) => Object.values(changes).some(value => value !== undefined),
    'aucun champ à modifier',
  )

export type TaskChanges = z.infer<typeof taskChangesSchema>

/**
 * Réponse 422 de `PATCH /api/tasks/:id` quand OP refuse la modification. `message` reprend
 * celui d'OP. `task` est l'état réel de la tâche, pour annuler l'affichage optimiste ;
 * il manque si la tâche n'a pas pu être relue. Le code `op_token_invalid` partage ce statut :
 * c'est `error` qui distingue les deux.
 */
export const taskRejectedResponseSchema = z.object({
  error: z.literal('op_rejected'),
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
