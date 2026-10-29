<script setup lang="ts">
import type { OpNamedRef, TaskNode, TaskRef } from '@openpatatoes/shared'
import { forEachTask } from '@openpatatoes/shared'
import { computed } from 'vue'
import TaskChoicePicker from './TaskChoicePicker.vue'
import { taskPath } from './tasks'

/**
 * Parent d'une tâche, à choisir parmi les tâches de son projet. La tâche et ses sous-tâches
 * ne sont pas proposées : elles créeraient un cycle, que le serveur refuse de toute façon.
 */
const props = defineProps<{
  /** Tâche dont on choisit le parent ; absente pour une tâche à créer, qui peut aller sous n'importe laquelle. */
  taskId?: number
  parent: TaskRef | null
  /** Arbre du projet ; `undefined` tant qu'il n'est pas lu. */
  tree: TaskNode[] | undefined
  /** Le parent affiché attend la réponse d'OP. */
  pending?: boolean
  /** Le changement vient d'être refusé : le parent affiché est revenu à l'état réel. */
  rejected?: boolean
}>()

const emit = defineEmits<{ select: [parent: TaskRef | null] }>()

const texts = {
  search: 'Rechercher une tâche',
  loading: 'Chargement des tâches du projet…',
  noMatch: 'Aucune tâche du projet ne porte ce nom.',
}

const value = computed(() => props.parent && { id: props.parent.id, name: props.parent.subject })

/** Tâches du projet, par identifiant, hors la tâche et ses sous-tâches. */
const choices = computed(() => {
  if (!props.tree)
    return undefined
  const excluded = new Set<number>()
  const task = props.taskId === undefined
    ? undefined
    : taskPath(props.tree, props.taskId)?.at(-1)
  if (task)
    forEachTask([task], descendant => excluded.add(descendant.id))
  const choices: OpNamedRef[] = []
  forEachTask(props.tree, (candidate) => {
    if (!excluded.has(candidate.id))
      choices.push({ id: candidate.id, name: candidate.subject })
  })
  return choices.sort((a, b) => a.id - b.id)
})

function select(choice: OpNamedRef | null) {
  emit('select', choice && { id: choice.id, subject: choice.name })
}
</script>

<template>
  <TaskChoicePicker
    label="Parent"
    empty-label="Aucun parent"
    clearable
    :value="value"
    :choices="choices"
    :loading="!tree"
    :failure="null"
    :texts="texts"
    :pending="pending"
    :rejected="rejected"
    @select="select"
  >
    <template #choice="{ choice }">
      <span class="ref op-num">#{{ choice.id }}</span> {{ choice.name }}
    </template>
  </TaskChoicePicker>
</template>

<style scoped>
.ref {
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}
</style>
