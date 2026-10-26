<script setup lang="ts">
import type { TabsListProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { TabsList } from 'reka-ui'
import { cn } from '@/shared/lib/utils'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<!-- Onglets soulignés, posés sur un séparateur : pas de fond ni de cadre (Vitelotte). -->
<template>
  <TabsList
    data-slot="tabs-list"
    v-bind="delegatedProps"
    :class="cn('flex items-center gap-1 border-b border-border', props.class)"
  >
    <slot />
  </TabsList>
</template>
