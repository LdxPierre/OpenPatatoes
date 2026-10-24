<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLogoutMutation } from '@/features/auth/session'
import { ApiError } from '@/shared/api/api-fetch'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import ThemeModeSelect from '@/theme/ThemeModeSelect.vue'
import { useProjectsQuery } from './projects'

const router = useRouter()
const projects = useProjectsQuery()
const logout = useLogoutMutation()

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
  if (!error)
    return null
  if (error instanceof ApiError && error.code === 'op_token_invalid')
    return 'OpenProject refuse votre jeton d\'API : il a peut-être été révoqué. Générez-en un nouveau dans OpenProject.'
  if (error instanceof ApiError && error.code === 'op_forbidden')
    return 'OpenProject refuse de lister les projets avec votre jeton. Vérifiez les droits de votre compte dans OpenProject.'
  if (error instanceof ApiError && error.code === 'op_unavailable')
    return 'OpenProject ne répond pas. Réessayez dans un instant.'
  if (error instanceof ApiError && error.status === 0)
    return 'L\'app ne répond pas. Vérifiez votre connexion, puis réessayez.'
  return 'L\'app n\'a pas pu charger vos projets. Réessayez dans un instant.'
})

// Un refus (4xx) ne changera pas en réessayant ; une panne d'OP ou du réseau, peut-être.
const canRetry = computed(() => {
  const error = projects.error.value
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500)
})

function signOut() {
  logout.mutate(undefined, {
    onSuccess: () => router.replace({ name: 'login' }),
  })
}
</script>

<template>
  <div class="projects-page">
    <header class="topbar">
      <span class="brand">OpenPatatoes</span>
      <ThemeModeSelect />
      <Button variant="ghost" :disabled="logout.isPending.value" @click="signOut">
        Se déconnecter
      </Button>
    </header>

    <main class="content">
      <div class="title-bar">
        <h1>Projets</h1>
        <span v-if="countText" class="count op-num">{{ countText }}</span>
      </div>

      <Alert v-if="logout.isError.value" variant="error">
        <AlertDescription>La déconnexion a échoué. Réessayez.</AlertDescription>
      </Alert>

      <p v-if="projects.isPending.value" class="muted" role="status">
        Chargement des projets…
      </p>

      <template v-else-if="errorText">
        <Alert variant="error">
          <AlertDescription>{{ errorText }}</AlertDescription>
        </Alert>
        <Button v-if="canRetry" variant="outline" :disabled="projects.isFetching.value" @click="projects.refetch()">
          Réessayer
        </Button>
      </template>

      <p v-else-if="projects.data.value?.length === 0" class="muted" role="status">
        Aucun projet n'est accessible avec votre jeton OpenProject. Demandez à devenir membre d'un projet dans OpenProject.
      </p>

      <div v-else class="project-list">
        <div class="list-head" aria-hidden="true">
          <span>Projet</span>
          <span>Identifiant</span>
        </div>
        <ul>
          <li v-for="project in projects.data.value" :key="project.id" class="project-row" :title="project.name">
            <span class="name">{{ project.name }}</span>
            <span class="identifier">{{ project.identifier }}</span>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--op-space-4);
  padding: var(--op-space-3) var(--op-space-6);
  border-bottom: 1px solid var(--p-app-line);
}

.brand {
  margin-right: auto;
  font-weight: 700;
  color: var(--p-primary-color);
}

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

.project-list {
  align-self: stretch;
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
  font-size: var(--op-text-md);
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
