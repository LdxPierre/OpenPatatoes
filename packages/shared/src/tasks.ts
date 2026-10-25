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
 */
export const taskDetailSchema = taskRefSchema.extend({
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

/** Réponse de `GET /api/tasks/:id`. */
export const taskDetailResponseSchema = z.object({
  task: taskDetailSchema,
})

export type TaskDetailResponse = z.infer<typeof taskDetailResponseSchema>

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
