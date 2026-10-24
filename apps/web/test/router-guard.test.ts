import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { currentPath, mountApp, PRIVATE_TEST_PATH } from './support/mount-app'

describe('garde des pages', () => {
  describe('sans session', () => {
    it('renvoie vers la connexion en retenant la page demandée', async () => {
      fakeApi.on('GET', '/auth/me', () => {
        throw new ApiError(401, 'unauthenticated')
      })

      await mountApp(PRIVATE_TEST_PATH)

      expect(currentPath()).toBe(`/connexion?redirect=${PRIVATE_TEST_PATH}`)
    })

    it('renvoie vers la connexion depuis la page du jeton OP', async () => {
      fakeApi.on('GET', '/auth/me', () => {
        throw new ApiError(401, 'unauthenticated')
      })

      await mountApp('/jeton-op')

      expect(currentPath()).toBe('/connexion?redirect=/jeton-op')
    })
  })

  describe('connecté sans jeton OP', () => {
    it('demande le jeton avant une page privée, en retenant la page demandée', async () => {
      fakeApi.signedIn({ opConnected: false })

      const wrapper = await mountApp(PRIVATE_TEST_PATH)

      expect(currentPath()).toBe(`/jeton-op?redirect=${PRIVATE_TEST_PATH}`)
      expect(wrapper.text()).toContain('Connectez OpenProject')
    })

    it('demande le jeton à la place de l\'accueil', async () => {
      fakeApi.signedIn({ opConnected: false })

      await mountApp('/')

      expect(currentPath()).toBe('/jeton-op')
    })

    it('applique la même règle à l\'administrateur', async () => {
      fakeApi.signedIn({ opConnected: false, isAdmin: true })

      await mountApp(PRIVATE_TEST_PATH)

      expect(currentPath()).toBe(`/jeton-op?redirect=${PRIVATE_TEST_PATH}`)
    })

    it('laisse accéder aux pages publiques', async () => {
      fakeApi.signedIn({ opConnected: false })

      const wrapper = await mountApp('/page-inconnue')

      expect(currentPath()).toBe('/page-inconnue')
      expect(wrapper.text()).toContain('Cette page n\'existe pas')
    })
  })

  describe('connecté avec un jeton OP', () => {
    it('ouvre les pages privées', async () => {
      fakeApi.signedIn()

      const wrapper = await mountApp(PRIVATE_TEST_PATH)

      expect(currentPath()).toBe(PRIVATE_TEST_PATH)
      expect(wrapper.text()).toContain('Page privée')
    })

    it('renvoie vers l\'accueil depuis la page du jeton OP', async () => {
      fakeApi.signedIn()

      await mountApp('/jeton-op')

      expect(currentPath()).toBe('/')
    })

    it('renvoie vers l\'accueil depuis la connexion', async () => {
      fakeApi.signedIn()

      await mountApp('/connexion')

      expect(currentPath()).toBe('/')
    })
  })
})
