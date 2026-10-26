import type { OpNamedRef, TaskActivitiesResponse, TaskDetail, TaskDetailResponse, TaskNode, TaskRef, TaskRejectedResponse, TaskStatus, TaskTreeResponse } from '@openpatatoes/shared'
import type { QueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { forEachTask, taskActivitiesResponseSchema, taskActivityResponseSchema, taskAllowedValuesResponseSchema, taskAssigneesResponseSchema, taskDetailResponseSchema, taskRejectedResponseSchema, taskTreeResponseSchema } from '@openpatatoes/shared'
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/vue-query'
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

function taskAllowedValuesQueryKey(taskId: number) {
  return [
    ...taskDetailQueryKey(taskId),
    'allowed-values',
  ]
}

/**
 * États, types et priorités qu'OP accepte pour la tâche. La liste n'est lue qu'à la demande,
 * et relue à chaque ouverture : les transitions d'état changent avec l'état et le type.
 */
export function useTaskAllowedValuesQuery(taskId: MaybeRefOrGetter<number>, enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: computed(() => taskAllowedValuesQueryKey(toValue(taskId))),
    queryFn: ({ signal }) => apiFetch(`/tasks/${toValue(taskId)}/allowed-values`, { schema: taskAllowedValuesResponseSchema, signal }),
    enabled: () => toValue(enabled),
  })
}

function taskActivitiesQueryKey(taskId: number) {
  return [
    ...taskDetailQueryKey(taskId),
    'activities',
  ]
}

/** Historique d'une tâche, du plus ancien au plus récent. La liste n'est lue qu'à la demande. */
export function useTaskActivitiesQuery(taskId: MaybeRefOrGetter<number>, enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: computed(() => taskActivitiesQueryKey(toValue(taskId))),
    queryFn: ({ signal }) => apiFetch(`/tasks/${toValue(taskId)}/activities`, { schema: taskActivitiesResponseSchema, signal }),
    select: data => data.activities,
    enabled: () => toValue(enabled),
  })
}

export interface TaskCommentVariables {
  taskId: number
  /** Commentaire en markdown. */
  comment: string
}

/** Ajoute un commentaire markdown à une tâche ; une fois enregistré par OP, il s'ajoute à la fin de l'historique. */
export function useTaskCommentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, comment }: TaskCommentVariables) =>
      apiFetch(`/tasks/${taskId}/activities`, {
        method: 'POST',
        body: { comment },
        schema: taskActivityResponseSchema,
      }),
    onSuccess: ({ activity }, { taskId }) => {
      queryClient.setQueryData<TaskActivitiesResponse>(
        taskActivitiesQueryKey(taskId),
        data => data && {
          activities: [
            ...data.activities,
            activity,
          ],
        },
      )
    },
  })
}

/**
 * Modification d'une tâche, telle que l'interface l'affiche. Un champ absent reste inchangé,
 * `null` le vide. Les ressources sont complètes : leur nom s'affiche avant la réponse d'OP.
 */
export interface TaskEdit {
  estimatedHours?: number | null
  remainingHours?: number | null
  assignee?: OpNamedRef | null
  status?: TaskStatus
  type?: OpNamedRef
  priority?: OpNamedRef
  parent?: TaskRef | null
  /** Markdown ; une chaîne vide efface la description. */
  description?: string
}

export interface TaskEditVariables {
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

/** Modifications d'une tâche encore en route vers OP, dans l'ordre où elles ont été lancées. */
function pendingEdits(queryClient: QueryClient, taskId: number): TaskEditVariables[] {
  return queryClient.getMutationCache()
    .findAll({ mutationKey: taskEditMutationKey, status: 'pending' })
    .map(mutation => mutation.state.variables as TaskEditVariables)
    .filter(variables => variables.taskId === taskId)
}

/**
 * Enregistre la tâche dans le cache du détail, et son état, son assigné et sa place dans l'arbre du projet.
 * Les modifications encore en route vers OP restent affichées par-dessus, sauf `settled`,
 * celle qui vient d'obtenir sa réponse.
 */
function showTask(queryClient: QueryClient, { projectId, taskId }: TaskEditVariables, base: TaskDetail, settled?: TaskEditVariables) {
  const task = pendingEdits(queryClient, taskId)
    .filter(variables => variables !== settled)
    .reduce((shown, variables) => applyEdit(shown, variables.edit), base)
  queryClient.setQueryData<TaskDetailResponse>(taskDetailQueryKey(taskId), { task })
  queryClient.setQueryData<TaskTreeResponse>(
    taskTreeQueryKey(projectId),
    tree => tree && {
      tasks: withTreeFields(withParent(tree.tasks, taskId, task.parent?.id ?? null), taskId, task),
    },
  )
}

/** Ce que l'arbre affiche d'une tâche, en plus de son titre. */
type TreeFields = Pick<TaskNode, 'status' | 'assignee'>

/** L'arbre avec l'état et l'assigné d'une tâche remplacés. Seules les tâches du chemin sont copiées. */
export function withTreeFields(roots: TaskNode[], taskId: number, { status, assignee }: TreeFields): TaskNode[] {
  const path = taskPath(roots, taskId)
  const task = path?.at(-1)
  if (!path || !task)
    return roots
  if (task.status.id === status.id && (task.assignee?.id ?? null) === (assignee?.id ?? null))
    return roots
  const updated = { ...task, status, assignee }
  return withChildren(roots, path.slice(0, -1), children => children.map(child => child === task
    ? updated
    : child))
}

/**
 * L'arbre avec la tâche déplacée sous `parentId`, parmi ses frères rangés par identifiant
 * comme dans la liste d'OP. Un parent absent de l'arbre (autre projet, invisible avec le jeton)
 * en fait une racine, comme côté serveur. Un parent pris dans la tâche elle-même créerait
 * un cycle : l'arbre reste tel quel. Seules les tâches des deux chemins sont copiées.
 */
export function withParent(roots: TaskNode[], taskId: number, parentId: number | null): TaskNode[] {
  const path = taskPath(roots, taskId)
  const task = path?.at(-1)
  if (!path || !task)
    return roots
  const parentPath = parentId === null
    ? null
    : taskPath(roots, parentId)
  if ((parentPath?.at(-1)?.id ?? null) === (path.at(-2)?.id ?? null) || parentPath?.includes(task))
    return roots
  const detached = withChildren(roots, path.slice(0, -1), children => children.filter(child => child !== task))
  const newParentPath = parentPath
    ? taskPath(detached, parentPath.at(-1)!.id)!
    : []
  return withChildren(detached, newParentPath, (children) => {
    const index = children.findIndex(child => child.id > task.id)
    return children.toSpliced(index === -1
      ? children.length
      : index, 0, task)
  })
}

/**
 * L'arbre avec les enfants de la dernière tâche de `path` remplacés ; `path` vide : les racines.
 * `path` part d'une racine. Seules les tâches du chemin sont copiées.
 */
function withChildren(roots: TaskNode[], path: TaskNode[], update: (children: TaskNode[]) => TaskNode[]): TaskNode[] {
  let children = update(path.at(-1)?.children ?? roots)
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const node = { ...path[depth]!, children }
    const siblings = path[depth - 1]?.children ?? roots
    children = siblings.map(sibling => sibling === path[depth]
      ? node
      : sibling)
  }
  return children
}

