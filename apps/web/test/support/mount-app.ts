import { VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, vi } from 'vitest'
import { h } from 'vue'
import App from '@/App.vue'
import { router } from '@/router'
import { queryClient } from '@/shared/query-client'

/** Page privée de test, pour vérifier `?redirect=` ailleurs que sur l'accueil. */
export const PRIVATE_TEST_PATH = '/test/privee'

if (!router.hasRoute('test-private')) {
  router.addRoute({
    path: PRIVATE_TEST_PATH,
    name: 'test-private',
    component: {
      render: () => h('p', 'Page privée'),
    },
  })
}

/** Monte l'application complète (routeur, garde, cache) sur le chemin donné. */
export async function mountApp(path: string) {
  await router.push(path)
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [
        router,
        [
          VueQueryPlugin,
          { queryClient },
        ],
      ],
    },
  })
  await flushPromises()
  return wrapper
}

export function currentPath() {
  return router.currentRoute.value.fullPath
}

/** Attend la fin d'une navigation, le temps de charger une page à la demande. */
export async function expectNavigatedTo(fullPath: string) {
  await vi.waitFor(() => expect(currentPath()).toBe(fullPath))
  await flushPromises()
}
