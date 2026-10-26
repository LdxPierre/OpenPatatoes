<script setup lang="ts">
import type { TaskNode } from '@openpatatoes/shared'
import type { TaskEdit, TaskEditVariables } from './tasks'
import type { OpErrorMessages } from '@/shared/api/op-error'
import { onKeyStroke } from '@vueuse/core'
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import OpErrorAlert from '@/shared/components/OpErrorAlert.vue'
import StatusBadge from '@/shared/components/StatusBadge.vue'
import { Button } from '@/shared/components/ui/button'
import { dueHint, formatDay, formatFullDay, formatHours } from './format'
import TaskAllowedValuePicker from './TaskAllowedValuePicker.vue'
import TaskAssigneePicker from './TaskAssigneePicker.vue'
import TaskHoursField from './TaskHoursField.vue'
import TaskParentPicker from './TaskParentPicker.vue'
import { taskPreview, taskRejection, usePendingTaskFields, useTaskDetailQuery, useTaskEditMutation } from './tasks'

/**
 * Détail d'une tâche, à côté de l'arbre du projet. Le parent est relié au titre
 * par un coude, comme dans l'arbre ; les sous-tâches en partent de la même façon.
 */
const props = defineProps<{
  projectId: number
  taskId: number
  /** Arbre du projet : de quoi afficher l'en-tête et les sous-tâches sans attendre OP. */
  tree?: TaskNode[]
  /** Sur petit écran, le panneau recouvre l'arbre : il prend le focus, comme une fenêtre. */
  covering?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const detail = useTaskDetailQuery(() => props.taskId)
const preview = computed(() => props.tree && taskPreview(props.tree, props.taskId))
/** En-tête : la réponse d'OP, ou ce que l'arbre sait déjà de la tâche. */
const header = computed(() => detail.data.value ?? preview.value)

// Les champs et la liste des assignés arrêtent leur Échap : il ne ferme pas le détail.
onKeyStroke('Escape', () => emit('close'))

const closeButton = useTemplateRef('closeButton')

function takeFocus() {
  if (props.covering)
    (closeButton.value?.$el as HTMLElement | undefined)?.focus()
}

onMounted(takeFocus)
watch(() => [props.taskId, props.covering], takeFocus, { flush: 'post' })

const errorMessages: OpErrorMessages = {
  forbidden: 'OpenProject refuse l\'accès à cette tâche avec votre jeton. Vérifiez vos droits sur son projet dans OpenProject.',
  // Comme pour les projets, OP masque ce qu'on n'a pas le droit de voir : un 404 peut être un refus.
  notFound: 'Cette tâche est introuvable ou inaccessible avec votre jeton OpenProject. Elle a peut-être été supprimée.',
  fallback: 'L\'app n\'a pas pu ouvrir cette tâche. Réessayez dans un instant.',
}

/** Dernière modification de cette tâche qui a échoué ; effacée dès que l'utilisateur en lance une autre. */
const failure = shallowRef<{ error: Error, variables: TaskEditVariables } | null>(null)
watch(() => props.taskId, () => {
  failure.value = null
})

const editMutation = useTaskEditMutation({
  onFailure: (error, variables) => {
    if (variables.taskId === props.taskId)
      failure.value = { error, variables }
  },
})

/** Champs en attente de la réponse d'OP. */
const pendingFields = usePendingTaskFields(() => props.taskId)

const failedFields = computed(() => Object.keys(failure.value?.variables.edit ?? {}) as (keyof TaskEdit)[])
const rejection = computed(() => failure.value && taskRejection(failure.value.error))

/** Champs dont la modification a échoué : ils sont revenus à l'état réel. */
const rejectedFields = computed(() => new Set<string>(failedFields.value))

const fieldNames: Record<keyof TaskEdit, string> = {
  estimatedHours: 'le temps estimé',
  remainingHours: 'le temps restant',
  assignee: 'l\'assigné',
  status: 'l\'état',
  type: 'le type',
  priority: 'la priorité',
  parent: 'le parent',
}

const editErrorMessages = computed<OpErrorMessages>(() => {
  const what = failedFields.value.map(field => fieldNames[field]).join(' et ')
  return {
    // Le message d'un refus vient d'OP, ou du serveur pour un parent qui créerait un cycle : il nomme le champ en cause.
    fallback: rejection.value?.message ?? `L'app n'a pas pu modifier ${what}. Réessayez dans un instant.`,
    forbidden: `OpenProject ne vous permet pas de modifier ${what} de cette tâche. Demandez ce droit à un administrateur du projet dans OpenProject.`,
    notFound: errorMessages.notFound,
  }
})

function mutate(variables: TaskEditVariables) {
  failure.value = null
  editMutation.mutate(variables)
}

function save(edit: TaskEdit) {
  mutate({ projectId: props.projectId, taskId: props.taskId, edit })
}

const editableHours = computed(() => {
  const task = detail.data.value
  if (!task)
    return []
  return [
    { field: 'estimatedHours', label: 'Estimé', value: task.estimatedHours },
    { field: 'remainingHours', label: 'Restant', value: task.remainingHours },
  ] as const
})

interface FieldValue {
  label: string
  value: string
  /** Infobulle : la valeur complète quand l'affichage est abrégé. */
  title?: string
  hint?: ReturnType<typeof dueHint>
  edit?: 'type' | 'priority' | 'parent'
}

interface Field extends FieldValue {
  /** Les valeurs longues prennent toute la largeur ; les courtes vont par deux. */
  column: 'wide' | 'left' | 'right'
}

/** Propriété modifiable : la valeur est une liste de choix. */
function editable(label: string, edit: NonNullable<FieldValue['edit']>): FieldValue {
  return { label, value: '', edit }
}

function named(label: string, ref: { name: string } | null): FieldValue | null {
  return ref && { label, value: ref.name }
}

function wide(field: FieldValue | null): Field[] {
  return field
    ? [
        { ...field, column: 'wide' },
      ]
    : []
}

/** Deux valeurs courtes côte à côte ; seule, une valeur reste dans la colonne de gauche. */
function pair(left: FieldValue | null, right: FieldValue | null): Field[] {
  return [left, right]
    .filter(field => field !== null)
    .map((field, index) => ({
      ...field,
      column: index === 0
        ? 'left'
        : 'right',
    }))
}

/**
 * Propriétés renseignées, dans l'ordre d'affichage. Une propriété vide n'est pas affichée,
 * sauf si elle se modifie : le parent, le type et la priorité.
 */
const fields = computed<Field[]>(() => {
  const task = detail.data.value
  if (!task)
    return []
  // Une tâche fermée n'a plus d'échéance à tenir : pas d'indication relative.
  const hint = task.dueDate && !task.status.isClosed
    ? dueHint(task.dueDate)
    : undefined
  return [
    ...wide(editable('Parent', 'parent')),
    ...wide(named('Responsable', task.responsible)),
    ...wide(datesField(task.startDate, task.dueDate, hint)),
    ...pair(editable('Type', 'type'), editable('Priorité', 'priority')),
    ...wide(named('Version', task.version)),
    ...wide(named('Catégorie', task.category)),
  ]
})

/** Début et échéance sur une ligne : « 6 oct. → 31 oct. », suivie de l'échéance relative. */
function datesField(start: string | null, due: string | null, hint: FieldValue['hint']): FieldValue | null {
  // Un jalon a la même date de début et d'échéance : seule l'échéance compte.
  if (start && due && start !== due) {
    return {
      label: 'Dates',
      value: `${formatDay(start)} → ${formatDay(due)}`,
      title: `Du ${formatFullDay(start)} au ${formatFullDay(due)}`,
      hint,
    }
  }
  if (due) {
    return {
      label: 'Échéance',
      value: formatDay(due),
      title: formatFullDay(due),
      hint,
    }
  }
  if (start) {
    return {
      label: 'Début',
      value: formatDay(start),
      title: formatFullDay(start),
    }
  }
  return null
}

const subtasks = computed(() => preview.value?.children ?? [])
const closedSubtasksText = computed(() => {
  const closed = subtasks.value.filter(child => child.status.isClosed).length
  return `${closed} sur ${subtasks.value.length} ${closed > 1
    ? 'fermées'
    : 'fermée'}`
})
</script>

<template>
  <aside
    class="task-detail"
    :role="covering ? 'dialog' : undefined"
    :aria-modal="covering || undefined"
    :aria-labelledby="header ? 'task-detail-title' : undefined"
    :aria-label="header ? undefined : 'Détail de la tâche'"
  >
    <div class="head">
      <RouterLink
        v-if="header?.parent"
        class="parent"
        :to="{ name: 'task', params: { id: projectId, taskId: header.parent.id } }"
      >
        <span class="sr-only">Tâche parente : </span>{{ header.parent.subject }}
      </RouterLink>

      <Button ref="closeButton" variant="ghost" size="icon" class="close" aria-label="Fermer le détail" @click="emit('close')">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </Button>

      <template v-if="header">
        <h2 id="task-detail-title" :class="{ child: header.parent }">
          {{ header.subject }}
        </h2>
        <div class="summary">
          <TaskAllowedValuePicker
            v-if="detail.data.value"
            :task-id="taskId"
            field="status"
            :value="detail.data.value.status"
            :pending="pendingFields.has('status')"
            :rejected="rejectedFields.has('status')"
            @save="save"
          />
          <StatusBadge v-else :status="header.status" />
          <TaskAssigneePicker
            v-if="detail.data.value"
            :task-id="taskId"
            :assignee="detail.data.value.assignee"
            :pending="pendingFields.has('assignee')"
            :rejected="rejectedFields.has('assignee')"
            @select="assignee => save({ assignee })"
          />
          <span v-else-if="header.assignee">{{ header.assignee.name }}</span>
          <span class="ref op-num">#{{ header.id }}</span>
        </div>
      </template>

      <p v-else-if="detail.isPending.value" class="muted opening" role="status">
        Ouverture de la tâche…
      </p>
    </div>

    <div v-if="detail.error.value" class="section error">
      <OpErrorAlert
        :error="detail.error.value"
        :messages="errorMessages"
        :retrying="detail.isFetching.value"
        @retry="detail.refetch()"
      />
    </div>

    <template v-else-if="header">
      <section class="section" aria-label="Temps et propriétés" :aria-busy="detail.isPending.value">
        <p v-if="detail.isPending.value" class="muted" role="status">
          Chargement des heures et des propriétés…
        </p>
        <template v-else>
          <dl class="hours">
            <TaskHoursField
              v-for="item in editableHours"
              :key="item.field"
              :label="item.label"
              :value="item.value"
              :pending="pendingFields.has(item.field)"
              :rejected="rejectedFields.has(item.field)"
              @save="hours => save({ [item.field]: hours })"
            />
            <!-- Sans droit de voir le temps passé, OP ne le donne pas : on n'en parle pas. -->
            <div v-if="detail.data.value?.spentHours != null" class="hour">
              <dt>Passé</dt>
              <dd class="op-num">
                {{ formatHours(detail.data.value.spentHours) }}
              </dd>
            </div>
          </dl>
          <div v-if="failure" class="edit-error">
            <OpErrorAlert
              :error="failure.error"
              :messages="editErrorMessages"
              @retry="mutate(failure.variables)"
            />
          </div>
          <p class="sr-only" role="status">
            {{ pendingFields.size ? 'Enregistrement dans OpenProject…' : '' }}
          </p>
          <dl class="fields">
            <div v-for="field in fields" :key="field.label" class="field" :class="field.column">
              <dt>{{ field.label }}</dt>
              <dd v-if="field.edit === 'parent' && detail.data.value" class="editable">
                <TaskParentPicker
                  :task-id="taskId"
                  :parent="detail.data.value.parent"
                  :tree="tree"
                  :pending="pendingFields.has('parent')"
                  :rejected="rejectedFields.has('parent')"
                  @select="parent => save({ parent })"
                />
              </dd>
              <dd v-else-if="field.edit && field.edit !== 'parent' && detail.data.value" class="editable">
                <TaskAllowedValuePicker
                  :task-id="taskId"
                  :field="field.edit"
                  :value="detail.data.value[field.edit]"
                  :pending="pendingFields.has(field.edit)"
                  :rejected="rejectedFields.has(field.edit)"
                  @save="save"
                />
              </dd>
              <dd v-else :title="field.title">
                {{ field.value }}<span v-if="field.hint" class="hint" :class="{ overdue: field.hint.overdue }">{{ field.hint.text }}</span>
              </dd>
            </div>
          </dl>
        </template>
      </section>

      <section v-if="subtasks.length" class="section" aria-labelledby="subtasks-title">
        <h3 id="subtasks-title">
          Sous-tâches <span class="count op-num">{{ closedSubtasksText }}</span>
        </h3>
        <ul class="subtasks">
          <li v-for="child in subtasks" :key="child.id">
            <RouterLink :to="{ name: 'task', params: { id: projectId, taskId: child.id } }" class="subtask" :title="child.subject">
              {{ child.subject }}
            </RouterLink>
            <StatusBadge :status="child.status" />
          </li>
        </ul>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.task-detail {
  /* Coude du parent vers le titre : même trait et même retrait que dans l'arbre. */
  --lineage-gap: var(--op-space-1);
  --elbow-x: 0.375rem;
  /* Libellé des propriétés : même largeur partout, pour que les valeurs s'alignent. */
  --field-label: 4.75rem;

  position: sticky;
  top: var(--op-space-4);
  max-height: calc(100vh - 2 * var(--op-space-4));
  overflow-y: auto;
  box-sizing: border-box;
  border-left: 1px solid var(--p-app-line);
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--lineage-gap) var(--op-space-2);
  padding: 0 0 var(--op-space-4) var(--op-space-6);
}

