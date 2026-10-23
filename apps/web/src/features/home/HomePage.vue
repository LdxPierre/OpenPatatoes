<script setup lang="ts">
import Message from 'primevue/message'
import { computed } from 'vue'
import { ApiError } from '@/shared/api/api-fetch'
import ThemeModeSelect from '@/theme/ThemeModeSelect.vue'
import { useHealthQuery } from './use-health-query'

// Page provisoire : elle prouve que le front, le proxy, l'API et le thème fonctionnent ensemble.
// L'écran de connexion la remplacera.

const health = useHealthQuery()

const status = computed(() => {
  if (health.isPending.value)
    return { severity: 'secondary', text: 'Vérification de l\'API…' }
  if (health.isSuccess.value)
    return { severity: 'success', text: 'L\'API et la base répondent.' }
  const error = health.error.value
  if (error instanceof ApiError && error.status === 503)
    return { severity: 'warn', text: 'L\'API répond, mais la base est indisponible. Lancez PostgreSQL avec docker compose -f compose.dev.yml up -d.' }
  return { severity: 'error', text: 'L\'API ne répond pas. Lancez le serveur avec pnpm dev.' }
})
</script>

<template>
  <main class="home">
    <h1>OpenPatatoes</h1>
    <p class="lead">
      Socle de l'application. L'écran de connexion remplacera cette page.
    </p>
    <Message :severity="status.severity" role="status">
      {{ status.text }}
    </Message>
    <ThemeModeSelect />
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
