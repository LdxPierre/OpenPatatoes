import type { LocationQueryValue } from 'vue-router'

/** Cible de `?redirect=`. Seul un chemin interne est accepté, pour ne pas renvoyer vers un autre site. */
export function redirectTarget(redirect: LocationQueryValue | LocationQueryValue[] | undefined): string {
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/'
}
