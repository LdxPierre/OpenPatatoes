<script setup lang="ts">
import type { OpErrorMessages } from '@/shared/api/op-error'
import { useMediaQuery } from '@vueuse/core'
import { computed, nextTick, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()
const tree = useTemplateRef('tree')

/** Sur petit écran, le détail recouvre l'arbre, qui ne doit plus recevoir le focus. */
const narrow = useMediaQuery('(max-width: 760px)')
const detailCovers = computed(() => narrow.value && props.taskId !== null)

function openTask(taskId: number) {
  if (taskId !== props.taskId) {
    router.push({
      name: 'task',
      params: { id: props.id, taskId },
    })
  }
}

/** Fermer le détail rend la main à l'arbre, sur la tâche qui était ouverte. */
async function closeTask() {
  if (props.taskId === null)
    return
  await router.push({
    name: 'project',
    params: { id: props.id },
  })
  await nextTick()
  tree.value?.focusActive()
}

const project = useProjectQuery(() => props.id)
const tasks = useTaskTreeQuery(() => props.id)

const countText = computed(() => {
  if (!tasks.data.value?.length)
    return null
  const count = countTasks(tasks.data.value)
  return count === 1
    ? '1 tâche'
    : `${count.toLocaleString('fr-FR')} tâches`
})

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
      </div>

      <div class="workspace" :class="{ 'with-detail': taskId !== null }">
        <div class="tasks" :inert="detailCovers">
          <p v-if="tasks.isPending.value" class="muted" role="status">
            Chargement des tâches…
          </p>

          <OpErrorAlert
            v-else-if="tasks.error.value"
            :error="tasks.error.value"
            :messages="taskErrorMessages"
            :retrying="tasks.isFetching.value"
            @retry="tasks.refetch()"
          />

          <p v-else-if="tasks.data.value?.length === 0" class="muted" role="status">
            Ce projet n'a encore aucune tâche. Les tâches créées dans OpenProject apparaîtront ici.
          </p>

          <TaskTree
            v-else-if="tasks.data.value"
            ref="tree"
            :key="id"
            :tasks="tasks.data.value"
            :label="`Tâches de ${project.data.value.name}`"
            :selected-id="taskId"
            @open="openTask"
          />
        </div>

        <RouterView :tree="tasks.data.value" :covering="detailCovers" @close="closeTask" />
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
  display: flex;
  align-items: baseline;
  gap: var(--op-space-3);
  min-width: 0;
  max-width: 100%;
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
