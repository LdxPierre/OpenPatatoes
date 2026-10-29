<script setup lang="ts">
import type { TaskCriteria } from '@/features/tasks/task-filters'
import type { OpErrorMessages } from '@/shared/api/op-error'
import { useMediaQuery } from '@vueuse/core'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { criteriaFromQuery, criteriaOptions, filterTaskTree, hasCriteria, knownCriteria, queryWithCriteria } from '@/features/tasks/task-filters'
import TaskCreateDialog from '@/features/tasks/TaskCreateDialog.vue'
import TaskFilterBar from '@/features/tasks/TaskFilterBar.vue'
import { countTasks, useTaskTreeQuery } from '@/features/tasks/tasks'
import TaskTree from '@/features/tasks/TaskTree.vue'
import AppTopbar from '@/shared/components/AppTopbar.vue'
import OpErrorAlert from '@/shared/components/OpErrorAlert.vue'
import { useProjectQuery } from './projects'

const props = defineProps<{
  id: number
  /** Tâche dont le détail est ouvert à côté de l'arbre. */
  taskId: number | null
}>()

const route = useRoute()
const router = useRouter()
const tree = useTemplateRef('tree')
const filterBar = useTemplateRef('filterBar')

/** Sur petit écran, le détail recouvre l'arbre, qui ne doit plus recevoir le focus. */
const narrow = useMediaQuery('(max-width: 760px)')
const detailCovers = computed(() => narrow.value && props.taskId !== null)

/** Ouvrir ou fermer une tâche garde les critères de l'arbre dans l'adresse. */
function openTask(taskId: number) {
  if (taskId !== props.taskId) {
    router.push({
      name: 'task',
      params: { id: props.id, taskId },
      query: route.query,
    })
  }
}

/** Tâche qui vient d'être créée : son détail prend le focus à son ouverture. */
const createdTaskId = shallowRef<number | null>(null)

function openCreatedTask(taskId: number) {
  createdTaskId.value = taskId
  openTask(taskId)
}

// Revenir plus tard sur cette tâche ne lui redonne pas le focus.
watch(() => props.taskId, (taskId) => {
  if (taskId !== createdTaskId.value)
    createdTaskId.value = null
})

const project = useProjectQuery(() => props.id)
const taskTree = useTaskTreeQuery(() => props.id)
const tasks = computed(() => taskTree.data.value?.tasks)
const currentUserId = computed(() => taskTree.data.value?.currentUserId ?? null)

const options = computed(() => criteriaOptions(tasks.value ?? [], currentUserId.value))

/**
 * Critères de l'arbre, gardés dans l'adresse sans remplir l'historique. Une valeur que les filtres
 * ne proposent pas est ignorée ; elle quitte l'adresse au prochain changement de critères.
 */
const criteria = computed({
  get: () => knownCriteria(criteriaFromQuery(route.query), options.value),
  set: (next: TaskCriteria) => {
    router.replace({
      query: queryWithCriteria(route.query, next),
    })
  },
})

/** Arbre réduit aux critères ; `null` sans critère. */
const filtered = computed(() => tasks.value && hasCriteria(criteria.value)
  ? filterTaskTree(tasks.value, criteria.value, currentUserId.value)
  : null)

const noMatch = computed(() => filtered.value?.tasks.length === 0)

function taskCount(count: number) {
  return count === 1
    ? '1 tâche'
    : `${count.toLocaleString('fr-FR')} tâches`
}

const countText = computed(() => {
  if (!tasks.value?.length)
    return null
  const total = countTasks(tasks.value)
  return filtered.value
    ? `${taskCount(filtered.value.matchIds.size)} sur ${total.toLocaleString('fr-FR')}`
    : taskCount(total)
})

/**
 * Fermer le détail rend la main à l'arbre, sur la tâche qui était ouverte, ou sur la première ligne
 * si les critères la masquent. Sans aucune ligne, la main va à la recherche.
 */
async function closeTask() {
  if (props.taskId === null)
    return
  await router.push({
    name: 'project',
    params: { id: props.id },
    query: route.query,
  })
  await nextTick()
  if (noMatch.value)
    filterBar.value?.focusSearch()
  else
    tree.value?.focusActive()
}

