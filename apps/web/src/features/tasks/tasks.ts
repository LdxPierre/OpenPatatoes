import type { TaskDetailResponse, TaskNode, TaskTreeResponse } from '@openpatatoes/shared'
import type { MaybeRefOrGetter } from 'vue'
import { forEachTask, taskDetailResponseSchema, taskTreeResponseSchema } from '@openpatatoes/shared'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { projectsQueryKey } from '@/features/projects/projects'
import { apiFetch } from '@/shared/api/api-fetch'

/**
 * Arbre des tâches d'un projet, en une seule requête. Les données ne sont pas rendues
 * réactives en profondeur : un projet peut compter des milliers de tâches.
 */
export function useTaskTreeQuery(projectId: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: computed(() => taskTreeQueryKey(toValue(projectId))),
    queryFn: ({ signal }) => apiFetch(`/projects/${toValue(projectId)}/tasks`, { schema: taskTreeResponseSchema, signal }),
    select: data => data.tasks,
    shallow: true,
  })
}

function taskTreeQueryKey(projectId: number) {
  return [
    ...projectsQueryKey,
    projectId,
    'tasks',
  ] as const
}

/**
 * Détail d'une tâche. Ouverte depuis l'arbre du projet, son titre et son parent
 * s'affichent tout de suite ; les heures attendent la réponse d'OP.
 */
export function useTaskDetailQuery(projectId: MaybeRefOrGetter<number>, taskId: MaybeRefOrGetter<number>) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: computed(() => [
      'tasks',
      toValue(taskId),
    ]),
    queryFn: ({ signal }) => apiFetch(`/tasks/${toValue(taskId)}`, { schema: taskDetailResponseSchema, signal }),
    placeholderData: (): TaskDetailResponse | undefined => {
      const roots = queryClient.getQueryData<TaskTreeResponse>(taskTreeQueryKey(toValue(projectId)))?.tasks
      const path = roots && taskPath(roots, toValue(taskId))
      if (!path)
        return undefined
      const task = path.at(-1)!
      const parent = path.at(-2)
      return {
        task: {
          id: task.id,
          subject: task.subject,
          estimatedHours: null,
          remainingHours: null,
          parent: parent
            ? { id: parent.id, subject: parent.subject }
            : null,
        },
      }
    },
    select: data => data.task,
  })
}

/** Heures décimales, arrondies au centième pour l'affichage : « 12,5 h ». */
export function formatHours(hours: number) {
  return `${hours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}\u202Fh`
}

/**
 * Chemin de la racine jusqu'à la tâche, la tâche comprise ; `null` si elle n'est pas dans l'arbre.
 * Le parcours est itératif, comme la construction de l'arbre côté serveur.
 */
export function taskPath(roots: TaskNode[], id: number): TaskNode[] | null {
  const stack = roots.map(task => [task])
  for (let path = stack.pop(); path; path = stack.pop()) {
    const task = path.at(-1)!
    if (task.id === id)
      return path
    for (const child of task.children)
      stack.push([...path, child])
  }
  return null
}

/** Ligne visible de l'arbre, à plat pour la virtualisation. */
export interface TaskRow {
  task: TaskNode
  /** 0 pour une tâche de premier niveau. */
  depth: number
  /**
   * Un booléen par niveau de retrait : le trait de racine de ce niveau continue-t-il
   * sous la ligne ? Le dernier concerne la ligne elle-même (coude, avec ou sans suite).
   * Chaque ligne dessine ses traits seule : rien ne casse quand la liste est recyclée.
   */
  guides: boolean[]
  /** Index de la ligne parente, -1 pour une tâche de premier niveau. */
  parentIndex: number
  /** Position parmi les frères, à partir de 1. */
  position: number
  siblingCount: number
  hasChildren: boolean
  expanded: boolean
}

interface Level {
  siblings: TaskNode[]
  next: number
  depth: number
  guides: boolean[]
  parentIndex: number
}

/**
 * Lignes visibles : les racines, et les enfants des nœuds dépliés, dans l'ordre de l'arbre.
 * Le parcours est itératif, comme la construction de l'arbre côté serveur.
 */
export function visibleTaskRows(roots: TaskNode[], expanded: ReadonlySet<number>): TaskRow[] {
  const rows: TaskRow[] = []
  const stack: Level[] = [
    {
      siblings: roots,
      next: 0,
      depth: 0,
      guides: [],
      parentIndex: -1,
    },
  ]
  while (stack.length > 0) {
    const level = stack.at(-1)!
    if (level.next >= level.siblings.length) {
      stack.pop()
      continue
    }
    const position = level.next++
    const task = level.siblings[position]!
    const isLast = position === level.siblings.length - 1
    const guides = level.depth === 0
      ? []
      : [...level.guides, !isLast]
    const hasChildren = task.children.length > 0
    const isExpanded = hasChildren && expanded.has(task.id)
    rows.push({
      task,
      depth: level.depth,
      guides,
      parentIndex: level.parentIndex,
      position: position + 1,
      siblingCount: level.siblings.length,
      hasChildren,
      expanded: isExpanded,
    })
    if (isExpanded) {
      stack.push({
        siblings: task.children,
        next: 0,
        depth: level.depth + 1,
        guides,
        parentIndex: rows.length - 1,
      })
    }
  }
  return rows
}

/** Nombre total de tâches, à tous les niveaux. */
export function countTasks(roots: TaskNode[]) {
  let count = 0
  forEachTask(roots, () => count++)
  return count
}
