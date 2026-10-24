import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { expectNavigatedTo, mountApp } from './support/mount-app'

describe('liste des projets', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('affiche les projets renvoyés par l\'API, avec leur nombre', async () => {
    fakeApi.on('GET', '/projects', () => ({
      projects: [
        { id: 1, identifier: 'alpha', name: 'Alpha' },
        { id: 3, identifier: 'gamma', name: 'Gamma' },
      ],
    }))
    const wrapper = await mountApp('/')

    const rows = wrapper.findAll('.project-row').map(row => [
      row.find('.name').text(),
      row.find('.identifier').text(),
    ])
    expect(rows).toEqual([
      ['Alpha', 'alpha'],
      ['Gamma', 'gamma'],
    ])
    expect(wrapper.find('.count').text()).toBe('2 projets')
  })

  it('dit quand aucun projet n\'est accessible', async () => {
    fakeApi.on('GET', '/projects', () => ({ projects: [] }))
    const wrapper = await mountApp('/')

    expect(wrapper.find('[role="status"]').text()).toContain('Aucun projet n\'est accessible')
    expect(wrapper.find('.count').exists()).toBe(false)
  })

  describe('erreurs', () => {
    it.each([
      [
        new ApiError(422, 'op_token_invalid'),
        'OpenProject refuse votre jeton',
      ],
      [
        new ApiError(403, 'op_forbidden'),
        'OpenProject refuse de lister les projets avec votre jeton. Vérifiez les droits',
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
        'L\'app n\'a pas pu charger vos projets',
      ],
    ])('affiche un message adapté à %s', async (error, message) => {
      fakeApi.on('GET', '/projects', () => {
        throw error
      })
      const wrapper = await mountApp('/')

      // Un 5xx ou une panne réseau est retenté une fois avant d'être affiché.
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toContain(message), { timeout: 3000 })
      expect(wrapper.find('.project-list').exists()).toBe(false)
    })

    it('ne propose pas de réessayer après un refus', async () => {
      fakeApi.on('GET', '/projects', () => {
        throw new ApiError(422, 'op_token_invalid')
      })
      const wrapper = await mountApp('/')

      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.findAll('button').some(button => button.text() === 'Réessayer')).toBe(false)
    })

    it('laisse réessayer quand OP ne répond pas', async () => {
      fakeApi.on('GET', '/projects', () => {
        throw new ApiError(503, 'op_unavailable')
      })
      const wrapper = await mountApp('/')
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true), { timeout: 3000 })

      fakeApi.on('GET', '/projects', () => ({
        projects: [
          { id: 1, identifier: 'alpha', name: 'Alpha' },
        ],
      }))
      const retry = wrapper.findAll('button').find(button => button.text() === 'Réessayer')
      await retry?.trigger('click')
      await flushPromises()

      await vi.waitFor(() => expect(wrapper.find('.project-row .name').text()).toBe('Alpha'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  it('permet de se déconnecter', async () => {
    fakeApi.on('POST', '/auth/logout', () => undefined)
    const wrapper = await mountApp('/')

    const signOut = wrapper.findAll('button').find(button => button.text() === 'Se déconnecter')
    await signOut?.trigger('click')
    await flushPromises()

    await expectNavigatedTo('/connexion')
  })
})
