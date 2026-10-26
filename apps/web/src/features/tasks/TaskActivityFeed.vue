<script setup lang="ts">
import type { TaskActivity } from '@openpatatoes/shared'
import type { OpErrorMessages } from '@/shared/api/op-error'
import { shallowRef, watch } from 'vue'
import OpErrorAlert from '@/shared/components/OpErrorAlert.vue'
import { Button } from '@/shared/components/ui/button'
import { formatFullMoment, formatMoment } from './format'
import { useTaskActivitiesQuery, useTaskCommentMutation } from './tasks'

/**
 * Historique d'une tâche, du plus ancien au plus récent, et le champ de commentaire à la suite.
 * Les commentaires se lisent ; les modifications tiennent sur une ligne, avec le détail au survol.
 */
const props = defineProps<{ taskId: number }>()

const activities = useTaskActivitiesQuery(() => props.taskId, true)

const errorMessages: OpErrorMessages = {
  forbidden: 'OpenProject ne vous permet pas de lire l\'activité de cette tâche. Vérifiez vos droits sur son projet dans OpenProject.',
  notFound: 'Cette tâche est introuvable ou inaccessible avec votre jeton OpenProject. Elle a peut-être été supprimée.',
  fallback: 'L\'app n\'a pas pu lire l\'activité de cette tâche. Réessayez dans un instant.',
}

const commentErrorMessages: OpErrorMessages = {
  forbidden: 'OpenProject ne vous permet pas de commenter cette tâche. Demandez ce droit à un administrateur du projet dans OpenProject.',
  notFound: errorMessages.notFound,
  fallback: 'L\'app n\'a pas pu envoyer le commentaire. Il est gardé dans le champ : réessayez dans un instant.',
}

/** Brouillon du commentaire. Il reste en place si l'envoi échoue. */
const draft = shallowRef('')
const commentMutation = useTaskCommentMutation()

watch(() => props.taskId, () => {
  draft.value = ''
  commentMutation.reset()
})

function send() {
  const comment = draft.value.trim()
  if (!comment || commentMutation.isPending.value)
    return
  const taskId = props.taskId
  commentMutation.mutate({ taskId, comment }, {
    onSuccess: () => {
      // L'utilisateur a pu passer à une autre tâche pendant l'envoi : son brouillon n'est pas celui-ci.
      if (props.taskId === taskId)
        draft.value = ''
    },
  })
}

/** Initiales de l'auteur : « Camille Roux » donne « CR ». */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]!.toUpperCase())
    .join('')
}

function authorName(activity: TaskActivity) {
  return activity.author?.name ?? 'Utilisateur inconnu'
}

/** Ligne d'une activité sans commentaire : qui a fait quoi. */
function changeSummary(activity: TaskActivity) {
  if (activity.creation)
    return 'a créé la tâche'
  return activity.changes.length > 1
    ? `a fait ${activity.changes.length} modifications`
    : 'a modifié la tâche'
}
</script>

<template>
  <section class="feed-section" aria-label="Activité de la tâche" :aria-busy="activities.isPending.value">
    <div v-if="activities.error.value" class="error">
      <OpErrorAlert
        :error="activities.error.value"
        :messages="errorMessages"
        :retrying="activities.isFetching.value"
        @retry="activities.refetch()"
      />
    </div>
    <p v-else-if="activities.isPending.value" class="muted" role="status">
      Chargement de l'activité…
    </p>
    <template v-else>
      <p v-if="!activities.data.value?.length" class="muted">
        Aucune activité pour l'instant.
      </p>
      <ol v-else class="feed">
        <template v-for="activity in activities.data.value" :key="activity.id">
          <li v-if="activity.comment !== null" class="comment">
            <span class="mark" aria-hidden="true">{{ activity.author ? initials(activity.author.name) : '?' }}</span>
            <div class="meta">
              <span class="who">{{ authorName(activity) }}</span>
              <time :datetime="activity.createdAt" :title="formatFullMoment(activity.createdAt)">{{ formatMoment(activity.createdAt) }}</time>
            </div>
            <!-- HTML rendu par OP et assaini par le serveur : ni script ni attribut on*. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="markdown" v-html="activity.comment" />
            <ul v-if="activity.changes.length" class="comment-changes">
              <li v-for="change in activity.changes" :key="change">
                {{ change }}
              </li>
            </ul>
          </li>
          <li
            v-else
            class="change"
            :tabindex="activity.changes.length ? 0 : undefined"
            :aria-describedby="activity.changes.length ? `activity-${activity.id}-changes` : undefined"
          >
            <span class="mark" aria-hidden="true" />
            <span class="what"><b>{{ authorName(activity) }}</b> {{ changeSummary(activity) }}</span>
            <time :datetime="activity.createdAt" :title="formatFullMoment(activity.createdAt)">{{ formatMoment(activity.createdAt) }}</time>
            <ul v-if="activity.changes.length" :id="`activity-${activity.id}-changes`" class="pop">
              <li v-for="change in activity.changes" :key="change">
                {{ change }}
              </li>
            </ul>
          </li>
        </template>
      </ol>
    </template>

    <form class="composer" @submit.prevent="send">
      <textarea
        v-model="draft"
        aria-label="Commentaire"
        placeholder="Commenter"
        rows="3"
        :readonly="commentMutation.isPending.value"
        @keydown.enter.ctrl.prevent="send"
        @keydown.enter.meta.prevent="send"
      />
      <div class="composer-actions">
        <span class="hint">Markdown accepté. Ctrl + Entrée pour envoyer.</span>
        <Button type="submit" :disabled="!draft.trim() || commentMutation.isPending.value">
          {{ commentMutation.isPending.value ? 'Envoi…' : 'Commenter' }}
        </Button>
      </div>
      <div v-if="commentMutation.error.value" class="error">
        <OpErrorAlert
          :error="commentMutation.error.value"
          :messages="commentErrorMessages"
          @retry="send"
        />
      </div>
    </form>
  </section>
