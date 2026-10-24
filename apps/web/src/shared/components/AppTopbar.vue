<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLogoutMutation } from '@/features/auth/session'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import ThemeModeSelect from '@/theme/ThemeModeSelect.vue'

const router = useRouter()
const logout = useLogoutMutation()

function signOut() {
  logout.mutate(undefined, {
    onSuccess: () => router.replace({ name: 'login' }),
  })
}
</script>

<template>
  <header class="topbar">
    <RouterLink :to="{ name: 'home' }" class="brand">
      OpenPatatoes
    </RouterLink>
    <ThemeModeSelect />
    <Button variant="ghost" :disabled="logout.isPending.value" @click="signOut">
      Se déconnecter
    </Button>
  </header>
  <Alert v-if="logout.isError.value" variant="error" class="logout-error">
    <AlertDescription>La déconnexion a échoué. Réessayez.</AlertDescription>
  </Alert>
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
  text-decoration: none;
}

.logout-error {
  margin: var(--op-space-4) var(--op-space-6) 0;
  width: auto;
}
</style>
