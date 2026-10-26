<script setup lang="ts">
import { nextTick, ref, useId, useTemplateRef } from 'vue'
import { formatHours, formatHoursNumber, hoursInputText, parseHours } from './format'

/**
 * Temps d'une tâche, modifiable sur place : le nombre devient un champ de même taille,
 * pour que rien ne bouge autour. Entrée ou la sortie du champ enregistrent, Échap annule.
 */
const props = defineProps<{
  label: string
  value: number | null
  /** La valeur affichée attend la réponse d'OP. */
  pending?: boolean
  /** OP vient de refuser la modification : la valeur affichée est revenue à l'état réel. */
  rejected?: boolean
}>()

const emit = defineEmits<{ save: [hours: number | null] }>()

const editing = ref(false)
const text = ref('')
const invalid = ref(false)
const input = useTemplateRef('input')
const valueButton = useTemplateRef('valueButton')
const id = useId()

async function edit() {
  text.value = hoursInputText(props.value)
  invalid.value = false
  editing.value = true
  await nextTick()
  input.value?.select()
}

async function stopEditing(refocus: boolean) {
  editing.value = false
  if (refocus) {
    await nextTick()
    valueButton.value?.focus()
  }
}

function leave() {
  // Une saisie invalide abandonnée n'a rien à enregistrer : la valeur d'origine revient.
  if (parseHours(text.value) === undefined)
    stopEditing(false)
  else
    save(false)
}

function save(refocus: boolean) {
  if (!editing.value)
    return
  // Rien de modifié : on n'écrit pas une valeur arrondie à la place de celle d'OP.
  if (text.value === hoursInputText(props.value))
    return stopEditing(refocus)
  const hours = parseHours(text.value)
  if (hours === undefined) {
    invalid.value = true
    return
  }
  if (hours !== props.value)
    emit('save', hours)
  return stopEditing(refocus)
}

function cancel() {
  stopEditing(true)
}
</script>

<template>
  <div class="hour">
    <dt :id="`${id}-label`">
      {{ label }}
    </dt>
    <dd v-if="editing" class="box edit">
      <input
        ref="input"
        v-model="text"
        class="op-num"
        inputmode="decimal"
        autocomplete="off"
        :aria-labelledby="`${id}-label`"
        :aria-invalid="invalid || undefined"
        :aria-describedby="invalid ? `${id}-error` : undefined"
        @keydown.enter.prevent="save(true)"
        @keydown.escape.stop.prevent="cancel"
        @blur="leave"
        @input="invalid = false"
      >
      <span class="unit" aria-hidden="true">&#x202F;h</span>
      <span v-if="invalid" :id="`${id}-error`" class="invalid" role="alert">Saisissez des heures, par exemple 2,5 ou 1 h 30.</span>
    </dd>
    <dd v-else>
      <button
        ref="valueButton"
        type="button"
        class="box value"
        :class="{ pending, rejected, empty: value === null }"
        :aria-label="`${label} : ${value === null ? 'non renseigné' : formatHours(value)}. Modifier`"
        :title="pending ? 'Enregistrement dans OpenProject…' : undefined"
        @click="edit"
      >
        <span v-if="value === null">Non renseigné</span>
        <template v-else>
          <span class="op-num">{{ formatHoursNumber(value) }}</span><span class="unit">&#x202F;h</span>
        </template>
      </button>
    </dd>
  </div>
</template>

<style scoped>
.hour {
  /* La valeur déborde de son fond au survol, sans décaler le texte. */
  --bleed: var(--op-space-1);

  display: flex;
  flex-wrap: wrap;
  /*
   * Centré dans la ligne de 28 px, et non sur la ligne de base : celle-ci dépend de la taille
   * du texte, qui change entre une valeur, « Non renseigné » et le champ de saisie.
   */
  align-items: center;
  gap: 0 var(--op-space-2);
}

dt {
  font-size: var(--op-text-xs);
  color: var(--p-text-muted-color);
}

dd {
  margin: 0;
}

/*
 * Même boîte en lecture et en saisie : largeur fixe, nombre aligné à droite contre son unité.
 * Rien ne bouge quand la valeur devient un champ, ni d'une saisie à l'autre.
 * La largeur tient « Non renseigné » comme « 1 h 30 ».
 */
.box {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: calc(5.5rem + 2 * var(--bleed));
  height: 1.75rem;
  margin: 0 calc(-1 * var(--bleed));
  padding: 0 var(--bleed);
  border-radius: var(--p-border-radius-md);
  font-size: var(--op-text-lg);
  font-weight: 500;
  color: var(--p-text-color);
}

.value {
  border: 0;
  background: none;
  font-family: inherit;
  cursor: text;
}

.value:hover {
  background: var(--p-app-hover);
}

.value.empty {
  font-size: var(--op-text-sm);
  font-weight: 400;
  color: var(--p-text-muted-color);
}

/* En route vers OP : le trait pointillé dit que la valeur n'est pas encore enregistrée. */
.value.pending .op-num {
  text-decoration: underline dashed var(--p-primary-color);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.25em;
}

/* Refusée par OP : la valeur revenue à l'état réel est marquée, l'alerte dit pourquoi. */
.value.rejected {
  background: var(--p-app-error-background);
  color: var(--p-app-error-color);
}

/* Le contour de focus est porté par la boîte, pour qu'il ait la même taille que la valeur. */
.edit {
  position: relative;
  background: var(--p-content-background);
}

.edit:focus-within {
  outline: var(--p-focus-ring-width) var(--p-focus-ring-style) var(--p-focus-ring-color);
  outline-offset: 0;
}

.edit:has([aria-invalid]) {
  outline-color: var(--p-app-error-color);
}

.edit input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: right;
  outline: none;
}

/* Le message flotte sous le champ, sans déplacer les autres heures. */
.invalid {
  position: absolute;
  top: calc(100% + var(--op-space-1));
  left: 0;
  z-index: 1;
  padding: var(--op-space-1) var(--op-space-2);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
  box-shadow: var(--p-app-shadow-lift);
  width: max-content;
  max-width: 11rem;
  font-size: var(--op-text-xs);
  color: var(--p-app-error-color);
}
</style>
