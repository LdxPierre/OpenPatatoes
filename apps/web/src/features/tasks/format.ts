import { TASK_HOURS_MAX, TASK_HOURS_MIN } from '@openpatatoes/shared'

/** Nombre d'heures décimales, arrondi au centième pour l'affichage, sans unité : « 12,5 ». */
export function formatHoursNumber(hours: number) {
  return hours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

/** Heures décimales, arrondies au centième pour l'affichage : « 12,5 h ». */
export function formatHours(hours: number) {
  return `${formatHoursNumber(hours)}\u202Fh`
}

/** Heures à modifier dans un champ : « 12,5 », sans unité ni séparateur de milliers. */
export function hoursInputText(hours: number | null) {
  return hours === null
    ? ''
    : hours.toLocaleString('fr-FR', { maximumFractionDigits: 2, useGrouping: false })
}

/**
 * Heures saisies : « 2,5 », « 2.5 », « 2 h » ou « 1 h 30 ». Un champ vide donne `null`, qui vide
 * la valeur dans OP. Renvoie `undefined` si la saisie n'est pas un temps accepté.
 */
export function parseHours(text: string): number | null | undefined {
  const compact = text.replace(/\s/g, '').toLowerCase()
  if (compact === '')
    return null
  const match = /^(\d+(?:[.,]\d+)?)(?:h(?:(\d{1,2})(?:min)?)?)?$/.exec(compact)
  if (!match)
    return undefined
  const minutes = match[2] === undefined
    ? 0
    : Number(match[2])
  // Les minutes ne suivent qu'un nombre d'heures entier, et restent sous l'heure.
  if (minutes >= 60 || (minutes > 0 && /[.,]/.test(match[1]!)))
    return undefined
  const hours = Number(match[1]!.replace(',', '.')) + minutes / 60
  if (hours !== 0 && (hours < TASK_HOURS_MIN || hours > TASK_HOURS_MAX))
    return undefined
  return hours
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Jour ISO (`2026-10-31`) en millisecondes UTC : les jours se comparent sans fuseau horaire. */
function dayToUtc(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year!, month! - 1, date!)
}

/** Le jour local de `now`, au même format. */
function todayUtc(now: Date) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Jour court : « 31 oct. », avec l'année si ce n'est pas l'année en cours. */
export function formatDay(day: string, now = new Date()) {
  const time = dayToUtc(day)
  return new Date(time).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: new Date(time).getUTCFullYear() === now.getFullYear()
      ? undefined
      : 'numeric',
    timeZone: 'UTC',
  })
}

/** Jour complet, pour l'infobulle : « vendredi 31 octobre 2026 ». */
export function formatFullDay(day: string) {
  return new Date(dayToUtc(day)).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Échéance relative à aujourd'hui : « dans 6 jours », « demain », « en retard de 2 jours ».
 * `overdue` signale une échéance dépassée : à l'interface de décider si elle compte (tâche fermée ou non).
 */
export function dueHint(day: string, now = new Date()) {
  const days = Math.round((dayToUtc(day) - todayUtc(now)) / DAY_MS)
  if (days === 0)
    return { text: 'aujourd\'hui', overdue: false }
  if (days === 1)
    return { text: 'demain', overdue: false }
  if (days > 1)
    return { text: `dans ${days} jours`, overdue: false }
  return {
    text: days === -1
      ? 'en retard d\'un jour'
      : `en retard de ${-days} jours`,
    overdue: true,
  }
}

/**
 * Moment d'une activité, court : « aujourd'hui », « hier », puis le jour (« 14 oct. »).
 * Les jours se comptent en heure locale.
 */
export function formatMoment(dateTime: string, now = new Date()) {
  const moment = new Date(dateTime)
  const day = Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate())
  const days = Math.round((todayUtc(now) - day) / DAY_MS)
  if (days === 0)
    return 'aujourd\'hui'
  if (days === 1)
    return 'hier'
  return formatDay(new Date(day).toISOString().slice(0, 10), now)
}

/** Moment complet, pour l'infobulle : « 14 octobre 2026 à 09:12 ». */
export function formatFullMoment(dateTime: string) {
  return new Date(dateTime).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}
