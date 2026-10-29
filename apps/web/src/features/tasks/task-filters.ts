import type { OpNamedRef, TaskNode } from '@openpatatoes/shared'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { forEachTask } from '@openpatatoes/shared'

/** Statut à garder : un statut d'OP, ou tous les statuts ouverts ou fermés. */
export type StatusCriterion = number | 'open' | 'closed'

/** Assigné à garder : un utilisateur d'OP, l'utilisateur du jeton (`me`), ou aucun (`none`). */
export type AssigneeCriterion = number | 'me' | 'none'

/**
 * Critères de l'arbre d'un projet. Les valeurs d'un même critère se combinent en OU,
 * les critères entre eux en ET. Un critère vide ne filtre rien.
 */
export interface TaskCriteria {
  search: string
  statuses: StatusCriterion[]
  types: number[]
  assignees: AssigneeCriterion[]
  /** Tâches dont on garde la descendance, à tous les niveaux. */
  parents: number[]
}

export const NO_CRITERIA: TaskCriteria = {
  search: '',
  statuses: [],
  types: [],
  assignees: [],
  parents: [],
}

export function hasCriteria(criteria: TaskCriteria): boolean {
  return criteria.search.trim() !== ''
    || criteria.statuses.length > 0
    || criteria.types.length > 0
    || criteria.assignees.length > 0
    || criteria.parents.length > 0
}

/** Texte comparable sans casse ni accents : « État » et « etat » se valent. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr')
}

/**
 * Recherche d'une tâche par identifiant ou par titre. Un nombre, avec ou sans `#`, trouve
 * l'identifiant exact ; le texte est aussi cherché dans le titre, sans casse ni accents.
 * `null` pour une recherche vide, qui garde tout.
 */
export function taskSearch(search: string): ((task: Pick<TaskNode, 'id' | 'subject'>) => boolean) | null {
  const text = search.trim()
  if (!text)
    return null
  const id = /^#?(\d+)$/.exec(text)?.[1]
  const wantedId = id === undefined
    ? null
    : Number(id)
  const folded = foldText(text)
  return task => task.id === wantedId || foldText(task.subject).includes(folded)
}

/** Arbre réduit aux tâches qui correspondent aux critères, et aux ancêtres qui y mènent. */
export interface FilteredTaskTree {
  tasks: TaskNode[]
  /** Tâches qui correspondent ; les autres tâches de l'arbre sont des ancêtres, affichés pour le contexte. */
  matchIds: Set<number>
}

/**
 * Réduit l'arbre aux tâches qui correspondent aux critères, avec leurs ancêtres.
 * Une tâche gardée ne garde que les enfants qui correspondent ou qui y mènent.
 * `currentUserId` est l'utilisateur OP du jeton, pour le critère « Moi ».
 * Le parcours est itératif : une hiérarchie profonde ne fait pas déborder la pile.
 * Seules les tâches dont les enfants changent sont copiées.
 */
export function filterTaskTree(roots: TaskNode[], criteria: TaskCriteria, currentUserId: number | null): FilteredTaskTree {
  const search = taskSearch(criteria.search)
  const statuses = new Set(criteria.statuses)
  const types = new Set(criteria.types)
  const assignees = new Set(criteria.assignees)
  const parents = new Set(criteria.parents)

  const matchesStatus = ({ status }: TaskNode) => statuses.size === 0
    || statuses.has(status.id)
    || statuses.has(status.isClosed
      ? 'closed'
      : 'open')
  const matchesAssignee = ({ assignee }: TaskNode) => assignees.size === 0
    || (assignee === null
      ? assignees.has('none')
      : assignees.has(assignee.id) || (assignee.id === currentUserId && assignees.has('me')))
  const matches = (task: TaskNode, underParent: boolean) => (parents.size === 0 || underParent)
    && matchesStatus(task)
    && (types.size === 0 || types.has(task.type.id))
    && matchesAssignee(task)
    && (search === null || search(task))

  // Ordre préfixe : chaque tâche avant ses enfants. On le remonte à l'envers pour décider des parents après leurs enfants.
  const order: TaskNode[] = []
  const matchIds = new Set<number>()
  const stack = roots.map(task => ({ task, underParent: false }))
  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    const { task, underParent } = entry
    order.push(task)
    if (matches(task, underParent))
      matchIds.add(task.id)
    const childrenUnderParent = underParent || parents.has(task.id)
    for (const child of task.children)
      stack.push({ task: child, underParent: childrenUnderParent })
  }

  const kept = new Map<TaskNode, TaskNode>()
  const keep = (tasks: TaskNode[]) => tasks.flatMap(task => kept.get(task) ?? [])
  for (let index = order.length - 1; index >= 0; index--) {
    const task = order[index]!
    const children = keep(task.children)
    if (children.length === 0 && !matchIds.has(task.id))
      continue
    kept.set(task, children.length === task.children.length
      ? task
      : { ...task, children })
  }
  return {
    tasks: keep(roots),
    matchIds,
  }
}

/** Tâches de l'arbre filtré qui ont des enfants : celles à déplier pour montrer chaque résultat. */
export function taskIdsWithChildren(roots: TaskNode[]): number[] {
  const ids: number[] = []
  forEachTask(roots, (task) => {
    if (task.children.length > 0)
      ids.push(task.id)
  })
  return ids
}

/** Valeur proposée par un filtre, avec son nombre de tâches dans le projet s'il a un sens. */
export interface CriterionOption<T> {
  value: T
  name: string
  count?: number
}

