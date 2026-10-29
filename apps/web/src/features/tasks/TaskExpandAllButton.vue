<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/shared/components/ui/button'

/** Bouton à icône de l'arbre : tout déplier, ou tout replier quand tout est déjà déplié. */
const props = defineProps<{
  allExpanded: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

const label = computed(() => props.allExpanded ? 'Tout replier' : 'Tout déplier')
</script>

<template>
  <Button variant="ghost" size="icon" :aria-label="label" :title="label" @click="emit('toggle')">
    <!-- Deux chevrons qui se rapprochent pour replier, qui s'écartent pour déplier. -->
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        :d="allExpanded ? 'M4.5 2.5 8 6l3.5-3.5M4.5 13.5 8 10l3.5 3.5' : 'M4.5 6 8 2.5 11.5 6M4.5 10 8 13.5 11.5 10'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </Button>
</template>
