import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { currentPath, expectNavigatedTo, mountApp, PRIVATE_TEST_PATH } from './support/mount-app'

async function submitToken(wrapper: VueWrapper, token = 'tok-alice') {
  await wrapper.find('#op-token').setValue(token)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

function buttonNamed(wrapper: VueWrapper, name: string) {
  const button = wrapper.findAll('button').find(candidate => candidate.text() === name)
  if (!button)
    throw new Error(`Bouton « ${name} » absent`)
  return button
}

describe('saisie du jeton OP', () => {
  beforeEach(() => {
    fakeApi.signedIn({ opConnected: false })
  })

  it('envoie le jeton saisi', async () => {
    fakeApi.on('PUT', '/profile/op-connection', () => ({
      opUser: { id: 7, name: 'Alice Martin' },
    }))
    const wrapper = await mountApp('/jeton-op')

    await submitToken(wrapper, 'tok-alice')

    expect(fakeApi.calls).toContainEqual({
      method: 'PUT',
      path: '/profile/op-connection',
      body: { token: 'tok-alice' },
    })
  })

  it('confirme le compte OP, puis mène à la page demandée', async () => {
    fakeApi.on('PUT', '/profile/op-connection', () => ({
      opUser: { id: 7, name: 'Alice Martin' },
    }))
    const wrapper = await mountApp(`/jeton-op?redirect=${PRIVATE_TEST_PATH}`)

    await submitToken(wrapper)

    expect(wrapper.text()).toContain('Connecté à OpenProject en tant que Alice Martin.')
    expect(currentPath()).toBe(`/jeton-op?redirect=${PRIVATE_TEST_PATH}`)

    await buttonNamed(wrapper, 'Continuer').trigger('click')
    await flushPromises()

    await expectNavigatedTo(PRIVATE_TEST_PATH)
    expect(wrapper.text()).toContain('Page privée')
  })

  it('mène à l\'accueil sans page demandée', async () => {
    fakeApi.on('PUT', '/profile/op-connection', () => ({
      opUser: { id: 7, name: 'Alice Martin' },
    }))
    const wrapper = await mountApp('/jeton-op')

    await submitToken(wrapper)
    await buttonNamed(wrapper, 'Continuer').trigger('click')
    await flushPromises()

    await expectNavigatedTo('/')
  })

  describe('erreurs', () => {
    it.each([
      [
        new ApiError(422, 'op_token_invalid'),
        'OpenProject a refusé ce jeton',
      ],
      [
        new ApiError(503, 'op_unavailable'),
        'OpenProject ne répond pas',
      ],
      [
        new ApiError(0, 'network_error'),
        'L\'app ne répond pas',
      ],
      [
        new ApiError(502, 'op_invalid_response'),
        'OpenProject a renvoyé une réponse inattendue',
      ],
      [
        new ApiError(500, 'internal_error'),
        'L\'app n\'a pas pu enregistrer ce jeton',
      ],
    ])('affiche un message adapté à %s et reste sur le formulaire', async (error, message) => {
      fakeApi.on('PUT', '/profile/op-connection', () => {
        throw error
      })
      const wrapper = await mountApp('/jeton-op')

      await submitToken(wrapper)

      expect(wrapper.find('[role="alert"]').text()).toContain(message)
      expect(wrapper.find('#op-token').exists()).toBe(true)
    })

    it('laisse réessayer après un refus', async () => {
      fakeApi.on('PUT', '/profile/op-connection', () => {
        throw new ApiError(422, 'op_token_invalid')
      })
      const wrapper = await mountApp('/jeton-op')
      await submitToken(wrapper, 'tok-faux')

      fakeApi.on('PUT', '/profile/op-connection', () => ({
        opUser: { id: 7, name: 'Alice Martin' },
      }))
      await submitToken(wrapper, 'tok-alice')

      expect(wrapper.text()).toContain('Connecté à OpenProject en tant que Alice Martin.')
    })
  })

  it('permet de se déconnecter', async () => {
    fakeApi.on('POST', '/auth/logout', () => undefined)
    const wrapper = await mountApp('/jeton-op')

    await buttonNamed(wrapper, 'Se déconnecter').trigger('click')
    await flushPromises()

    await expectNavigatedTo('/connexion')
  })
})