.parent {
  grid-column: 1;
  min-width: 0;
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-primary-color);
  overflow-wrap: anywhere;
}

.close {
  grid-column: 2;
  grid-row: 1;
  margin: calc(-1 * var(--op-space-1)) calc(-1 * var(--op-space-2)) 0 0;
  color: var(--p-text-muted-color);
}

h2 {
  grid-column: 1;
  margin: 0;
  font-size: var(--op-text-xl);
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

h2.child {
  position: relative;
  padding-left: calc(var(--p-app-tree-indent) + var(--op-space-1));
}

/* Le coude part sous le parent et s'arrête au milieu de la première ligne du titre. */
h2.child::before {
  content: "";
  position: absolute;
  top: calc(-1 * var(--lineage-gap));
  left: var(--elbow-x);
  width: calc(var(--p-app-tree-indent) - var(--elbow-x));
  height: calc(var(--lineage-gap) + 0.5lh);
  box-sizing: border-box;
  border-left: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom-left-radius: var(--p-border-radius-md);
}

.summary {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--op-space-2) var(--op-space-3);
  margin: var(--op-space-2) 0 0;
  font-size: var(--op-text-sm);
}

h2.child ~ .summary {
  padding-left: calc(var(--p-app-tree-indent) + var(--op-space-1));
}

