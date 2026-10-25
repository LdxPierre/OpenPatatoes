/**
 * Durées ISO 8601 d'OP (`PT2H30M`, `P1DT2H`...) vers des heures décimales.
 *
 * OP 17 émet ses durées depuis un nombre d'heures (gem `ruby-duration`) : 26 h donnent
 * `P1DT2H`, un jour vaut donc 24 h, pas une journée de travail. Les semaines (7 × 24 h)
 * sont acceptées par prudence, seules comme le veut la norme ; mois et années, de longueur
 * variable, donnent `null`. Comme dans la norme, seule la dernière composante peut être décimale.
 * Aucun arrondi : la valeur exacte doit survivre à une relecture puis une réécriture.
 */

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const ISO_DURATION = new RegExp(
  // Au moins une composante après `P`, et au moins une après `T` s'il est présent.
  String.raw`^P(?:(?<weeks>${NUMBER})W|(?=\d|T\d)(?:(?<days>${NUMBER})D)?`
  + String.raw`(?:T(?=\d)(?:(?<hours>${NUMBER})H)?(?:(?<minutes>${NUMBER})M)?(?:(?<seconds>${NUMBER})S)?)?)$`,
)

/** Minutes et secondes sont divisées directement : multiplier par `1 / 60` ajouterait un arrondi. */
const TO_HOURS = {
  weeks: n => n * 168,
  days: n => n * 24,
  hours: n => n,
  minutes: n => n / 60,
  seconds: n => n / 3600,
} satisfies Record<string, (n: number) => number>

export function isoDurationToHours(duration: string): number | null {
  const groups = ISO_DURATION.exec(duration)?.groups
  if (!groups)
    return null

  const parts = Object.entries(TO_HOURS).filter(([unit]) => groups[unit] !== undefined)
  if (parts.slice(0, -1).some(([unit]) => /[.,]/.test(groups[unit]!)))
    return null

  let hours = 0
  for (const [unit, toHours] of parts)
    hours += toHours(Number(groups[unit]!.replace(',', '.')))
  return hours
}
