<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import type { ThemeMode } from './theme-mode'
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group'
import { themeModeLabels, useThemeMode } from './theme-mode'

const { mode, setMode } = useThemeMode()

const options = Object.entries(themeModeLabels).map(([value, label]) => ({ value: value as ThemeMode, label }))

// Recliquer sur le choix actif le désélectionne : on garde toujours un thème.
function select(value: AcceptableValue | AcceptableValue[]) {
  if (typeof value === 'string')
    setMode(value as ThemeMode)
}
</script>

<template>
  <ToggleGroup
    type="single"
    variant="outline"
    size="sm"
    :model-value="mode"
    aria-label="Thème"
    @update:model-value="select"
  >
    <ToggleGroupItem v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroup>
</template>
