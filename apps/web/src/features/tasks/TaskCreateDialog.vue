<script setup lang="ts">
import type { ProjectType, TaskNode, TaskRef } from '@openpatatoes/shared'
import type { OpErrorMessages } from '@/shared/api/op-error'
import { TASK_SUBJECT_MAX_LENGTH } from '@openpatatoes/shared'
import { DialogTrigger } from 'reka-ui'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { ApiError } from '@/shared/api/api-fetch'
import { opErrorRecovery, opErrorText } from '@/shared/api/op-error'
import OpErrorAlert from '@/shared/components/OpErrorAlert.vue'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import TaskChoicePicker from './TaskChoicePicker.vue'
import TaskParentPicker from './TaskParentPicker.vue'
import { defaultTaskType, useProjectTypesQuery, useTaskCreateMutation } from './tasks'

/**
 * Bouton « Nouvelle tâche » et son dialogue : type, titre et parent. La tâche est créée dans OP
 * à la validation ; le dialogue se ferme alors et laisse la page ouvrir son détail.
 * Fermer le dialogue abandonne la saisie, sans confirmation.
 */
const props = defineProps<{
  projectId: number
  projectName: string
  /** Arbre du projet : les parents possibles ; `undefined` tant qu'il n'est pas lu. */
  tree: TaskNode[] | undefined
}>()

const emit = defineEmits<{ created: [taskId: number] }>()

const open = shallowRef(false)
const type = shallowRef<ProjectType | null>(null)
const subject = shallowRef('')
const parent = shallowRef<TaskRef | null>(null)
/** La tâche vient d'être créée : le focus ira à son détail, pas au bouton. */
const created = shallowRef(false)

const types = useProjectTypesQuery(() => props.projectId, open)
const creation = useTaskCreateMutation()

// Chaque ouverture repart d'une saisie vide.
watch(open, (isOpen) => {
  if (!isOpen)
    return
  type.value = null
  subject.value = ''
  parent.value = null
  created.value = false
  creation.reset()
})

// Le type « Tâche » est proposé d'emblée, dès que les types du projet sont lus.
watch([
  open,
  () => types.data.value,
], ([isOpen, list]) => {
  if (isOpen && list && type.value === null)
    type.value = defaultTaskType(list)
}, { immediate: true })

const typesFailure = computed(() => {
  const error = types.error.value
  return error && {
    message: opErrorText(error, { fallback: 'L\'app n\'a pas pu lire les types du projet dans OpenProject.' }),
    retry: opErrorRecovery(error) === 'retry',
  }
})

const canSubmit = computed(() => type.value !== null && subject.value.trim() !== '' && !creation.isPending.value)

function submit() {
  if (!canSubmit.value || !type.value)
    return
  creation.mutate({
    projectId: props.projectId,
    task: {
      typeId: type.value.id,
      subject: subject.value.trim(),
      parentId: parent.value?.id ?? null,
    },
  }, {
    onSuccess: ({ task }) => {
      created.value = true
      open.value = false
      emit('created', task.id)
    },
  })
}

/** Refus d'OP : son message dit quoi corriger dans la saisie. */
const rejection = computed(() => {
  const error = creation.error.value
  if (!(error instanceof ApiError) || error.code !== 'op_rejected')
    return null
  const body = error.body as { message?: unknown } | undefined
  return typeof body?.message === 'string'
    ? body.message
    : 'OpenProject a refusé la création de cette tâche.'
})

const errorMessages: OpErrorMessages = {
  forbidden: 'OpenProject refuse de créer une tâche dans ce projet avec votre jeton. Vérifiez vos droits sur ce projet dans OpenProject.',
  notFound: 'Ce projet est introuvable ou inaccessible avec votre jeton OpenProject.',
  fallback: 'L\'app n\'a pas pu créer la tâche. Réessayez dans un instant.',
}

const subjectInput = useTemplateRef('subjectInput')

async function focusSubject(event: Event) {
  event.preventDefault()
  await nextTick()
  ;(subjectInput.value?.$el as HTMLInputElement | undefined)?.focus()
}

function onCloseAutoFocus(event: Event) {
  if (created.value)
    event.preventDefault()
}

const typeTexts = {
  search: 'Rechercher un type',
  loading: 'Chargement des types du projet…',
  noMatch: 'Aucun type ne porte ce nom.',
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button variant="outline" class="new-task">
        Nouvelle tâche
      </Button>
    </DialogTrigger>

    <DialogContent @open-auto-focus="focusSubject" @close-auto-focus="onCloseAutoFocus">
      <DialogHeader>
        <DialogTitle>Nouvelle tâche dans {{ projectName }}</DialogTitle>
        <DialogDescription>
          Les autres propriétés prennent les valeurs par défaut d'OpenProject. Vous les modifierez dans le détail de la tâche.
        </DialogDescription>
      </DialogHeader>

      <form class="form" :aria-busy="creation.isPending.value" @submit.prevent="submit">
        <div class="field">
          <span class="label">Type</span>
          <TaskChoicePicker
            label="Type"
            empty-label="Aucun type"
            :value="type"
            :choices="types.data.value"
            :loading="types.isPending.value"
            :failure="typesFailure"
            :texts="typeTexts"
            @select="choice => type = choice"
            @retry="types.refetch()"
          />
        </div>

        <div class="field">
          <Label for="new-task-subject" class="label">
            Titre
          </Label>
          <Input
            id="new-task-subject"
            ref="subjectInput"
            v-model="subject"
            autocomplete="off"
            :maxlength="TASK_SUBJECT_MAX_LENGTH"
          />
        </div>

        <div class="field">
          <span class="label">Parent</span>
          <TaskParentPicker :parent="parent" :tree="tree" @select="choice => parent = choice" />
        </div>

        <Alert v-if="rejection" variant="error">
          <AlertDescription>{{ rejection }}</AlertDescription>
        </Alert>
        <div v-else-if="creation.error.value" class="error">
          <OpErrorAlert :error="creation.error.value" :messages="errorMessages" :retrying="creation.isPending.value" @retry="submit" />
        </div>
        <p v-if="typesFailure && !types.data.value" class="note" role="alert">
          Sans les types du projet, la tâche ne peut pas être créée.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            Annuler
          </Button>
          <Button type="submit" :disabled="!canSubmit">
            {{ creation.isPending.value ? 'Création…' : 'Créer' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.new-task {
  flex: none;
  margin-left: auto;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--op-space-4);
  min-width: 0;
}

.field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-1);
  min-width: 0;
}

/* Le titre prend toute la largeur ; les sélecteurs, celle de leur valeur. */
.field :deep([data-slot="input"]) {
  align-self: stretch;
}

.label {
  font-size: var(--op-text-xs);
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-2);
}

.note {
  margin: 0;
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}
</style>
