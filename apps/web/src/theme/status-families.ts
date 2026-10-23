// Familles d'état : la couleur d'un statut OP vient de sa famille, jamais de
// la couleur configurée dans OP. Le badge affiche toujours le nom du statut OP.

export const statusFamilies = ['new', 'planned', 'active', 'onHold', 'closed'] as const

export type StatusFamily = (typeof statusFamilies)[number]

export const statusFamilyLabels: Record<StatusFamily, string> = {
  new: 'Nouveau',
  planned: 'Prévu',
  active: 'En cours',
  onHold: 'En attente',
  closed: 'Fermé',
}

// Statuts par défaut d'OpenProject, en anglais et en français. Les noms sont
// comparés sans casse ni accents.
const defaultStatuses: Record<StatusFamily, readonly string[]> = {
  new: ['New', 'Nouveau'],
  planned: [
    'In specification', 'Specified', 'Confirmed', 'To be scheduled', 'Scheduled',
    'En spécification', 'Spécifié', 'Confirmé', 'À planifier', 'Planifié',
  ],
  active: [
    'In progress', 'Developed', 'In testing', 'Tested',
    'En cours', 'Développé', 'En test', 'Testé',
  ],
  onHold: ['On hold', 'Test failed', 'En attente', 'Test échoué'],
  closed: ['Closed', 'Rejected', 'Fermé', 'Rejeté'],
}

const normalize = (name: string) =>
  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

const familyByName = new Map<string, StatusFamily>(
  statusFamilies.flatMap((family) =>
    defaultStatuses[family].map((name) => [normalize(name), family] as const),
  ),
)

/**
 * Famille d'un statut OP. Un statut inconnu (ajouté par un administrateur OP)
 * tombe dans « Fermé » s'il est marqué fermé dans OP, sinon dans « Nouveau ».
 */
export function statusFamilyOf(status: { name: string; isClosed: boolean }): StatusFamily {
  return familyByName.get(normalize(status.name)) ?? (status.isClosed ? 'closed' : 'new')
}

/** Variables CSS de la famille, produites par le preset (voir preset.ts). */
export function statusFamilyVars(family: StatusFamily) {
  return {
    background: `var(--p-app-status-${kebab(family)}-background)`,
    color: `var(--p-app-status-${kebab(family)}-color)`,
  }
}

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
