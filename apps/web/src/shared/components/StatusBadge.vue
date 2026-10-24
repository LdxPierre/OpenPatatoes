<script setup lang="ts">
import { computed } from 'vue'
import { statusFamilyOf, statusFamilyVars } from '@/theme/status-families'

/** Statut OP : le nom vient d'OP, la couleur et le pictogramme de sa famille. */
const props = defineProps<{
  status: { name: string, isClosed: boolean }
}>()

const family = computed(() => statusFamilyOf(props.status))
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
  /* Taille du pictogramme : il doit rester lisible à côté d'un texte de 13 px. */
  --status-icon-size: 9px;
  --status-icon-border: 1.5px;

  display: inline-flex;
  align-items: center;
  gap: var(--op-space-1);
  max-width: 100%;
  padding: var(--op-space-1) var(--op-space-2);
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
  width: var(--status-icon-size);
  height: var(--status-icon-size);
  box-sizing: border-box;
  border: var(--status-icon-border) solid currentColor;
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
