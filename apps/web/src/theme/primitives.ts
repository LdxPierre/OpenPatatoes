// Couleurs brutes du design « Vitelotte ». Aucun composant ne les utilise
// directement : elles passent par les rôles définis dans preset.ts.

/** Violet de la pomme de terre vitelotte : la marque et la sélection. */
export const vitelotte = {
  50: '#F7F3FA',
  100: '#EFE7F5',
  200: '#E1D2EC',
  300: '#C7A8E0',
  400: '#A880C6',
  500: '#7E5A9B',
  600: '#5F3D78',
  700: '#4A2B5E',
  800: '#3A2148',
  900: '#2B1A38',
  950: '#1E1227',
} as const

/**
 * Gris teinté de violet pour les fonds, traits et textes secondaires.
 * Même échelle en clair et en sombre : 50 est le fond clair, 950 le fond sombre.
 */
export const terre = {
  0: '#FFFFFF',
  50: '#FAF9FB',
  100: '#F4F0F7',
  200: '#E7E2EC',
  300: '#CFC8D6',
  400: '#A79EB3',
  500: '#8E8599',
  600: '#6B6375',
  700: '#332C3B',
  800: '#28222E',
  900: '#221D28',
  950: '#1B1720',
} as const
