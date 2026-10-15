/**
 * Durées ISO 8601 d'OP (`PT2H30M`, `P1DT2H`...) vers des heures décimales.
 *
 * Semaines et jours valent 7 × 24 h et 24 h ; mois et années, de longueur variable,
 * ne sont pas convertibles et donnent `null`. Le résultat est arrondi au centième d'heure.
 */

const ISO_DURATION =
  /^P(?:(?<weeks>\d+(?:[.,]\d+)?)W)?(?:(?<days>\d+(?:[.,]\d+)?)D)?(?:T(?:(?<hours>\d+(?:[.,]\d+)?)H)?(?:(?<minutes>\d+(?:[.,]\d+)?)M)?(?:(?<seconds>\d+(?:[.,]\d+)?)S)?)?$/;

const HOURS_PER_UNIT = { weeks: 168, days: 24, hours: 1, minutes: 1 / 60, seconds: 1 / 3600 } as const;

export function isoDurationToHours(duration: string): number | null {
  // `P` ou `PT` seuls ne portent aucune valeur.
  if (duration === "P" || duration.endsWith("T")) return null;
  const groups = ISO_DURATION.exec(duration)?.groups;
  if (!groups) return null;

  let hours = 0;
  for (const [unit, factor] of Object.entries(HOURS_PER_UNIT)) {
    const value = groups[unit];
    if (value !== undefined) hours += Number(value.replace(",", ".")) * factor;
  }
  return Math.round(hours * 100) / 100;
}
