import { createRouter, createWebHistory } from 'vue-router'
import { sessionQueryOptions } from '@/features/auth/session'
import { queryClient } from '@/shared/query-client'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page accessible sans session. */
    public?: boolean
    /** Page réservée aux visiteurs sans session (connexion). */
    guestOnly?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/features/home/HomePage.vue'),
    },
    {
      path: '/connexion',
      name: 'login',
      component: () => import('@/features/auth/LoginPage.vue'),
      meta: { public: true, guestOnly: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/features/not-found/NotFoundPage.vue'),
      meta: { public: true },
    },
  ],
})

router.beforeEach(async (to) => {
  // Si l'API ne répond pas, on passe par la connexion : la page dira ce qui se passe.
  const user = await queryClient.ensureQueryData(sessionQueryOptions).catch(() => null)
  if (!user && !to.meta.public) {
    return {
      name: 'login',
      query: to.fullPath === '/'
        ? {}
        : { redirect: to.fullPath },
    }
  }
  if (user && to.meta.guestOnly)
    return { name: 'home' }
})
