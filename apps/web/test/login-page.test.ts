import type { SessionUser } from '@openpatatoes/shared'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { currentPath, expectNavigatedTo, mountApp, PRIVATE_TEST_PATH } from './support/mount-app'

const alice: SessionUser = {
  id: 'u1',
  username: 'alice',
  isAdmin: false,
  opConnected: true,
}

async function signIn(wrapper: VueWrapper, username = 'alice', password = 'secret') {
  await wrapper.find('#login-username').setValue(username)
  await wrapper.find('#login-password').setValue(password)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('page de connexion', () => {
  beforeEach(() => {
    fakeApi.on('GET', '/auth/me', () => {
      throw new ApiError(401, 'unauthenticated')
    })
  })

  it('envoie l\'identifiant et le mot de passe saisis', async () => {
    fakeApi.on('POST', '/auth/login', () => ({ user: alice }))
    const wrapper = await mountApp('/connexion')

    await signIn(wrapper, 'alice', 'mot-de-passe')

    expect(fakeApi.calls).toContainEqual({
      method: 'POST',
      path: '/auth/login',
      body: { username: 'alice', password: 'mot-de-passe' },
    })
  })

  it('ramène à la page demandée après la connexion', async () => {
    fakeApi.on('POST', '/auth/login', () => ({ user: alice }))
    const wrapper = await mountApp(`/connexion?redirect=${PRIVATE_TEST_PATH}`)

    await signIn(wrapper)

    await expectNavigatedTo(PRIVATE_TEST_PATH)
  })

  it('ignore une redirection vers un autre site', async () => {
    fakeApi.on('POST', '/auth/login', () => ({ user: alice }))
    const wrapper = await mountApp('/connexion?redirect=//exemple.com')

    await signIn(wrapper)

    await expectNavigatedTo('/')
  })

  it('demande le jeton OP après la connexion d\'un utilisateur qui n\'en a pas', async () => {
    fakeApi.on('POST', '/auth/login', () => ({
      user: { ...alice, opConnected: false },
    }))
    const wrapper = await mountApp(`/connexion?redirect=${PRIVATE_TEST_PATH}`)

    await signIn(wrapper)

    await expectNavigatedTo(`/jeton-op?redirect=${PRIVATE_TEST_PATH}`)
  })

  describe('erreurs', () => {
    it.each([
      [
        new ApiError(401, 'invalid_credentials'),
        'Identifiant ou mot de passe incorrect',
      ],
      [
        new ApiError(0, 'network_error'),
        'L\'app ne répond pas',
      ],
      [
        new ApiError(500, 'unknown_error'),
        'L\'app n\'a pas pu vous connecter',
      ],
    ])('affiche un message adapté à %s', async (error, message) => {
      fakeApi.on('POST', '/auth/login', () => {
        throw error
      })
      const wrapper = await mountApp('/connexion')

      await signIn(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toContain(message)
      expect(currentPath()).toBe('/connexion')
    })
  })
})