/** Valeurs que les filtres proposent : celles présentes dans les tâches du projet. */
export interface CriteriaOptions {
  statuses: CriterionOption<StatusCriterion>[]
  types: CriterionOption<number>[]
  assignees: CriterionOption<AssigneeCriterion>[]
  /** Tâches qui ont des sous-tâches, par identifiant, sans nombre de tâches. */
  parents: CriterionOption<number>[]
}

/** Ressources d'OP trouvées dans l'arbre, avec leur nombre de tâches. */
type CountedRefs = Map<number, { ref: OpNamedRef, count: number }>

function counted(refs: CountedRefs): CriterionOption<number>[] {
  return [
    ...refs.values(),
  ]
    .map(({ ref, count }) => ({ value: ref.id, name: ref.name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function addTo(refs: CountedRefs, ref: OpNamedRef) {
  const entry = refs.get(ref.id)
  if (entry)
    entry.count++
  else
    refs.set(ref.id, { ref, count: 1 })
}

/**
 * Valeurs des filtres, tirées des tâches du projet. Les statuts commencent par « Tous les ouverts »
 * et « Tous les fermés », l'assigné par « Moi » et « Non assigné ».
 */
export function criteriaOptions(roots: TaskNode[], currentUserId: number | null): CriteriaOptions {
  const statuses: CountedRefs = new Map()
  const types: CountedRefs = new Map()
  const assignees: CountedRefs = new Map()
  const parents: CriterionOption<number>[] = []
  let open = 0
  let closed = 0
  let mine = 0
  let unassigned = 0
  forEachTask(roots, (task) => {
    addTo(statuses, task.status)
    addTo(types, task.type)
    if (task.status.isClosed)
      closed++
    else
      open++
    if (task.assignee) {
      addTo(assignees, task.assignee)
      if (task.assignee.id === currentUserId)
        mine++
    }
    else {
      unassigned++
    }
    if (task.children.length > 0)
      parents.push({ value: task.id, name: task.subject })
  })
  return {
    statuses: [
      { value: 'open', name: 'Tous les ouverts', count: open },
      { value: 'closed', name: 'Tous les fermés', count: closed },
      ...counted(statuses),
    ],
    types: counted(types),
    assignees: [
      { value: 'me', name: 'Moi', count: mine },
      { value: 'none', name: 'Non assigné', count: unassigned },
      ...counted(assignees),
    ],
    parents: parents.sort((a, b) => a.value - b.value),
  }
}

/** Paramètres d'adresse des critères. */
const QUERY_KEYS = {
  search: 'q',
  statuses: 'status',
  types: 'type',
  assignees: 'assignee',
  parents: 'parent',
} as const

/** Identifiant OP dans l'adresse : au plus 15 chiffres, comme dans les routes. */
const ID = /^[1-9]\d{0,14}$/

function queryValues(query: LocationQuery, key: string): string[] {
  const raw = query[key]
  const values = Array.isArray(raw)
    ? raw
    : [raw]
  return [
    ...new Set(values.flatMap(value => value?.split(',') ?? [])),
  ]
}

function idsOrKeywords<K extends string>(values: string[], keywords: readonly K[]): (number | K)[] {
  return values.flatMap((value): (number | K)[] => {
    if (ID.test(value)) {
      return [
        Number(value),
      ]
    }
    return (keywords as readonly string[]).includes(value)
      ? [value as K]
      : []
  })
}

/** Critères lus dans l'adresse. Une valeur inconnue ou invalide est ignorée. */
export function criteriaFromQuery(query: LocationQuery): TaskCriteria {
  const search = query[QUERY_KEYS.search]
  return {
    search: typeof search === 'string'
      ? search
      : '',
    statuses: idsOrKeywords(queryValues(query, QUERY_KEYS.statuses), ['open', 'closed'] as const),
    types: idsOrKeywords(queryValues(query, QUERY_KEYS.types), [] as const),
    assignees: idsOrKeywords(queryValues(query, QUERY_KEYS.assignees), ['me', 'none'] as const),
    parents: idsOrKeywords(queryValues(query, QUERY_KEYS.parents), [] as const),
  }
}

/**
 * L'adresse avec les critères donnés. Les autres paramètres sont gardés ;
 * un critère vide n'apparaît pas.
 */
export function queryWithCriteria(query: LocationQuery, criteria: TaskCriteria): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query }
  for (const key of Object.values(QUERY_KEYS))
    delete next[key]
  if (criteria.search.trim())
    next[QUERY_KEYS.search] = criteria.search
  for (const key of [
    'statuses',
    'types',
    'assignees',
    'parents',
  ] as const) {
    if (criteria[key].length > 0)
      next[QUERY_KEYS[key]] = criteria[key].join(',')
  }
  return next
}

/**
 * Critères réduits aux valeurs que les filtres proposent : un identifiant bien formé mais absent
 * du projet (lien ancien, tâche supprimée) est ignoré, comme une valeur invalide.
 */
export function knownCriteria(criteria: TaskCriteria, options: CriteriaOptions): TaskCriteria {
  const known = <T>(values: T[], offered: CriterionOption<T>[]) =>
    values.filter(value => offered.some(option => option.value === value))
  return {
    search: criteria.search,
    statuses: known(criteria.statuses, options.statuses),
    types: known(criteria.types, options.types),
    assignees: known(criteria.assignees, options.assignees),
    parents: known(criteria.parents, options.parents),
  }
}
