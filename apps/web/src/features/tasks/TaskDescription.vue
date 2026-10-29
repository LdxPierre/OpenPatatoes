<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { Button } from '@/shared/components/ui/button'
import { useThemeMode } from '@/theme'
import { MARKDOWN_LANGUAGE, MARKDOWN_TOOLBARS, sanitizePreview } from './markdown'
import 'md-editor-v3/lib/style.css'

/**
 * Description d'une tâche : l'aperçu du markdown, coupé à six lignes, et son éditeur.
 * L'aperçu et l'éditeur passent le HTML par `sanitizePreview` : une description venue d'OP
 * ou saisie ne peut pas exécuter de script.
 */
const props = defineProps<{
  description: string
  /** La description affichée attend la réponse d'OP. */
  pending?: boolean
  /** OP vient de refuser la modification : la description affichée est revenue à l'état réel. */
  rejected?: boolean
  /**
   * La description a changé dans OP pendant la saisie : en éditant, la version d'OP s'affiche
   * au-dessus du brouillon, pour les comparer avant d'enregistrer.
   */
  showCurrent?: boolean
}>()

const emit = defineEmits<{ save: [description: string] }>()

const id = useId()
const { isDark } = useThemeMode()
const theme = computed(() => isDark.value
  ? 'dark'
  : 'light')

const editing = ref(false)
const draft = ref('')
const editButton = useTemplateRef('editButton')
const editorBox = useTemplateRef('editorBox')

/**
 * Défilement de la page avant l'éditeur. Agrandi, md-editor-v3 bloque celui de la page,
 * et ne le rend pas si l'éditeur se ferme sans le réduire (enregistrement par Ctrl+S).
 */
let pageOverflow = ''

async function edit(text = props.description) {
  draft.value = text
  pageOverflow = document.body.style.overflow
  editing.value = true
  await nextTick()
  editorBox.value?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()
}

function closeEditor() {
  if (!editing.value)
    return
  editing.value = false
  document.body.style.overflow = pageOverflow
}

onBeforeUnmount(closeEditor)

async function stopEditing() {
  closeEditor()
  await nextTick()
  ;(editButton.value?.$el as HTMLElement | undefined)?.focus()
}

function save() {
  if (draft.value !== props.description)
    emit('save', draft.value)
  return stopEditing()
}

/**
 * Rend à l'éditeur un texte refusé par OP, pour le corriger sans le réécrire. Si l'éditeur
 * est déjà rouvert, la saisie en cours est plus récente : elle reste.
 */
function restore(text: string) {
  if (!editing.value)
    void edit(text)
}

defineExpose({ restore })

/** Une longue description est coupée à six lignes : le lien affiche la suite sur place. */
const expanded = ref(false)
const overflowing = shallowRef(false)
const preview = useTemplateRef('preview')

useResizeObserver(preview, () => {
  const element = preview.value
  overflowing.value = !!element && element.scrollHeight > element.clientHeight + 1
})

watch(() => props.description, () => {
  expanded.value = false
})
</script>

