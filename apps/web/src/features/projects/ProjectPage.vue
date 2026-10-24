<script setup lang="ts">
import { computed } from 'vue'
import AppTopbar from '@/shared/components/AppTopbar.vue'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { canRetry, opErrorText } from './op-error'
import { useProjectQuery } from './projects'

const props = defineProps<{ id: number }>()

const project = useProjectQuery(() => props.id)

const errorText = computed(() => {
  const error = project.error.value
  return error && opErrorText(error, {
    forbidden: 'OpenProject refuse l\'accès à ce projet avec votre jeton. Demandez à en devenir membre dans OpenProject.',
    // OP masque l'existence des projets dont on n'est pas membre : un 404 peut aussi être un refus.
    notFound: 'Ce projet est introuvable ou inaccessible avec votre jeton OpenProject. Vérifiez le lien, ou demandez à devenir membre du projet dans OpenProject.',
    fallback: 'L\'app n\'a pas pu ouvrir ce projet. Réessayez dans un instant.',
  })
})
</script>

<template>
  <AppTopbar />

  <main class="content">
    <RouterLink :to="{ name: 'home' }" class="back">
      Tous les projets
    </RouterLink>

    <p v-if="project.isPending.value" class="muted" role="status">
      Ouverture du projet…
    </p>

    <template v-else-if="project.error.value">
      <Alert variant="error">
        <AlertDescription>{{ errorText }}</AlertDescription>
      </Alert>
      <Button v-if="canRetry(project.error.value)" variant="outline" :disabled="project.isFetching.value" @click="project.refetch()">
        Réessayer
      </Button>
    </template>

    <template v-else-if="project.data.value">
      <div class="title-bar">
        <h1>{{ project.data.value.name }}</h1>
        <span class="identifier">{{ project.data.value.identifier }}</span>
      </div>
      <!-- L'arbre des tâches arrive avec #6. -->
      <p class="muted">
        Les tâches de ce projet ne sont pas encore affichées.
      </p>
    </template>
  </main>
</template>

<style scoped>
.content {
  padding: var(--op-space-6);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-4);
}

.back {
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-primary-color);
}

.title-bar {
  display: flex;
  align-items: baseline;
  gap: var(--op-space-3);
  min-width: 0;
  max-width: 100%;
}

h1 {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--op-text-xl);
  color: var(--p-primary-color);
}

.identifier,
.muted {
  color: var(--p-text-muted-color);
}

.identifier {
  font-size: var(--op-text-sm);
}

.muted {
  margin: 0;
}
</style>