const errorMessages: OpErrorMessages = {
  forbidden: 'OpenProject refuse l\'accès à ce projet avec votre jeton. Demandez à en devenir membre dans OpenProject.',
  // OP masque l'existence des projets dont on n'est pas membre : un 404 peut aussi être un refus.
  notFound: 'Ce projet est introuvable ou inaccessible avec votre jeton OpenProject. Vérifiez le lien, ou demandez à devenir membre du projet dans OpenProject.',
  fallback: 'L\'app n\'a pas pu ouvrir ce projet. Réessayez dans un instant.',
}

const taskErrorMessages: OpErrorMessages = {
  forbidden: 'OpenProject refuse de lister les tâches de ce projet avec votre jeton. Vérifiez vos droits sur ce projet dans OpenProject.',
  notFound: errorMessages.notFound,
  fallback: 'L\'app n\'a pas pu charger les tâches de ce projet. Réessayez dans un instant.',
}
</script>

<template>
  <AppTopbar />

  <main class="content">
    <RouterLink :to="{ name: 'home' }" class="back">
      Tous les projets
    </RouterLink>

    <p v-if="project.isPending.value" class="muted" role="status">
      Ouverture du projet…
    </p>

    <OpErrorAlert
      v-else-if="project.error.value"
      :error="project.error.value"
      :messages="errorMessages"
      :retrying="project.isFetching.value"
      @retry="project.refetch()"
    />

    <template v-else-if="project.data.value">
      <div class="title-bar">
        <h1>{{ project.data.value.name }}</h1>
        <span class="identifier">{{ project.data.value.identifier }}</span>
        <span v-if="countText" class="count op-num">{{ countText }}</span>
        <TaskCreateDialog
          :project-id="id"
          :project-name="project.data.value.name"
          :tree="tasks"
          @created="openCreatedTask"
        />
      </div>

      <div class="workspace" :class="{ 'with-detail': taskId !== null }">
        <div class="tasks" :inert="detailCovers">
          <p v-if="taskTree.isPending.value" class="muted" role="status">
            Chargement des tâches…
          </p>

          <OpErrorAlert
            v-else-if="taskTree.error.value"
            :error="taskTree.error.value"
            :messages="taskErrorMessages"
            :retrying="taskTree.isFetching.value"
            @retry="taskTree.refetch()"
          />

          <p v-else-if="tasks?.length === 0" class="muted" role="status">
            Ce projet n'a encore aucune tâche. Créez la première avec « Nouvelle tâche ».
          </p>

          <template v-else-if="tasks">
            <TaskFilterBar ref="filterBar" v-model="criteria" :options="options" />

            <p v-if="noMatch" class="muted" role="status">
              Aucune tâche ne correspond à ces critères.
            </p>

            <!-- Masqué sans être démonté : l'arbre garde son dépliage pour le retour sans critère. -->
            <TaskTree
              v-show="!noMatch"
              ref="tree"
              :key="id"
              :tasks="filtered?.tasks ?? tasks"
              :match-ids="filtered?.matchIds"
              :label="`Tâches de ${project.data.value.name}`"
              :selected-id="taskId"
              @open="openTask"
            />
          </template>
        </div>

        <RouterView
          :tree="tasks"
          :covering="detailCovers"
          :focused="createdTaskId !== null && createdTaskId === taskId"
          @close="closeTask"
        />
      </div>
    </template>
  </main>
</template>

<style scoped>
.content {
  padding: var(--op-space-6);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-4);
}

.back {
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-primary-color);
}

.title-bar {
  align-self: stretch;
  display: flex;
  align-items: baseline;
  gap: var(--op-space-3);
  min-width: 0;
}

h1 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--op-text-xl);
  color: var(--p-primary-color);
}

.identifier,
.count,
.muted {
  color: var(--p-text-muted-color);
}

.identifier {
  font-size: var(--op-text-sm);
}

.count {
  flex: none;
  font-size: var(--op-text-xs);
}

.muted {
  margin: 0;
}

.workspace {
  align-self: stretch;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: var(--op-space-8);
}

.workspace.with-detail {
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 26rem);
}

.tasks {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-4);
  min-width: 0;
}

/* Sur petit écran, le détail recouvre l'arbre : l'arbre garde toute la largeur. */
@media (max-width: 760px) {
  .workspace.with-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
