<script setup lang="ts">
import { computed } from 'vue'
import { statusFamilyOf, statusFamilyVars } from '@/theme/status-families'

/**
 * Statut OP : le nom vient d'OP, la couleur et le pictogramme de sa famille.
 * Sans `isClosed`, un statut inconnu tombe dans « Nouveau ».
 */
const props = defineProps<{
  status: { name: string, isClosed?: boolean }
}>()

const family = computed(() => statusFamilyOf({ name: props.status.name, isClosed: props.status.isClosed ?? false }))
const style = computed(() => {
  const vars = statusFamilyVars(family.value)
  return {
    '--status-background': vars.background,
    '--status-color': vars.color,
  }
})
</script>

<template>
  <span class="status" :data-family="family" :style="style">{{ status.name }}</span>
</template>

<style scoped>
/* Fond teinté, jamais plein : des centaines de pastilles pleines deviendraient du bruit. */
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px 4px 6px;
  border-radius: 999px;
  background: var(--status-background);
  color: var(--status-color);
  font-size: var(--op-text-sm);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Le pictogramme rend l'état lisible sans distinguer les couleurs. */
.status::before {
  content: "";
  flex: none;
  width: 9px;
  height: 9px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  background: conic-gradient(currentColor var(--status-fill, 0%), transparent 0);
}

.status[data-family="planned"] { --status-fill: 25%; }
.status[data-family="active"] { --status-fill: 50%; }
.status[data-family="closed"] { --status-fill: 100%; }

.status[data-family="onHold"]::before {
  border-style: dashed;
  background: none;
}
</style>
