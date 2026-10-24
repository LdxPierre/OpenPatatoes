import { z } from 'zod'

/** Tâche dans l'arbre d'un projet : une ligne de la liste, avec ses sous-tâches. */
export interface TaskNode {
  id: number
  subject: string
  status: { id: number, name: string }
  assignee: { id: number, name: string } | null
  children: TaskNode[]
}

const refSchema = z.object({
  id: z.number().int(),
  name: z.string(),
})

export const taskNodeSchema: z.ZodType<TaskNode> = z.object({
  id: z.number().int(),
  subject: z.string(),
  status: refSchema,
  assignee: refSchema.nullable(),
  get children() {
    return z.array(taskNodeSchema)
  },
})

/** Réponse de `GET /api/projects/:id/tasks` : les racines de l'arbre, dans l'ordre d'OP. */
export const taskTreeResponseSchema = z.object({
  tasks: z.array(taskNodeSchema),
})

export type TaskTreeResponse = z.infer<typeof taskTreeResponseSchema>
