import { createRouter, createWebHistory } from 'vue-router'
import { sessionQueryOptions } from '@/features/auth/session'
import { queryClient } from '@/shared/query-client'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page accessible sans session. */
    public?: boolean
    /** Page réservée aux visiteurs sans session (connexion). */
    guestOnly?: boolean
    /** Page réservée aux utilisateurs sans jeton OP (saisie du jeton). */
    withoutOpConnection?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/features/projects/ProjectsPage.vue'),
    },
    {
      // Au plus 15 chiffres : l'identifiant reste un entier sûr une fois converti en nombre.
      path: '/projets/:id([1-9]\\d{0,14})',
      name: 'project',
      component: () => import('@/features/projects/ProjectPage.vue'),
      props: route => ({
        id: Number(route.params.id),
        taskId: route.params.taskId
          ? Number(route.params.taskId)
          : null,
      }),
      children: [
        {
          // Le détail s'ouvre à côté de l'arbre : l'adresse garde le projet.
          path: 'taches/:taskId([1-9]\\d{0,14})',
          name: 'task',
          component: () => import('@/features/tasks/TaskDetailPanel.vue'),
          props: route => ({
            projectId: Number(route.params.id),
            taskId: Number(route.params.taskId),
          }),
        },
      ],
    },
    {
      path: '/connexion',
      name: 'login',
      component: () => import('@/features/auth/LoginPage.vue'),
      meta: { public: true, guestOnly: true },
    },
    {
      path: '/jeton-op',
      name: 'op-token',
      component: () => import('@/features/op-connection/OpTokenPage.vue'),
      meta: { withoutOpConnection: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/features/not-found/NotFoundPage.vue'),
      meta: { public: true },
    },
  ],
})

/** `?redirect=` vers la page demandée, sauf pour l'accueil où l'on revient de toute façon. */
function redirectQuery(fullPath: string) {
  return fullPath === '/'
    ? {}
    : { redirect: fullPath }
}

router.beforeEach(async (to) => {
  // Si l'API ne répond pas, on passe par la connexion : la page dira ce qui se passe.
  const user = await queryClient.ensureQueryData(sessionQueryOptions).catch(() => null)
  if (!user && !to.meta.public) {
    return {
      name: 'login',
      query: redirectQuery(to.fullPath),
    }
  }
  if (user && to.meta.guestOnly)
    return { name: 'home' }
  // Sans jeton OP, l'app ne peut rien afficher : on le demande avant toute page privée.
  if (user && !user.opConnected && !to.meta.public && !to.meta.withoutOpConnection) {
    return {
      name: 'op-token',
      query: redirectQuery(to.fullPath),
    }
  }
  if (user?.opConnected && to.meta.withoutOpConnection)
    return { name: 'home' }
})
