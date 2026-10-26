<script setup lang="ts">
import type { OpNamedRef, TaskStatus } from '@openpatatoes/shared'
import type { TaskEdit } from './tasks'
import { computed, ref } from 'vue'
import StatusBadge from '@/shared/components/StatusBadge.vue'
import TaskChoicePicker from './TaskChoicePicker.vue'
import { useTaskAllowedValuesQuery } from './tasks'

type Field = 'status' | 'type' | 'priority'

/**
 * État, type ou priorité d'une tâche, à choisir parmi les valeurs que permet le formulaire OP.
 * Pour l'état, ce sont les transitions permises depuis l'état actuel, pour cet utilisateur.
 */
const props = defineProps<{
  taskId: number
  field: Field
  value: TaskStatus | OpNamedRef | null
  /** La valeur affichée attend la réponse d'OP. */
  pending?: boolean
  /** OP vient de refuser le changement : la valeur affichée est revenue à l'état réel. */
  rejected?: boolean
}>()

const emit = defineEmits<{ save: [edit: TaskEdit] }>()

const settings = {
  status: {
    label: 'État',
    empty: 'Non renseigné',
    list: 'statuses',
    texts: {
      search: 'Rechercher un état',
      loading: 'Chargement des états possibles…',
      failed: 'L\'app n\'a pas pu lire les états possibles dans OpenProject.',
      noMatch: 'Aucun état possible ne porte ce nom.',
    },
  },
  type: {
    label: 'Type',
    empty: 'Non renseigné',
    list: 'types',
    texts: {
      search: 'Rechercher un type',
      loading: 'Chargement des types du projet…',
      failed: 'L\'app n\'a pas pu lire les types du projet dans OpenProject.',
      noMatch: 'Aucun type ne porte ce nom.',
    },
  },
  priority: {
    label: 'Priorité',
    empty: 'Non renseignée',
    list: 'priorities',
    texts: {
      search: 'Rechercher une priorité',
      loading: 'Chargement des priorités…',
      failed: 'L\'app n\'a pas pu lire les priorités dans OpenProject.',
      noMatch: 'Aucune priorité ne porte ce nom.',
    },
  },
} as const

const setting = computed(() => settings[props.field])

const open = ref(false)
// Relue à chaque ouverture : un autre a pu changer l'état ou le type dans OP.
const allowedValues = useTaskAllowedValuesQuery(() => props.taskId, open)

function select(choice: OpNamedRef | null) {
  // Ni l'état, ni le type, ni la priorité ne se vident.
  if (choice)
    emit('save', { [props.field]: choice })
}
</script>

<template>
  <TaskChoicePicker
    v-model:open="open"
    :label="setting.label"
    :empty-label="setting.empty"
    :value="value"
    :choices="allowedValues.data.value?.[setting.list]"
    :loading="allowedValues.isPending.value"
    :failed="allowedValues.isError.value"
    :texts="setting.texts"
    :pending="pending"
    :rejected="rejected"
    @select="select"
    @retry="allowedValues.refetch()"
  >
    <template v-if="field === 'status'" #value="{ value: status }">
      <StatusBadge :status="status as TaskStatus" />
    </template>
    <template v-if="field === 'status'" #choice="{ choice }">
      <StatusBadge :status="choice as TaskStatus" />
    </template>
  </TaskChoicePicker>
</template>