.ref,
.muted,
.empty,
dt,
.count,
.hint {
  color: var(--p-text-muted-color);
}

.ref {
  font-size: var(--op-text-xs);
}

.muted {
  margin: 0;
}

.opening {
  grid-column: 1;
}

.section {
  padding: var(--op-space-4) 0 var(--op-space-4) var(--op-space-6);
  border-top: 1px solid var(--p-app-line);
}

dl,
dd {
  margin: 0;
}

dt {
  font-size: var(--op-text-xs);
}

/* Les trois heures sur une ligne : ce qu'on vient lire en premier. */
.hours {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--op-space-1) var(--op-space-5);
  margin-bottom: var(--op-space-2);
}

.hour {
  display: flex;
  /* Centré comme les heures modifiables, pour rester sur la même ligne qu'elles. */
  align-items: center;
  gap: var(--op-space-2);
}

.hour dd {
  font-size: var(--op-text-lg);
  font-weight: 500;
  line-height: 1.75rem;
}

.edit-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-2);
  margin-bottom: var(--op-space-3);
}

/* Une propriété par ligne de 28 px, libellé et valeur côte à côte. */
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--op-space-3);
}

.field {
  display: flex;
  align-items: center;
  gap: var(--op-space-2);
  min-width: 0;
  height: 1.75rem;
}

