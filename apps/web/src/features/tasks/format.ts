/** Heures décimales, arrondies au centième pour l'affichage : « 12,5 h ». */
export function formatHours(hours: number) {
  return `${hours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}\u202Fh`
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
