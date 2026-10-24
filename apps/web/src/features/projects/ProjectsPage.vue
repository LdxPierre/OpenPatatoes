<script setup lang="ts">
import { computed } from 'vue'
import AppTopbar from '@/shared/components/AppTopbar.vue'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { canRetry, opErrorText } from './op-error'
import { useProjectsQuery } from './projects'

const projects = useProjectsQuery()

const countText = computed(() => {
  const count = projects.data.value?.length
  if (!count)
    return null
  return count === 1
    ? '1 projet'
    : `${count.toLocaleString('fr-FR')} projets`
})

const errorText = computed(() => {
  const error = projects.error.value
  return error && opErrorText(error, {
    forbidden: 'OpenProject refuse de lister les projets avec votre jeton. Vérifiez les droits de votre compte dans OpenProject.',
    fallback: 'L\'app n\'a pas pu charger vos projets. Réessayez dans un instant.',
  })
})
</script>

<template>
  <AppTopbar />

  <main class="content">
    <div class="title-bar">
      <h1>Projets</h1>
      <span v-if="countText" class="count op-num">{{ countText }}</span>
    </div>

    <p v-if="projects.isPending.value" class="muted" role="status">
      Chargement des projets…
    </p>

    <template v-else-if="projects.error.value">
      <Alert variant="error">
        <AlertDescription>{{ errorText }}</AlertDescription>
      </Alert>
      <Button v-if="canRetry(projects.error.value)" variant="outline" :disabled="projects.isFetching.value" @click="projects.refetch()">
        Réessayer
      </Button>
    </template>

    <p v-else-if="projects.data.value?.length === 0" class="muted" role="status">
      Aucun projet n'est accessible avec votre jeton OpenProject. Demandez à devenir membre d'un projet dans OpenProject.
    </p>

    <nav v-else class="project-list" aria-label="Projets">
      <div class="list-head" aria-hidden="true">
        <span>Projet</span>
        <span>Identifiant</span>
      </div>
      <ul>
        <li v-for="project in projects.data.value" :key="project.id">
          <RouterLink :to="{ name: 'project', params: { id: project.id } }" class="project-row" :title="project.name">
            <span class="name">{{ project.name }}</span>
            <span class="identifier">{{ project.identifier }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
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

.title-bar {
  display: flex;
  align-items: baseline;
  gap: var(--op-space-3);
}

h1 {
  margin: 0;
  font-size: var(--op-text-xl);
  color: var(--p-primary-color);
}

.count,
.muted {
  color: var(--p-text-muted-color);
}

.count {
  font-size: var(--op-text-sm);
}

.muted {
  margin: 0;
}

/* Le survol et le focus débordent de 8 px de chaque côté : le texte reste aligné sur le titre. */
.project-list {
  align-self: stretch;
  margin: 0 calc(-1 * var(--op-space-2));
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list-head,
.project-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(8rem, 16rem);
  align-items: center;
  column-gap: var(--op-space-6);
  padding: 0 var(--op-space-2);
}

/* Seule une ligne fine sépare l'en-tête des lignes, comme dans l'arbre des tâches. */
.list-head {
  height: 1.75rem;
  margin-bottom: var(--op-space-1);
  box-shadow: inset 0 -1px var(--p-app-line);
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}

.project-row {
  height: var(--p-app-tree-row-height);
  border-radius: 6px;
  font-size: var(--op-text-md);
  color: inherit;
  text-decoration: none;
}

.project-row:hover {
  background: var(--p-app-hover);
}

.project-row:focus-visible {
  outline-offset: -2px;
}

.name,
.identifier {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identifier {
  color: var(--p-text-muted-color);
}

/* Sur petit écran, le nom du projet garde toute la largeur, comme dans l'arbre des tâches. */
@media (max-width: 560px) {
  .list-head,
  .project-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .list-head span:last-child,
  .identifier {
    display: none;
  }
}
</style>
