import '@fontsource-variable/atkinson-hyperlegible-next'
import './base.css'
import type { PrimeVueConfiguration } from 'primevue/config'
import { darkModeClass, Vitelotte } from './preset'

export { statusFamilies, statusFamilyLabels, statusFamilyOf, statusFamilyVars } from './status-families'
export type { StatusFamily } from './status-families'
export { applyThemeMode, themeModeLabels, useThemeMode } from './theme-mode'
export type { ThemeMode } from './theme-mode'

/** Options à passer à `app.use(PrimeVue, primeVueTheme)`. */
export const primeVueTheme: PrimeVueConfiguration = {
  theme: {
    preset: Vitelotte,
    options: { darkModeSelector: `.${darkModeClass}` },
  },
}
