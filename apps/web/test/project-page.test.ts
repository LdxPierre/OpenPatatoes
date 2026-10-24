import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { expectNavigatedTo, mountApp } from './support/mount-app'

const alpha = { id: 1, identifier: 'alpha', name: 'Alpha' }

function retryButton(wrapper: Awaited<ReturnType<typeof mountApp>>) {
  return wrapper.findAll('button').find(button => button.text() === 'Réessayer')
}

describe('ouverture d\'un projet', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('ouvre le projet depuis la liste', async () => {
    fakeApi.on('GET', '/projects', () => ({
      projects: [alpha],
    }))
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    const wrapper = await mountApp('/')

    await wrapper.find('a.project-row').trigger('click')
    await expectNavigatedTo('/projets/1')

    expect(wrapper.find('h1').text()).toBe('Alpha')
    expect(fakeApi.calls).toContainEqual({ method: 'GET', path: '/projects/1', body: undefined })
  })

  it('ouvre un projet depuis son adresse', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    const wrapper = await mountApp('/projets/1')

    expect(wrapper.find('h1').text()).toBe('Alpha')
  })

  describe('refus d\'accès', () => {
    it('affiche un refus d\'OP comme un message clair, sans proposer de réessayer', async () => {
      fakeApi.on('GET', '/projects/2', () => {
        throw new ApiError(403, 'op_forbidden')
      })
      const wrapper = await mountApp('/projets/2')

      expect(wrapper.find('[role="alert"]').text()).toContain('OpenProject refuse l\'accès à ce projet avec votre jeton')
      expect(retryButton(wrapper)).toBeUndefined()
      expect(wrapper.find('h1').exists()).toBe(false)
    })

    it('traite un projet masqué par OP comme introuvable ou inaccessible', async () => {
      fakeApi.on('GET', '/projects/2', () => {
        throw new ApiError(404, 'op_not_found')
      })
      const wrapper = await mountApp('/projets/2')

      expect(wrapper.find('[role="alert"]').text()).toContain('introuvable ou inaccessible')
      expect(retryButton(wrapper)).toBeUndefined()
    })

    it('distingue une panne d\'OP d\'un refus, et laisse réessayer', async () => {
      fakeApi.on('GET', '/projects/1', () => {
        throw new ApiError(503, 'op_unavailable')
      })
      const wrapper = await mountApp('/projets/1')
      // Un 5xx est retenté une fois avant d'être affiché.
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true), { timeout: 3000 })

      expect(wrapper.find('[role="alert"]').text()).toContain('OpenProject ne répond pas')
      expect(wrapper.find('[role="alert"]').text()).not.toContain('refuse')

      fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
      await retryButton(wrapper)?.trigger('click')
      await flushPromises()

      await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Alpha'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  it('mène à la page introuvable pour un identifiant invalide ou trop grand, sans appeler l\'API', async () => {
    for (const path of ['/projets/abc', `/projets/${'1'.repeat(16)}`]) {
      const wrapper = await mountApp(path)

      expect(wrapper.text()).toContain('Cette page n\'existe pas')
      wrapper.unmount()
    }
    expect(fakeApi.calls.some(call => call.path.startsWith('/projects/'))).toBe(false)
  })

  it('revient à la liste des projets', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    const wrapper = await mountApp('/projets/1')

    const back = wrapper.findAll('a').find(link => link.text() === 'Tous les projets')
    await back?.trigger('click')

    await expectNavigatedTo('/')
  })
})
