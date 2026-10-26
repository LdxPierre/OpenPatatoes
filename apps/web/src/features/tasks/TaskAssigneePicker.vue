<script setup lang="ts">
import type { OpNamedRef } from '@openpatatoes/shared'
import { ref } from 'vue'
import TaskChoicePicker from './TaskChoicePicker.vue'
import { useTaskAssigneesQuery } from './tasks'

/** Assigné d'une tâche, à choisir parmi les membres que propose OP. */
const props = defineProps<{
  taskId: number
  assignee: OpNamedRef | null
  /** L'assigné affiché attend la réponse d'OP. */
  pending?: boolean
  /** OP vient de refuser le changement : l'assigné affiché est revenu à l'état réel. */
  rejected?: boolean
}>()

const emit = defineEmits<{ select: [assignee: OpNamedRef | null] }>()

const open = ref(false)
const assignees = useTaskAssigneesQuery(() => props.taskId, open)

const texts = {
  search: 'Rechercher un membre',
  loading: 'Chargement des membres du projet…',
  failed: 'L\'app n\'a pas pu lire les membres du projet dans OpenProject.',
  noMatch: 'Aucun membre ne porte ce nom.',
}
</script>

<template>
  <TaskChoicePicker
    v-model:open="open"
    label="Assigné"
    empty-label="Non assigné"
    clearable
    :value="assignee"
    :choices="assignees.data.value"
    :loading="assignees.isPending.value"
    :failed="assignees.isError.value"
    :texts="texts"
    :pending="pending"
    :rejected="rejected"
    @select="assignee => emit('select', assignee)"
    @retry="assignees.refetch()"
  />
</template>
