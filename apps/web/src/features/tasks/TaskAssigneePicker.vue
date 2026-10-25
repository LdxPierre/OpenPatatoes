<script setup lang="ts">
import type { OpNamedRef } from '@openpatatoes/shared'
import { computed, ref } from 'vue'
import { Combobox, ComboboxAnchor, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxList, ComboboxTrigger, ComboboxViewport } from '@/shared/components/ui/combobox'
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

const UNASSIGNED = 'aucun'

const open = ref(false)
const assignees = useTaskAssigneesQuery(() => props.taskId, open)

/** Les membres proposés, et l'assigné actuel même si OP ne le propose plus (un groupe, un ancien membre). */
const choices = computed(() => {
  const list = assignees.data.value ?? []
  const current = props.assignee
  return current && !list.some(user => user.id === current.id)
    ? [current, ...list]
    : list
})

const selected = computed(() => props.assignee
  ? String(props.assignee.id)
  : UNASSIGNED)

function choose(value: unknown) {
  open.value = false
  if (value === selected.value)
    return
  emit('select', choices.value.find(user => String(user.id) === value) ?? null)
}
</script>

<template>
  <Combobox v-model:open="open" class="picker" :model-value="selected" @update:model-value="choose">
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <button
          type="button"
          class="trigger"
          :class="{ pending, rejected, empty: !assignee }"
          :aria-label="`Assigné : ${assignee?.name ?? 'personne'}. Modifier`"
          :title="pending ? 'Enregistrement dans OpenProject…' : undefined"
        >
          <span class="name">{{ assignee?.name ?? 'Non assigné' }}</span>
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxList aria-label="Membres du projet">
      <ComboboxInput placeholder="Rechercher un membre" :display-value="() => ''" @keydown.escape.stop.prevent="open = false" />
      <ComboboxViewport>
        <p v-if="assignees.isPending.value" class="note" role="status">
          Chargement des membres du projet…
        </p>
        <p v-else-if="assignees.isError.value" class="note" role="alert">
          L'app n'a pas pu lire les membres du projet dans OpenProject.
          <button type="button" class="retry" @click="assignees.refetch()">
            Réessayer
          </button>
        </p>
        <template v-else>
          <ComboboxEmpty>Aucun membre ne porte ce nom.</ComboboxEmpty>
          <ComboboxItem :value="UNASSIGNED" class="unassigned">
            Non assigné
            <ComboboxItemIndicator>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem v-for="user in choices" :key="user.id" :value="String(user.id)" :text-value="user.name">
            <span class="choice">{{ user.name }}</span>
            <ComboboxItemIndicator>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </ComboboxItemIndicator>
          </ComboboxItem>
        </template>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>

<style scoped>
/* Le fond du survol déborde du nom, sans décaler le texte. */
.picker {
  min-width: 0;
  margin: 0 calc(-1 * var(--op-space-1));
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--op-space-1);
  max-width: 100%;
  padding: 0 var(--op-space-1);
  border: 0;
  border-radius: var(--p-border-radius-md);
  background: none;
  font: inherit;
  line-height: 1.5rem;
  color: var(--p-text-color);
  cursor: pointer;
}

.trigger:hover,
.trigger[data-state="open"] {
  background: var(--p-app-hover);
}

.trigger svg {
  flex: none;
  color: var(--p-text-muted-color);
}

.trigger.empty {
  color: var(--p-text-muted-color);
}

.name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mêmes marques que les heures : pointillé en attente d'OP, teinte d'erreur après un refus. */
.trigger.pending .name {
  text-decoration: underline dashed var(--p-primary-color);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25em;
}

.trigger.rejected {
  background: var(--p-app-error-background);
  color: var(--p-app-error-color);
}

.note {
  margin: 0;
  padding: var(--op-space-2);
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}

.retry {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 500;
  color: var(--p-primary-color);
  cursor: pointer;
}

.unassigned {
  color: var(--p-text-muted-color);
}

.choice {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
