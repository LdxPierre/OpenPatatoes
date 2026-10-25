import type { OpNamedRef, TaskDetail, TaskDetailResponse, TaskNode, TaskRejectedResponse, TaskTreeResponse } from '@openpatatoes/shared'
import type { QueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { forEachTask, taskAssigneesResponseSchema, taskDetailResponseSchema, taskRejectedResponseSchema, taskTreeResponseSchema } from '@openpatatoes/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { projectsQueryKey } from '@/features/projects/projects'
import { ApiError, apiFetch } from '@/shared/api/api-fetch'

function taskTreeQueryKey(projectId: number) {
  return [
    ...projectsQueryKey,
    projectId,
    'tasks',
  ]
}

function taskDetailQueryKey(taskId: number) {
  return [
    'tasks',
    taskId,
  ]
}

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

/** Détail d'une tâche, lu dans OP. */
export function useTaskDetailQuery(taskId: MaybeRefOrGetter<number>) {
  return useQuery({
    queryKey: computed(() => taskDetailQueryKey(toValue(taskId))),
    queryFn: ({ signal }) => apiFetch(`/tasks/${toValue(taskId)}`, { schema: taskDetailResponseSchema, signal }),
    select: data => data.task,
  })
}

/** Utilisateurs à qui la tâche peut être assignée. La liste n'est lue qu'à la demande. */
export function useTaskAssigneesQuery(taskId: MaybeRefOrGetter<number>, enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: computed(() => [
      ...taskDetailQueryKey(toValue(taskId)),
      'assignees',
    ]),
    queryFn: ({ signal }) => apiFetch(`/tasks/${toValue(taskId)}/assignees`, { schema: taskAssigneesResponseSchema, signal }),
    select: data => data.assignees,
    enabled: () => toValue(enabled),
    // Les membres d'un projet changent rarement : la liste sert pour plusieurs modifications.
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Modification d'une tâche, telle que l'interface l'affiche. Un champ absent reste inchangé,
 * `null` le vide. L'assigné est complet : son nom s'affiche avant la réponse d'OP.
 */
export interface TaskEdit {
  estimatedHours?: number | null
  remainingHours?: number | null
  assignee?: OpNamedRef | null
}

interface TaskEditVariables {
  projectId: number
  taskId: number
  edit: TaskEdit
}

const taskEditMutationKey = ['tasks', 'edit']

function applyEdit(task: TaskDetail, edit: TaskEdit): TaskDetail {
  const changed = Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined))
  return {
    ...task,
    ...changed,
  }
}

/**
 * Enregistre la tâche dans le cache du détail, et son assigné dans l'arbre du projet.
 * Les modifications encore en route vers OP restent affichées par-dessus.
 */
function showTask(queryClient: QueryClient, { projectId, taskId }: TaskEditVariables, base: TaskDetail, settled?: TaskEditVariables) {
  const pending = queryClient.getMutationCache().findAll({
    mutationKey: taskEditMutationKey,
    status: 'pending',
    predicate: mutation => mutation.state.variables !== settled
      && (mutation.state.variables as TaskEditVariables | undefined)?.taskId === taskId,
  })
  const task = pending.reduce((shown, mutation) => applyEdit(shown, (mutation.state.variables as TaskEditVariables).edit), base)
  queryClient.setQueryData<TaskDetailResponse>(taskDetailQueryKey(taskId), { task })
  queryClient.setQueryData<TaskTreeResponse>(
    taskTreeQueryKey(projectId),
    tree => tree && {
      tasks: withAssignee(tree.tasks, taskId, task.assignee),
    },
  )
}

/** L'arbre avec l'assigné d'une tâche remplacé. Seules les tâches du chemin sont copiées. */
export function withAssignee(roots: TaskNode[], taskId: number, assignee: OpNamedRef | null): TaskNode[] {
  const path = taskPath(roots, taskId)
  const task = path?.at(-1)
  if (!path || !task || (task.assignee?.id ?? null) === (assignee?.id ?? null))
    return roots
  let node: TaskNode = { ...task, assignee }
  for (const parent of path.slice(0, -1).reverse()) {
    const child = node
    node = {
      ...parent,
      children: parent.children.map(sibling => sibling.id === child.id
        ? child
        : sibling),
    }
  }
  const root = node
  return roots.map(task => task.id === root.id
    ? root
    : task)
}

/** Le refus d'OP, avec son message et l'état réel de la tâche ; `null` pour toute autre erreur. */
export function taskRejection(error: Error): TaskRejectedResponse | null {
  if (!(error instanceof ApiError) || error.code !== 'op_rejected')
    return null
  const parsed = taskRejectedResponseSchema.safeParse(error.body)
  return parsed.success
    ? parsed.data
    : null
}

/**
 * Modifie le temps estimé, le temps restant ou l'assigné d'une tâche. La modification
 * s'affiche tout de suite ; si OP la refuse, l'affichage revient à l'état réel.
 * Les modifications partent l'une après l'autre : chacune envoie la version de la tâche
 * que la précédente a obtenue d'OP.
 */
export function useTaskEditMutation() {
  const queryClient = useQueryClient()

  function cachedTask(taskId: number) {
    return queryClient.getQueryData<TaskDetailResponse>(taskDetailQueryKey(taskId))?.task
  }

  return useMutation({
    mutationKey: taskEditMutationKey,
    scope: { id: 'task-edit' },
    mutationFn: ({ taskId, edit }: TaskEditVariables) => {
      const task = cachedTask(taskId)
      if (!task)
        throw new Error(`Tâche ${taskId} absente du cache`)
      const { assignee, ...hours } = edit
      return apiFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          lockVersion: task.lockVersion,
          ...hours,
          ...(assignee === undefined
            ? {}
            : { assigneeId: assignee?.id ?? null }),
        },
        schema: taskDetailResponseSchema,
      })
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: taskDetailQueryKey(variables.taskId),
        exact: true,
      })
      const previous = cachedTask(variables.taskId)
      if (previous)
        showTask(queryClient, variables, applyEdit(previous, variables.edit))
      return { previous }
    },
    onSuccess: ({ task }, variables) => showTask(queryClient, variables, task, variables),
    onError: (error, variables, context) => {
      const real = taskRejection(error)?.task
      const current = cachedTask(variables.taskId)
      if (real) {
        showTask(queryClient, variables, real, variables)
      }
      else if (context?.previous && current) {
        // Sans état réel, chaque champ modifié reprend sa valeur d'avant.
        const restored = Object.fromEntries(Object.keys(variables.edit).map(field => [field, context.previous![field as keyof TaskEdit]]))
        showTask(queryClient, variables, {
          ...current,
          ...restored,
        }, variables)
      }
    },
  })
}

/** Ce que l'arbre du projet sait déjà d'une tâche : de quoi afficher l'en-tête du détail avant la réponse d'OP. */
export type TaskPreview = Pick<TaskDetail, 'id' | 'subject' | 'status' | 'assignee' | 'parent'> & {
  children: TaskNode[]
}

export function taskPreview(roots: TaskNode[], id: number): TaskPreview | null {
  const path = taskPath(roots, id)
  if (!path)
    return null
  const task = path.at(-1)!
  const parent = path.at(-2)
  return {
    id: task.id,
    subject: task.subject,
    status: task.status,
    assignee: task.assignee,
    parent: parent
      ? { id: parent.id, subject: parent.subject }
      : null,
    children: task.children,
  }
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
