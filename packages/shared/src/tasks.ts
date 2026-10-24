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

export const taskNodeSchema: z.ZodType<TaskNode> = z.object({
  id: z.number().int(),
  subject: z.string(),
  status: opNamedRefSchema.extend({
    isClosed: z.boolean(),
  }),
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