<template>
  <section class="description" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`">
      Description
    </h3>

    <div v-if="editing" ref="editorBox" class="editor">
      <details v-if="showCurrent" class="current" open>
        <summary>Version actuelle dans OpenProject</summary>
        <div class="preview expanded">
          <MdPreview
            v-if="description"
            :id="`${id}-current`"
            :model-value="description"
            :language="MARKDOWN_LANGUAGE"
            :theme="theme"
            :sanitize="sanitizePreview"
            no-highlight
            no-mermaid
            no-katex
            no-echarts
            no-img-zoom-in
            :code-foldable="false"
          />
          <p v-else class="empty">
            Aucune description.
          </p>
        </div>
      </details>
      <MdEditor
        v-model="draft"
        :editor-id="`${id}-editor`"
        :language="MARKDOWN_LANGUAGE"
        :theme="theme"
        :toolbars="[...MARKDOWN_TOOLBARS]"
        :footers="[]"
        :preview="false"
        :sanitize="sanitizePreview"
        no-highlight
        no-mermaid
        no-katex
        no-echarts
        no-prettier
        no-upload-img
        placeholder="Décrivez la tâche en markdown"
        @save="save"
      />
      <div class="actions">
        <Button @click="save">
          Enregistrer la description
        </Button>
        <Button variant="ghost" @click="stopEditing">
          Annuler
        </Button>
      </div>
    </div>

    <template v-else>
      <div
        v-if="description"
        :id="`${id}-preview`"
        ref="preview"
        class="preview"
        :class="{ expanded, pending, rejected }"
        :title="pending ? 'Enregistrement dans OpenProject…' : undefined"
      >
        <MdPreview
          :id="`${id}-md`"
          :model-value="description"
          :language="MARKDOWN_LANGUAGE"
          :theme="theme"
          :sanitize="sanitizePreview"
          no-highlight
          no-mermaid
          no-katex
          no-echarts
          no-img-zoom-in
          :code-foldable="false"
        />
      </div>
      <div class="actions">
        <Button
          v-if="description && (overflowing || expanded)"
          variant="link"
          class="link"
          :aria-controls="`${id}-preview`"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Réduire la description' : 'Afficher toute la description' }}
        </Button>
        <Button ref="editButton" variant="link" class="link" @click="edit()">
          {{ description ? 'Modifier la description' : 'Ajouter une description' }}
        </Button>
      </div>
    </template>
  </section>
</template>

<style scoped>
h3 {
  margin: 0 0 var(--op-space-2);
  font-size: var(--op-text-sm);
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.preview {
  max-height: 6lh;
  overflow: hidden;
  border-radius: var(--p-border-radius-md);
  font-size: var(--op-text-md);
  line-height: 1.5;
}

.preview.expanded {
  max-height: none;
}

/* En route vers OP : le trait pointillé dit que la description n'est pas encore enregistrée. */
.preview.pending {
  text-decoration: underline dashed var(--p-primary-color);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25em;
}

/* Refusée par OP : la description revenue à l'état réel est marquée, l'alerte dit pourquoi. */
.preview.rejected {
  background: var(--p-app-error-background);
}

.preview.rejected :deep(.md-editor-preview) {
  color: var(--p-app-error-color);
}

/* La version d'OP, à comparer au brouillon : à part de l'éditeur, repliable. */
.current {
  margin-bottom: var(--op-space-3);
  padding: var(--op-space-2) var(--op-space-3);
  border: 1px solid var(--p-app-line);
  border-radius: var(--p-border-radius-md);
}

.current summary {
  cursor: pointer;
  font-size: var(--op-text-sm);
  color: var(--p-text-muted-color);
}

.current .preview {
  margin-top: var(--op-space-2);
}

.current .empty {
  margin: 0;
  color: var(--p-text-muted-color);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--op-space-2) var(--op-space-4);
  margin-top: var(--op-space-2);
}

.link {
  height: auto;
  padding: 0;
}

/* L'aperçu reprend le texte de l'app, pas le thème de md-editor-v3. */
.preview :deep(.md-editor) {
  --md-bk-color: transparent;

  font-family: inherit;
}

.preview :deep(.md-editor-preview) {
  font-size: inherit;
  line-height: inherit;
  color: var(--p-text-color);
  word-break: normal;
  overflow-wrap: anywhere;
}

.preview :deep(.md-editor-preview > :first-child) {
  margin-top: 0;
}

/* Le reset de Tailwind retire les puces et les numéros des listes. */
.description :deep(.md-editor-preview ul) {
  list-style: disc;
}

.description :deep(.md-editor-preview ol) {
  list-style: decimal;
}

.description :deep(.md-editor-preview .task-list-item) {
  list-style: none;
}

/* Le panneau est étroit : les outils passent à la ligne plutôt que de défiler hors de vue. */
.editor :deep(.md-editor-toolbar) {
  align-items: flex-start;
}

.editor :deep(.md-editor-toolbar-left) {
  flex-wrap: wrap;
}

.editor :deep(.md-editor-toolbar-right) {
  flex-shrink: 0;
}

.editor :deep(.md-editor) {
  height: 18rem;
  font-family: inherit;
  border-radius: var(--p-border-radius-md);
}
</style>
