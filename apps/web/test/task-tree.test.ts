import type { TaskNode } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { mountApp } from './support/mount-app'

const alpha = { id: 1, identifier: 'alpha', name: 'Alpha' }

function task(id: number, subject: string, children: TaskNode[] = [], extra: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    subject,
    status: { id: 1, name: 'Nouveau' },
    assignee: null,
    children,
    ...extra,
  }
}

const tree = [
  task(10, 'Refonte du portail client', [
    task(11, 'Parcours de connexion', [
      task(12, 'Migration des comptes existants', [], {
        status: { id: 7, name: 'En cours' },
        assignee: { id: 3, name: 'Camille Roux' },
      }),
    ]),
    task(13, 'Espace documents'),
  ], {
    status: { id: 7, name: 'En cours' },
    assignee: { id: 3, name: 'Camille Roux' },
  }),
  task(20, 'Contrat de maintenance 2027'),
]

async function openProject(tasks: TaskNode[] = tree) {
  fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks }))
  return mountApp('/projets/1')
}

type Wrapper = Awaited<ReturnType<typeof openProject>>

function rowTitles(wrapper: Wrapper) {
  return wrapper.findAll('[role="treeitem"] .name').map(name => name.text())
}

function row(wrapper: Wrapper, subject: string) {
  const found = wrapper.findAll('[role="treeitem"]').find(item => item.find('.name').text() === subject)
  if (!found)
    throw new Error(`Ligne absente : ${subject}`)
  return found
}

describe('arbre des tâches d\'un projet', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('montre les tâches racines à l\'ouverture, les autres repliées', async () => {
    const wrapper = await openProject()

    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client', 'Contrat de maintenance 2027'])
    expect(row(wrapper, 'Refonte du portail client').attributes('aria-expanded')).toBe('false')
    // Un nœud replié affiche son nombre d'enfants.
    expect(row(wrapper, 'Refonte du portail client').find('.children-count').text()).toBe('2 sous-tâches')
    // Une feuille n'a pas d'état déplié.
    expect(row(wrapper, 'Contrat de maintenance 2027').attributes('aria-expanded')).toBeUndefined()
  })

  it('construit l\'arbre depuis une seule requête', async () => {
    await openProject()

    expect(fakeApi.calls.filter(call => call.path === '/projects/1/tasks')).toHaveLength(1)
  })

  it('affiche le titre, l\'état et l\'assigné de chaque ligne', async () => {
    const wrapper = await openProject()
    const portal = row(wrapper, 'Refonte du portail client')

    expect(portal.find('.status').text()).toBe('En cours')
    expect(portal.find('.status').attributes('data-family')).toBe('active')
    expect(portal.find('.assignee').text()).toBe('Camille Roux')
    // Sans assigné, la colonne reste vide.
    expect(row(wrapper, 'Contrat de maintenance 2027').find('.assignee').text()).toBe('')
  })

  it('déplie et replie un nœud au clic', async () => {
    const wrapper = await openProject()

    await row(wrapper, 'Refonte du portail client').find('.toggle').trigger('click')
    expect(rowTitles(wrapper)).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Espace documents',
      'Contrat de maintenance 2027',
    ])
    expect(row(wrapper, 'Refonte du portail client').attributes('aria-expanded')).toBe('true')
    expect(row(wrapper, 'Parcours de connexion').attributes('aria-level')).toBe('2')

    await row(wrapper, 'Refonte du portail client').find('.toggle').trigger('click')
    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client', 'Contrat de maintenance 2027'])
  })

  it('se parcourt au clavier : flèches pour bouger, déplier et replier', async () => {
    const wrapper = await openProject()
    const focused = () => document.activeElement?.querySelector('.name')?.textContent

    const portal = row(wrapper, 'Refonte du portail client')
    expect(portal.attributes('tabindex')).toBe('0')
    ;(portal.element as HTMLElement).focus()

    await portal.trigger('keydown', { key: 'ArrowRight' })
    expect(rowTitles(wrapper)).toContain('Parcours de connexion')

    await portal.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(focused()).toBe('Parcours de connexion')

    await row(wrapper, 'Parcours de connexion').trigger('keydown', { key: 'Enter' })
    expect(rowTitles(wrapper)).toContain('Migration des comptes existants')

    await row(wrapper, 'Parcours de connexion').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(focused()).toBe('Migration des comptes existants')

    // Sur une feuille, la flèche gauche remonte au parent.
    await row(wrapper, 'Migration des comptes existants').trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()
    expect(focused()).toBe('Parcours de connexion')

    await row(wrapper, 'Parcours de connexion').trigger('keydown', { key: 'ArrowLeft' })
    expect(rowTitles(wrapper)).not.toContain('Migration des comptes existants')
  })

  it('rend la main au nœud replié quand la ligne active disparaît', async () => {
    const wrapper = await openProject()
    await row(wrapper, 'Refonte du portail client').find('.toggle').trigger('click')
    await row(wrapper, 'Espace documents').trigger('click')
    expect(row(wrapper, 'Espace documents').attributes('tabindex')).toBe('0')

    await row(wrapper, 'Refonte du portail client').find('.toggle').trigger('click')

    expect(row(wrapper, 'Refonte du portail client').attributes('tabindex')).toBe('0')
  })

  it('ne rend que les lignes à l\'écran pour un projet de plusieurs milliers de tâches', async () => {
    const many = Array.from({ length: 5000 }, (_, index) => task(index + 1, `Tâche ${index + 1}`))
    const wrapper = await openProject(many)

    const rendered = wrapper.findAll('[role="treeitem"]').length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(100)
    expect(wrapper.find('.count').text()).toBe('5\u202F000 tâches')
  })

  it('invite à créer des tâches dans OP quand le projet n\'en a aucune', async () => {
    const wrapper = await openProject([])

    expect(wrapper.find('[role="status"]').text()).toContain('aucune tâche')
    expect(wrapper.find('[role="tree"]').exists()).toBe(false)
  })

  it('dit quand OP refuse de lister les tâches', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    fakeApi.on('GET', '/projects/1/tasks', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    const wrapper = await mountApp('/projets/1')

    expect(wrapper.find('h1').text()).toBe('Alpha')
    expect(wrapper.find('[role="alert"]').text()).toContain('refuse de lister les tâches')
  })
})
