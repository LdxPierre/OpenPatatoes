<script setup lang="ts">
import type { ThemeMode } from './theme-mode'
import SelectButton from 'primevue/selectbutton'
import { themeModeLabels, useThemeMode } from './theme-mode'

const { mode, setMode } = useThemeMode()

const options = Object.entries(themeModeLabels).map(([value, label]) => ({ value: value as ThemeMode, label }))
</script>

<template>
  <SelectButton
    :model-value="mode"
    :options="options"
    option-label="label"
    option-value="value"
    :allow-empty="false"
    aria-label="Thème"
    size="small"
    @update:model-value="setMode"
  />
</template>
