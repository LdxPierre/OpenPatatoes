<script setup lang="ts">
import type { TaskNode } from '@openpatatoes/shared'
import type { Range } from '@tanstack/vue-virtual'
import type { TaskRow } from './tasks'
import { defaultRangeExtractor, useWindowVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import StatusBadge from '@/shared/components/StatusBadge.vue'
import { taskIdsWithChildren } from './task-filters'
import { taskPath, visibleTaskRows } from './tasks'

/**
 * Arbre des tâches d'un projet. Seules les racines sont visibles au départ.
 * Les lignes sont virtualisées sur le défilement de la page : seules celles à l'écran existent.
 * Clavier : flèches haut et bas pour se déplacer, droite et gauche pour déplier et replier,
 * Espace pour basculer, Début et Fin pour aller aux extrémités. Entrée ou un clic ouvre le détail.
 * Filtré, l'arbre se déplie jusqu'à chaque résultat ; sans critère, il retrouve le dépliage d'avant.
 * Tout déplier ou tout replier agit sur l'arbre affiché, filtré ou non.
 */
const props = defineProps<{
  tasks: TaskNode[]
  label: string
  /** Tâche dont le détail est ouvert : elle est surlignée, et ses ancêtres dépliés. */
  selectedId?: number | null
  /**
   * Arbre filtré : les tâches qui correspondent aux critères. Les autres tâches de `tasks`
   * sont des ancêtres affichés pour le contexte, atténués. Absent sans critère.
   */
  matchIds?: Set<number> | null
}>()

const emit = defineEmits<{ open: [id: number] }>()

/** Dépliage choisi sans critère, retrouvé quand on efface les critères. */
const baseExpanded = reactive(new Set<number>())
/** Dépliage de l'arbre filtré : tout ce qui mène à un résultat. */
const filterExpanded = reactive(new Set<number>())
const expanded = computed(() => props.matchIds
  ? filterExpanded
  : baseExpanded)
const rows = computed(() => visibleTaskRows(props.tasks, expanded.value))

/** Tâches de l'arbre affiché qui ont des sous-tâches : celles qu'on peut déplier. */
const expandableIds = computed(() => taskIdsWithChildren(props.tasks))
const expandable = computed(() => expandableIds.value.length > 0)
const allExpanded = computed(() => expandableIds.value.every(id => expanded.value.has(id)))

/** Ligne active : la seule atteinte par Tab, et celle que l'on surligne. */
const activeId = ref<number | null>(null)
const activeIndex = computed(() => {
  const index = rows.value.findIndex(row => row.task.id === activeId.value)
  return Math.max(index, 0)
})

const list = useTemplateRef('list')
const scrollMargin = ref(0)
/** Hauteur d'une ligne (2rem), suivant la taille de texte choisie dans le navigateur. */
const rowHeight = ref(32)

const virtualizer = useWindowVirtualizer(computed(() => {
  const active = activeIndex.value
  return {
    count: rows.value.length,
    estimateSize: () => rowHeight.value,
    overscan: 12,
    scrollMargin: scrollMargin.value,
    getItemKey: (index: number) => rows.value[index]?.task.id ?? index,
    // La ligne active reste rendue hors de l'écran : Tab doit toujours pouvoir y revenir.
    rangeExtractor: (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      if (active < range.count && !indexes.includes(active)) {
        indexes.push(active)
        indexes.sort((a, b) => a - b)
      }
      return indexes
    },
  }
}))

const listMeasured = ref(false)

onMounted(() => {
  if (!list.value)
    return
  scrollMargin.value = list.value.getBoundingClientRect().top + window.scrollY
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  if (rootSize > 0)
    rowHeight.value = rootSize * 2
  listMeasured.value = true
  revealSelected()
})

/** La tâche ouverte devient visible et active, même ouverte depuis son adresse ou depuis un lien. */
async function revealSelected() {
  if (props.selectedId == null)
    return
  const path = taskPath(props.tasks, props.selectedId)
  if (!path)
    return
  for (const ancestor of path.slice(0, -1))
    expanded.value.add(ancestor.id)
  activeId.value = props.selectedId
  if (!listMeasured.value)
    return
  // Le virtualiseur prend en compte les lignes dépliées au rendu suivant.
  await nextTick()
  virtualizer.value.scrollToIndex(activeIndex.value, { align: 'auto' })
}

/** Parent de la tâche ouverte : quand elle change de parent, elle est de nouveau dévoilée. */
const selectedParentId = computed(() => props.selectedId == null
  ? null
  : taskPath(props.tasks, props.selectedId)?.at(-2)?.id ?? null)

function sameIds(a: Set<number>, b: Set<number>) {
  return a.size === b.size && [...a].every(id => b.has(id))
}

watch(() => props.matchIds, (matchIds, previous) => {
  if (matchIds) {
    // Des données relues sans changer les résultats gardent le repli choisi par l'utilisateur ;
    // un ancêtre nouveau (tâche déplacée) se déplie quand même.
    if (!previous || !sameIds(matchIds, previous))
      filterExpanded.clear()
    for (const id of taskIdsWithChildren(props.tasks))
      filterExpanded.add(id)
    return
  }
  if (!previous || activeId.value === null)
    return
  // Critères effacés : la tâche active reste visible dans le dépliage d'avant.
  for (const ancestor of taskPath(props.tasks, activeId.value)?.slice(0, -1) ?? [])
    baseExpanded.add(ancestor.id)
}, { immediate: true })

watch([
  () => props.selectedId,
  selectedParentId,
], revealSelected, { immediate: true })

const virtualRows = computed(() => virtualizer.value.getVirtualItems()
  .flatMap((item) => {
    const row = rows.value[item.index]
    return row
      ? [
          { row, index: item.index, top: item.start - scrollMargin.value },
        ]
      : []
  }))

function isDescendant(index: number, ancestorIndex: number) {
  for (let current = rows.value[index]?.parentIndex ?? -1; current >= 0; current = rows.value[current]!.parentIndex) {
    if (current === ancestorIndex)
      return true
  }
  return false
}

function setExpanded(index: number, open: boolean) {
  const row = rows.value[index]
  if (!row || !row.hasChildren || row.expanded === open)
    return
  if (open) {
    expanded.value.add(row.task.id)
    return
  }
  // Une ligne active cachée par le repli laisse la main à la tâche repliée.
  if (isDescendant(activeIndex.value, index))
    activeId.value = row.task.id
  expanded.value.delete(row.task.id)
}

async function focusRow(index: number) {
  const row = rows.value[index]
  if (!row)
    return
  activeId.value = row.task.id
  virtualizer.value.scrollToIndex(index, { align: 'auto' })
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent, index: number, row: TaskRow) {
  switch (event.key) {
    case 'ArrowDown':
      focusRow(index + 1)
      break
    case 'ArrowUp':
      focusRow(index - 1)
      break
    case 'Home':
      focusRow(0)
      break
    case 'End':
      focusRow(rows.value.length - 1)
      break
    case 'ArrowRight':
      if (row.expanded)
        focusRow(index + 1)
      else
        setExpanded(index, true)
      break
    case 'ArrowLeft':
      if (row.expanded)
        setExpanded(index, false)
      else
        focusRow(row.parentIndex)
      break
    case 'Enter':
      emit('open', row.task.id)
      break
    case ' ':
      if (!row.hasChildren)
        return
      setExpanded(index, !row.expanded)
      break
    default:
      return
  }
  event.preventDefault()
}

/** Remet le focus sur la ligne active, par exemple à la fermeture du détail. */
function focusActive() {
  focusRow(activeIndex.value)
}

/** Déplie tous les niveaux, ou replie tout. Une fois tout replié, la ligne active passe sur sa racine. */
function setAllExpanded(open: boolean) {
  if (open) {
    for (const id of expandableIds.value)
      expanded.value.add(id)
    return
  }
  const root = activeId.value === null
    ? undefined
    : taskPath(props.tasks, activeId.value)?.[0]
  if (root)
    activeId.value = root.id
  expanded.value.clear()
}

defineExpose({
  focusActive,
  expandable,
  allExpanded,
  setAllExpanded,
})

/** Titre complet au focus, seulement s'il est coupé. Au survol, l'attribut `title` suffit. */
const revealedId = ref<number | null>(null)

function onFocus(event: FocusEvent, row: TaskRow) {
  activeId.value = row.task.id
  const name = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.name')
  revealedId.value = name && name.scrollWidth > name.clientWidth
    ? row.task.id
    : null
}

function onBlur(row: TaskRow) {
  if (revealedId.value === row.task.id)
    revealedId.value = null
}

/** Clic sur le chevron : bascule le nœud, qui devient la ligne active. */
function toggleFromChevron(index: number, row: TaskRow) {
  setExpanded(index, !row.expanded)
  activeId.value = row.task.id
}

/** Trait d'un niveau : centré sous le chevron de l'ancêtre de ce niveau. */
function guideStyle(level: number) {
  return { left: `calc(${level} * var(--p-app-tree-indent) + var(--tree-guide-offset))` }
}
</script>

<template>
  <div class="task-tree">
    <div class="tree-row tree-head" aria-hidden="true">
      <span class="head-title">Tâche</span>
      <span>État</span>
      <span class="assignee">Assigné</span>
    </div>

    <div
      ref="list"
      class="tree-body"
      role="tree"
      :aria-label="label"
      :style="{ height: `${virtualizer.getTotalSize()}px` }"
    >
      <div
        v-for="{ row, index, top } in virtualRows"
        :key="row.task.id"
        class="tree-row task"
        :class="{ root: row.depth === 0, selected: row.task.id === selectedId, revealed: row.task.id === revealedId, context: matchIds && !matchIds.has(row.task.id) }"
        role="treeitem"
        :data-index="index"
        :tabindex="index === activeIndex ? 0 : -1"
        :aria-level="row.depth + 1"
        :aria-posinset="row.position"
        :aria-setsize="row.siblingCount"
        :aria-expanded="row.hasChildren ? row.expanded : undefined"
        :aria-selected="row.task.id === selectedId"
        :title="row.task.subject"
        :style="{ transform: `translateY(${top}px)` }"
        @keydown="onKeydown($event, index, row)"
        @focus="onFocus($event, row)"
        @blur="onBlur(row)"
        @click="activeId = row.task.id; emit('open', row.task.id)"
      >
        <span class="title">
          <span class="guides" :style="{ '--depth': row.depth }" aria-hidden="true">
            <template v-for="(continues, level) in row.guides" :key="level">
              <template v-if="level === row.depth - 1">
                <i class="elbow" :style="guideStyle(level)" />
                <i v-if="continues" class="tee" :style="guideStyle(level)" />
              </template>
              <i v-else-if="continues" class="rail" :style="guideStyle(level)" />
            </template>
          </span>
          <span
            class="toggle"
            aria-hidden="true"
            @click.stop="toggleFromChevron(index, row)"
          >
            <svg v-if="row.hasChildren" :class="{ open: row.expanded }" viewBox="0 0 10 10" width="10" height="10">
              <path d="M3.5 2 7 5 3.5 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="name">{{ row.task.subject }}</span>
          <span v-if="row.hasChildren && !row.expanded" class="children-count op-num">
            {{ row.task.children.length.toLocaleString('fr-FR') }}<span class="sr-only">{{ row.task.children.length === 1 ? ' sous-tâche' : ' sous-tâches' }}</span>
          </span>
        </span>
        <span class="status-cell">
          <StatusBadge :status="row.task.status" />
        </span>
        <span class="assignee">{{ row.task.assignee?.name }}</span>
        <span v-if="row.task.id === revealedId" class="full-title" aria-hidden="true">{{ row.task.subject }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Le survol et la sélection débordent de 8 px de chaque côté : le texte reste aligné sur le titre. */
.task-tree {
  /* Colonne du chevron ; les traits de racine se centrent dessous. */
  --tree-toggle-width: 18px;
  --tree-guide-offset: calc((var(--tree-toggle-width) - var(--p-app-tree-guide-width)) / 2);

  align-self: stretch;
  margin: 0 calc(-1 * var(--op-space-2));
}

.tree-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem minmax(6rem, 10rem);
  align-items: center;
  column-gap: var(--op-space-6);
  padding: 0 var(--op-space-2);
}

/* Seule une ligne fine sépare l'en-tête des lignes. L'en-tête reste visible en défilant. */
.tree-head {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 1.75rem;
  margin-bottom: var(--op-space-1);
  background: var(--p-app-background);
  box-shadow: inset 0 -1px var(--p-app-line);
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}

.head-title {
  padding-left: var(--tree-toggle-width);
}

.tree-body {
  position: relative;
}

.task {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  height: var(--p-app-tree-row-height);
  border-radius: var(--p-border-radius-md);
  font-size: var(--op-text-md);
  cursor: pointer;
}

.task:hover {
  background: var(--p-app-hover);
}

.task.selected {
  background: var(--p-highlight-background);
}

.task:focus-visible {
  outline-offset: -2px;
}

.task.revealed {
  z-index: 1;
}

/* Ancêtre d'un résultat, affiché pour le contexte : il ne correspond pas aux critères. */
.task.context .name,
.task.context .assignee,
.task.context .status-cell {
  opacity: 0.55;
}

.title {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
}

/* Traits de racine : un trait par ancêtre qui a encore des frères plus bas, et un coude vers la ligne. */
.guides {
  position: relative;
  flex: none;
  align-self: stretch;
  width: calc(var(--depth) * var(--p-app-tree-indent));
}

.guides i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--p-app-tree-guide-width);
  background: var(--p-app-tree-guide);
}

