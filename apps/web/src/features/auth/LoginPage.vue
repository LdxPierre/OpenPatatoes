<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/shared/api/api-fetch'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { redirectTarget } from './redirect'
import { useLoginMutation } from './session'

const route = useRoute()
const router = useRouter()
const login = useLoginMutation()

const username = ref('')
const password = ref('')

const errorText = computed(() => {
  const error = login.error.value
  if (!error)
    return null
  if (error instanceof ApiError && error.status === 401)
    return 'Identifiant ou mot de passe incorrect. Vérifiez-les et connectez-vous à nouveau.'
  if (error instanceof ApiError && error.status === 0)
    return 'L\'app ne répond pas. Vérifiez votre connexion, puis réessayez.'
  return 'L\'app n\'a pas pu vous connecter. Réessayez dans un instant.'
})

function submit() {
  login.mutate(
    { username: username.value, password: password.value },
    {
      onSuccess: () => router.replace(redirectTarget(route.query.redirect)),
    },
  )
}
</script>

<template>
  <main class="login">
    <form class="login-form" @submit.prevent="submit">
      <h1>OpenPatatoes</h1>
      <p class="lead">
        Connectez-vous pour retrouver vos tâches.
      </p>

      <Alert v-if="errorText" variant="error">
        <AlertDescription>{{ errorText }}</AlertDescription>
      </Alert>

      <div class="field">
        <Label for="login-username">Identifiant</Label>
        <Input
          id="login-username"
          v-model="username"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
          autofocus
          :aria-invalid="errorText ? true : undefined"
        />
      </div>

      <div class="field">
        <Label for="login-password">Mot de passe</Label>
        <Input
          id="login-password"
          v-model="password"
          type="password"
          name="password"
          autocomplete="current-password"
          required
          :aria-invalid="errorText ? true : undefined"
        />
      </div>

      <Button type="submit" class="submit" :disabled="login.isPending.value">
        {{ login.isPending.value ? 'Connexion…' : 'Se connecter' }}
      </Button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--op-space-6);
  box-sizing: border-box;
}

.login-form {
  width: 100%;
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  gap: var(--op-space-4);
}

h1 {
  margin: 0;
  font-size: var(--op-text-2xl);
  color: var(--p-primary-color);
}

.lead {
  margin: calc(-1 * var(--op-space-2)) 0 var(--op-space-2);
  color: var(--p-text-muted-color);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--op-space-2);
}

.submit {
  margin-top: var(--op-space-2);
}
</style>
