<script setup lang="ts">
import type { SessionUser } from '@openpatatoes/shared'
import type { OpErrorMessages } from '@/shared/api/op-error'
import { useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sessionQueryOptions } from '@/features/auth/session'
import { opErrorRecovery, opErrorText } from '@/shared/api/op-error'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'

/** Erreur d'accès à OP, avec la seule action qui peut la résoudre. */
const props = defineProps<{
  error: Error
  messages: OpErrorMessages
  /** Une nouvelle tentative est en cours. */
  retrying?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const text = computed(() => opErrorText(props.error, props.messages))
const recovery = computed(() => opErrorRecovery(props.error))

/** La session a expiré côté serveur : rien de l'utilisateur ne doit rester en cache. */
function signInAgain() {
  queryClient.clear()
  queryClient.setQueryData(sessionQueryOptions.queryKey, null)
  router.push({
    name: 'login',
    query: { redirect: route.fullPath },
  })
}

/** Le jeton enregistré ne sert plus : la saisie d'un nouveau jeton redevient accessible. */
function enterNewToken() {
  queryClient.setQueryData(
    sessionQueryOptions.queryKey,
    (user: SessionUser | null | undefined) => user && { ...user, opConnected: false },
  )
  router.push({
    name: 'op-token',
    query: { redirect: route.fullPath },
  })
}
</script>

<template>
  <Alert variant="error">
    <AlertDescription>{{ text }}</AlertDescription>
  </Alert>
  <Button v-if="recovery === 'retry'" variant="outline" :disabled="retrying" @click="emit('retry')">
    Réessayer
  </Button>
  <Button v-else-if="recovery === 'sign-in'" variant="outline" @click="signInAgain">
    Se connecter à nouveau
  </Button>
  <Button v-else-if="recovery === 'op-token'" variant="outline" @click="enterNewToken">
    Saisir un nouveau jeton
  </Button>
</template>