.field.wide {
  grid-column: 1 / -1;
}

.field.left {
  grid-column: 1;
}

.field.right {
  grid-column: 2;
}

.field dt {
  flex: none;
}

.field.wide dt,
.field.left dt {
  width: var(--field-label);
}

.field dd {
  min-width: 0;
  font-size: var(--op-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field dd.editable {
  display: flex;
  overflow: visible;
}

.hint {
  margin-left: var(--op-space-2);
  font-size: var(--op-text-xs);
}

.hint.overdue {
  color: var(--p-app-error-color);
}

h3 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--op-space-2);
  margin: 0 0 var(--op-space-2);
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.count {
  font-size: var(--op-text-xs);
  font-weight: 400;
}

/* Sous-tâches : les traits de racine de l'arbre, un coude pour la dernière. */
.subtasks {
  margin: 0;
  padding: 0;
  list-style: none;
}

.subtasks li {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--op-space-3);
  height: var(--p-app-tree-row-height);
  padding-left: var(--p-app-tree-indent);
}

.subtasks li::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--elbow-x);
  width: calc(var(--p-app-tree-indent) - var(--elbow-x) - var(--op-space-1));
  box-sizing: border-box;
  border-left: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
}

.subtasks li:not(:last-child)::after {
  content: "";
  position: absolute;
  top: calc(50% - var(--p-app-tree-guide-width) / 2);
  left: var(--elbow-x);
  width: calc(var(--p-app-tree-indent) - var(--elbow-x) - var(--op-space-1));
  height: var(--p-app-tree-guide-width);
  background: var(--p-app-tree-guide);
}

.subtasks li:last-child::before {
  bottom: 50%;
  border-bottom: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom-left-radius: var(--p-border-radius-md);
}

.subtask {
  flex: 1;
  min-width: 0;
  font-size: var(--op-text-md);
  color: var(--p-text-color);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtask:hover {
  color: var(--p-primary-color);
  text-decoration: underline;
}

/* Sur petit écran, le détail recouvre l'arbre ; le fermer y ramène. */
@media (max-width: 760px) {
  .task-detail {
    position: fixed;
    inset: 0;
    z-index: 10;
    max-height: none;
    padding: var(--op-space-4) var(--op-space-6) var(--op-space-6);
    border-left: 0;
    background: var(--p-app-background);
  }

  .head,
  .section {
    padding-left: 0;
  }
}
</style>
