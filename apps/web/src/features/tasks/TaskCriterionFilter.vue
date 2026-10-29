<script setup lang="ts" generic="T extends string | number">
import type { CriterionOption } from './task-filters'
import { computed, shallowRef } from 'vue'
import { Button } from '@/shared/components/ui/button'
import { Combobox, ComboboxAnchor, ComboboxInput, ComboboxItem, ComboboxItemIndicator, ComboboxList, ComboboxTrigger, ComboboxViewport } from '@/shared/components/ui/combobox'
import { foldText } from './task-filters'

/**
 * Filtre de l'arbre à choix multiple, dans une liste avec recherche. Le bouton dit
 * combien de valeurs sont choisies (« Statut · 2 »).
 */
const props = defineProps<{
  /** Nom du filtre : « Statut », « Type »… */
  label: string
  options: CriterionOption<T>[]
  /** Textes de la liste : ce qu'on cherche, une recherche sans résultat. */
  texts: { search: string, noMatch: string }
  /** Une option correspond-elle à la recherche ? Par défaut, son nom, sans casse ni accents. */
  matches?: (option: CriterionOption<T>, search: string) => boolean
}>()

defineSlots<{
  /** Option dans la liste ; son nom par défaut. */
  option?: (props: { option: CriterionOption<T> }) => unknown
}>()

const selected = defineModel<T[]>({ required: true })

const search = shallowRef('')

const shown = computed(() => {
  const text = search.value.trim()
  if (!text)
    return props.options
  const folded = foldText(text)
  const matches = props.matches ?? (option => foldText(option.name).includes(folded))
  return props.options.filter(option => matches(option, text))
})

const buttonText = computed(() => selected.value.length > 0
  ? `${props.label} · ${selected.value.length}`
  : props.label)

/** Les options sont repérées par leur valeur en texte : `me` et un identifiant ne se confondent pas. */
const keys = computed(() => selected.value.map(String))

function choose(values: unknown) {
  const wanted = new Set(values as string[])
  selected.value = props.options.filter(option => wanted.has(String(option.value))).map(option => option.value)
}
</script>

<template>
  <Combobox
    multiple
    ignore-filter
    :model-value="keys"
    :reset-search-term-on-select="false"
    @update:model-value="choose"
    @update:open="open => open || (search = '')"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <!-- Sans nom explicite, le déclencheur de Reka s'annonce « Show popup ». -->
        <Button variant="outline" class="trigger" :class="{ active: selected.length > 0 }" :aria-label="buttonText">
          {{ buttonText }}
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxList :aria-label="label" class="w-[280px]">
      <ComboboxInput v-model="search" :placeholder="texts.search" :display-value="() => ''" />
      <ComboboxViewport>
        <p v-if="shown.length === 0" class="note" role="status">
          {{ texts.noMatch }}
        </p>
        <ComboboxItem v-for="option in shown" :key="option.value" :value="String(option.value)" :text-value="option.name">
          <span class="option">
            <slot name="option" :option="option">{{ option.name }}</slot>
          </span>
          <span v-if="option.count !== undefined" class="count op-num">{{ option.count.toLocaleString('fr-FR') }}</span>
          <ComboboxItemIndicator>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>

<style scoped>
.trigger svg {
  color: var(--p-text-muted-color);
}

.trigger.active {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.note {
  margin: 0;
  padding: var(--op-space-2);
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}

.option {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count {
  flex: none;
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}
</style>
