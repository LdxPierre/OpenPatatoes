<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { redirectTarget } from '@/features/auth/redirect'
import { useLogoutMutation } from '@/features/auth/session'
import { opErrorText } from '@/shared/api/op-error'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useSaveOpTokenMutation } from './op-connection'

const route = useRoute()
const router = useRouter()
const save = useSaveOpTokenMutation()
const logout = useLogoutMutation()

const token = ref('')

const errorText = computed(() => {
  const error = save.error.value
  return error && opErrorText(error, {
    tokenInvalid: 'OpenProject a refusé ce jeton. Vérifiez-le, ou générez-en un nouveau.',
    fallback: 'L\'app n\'a pas pu enregistrer ce jeton. Réessayez dans un instant.',
  })
})

function submit() {
  save.mutate({ token: token.value })
}

function continueToApp() {
  router.replace(redirectTarget(route.query.redirect))
}

function signOut() {
  logout.mutate(undefined, {
    onSuccess: () => router.replace({ name: 'login' }),
  })
}
</script>

<template>
  <main class="op-token">
    <div v-if="save.data.value" class="op-token-panel">
      <h1>C'est prêt</h1>
      <p class="lead" role="status">
        Connecté à OpenProject en tant que {{ save.data.value.opUser.name }}.
      </p>
      <Button class="submit" autofocus @click="continueToApp">
        Continuer
      </Button>
    </div>

    <form v-else class="op-token-panel" @submit.prevent="submit">
      <h1>Connectez OpenProject</h1>
      <p class="lead">
        L'app agit dans OpenProject en votre nom, avec votre jeton d'API.
      </p>
      <p class="help">
        Pour obtenir un jeton : dans OpenProject, ouvrez « Mon compte », puis « Jetons d'accès », et générez un jeton d'API. Copiez-le ici.
      </p>

      <Alert v-if="errorText" variant="error">
        <AlertDescription>{{ errorText }}</AlertDescription>
      </Alert>

      <div class="field">
        <Label for="op-token">Jeton d'API OpenProject</Label>
        <Input
          id="op-token"
          v-model="token"
          type="password"
          name="op-token"
          autocomplete="off"
          spellcheck="false"
          required
          autofocus
          :aria-invalid="errorText ? true : undefined"
        />
      </div>

      <Button type="submit" class="submit" :disabled="save.isPending.value">
        {{ save.isPending.value ? 'Vérification…' : 'Enregistrer le jeton' }}
      </Button>

      <Button type="button" variant="ghost" :disabled="logout.isPending.value" @click="signOut">
        Se déconnecter
      </Button>
      <Alert v-if="logout.isError.value" variant="error">
        <AlertDescription>La déconnexion a échoué. Réessayez.</AlertDescription>
      </Alert>
    </form>
  </main>
</template>

<style scoped>
.op-token {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--op-space-6);
  box-sizing: border-box;
}

.op-token-panel {
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
  margin: calc(-1 * var(--op-space-2)) 0 0;
  color: var(--p-text-muted-color);
}

.help {
  margin: 0 0 var(--op-space-2);
  font-size: var(--op-text-sm);
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