.guides .elbow {
  bottom: 50%;
  width: calc(var(--tree-toggle-width) / 2);
  box-sizing: border-box;
  background: none;
  border-left: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom-left-radius: var(--p-border-radius-md);
}

.guides .tee {
  top: 50%;
}

.toggle {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--tree-toggle-width);
  align-self: stretch;
  color: var(--p-text-muted-color);
}

.toggle svg {
  transition: transform var(--p-transition-duration) ease-out;
}

.toggle svg.open {
  transform: rotate(90deg);
}

.name,
.assignee {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.root .name {
  font-weight: 700;
}

.children-count {
  flex: none;
  margin-left: var(--op-space-2);
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}

.status-cell {
  display: flex;
  min-width: 0;
}

.full-title {
  position: absolute;
  top: calc(100% + var(--op-space-1));
  left: var(--op-space-2);
  max-width: min(60ch, calc(100% - 2 * var(--op-space-2)));
  padding: var(--op-space-1) var(--op-space-2);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
  box-shadow: var(--p-app-shadow-lift);
  font-size: var(--op-text-sm);
  line-height: 1.4;
  pointer-events: none;
}

/* Sur petit écran, le titre garde la place ; l'assigné disparaît. */
@media (max-width: 560px) {
  .tree-row {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--op-space-3);
  }

  .assignee {
    display: none;
  }
}
</style>
