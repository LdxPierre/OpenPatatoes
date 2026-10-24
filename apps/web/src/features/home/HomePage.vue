<script setup lang="ts">
import type { AlertVariants } from '@/shared/components/ui/alert'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLogoutMutation, useSessionQuery } from '@/features/auth/session'
import { ApiError } from '@/shared/api/api-fetch'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import ThemeModeSelect from '@/theme/ThemeModeSelect.vue'
import { useHealthQuery } from './use-health-query'

// Page provisoire : elle prouve que le front, le proxy, l'API et le thème fonctionnent ensemble.
// La liste des projets la remplacera.

const router = useRouter()
const session = useSessionQuery()
const logout = useLogoutMutation()
const health = useHealthQuery()

function signOut() {
  logout.mutate(undefined, {
    onSuccess: () => router.replace({ name: 'login' }),
  })
}

const status = computed((): { variant: AlertVariants['variant'], text: string } => {
  if (health.isPending.value)
    return { variant: 'neutral', text: 'Vérification de l\'API…' }
  if (health.isSuccess.value)
    return { variant: 'success', text: 'L\'API et la base répondent.' }
  const error = health.error.value
  if (error instanceof ApiError && error.status === 503)
    return { variant: 'warn', text: 'L\'API répond, mais la base est indisponible. Lancez PostgreSQL avec docker compose -f compose.dev.yml up -d.' }
  return { variant: 'error', text: 'L\'API ne répond pas. Lancez le serveur avec pnpm dev.' }
})
</script>

<template>
  <main class="home">
    <h1>OpenPatatoes</h1>
    <p class="lead">
      Connecté en tant que {{ session.data.value?.username }}.
    </p>
    <Alert :variant="status.variant" role="status">
      <AlertDescription>{{ status.text }}</AlertDescription>
    </Alert>
    <ThemeModeSelect />
    <Button variant="outline" :disabled="logout.isPending.value" @click="signOut">
      Se déconnecter
    </Button>
    <Alert v-if="logout.isError.value" variant="error">
      <AlertDescription>La déconnexion a échoué. Réessayez.</AlertDescription>
    </Alert>
  </main>
</template>

<style scoped>
.home {
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--op-space-10) var(--op-space-6);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-4);
}

h1 {
  margin: 0;
  font-size: var(--op-text-xl);
}

.lead {
  margin: 0;
  color: var(--p-text-muted-color);
}
</style>