/** Le refus d'OP ou de l'app, avec son message et l'état réel de la tâche ; `null` pour toute autre erreur. */
export function taskRejection(error: Error): TaskRejectedResponse | null {
  if (!(error instanceof ApiError) || !taskRejectedResponseSchema.shape.error.safeParse(error.code).success)
    return null
  const parsed = taskRejectedResponseSchema.safeParse(error.body)
  return parsed.success
    ? parsed.data
    : null
}

/** Champs d'une tâche dont la modification attend la réponse d'OP. */
export function usePendingTaskFields(taskId: MaybeRefOrGetter<number>) {
  const pending = useMutationState({
    filters: { mutationKey: taskEditMutationKey, status: 'pending' },
    select: mutation => mutation.state.variables as TaskEditVariables,
  })
  return computed(() => new Set(pending.value
    .filter(variables => variables.taskId === toValue(taskId))
    .flatMap(variables => Object.keys(variables.edit))))
}

/**
 * Modifie le temps estimé, le temps restant, l'assigné, l'état, le type, la priorité, le parent ou la description d'une tâche. La modification
 * s'affiche tout de suite ; si OP la refuse, l'affichage revient à l'état réel.
 * Les modifications partent l'une après l'autre, toutes tâches confondues : chacune envoie
 * la version de la tâche que la précédente a obtenue d'OP.
 *
 * `onFailure` est appelé pour chaque modification qui échoue, même si d'autres ont été
 * lancées depuis : l'état de `useMutation` ne suit que la dernière.
 */
export function useTaskEditMutation({ onFailure }: { onFailure?: (error: Error, variables: TaskEditVariables) => void } = {}) {
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
      const { assignee, status, type, priority, parent, ...fields } = edit
      return apiFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          lockVersion: task.lockVersion,
          ...fields,
          ...(assignee !== undefined && { assigneeId: assignee?.id ?? null }),
          ...(status && { statusId: status.id }),
          ...(type && { typeId: type.id }),
          ...(priority && { priorityId: priority.id }),
          ...(parent !== undefined && { parentId: parent?.id ?? null }),
        },
        schema: taskDetailResponseSchema,
      })
    },
    onMutate: async (variables) => {
      // Une lecture en cours effacerait l'affichage optimiste en arrivant.
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: taskDetailQueryKey(variables.taskId),
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: taskTreeQueryKey(variables.projectId),
          exact: true,
        }),
      ])
      const current = cachedTask(variables.taskId)
      if (current)
        showTask(queryClient, variables, applyEdit(current, variables.edit))
    },
    onSuccess: ({ task }, variables) => showTask(queryClient, variables, task, variables),
    // L'état et le type décident des transitions permises : la liste est à relire, sans retenir la modification suivante.
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: taskAllowedValuesQueryKey(variables.taskId),
        exact: true,
      })
    },
    onError: async (error, variables) => {
      try {
        // Sans l'état réel joint au refus, on le relit : le cache mêle des valeurs jamais enregistrées.
        const real = taskRejection(error)?.task
          ?? (await apiFetch(`/tasks/${variables.taskId}`, { schema: taskDetailResponseSchema })).task
        showTask(queryClient, variables, real, variables)
      }
      catch {
        await queryClient.invalidateQueries({
          queryKey: taskDetailQueryKey(variables.taskId),
          exact: true,
        })
      }
      onFailure?.(error, variables)
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
