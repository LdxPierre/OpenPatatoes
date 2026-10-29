<script setup lang="ts">
import type { CriteriaOptions, CriterionOption, TaskCriteria } from './task-filters'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { shallowRef, useTemplateRef, watch } from 'vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { hasCriteria, NO_CRITERIA, taskSearch } from './task-filters'
import TaskCriterionFilter from './TaskCriterionFilter.vue'

/**
 * Recherche et filtres de l'arbre d'un projet. La recherche s'applique pendant la frappe.
 * `/` place le curseur dans la recherche, Échap la vide.
 */
const props = defineProps<{
  options: CriteriaOptions
}>()

const criteria = defineModel<TaskCriteria>({ required: true })

const SEARCH_DELAY_MS = 150

/** Saisie en cours : elle devient un critère après un court délai sans frappe. */
const text = shallowRef(criteria.value.search)
/** Dernière saisie appliquée : son retour par l'adresse ne doit pas écraser la frappe qui a suivi. */
let applied = criteria.value.search
const applySearch = useDebounceFn((search: string) => {
  applied = search
  if (search !== criteria.value.search)
    criteria.value = { ...criteria.value, search }
}, SEARCH_DELAY_MS)

watch(text, applySearch)
// Un critère changé ailleurs (effacement, adresse) remplace la saisie.
watch(() => criteria.value.search, (search) => {
  if (search !== applied) {
    applied = search
    text.value = search
  }
})

function update<K extends keyof TaskCriteria>(key: K, value: TaskCriteria[K]) {
  criteria.value = { ...criteria.value, [key]: value }
}

function clearSearch() {
  text.value = ''
  applied = ''
  update('search', '')
}

function clearAll() {
  text.value = ''
  applied = ''
  criteria.value = NO_CRITERIA
}

/** Un parent se cherche comme dans la recherche principale : par identifiant ou par titre. */
function parentMatches(option: CriterionOption<number>, search: string) {
  return taskSearch(search)?.({ id: option.value, subject: option.name }) ?? true
}

const searchField = useTemplateRef<{ $el: HTMLInputElement }>('search')

function focusSearch() {
  searchField.value?.$el.focus()
}

defineExpose({ focusSearch })

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target))
    return
  event.preventDefault()
  focusSearch()
})
</script>

<template>
  <div class="filter-bar" role="search" aria-label="Filtrer les tâches">
    <Input
      ref="search"
      v-model="text"
      type="search"
      class="search"
      placeholder="Rechercher par numéro ou titre"
      aria-label="Rechercher une tâche par numéro ou titre"
      aria-keyshortcuts="/"
      @keydown.escape.stop.prevent="clearSearch"
    />
    <TaskCriterionFilter
      :model-value="criteria.statuses"
      label="Statut"
      :options="props.options.statuses"
      :texts="{ search: 'Rechercher un statut', noMatch: 'Aucun statut ne porte ce nom.' }"
      @update:model-value="update('statuses', $event)"
    />
    <TaskCriterionFilter
      :model-value="criteria.types"
      label="Type"
      :options="props.options.types"
      :texts="{ search: 'Rechercher un type', noMatch: 'Aucun type ne porte ce nom.' }"
      @update:model-value="update('types', $event)"
    />
    <TaskCriterionFilter
      :model-value="criteria.assignees"
      label="Assigné"
      :options="props.options.assignees"
      :texts="{ search: 'Rechercher un assigné', noMatch: 'Aucun assigné ne porte ce nom.' }"
      @update:model-value="update('assignees', $event)"
    />
    <TaskCriterionFilter
      :model-value="criteria.parents"
      label="Parent"
      :options="props.options.parents"
      :matches="parentMatches"
      :texts="{ search: 'Rechercher par numéro ou titre', noMatch: 'Aucune tâche parente ne correspond.' }"
      @update:model-value="update('parents', $event)"
    >
      <template #option="{ option }">
        <span class="ref op-num">#{{ option.value }}</span> {{ option.name }}
      </template>
    </TaskCriterionFilter>
    <Button v-if="hasCriteria(criteria)" variant="ghost" @click="clearAll">
      Effacer les filtres
    </Button>
  </div>
</template>

<style scoped>
.filter-bar {
  align-self: stretch;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--op-space-2);
}

.search {
  flex: 0 1 18rem;
  min-width: 12rem;
}

.ref {
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}
</style>
