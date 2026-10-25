<script setup lang="ts">
import type { OpErrorMessages } from '@/shared/api/op-error'
import { onKeyStroke } from '@vueuse/core'
import { computed, onMounted, useTemplateRef, watch } from 'vue'
import OpErrorAlert from '@/shared/components/OpErrorAlert.vue'
import { Button } from '@/shared/components/ui/button'
import { formatHours, useTaskDetailQuery } from './tasks'

/**
 * Détail d'une tâche, à côté de l'arbre du projet. Le parent est relié au titre
 * par un coude, comme dans l'arbre.
 */
const props = defineProps<{
  projectId: number
  taskId: number
  /** Sur petit écran, le panneau recouvre l'arbre : il prend le focus, comme une fenêtre. */
  covering?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const detail = useTaskDetailQuery(() => props.projectId, () => props.taskId)
const task = computed(() => detail.data.value)

onKeyStroke('Escape', () => emit('close'))

const closeButton = useTemplateRef('closeButton')

function takeFocus() {
  if (props.covering)
    (closeButton.value?.$el as HTMLElement | undefined)?.focus()
}

onMounted(takeFocus)
watch(() => [props.taskId, props.covering], takeFocus, { flush: 'post' })

/** Titre et parent viennent de l'arbre en attendant OP ; les heures, seulement d'OP. */
const hoursPending = computed(() => detail.isPlaceholderData.value)

const hours = computed(() => task.value
  ? [
      { label: 'Temps estimé', value: task.value.estimatedHours },
      { label: 'Temps restant', value: task.value.remainingHours },
    ]
  : [])

const errorMessages: OpErrorMessages = {
  forbidden: 'OpenProject refuse l\'accès à cette tâche avec votre jeton. Vérifiez vos droits sur son projet dans OpenProject.',
  // Comme pour les projets, OP masque ce qu'on n'a pas le droit de voir : un 404 peut être un refus.
  notFound: 'Cette tâche est introuvable ou inaccessible avec votre jeton OpenProject. Elle a peut-être été supprimée.',
  fallback: 'L\'app n\'a pas pu ouvrir cette tâche. Réessayez dans un instant.',
}
</script>

<template>
  <aside
    class="task-detail"
    :role="covering ? 'dialog' : undefined"
    :aria-modal="covering || undefined"
    :aria-labelledby="task ? 'task-detail-title' : undefined"
    :aria-label="task ? undefined : 'Détail de la tâche'"
  >
    <div class="head">
      <p v-if="detail.isPending.value" class="muted" role="status">
        Ouverture de la tâche…
      </p>

      <div v-else-if="task" class="lineage">
        <RouterLink
          v-if="task.parent"
          class="parent"
          :to="{ name: 'task', params: { id: projectId, taskId: task.parent.id } }"
        >
          <span class="sr-only">Tâche parente : </span>{{ task.parent.subject }}
        </RouterLink>
        <h2 id="task-detail-title" :class="{ child: task.parent }">
          {{ task.subject }}
        </h2>
      </div>

      <Button ref="closeButton" variant="ghost" size="icon" class="close" aria-label="Fermer le détail" @click="emit('close')">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </Button>
    </div>

    <OpErrorAlert
      v-if="detail.error.value"
      :error="detail.error.value"
      :messages="errorMessages"
      :retrying="detail.isFetching.value"
      @retry="detail.refetch()"
    />

    <template v-else-if="task">
      <p class="ref op-num">
        #{{ task.id }}
      </p>

      <dl class="hours" :aria-busy="hoursPending">
        <div v-for="item in hours" :key="item.label" class="hour">
          <dt>{{ item.label }}</dt>
          <dd v-if="hoursPending" class="pending">
            …
          </dd>
          <dd v-else-if="item.value === null" class="empty">
            Non renseigné
          </dd>
          <dd v-else class="value op-num">
            {{ formatHours(item.value) }}
          </dd>
        </div>
      </dl>
    </template>
  </aside>
</template>

<style scoped>
.task-detail {
  /* Coude du parent vers le titre : même trait et même retrait que dans l'arbre. */
  --lineage-gap: var(--op-space-1);
  --elbow-x: 0.375rem;

  position: sticky;
  top: var(--op-space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-3);
  max-height: calc(100vh - 2 * var(--op-space-4));
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 0 var(--op-space-4) var(--op-space-6);
  border-left: 1px solid var(--p-app-line);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--op-space-3);
  align-self: stretch;
}

.close {
  margin: calc(-1 * var(--op-space-1)) calc(-1 * var(--op-space-2)) 0 auto;
  color: var(--p-text-muted-color);
}

.lineage {
  display: flex;
  flex-direction: column;
  gap: var(--lineage-gap);
  min-width: 0;
  max-width: 100%;
}

.parent {
  align-self: flex-start;
  max-width: 100%;
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-primary-color);
  overflow-wrap: anywhere;
}

h2 {
  margin: 0;
  font-size: var(--op-text-xl);
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

h2.child {
  position: relative;
  padding-left: calc(var(--p-app-tree-indent) + var(--op-space-1));
}

/* Le coude part sous le parent et s'arrête au milieu de la première ligne du titre. */
h2.child::before {
  content: "";
  position: absolute;
  top: calc(-1 * var(--lineage-gap));
  left: var(--elbow-x);
  width: calc(var(--p-app-tree-indent) - var(--elbow-x));
  height: calc(var(--lineage-gap) + 0.5lh);
  box-sizing: border-box;
  border-left: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  border-bottom-left-radius: var(--p-border-radius-md);
}

.ref,
.muted,
.empty,
.pending,
dt {
  color: var(--p-text-muted-color);
}

.ref {
  margin: calc(-1 * var(--op-space-2)) 0 0;
  font-size: var(--op-text-xs);
}

.muted {
  margin: 0;
}

.hours {
  display: flex;
  flex-wrap: wrap;
  gap: var(--op-space-4) var(--op-space-10);
  margin: var(--op-space-4) 0 0;
}

dt {
  font-size: var(--op-text-sm);
  font-weight: 500;
}

dd {
  margin: 0;
}

/* Les heures sont ce qu'on vient lire : à la taille du titre, chiffres de même largeur. */
.value,
.pending {
  font-size: var(--op-text-xl);
  font-weight: 500;
  line-height: 1.3;
}

.empty {
  font-size: var(--op-text-md);
  line-height: calc(var(--op-text-xl) * 1.3);
}

/* Sur petit écran, le détail recouvre l'arbre ; le fermer y ramène. */
@media (max-width: 760px) {
  .task-detail {
    position: fixed;
    inset: 0;
    z-index: 10;
    max-height: none;
    padding: var(--op-space-4) var(--op-space-6) var(--op-space-6);
    border-left: 0;
    background: var(--p-app-background);
  }
}
</style>