</template>

<style scoped>
.feed-section {
  padding: var(--op-space-4) 0 var(--op-space-4) var(--op-space-6);
}

.muted,
.hint,
time {
  color: var(--p-text-muted-color);
}

.muted {
  margin: 0 0 var(--op-space-4);
}

.error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--op-space-2);
  margin-bottom: var(--op-space-3);
}

/* Un trait de racine relie le fil, comme dans l'arbre. */
.feed {
  position: relative;
  margin: 0 0 var(--op-space-4);
  padding: 0;
  list-style: none;
}

.feed::before {
  content: "";
  position: absolute;
  top: var(--op-space-3);
  bottom: var(--op-space-3);
  left: 11px;
  width: var(--p-app-tree-guide-width);
  background: var(--p-app-tree-guide);
}

.feed > li {
  position: relative;
  padding-left: 34px;
}

.mark {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
}

time {
  flex: none;
  font-size: var(--op-text-xs);
}

/* Commentaire : auteur, date et texte, sans bulle. */
.comment {
  padding: 2px 0 var(--op-space-4);
}

.comment .mark {
  border-radius: 50%;
  background: var(--p-highlight-background);
  color: var(--p-primary-color);
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 0 0 3px var(--p-app-background);
}

.meta {
  display: flex;
  align-items: baseline;
  gap: var(--op-space-2);
  min-height: 24px;
}

.who {
  font-size: var(--op-text-sm);
  font-weight: 500;
}

.markdown {
  font-size: var(--op-text-md);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.markdown :deep(p),
.markdown :deep(ul),
.markdown :deep(ol),
.markdown :deep(pre),
.markdown :deep(blockquote) {
  margin: 2px 0 var(--op-space-2);
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-left: var(--op-space-5);
  list-style: revert;
}

.markdown :deep(:last-child) {
  margin-bottom: 0;
}

.markdown :deep(a) {
  color: var(--p-primary-color);
  text-decoration: underline;
}

.markdown :deep(code) {
  padding: 1px 4px;
  border-radius: var(--p-border-radius-sm);
  background: var(--p-app-hover);
  font-size: var(--op-text-sm);
}

.markdown :deep(pre) {
  padding: var(--op-space-2);
  border-radius: var(--p-border-radius-md);
  background: var(--p-app-hover);
  overflow-x: auto;
}

.markdown :deep(pre code) {
  padding: 0;
}

.markdown :deep(blockquote) {
  padding-left: var(--op-space-3);
  border-left: var(--p-app-tree-guide-width) solid var(--p-app-tree-guide);
  color: var(--p-text-muted-color);
}

.markdown :deep(img) {
  max-width: 100%;
  height: auto;
}

.comment-changes {
  margin: var(--op-space-1) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}

/* Modification : une ligne discrète. Le détail et l'heure viennent au survol ou au focus. */
.change {
  display: flex;
  align-items: center;
  gap: var(--op-space-2);
  min-height: 24px;
  margin: 0 0 10px;
  padding-right: 6px;
  border-radius: var(--p-border-radius-md);
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}

.change .mark::before {
  content: "";
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid var(--p-app-tree-guide);
  background: var(--p-app-background);
}

.what {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.what b {
  font-weight: 500;
  color: var(--p-text-color);
}

.change time {
  opacity: 0;
}

.change:hover,
.change:focus-visible {
  background: var(--p-app-hover);
}

.change:hover time,
.change:focus-visible time {
  opacity: 1;
}

.pop {
  position: absolute;
  z-index: 2;
  top: calc(100% + 2px);
  right: 0;
  left: 34px;
  display: none;
  margin: 0;
  padding: var(--op-space-2) 10px;
  border-radius: var(--p-border-radius-lg);
  background: var(--p-content-background);
  box-shadow: var(--p-app-shadow-lift);
  list-style: none;
  font-size: var(--op-text-sm);
  color: var(--p-text-color);
}

.change:hover .pop,
.change:focus-visible .pop {
  display: grid;
  gap: var(--op-space-1);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: var(--op-space-2);
}

.composer textarea {
  width: 100%;
  min-height: 4.5rem;
  box-sizing: border-box;
  padding: var(--op-space-2);
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
  color: var(--p-text-color);
  font: inherit;
  font-size: var(--op-text-md);
  resize: vertical;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--op-space-3);
}

.hint {
  font-size: var(--op-text-xs);
}

@media (max-width: 760px) {
  .feed-section {
    padding-left: 0;
  }
}
</style>
