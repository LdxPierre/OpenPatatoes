import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import { terre, vitelotte } from './primitives'

// Preset PrimeVue « Vitelotte ». Chaque rôle donne sa valeur claire et sombre
// avec light-dark() ; PrimeVue bascule via la classe posée par theme-mode.ts.
//
// Les jetons propres à l'app sont sous `extend.app` et deviennent des
// variables CSS --p-app-… (par exemple --p-app-status-on-hold-color).

/** Classe posée sur <html> quand le thème sombre est actif. */
export const darkModeClass = 'op-dark'

const feedback = (light: [string, string], dark: [string, string]) => ({
  background: `light-dark(${light[0]}, ${dark[0]})`,
  color: `light-dark(${light[1]}, ${dark[1]})`,
})

const messageSeverity = (group: string) => ({
  background: `{app.${group}.background}`,
  borderColor: `{app.${group}.background}`,
  color: `{app.${group}.color}`,
  shadow: 'none',
  outlined: { color: `{app.${group}.color}`, borderColor: `{app.${group}.color}` },
  simple: { color: `{app.${group}.color}` },
})

const scale = (name: string, palette: object) =>
  Object.fromEntries(Object.keys(palette).map((step) => [step, `{${name}.${step}}`]))

export const Vitelotte = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '10px' },
  },
  semantic: {
    transitionDuration: '0.15s',
    focusRing: { width: '2px', style: 'solid', color: '{primary.color}', offset: '2px', shadow: 'none' },
    primary: {
      ...scale('vitelotte', vitelotte),
      color: 'light-dark({vitelotte.700}, {vitelotte.300})',
      contrastColor: 'light-dark(#FFFFFF, {terre.950})',
      hoverColor: 'light-dark({vitelotte.800}, {vitelotte.200})',
      activeColor: 'light-dark({vitelotte.900}, {vitelotte.100})',
    },
    surface: scale('terre', terre),
    text: {
      color: 'light-dark(#2A2530, #ECE7F1)',
      hoverColor: 'light-dark(#1B1720, #FFFFFF)',
      mutedColor: 'light-dark({terre.600}, {terre.400})',
      hoverMutedColor: 'light-dark({terre.700}, {terre.300})',
    },
    content: {
      background: 'light-dark({terre.0}, {terre.900})',
      hoverBackground: 'light-dark({terre.100}, {terre.800})',
      borderColor: 'light-dark({terre.200}, {terre.700})',
    },
    highlight: {
      background: 'light-dark({vitelotte.100}, #33263F)',
      focusBackground: 'light-dark({vitelotte.200}, #3D2D4B)',
      color: '{text.color}',
      focusColor: '{text.color}',
    },
    formField: {
      background: 'light-dark({terre.0}, {terre.900})',
      // 3:1 minimum contre le fond : un champ doit se voir sans le survoler.
      borderColor: 'light-dark({terre.500}, #766C80)',
      hoverBorderColor: 'light-dark({terre.600}, {terre.400})',
      color: '{text.color}',
      placeholderColor: '{text.muted.color}',
    },
    overlay: {
      select: { shadow: '{app.shadow.lift}' },
      popover: { shadow: '{app.shadow.lift}' },
      modal: { shadow: '{app.shadow.lift}' },
      navigation: { shadow: '{app.shadow.lift}' },
    },
  },
  extend: {
    vitelotte,
    terre,
    app: {
      background: 'light-dark({terre.50}, {terre.950})',
      line: 'light-dark({terre.200}, {terre.700})',
      hover: 'light-dark({terre.100}, {terre.800})',
      shadow: {
        lift: '0 6px 18px light-dark(rgba(74, 43, 94, 0.18), rgba(0, 0, 0, 0.45))',
      },
      tree: {
        rowHeight: '2rem',
        indent: '1.25rem',
        guideWidth: '2px',
        // Décoratif : le retrait porte la hiérarchie, ce trait n'a pas besoin de 3:1.
        guide: 'light-dark(#CDBDDA, #4E4258)',
      },
      status: {
        new: feedback(['#EEEBF1', '#5A5363'], ['#2C2732', '#B8AFC3']),
        planned: feedback(['#E3EBF6', '#2D4F7C'], ['#1E2A3B', '#9DBBE3']),
        active: feedback(['#EADFF3', '#4A2B5E'], ['#3A2A4A', '#D6BFEB']),
        onHold: feedback(['#F7EACB', '#7A5200'], ['#372C15', '#EBC56E']),
        closed: feedback(['#DCEBDF', '#2F6A3C'], ['#1D3224', '#8FCB9B']),
      },
      warn: feedback(['#F7EACB', '#5C3E00'], ['#372C15', '#F3D79A']),
      error: feedback(['#F8E3E3', '#8A2A2A'], ['#3A1F22', '#F0A8A8']),
    },
  },
  components: {
    message: {
      info: messageSeverity('status.planned'),
      success: messageSeverity('status.closed'),
      warn: messageSeverity('warn'),
      error: messageSeverity('error'),
    },
  },
})
