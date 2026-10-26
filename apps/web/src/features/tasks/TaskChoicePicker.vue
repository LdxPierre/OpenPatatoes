<script setup lang="ts" generic="T extends OpNamedRef">
import type { OpNamedRef } from '@openpatatoes/shared'
import { computed } from 'vue'
import { Combobox, ComboboxAnchor, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxList, ComboboxTrigger, ComboboxViewport } from '@/shared/components/ui/combobox'

/**
 * Champ d'une tâche à choisir dans une liste avec recherche, sous sa valeur.
 * Les choix viennent d'OP : le parent les lit quand la liste s'ouvre.
 */
const props = defineProps<{
  /** Nom du champ : « Assigné », « État »… */
  label: string
  value: T | null
  /** Choix permis par OP ; `undefined` tant qu'ils ne sont pas lus. */
  choices: T[] | undefined
  loading: boolean
  failed: boolean
  /** Textes de la liste : ce qu'on cherche, la lecture des choix et son échec, une recherche sans résultat. */
  texts: { search: string, loading: string, failed: string, noMatch: string }
  /** Ce qu'affiche le champ vide. */
  emptyLabel: string
  /** Le champ peut être vidé : la liste propose `emptyLabel` en premier choix. */
  clearable?: boolean
  /** La valeur affichée attend la réponse d'OP. */
  pending?: boolean
  /** OP vient de refuser le changement : la valeur affichée est revenue à l'état réel. */
  rejected?: boolean
}>()

const emit = defineEmits<{
  select: [choice: T | null]
  retry: []
}>()

const open = defineModel<boolean>('open', { default: false })

defineSlots<{
  /** Valeur dans le bouton ; son nom par défaut. */
  value?: (props: { value: T }) => unknown
  /** Choix dans la liste ; son nom par défaut. */
  choice?: (props: { choice: T }) => unknown
}>()

const NONE = 'aucun'

/** Les choix d'OP, et la valeur actuelle même si OP ne la propose plus. */
const options = computed(() => {
  const list = props.choices ?? []
  const current = props.value
  return current && !list.some(choice => choice.id === current.id)
    ? [current, ...list]
    : list
})

const selected = computed(() => props.value
  ? String(props.value.id)
  : NONE)

function choose(value: unknown) {
  open.value = false
  if (value === selected.value)
    return
  emit('select', options.value.find(choice => String(choice.id) === value) ?? null)
}
</script>

<template>
  <Combobox v-model:open="open" class="picker" :model-value="selected" @update:model-value="choose">
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <button
          type="button"
          class="trigger"
          :class="{ pending, rejected, empty: !value }"
          :aria-label="`${label} : ${value?.name ?? emptyLabel}. Modifier`"
          :title="pending ? 'Enregistrement dans OpenProject…' : undefined"
        >
          <span class="value">
            <slot v-if="value" name="value" :value="value">{{ value.name }}</slot>
            <template v-else>{{ emptyLabel }}</template>
          </span>
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxList :aria-label="label">
      <ComboboxInput :placeholder="texts.search" :display-value="() => ''" @keydown.escape.stop.prevent="open = false" />
      <ComboboxViewport>
        <p v-if="loading" class="note" role="status">
          {{ texts.loading }}
        </p>
        <p v-else-if="failed" class="note" role="alert">
          {{ texts.failed }}
          <button type="button" class="retry" @click="emit('retry')">
            Réessayer
          </button>
        </p>
        <template v-else>
          <ComboboxEmpty>{{ texts.noMatch }}</ComboboxEmpty>
          <ComboboxItem v-if="clearable" :value="NONE" class="none">
            {{ emptyLabel }}
            <ComboboxItemIndicator>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem v-for="choice in options" :key="choice.id" :value="String(choice.id)" :text-value="choice.name">
            <span class="choice">
              <slot name="choice" :choice="choice">{{ choice.name }}</slot>
            </span>
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
/* Le fond du survol déborde de la valeur, sans décaler le texte. */
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

.value {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Mêmes marques que les heures : pointillé en attente d'OP, teinte d'erreur après un refus.
   Le soulignement ne traverse pas un bloc en ligne comme la pastille d'état : il s'y applique aussi. */
.trigger.pending .value,
.trigger.pending .value > :deep(*) {
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

.none {
  color: var(--p-text-muted-color);
}

.choice {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
