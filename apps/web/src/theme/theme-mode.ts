import { computed, readonly, ref } from 'vue'

// Thème choisi par l'utilisateur : suivre le système, ou forcer clair/sombre.
// Le choix est gardé dans le navigateur ; « Système » est la valeur par défaut.

/** Classe posée sur <html> quand le thème sombre est actif. */
export const darkModeClass = 'op-dark'

export type ThemeMode = 'system' | 'light' | 'dark'

export const themeModeLabels: Record<ThemeMode, string> = {
  system: 'Système',
  light: 'Clair',
  dark: 'Sombre',
}

const storageKey = 'op-theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

const mode = ref<ThemeMode>(readStoredMode())
const prefersDark = ref(systemDark.matches)
const isDark = computed(() => mode.value === 'dark' || (mode.value === 'system' && prefersDark.value))

systemDark.addEventListener('change', (event) => {
  prefersDark.value = event.matches
  apply()
})

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(storageKey)
  return stored === 'light' || stored === 'dark'
    ? stored
    : 'system'
}

function apply() {
  document.documentElement.classList.toggle(darkModeClass, isDark.value)
}

function setMode(next: ThemeMode) {
  mode.value = next
  if (next === 'system')
    localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, next)
  apply()
}

/** À appeler avant le montage de l'app, pour éviter un flash du mauvais thème. */
export const applyThemeMode = apply

export function useThemeMode() {
  return {
    mode: readonly(mode),
    isDark,
    setMode,
  }
}
