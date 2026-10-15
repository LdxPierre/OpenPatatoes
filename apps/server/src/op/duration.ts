/**
 * Durées ISO 8601 d'OP (`PT2H30M`, `P1DT2H`...) vers des heures décimales.
 *
 * OP 17 émet ses durées depuis un nombre d'heures (gem `ruby-duration`) : 26 h donnent
 * `P1DT2H`, un jour vaut donc 24 h, pas une journée de travail. Les semaines (7 × 24 h)
 * sont acceptées par prudence ; mois et années, de longueur variable, donnent `null`.
 * Aucun arrondi : la valeur exacte doit survivre à une relecture puis une réécriture.
 */

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const ISO_DURATION = new RegExp(
  // Au moins une composante après `P`, et au moins une après `T` s'il est présent.
  String.raw`^P(?=\d|T\d)(?:(?<weeks>${NUMBER})W)?(?:(?<days>${NUMBER})D)?`
  + String.raw`(?:T(?=\d)(?:(?<hours>${NUMBER})H)?(?:(?<minutes>${NUMBER})M)?(?:(?<seconds>${NUMBER})S)?)?$`,
)

const HOURS_PER_UNIT = {
  weeks: 168,
  days: 24,
  hours: 1,
  minutes: 1 / 60,
  seconds: 1 / 3600,
} as const

export function isoDurationToHours(duration: string): number | null {
  const groups = ISO_DURATION.exec(duration)?.groups
  if (!groups)
    return null

  let hours = 0
  for (const [unit, factor] of Object.entries(HOURS_PER_UNIT)) {
    const value = groups[unit]
    if (value !== undefined)
      hours += Number(value.replace(',', '.')) * factor
  }
  return hours
}
