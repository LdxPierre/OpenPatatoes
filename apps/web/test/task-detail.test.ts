import type { TaskDetail, TaskNode } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { currentPath, expectNavigatedTo, mountApp } from './support/mount-app'

const alpha = { id: 1, identifier: 'alpha', name: 'Alpha' }

function task(id: number, subject: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    subject,
    status: { id: 1, name: 'Nouveau', isClosed: false },
    assignee: null,
    children,
  }
}

const tree = [
  task(10, 'Refonte du portail client', [
    task(11, 'Parcours de connexion', [
      task(12, 'Migration des comptes existants'),
    ]),
  ]),
  task(20, 'Contrat de maintenance 2027'),
]

const details: Record<number, TaskDetail> = {
  10: {
    id: 10,
    subject: 'Refonte du portail client',
    estimatedHours: 120,
    remainingHours: 80,
    parent: null,
  },
  11: {
    id: 11,
    subject: 'Parcours de connexion',
    estimatedHours: 16,
    remainingHours: null,
    parent: { id: 10, subject: 'Refonte du portail client' },
  },
  12: {
    id: 12,
    subject: 'Migration des comptes existants',
    estimatedHours: 12.5,
    remainingHours: 4.25,
    parent: { id: 11, subject: 'Parcours de connexion' },
  },
  20: {
    id: 20,
    subject: 'Contrat de maintenance 2027',
    estimatedHours: null,
    remainingHours: null,
    parent: null,
  },
}

function openApp(path: string) {
  fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
  for (const detail of Object.values(details))
    fakeApi.on('GET', `/tasks/${detail.id}`, () => ({ task: detail }))
  return mountApp(path)
}

type Wrapper = Awaited<ReturnType<typeof openApp>>

function row(wrapper: Wrapper, subject: string) {
  const found = wrapper.findAll('[role="treeitem"]').find(item => item.find('.name').text() === subject)
  if (!found)
    throw new Error(`Ligne absente : ${subject}`)
  return found
}

function panel(wrapper: Wrapper) {
  return wrapper.find('aside.task-detail')
}

function hours(wrapper: Wrapper) {
  return panel(wrapper).findAll('.hour').map(item => [
    item.find('dt').text(),
    item.find('dd').text(),
  ])
}

describe('détail d\'une tâche', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('s\'ouvre à côté de l\'arbre au clic sur une tâche', async () => {
    const wrapper = await openApp('/projets/1')
    expect(panel(wrapper).exists()).toBe(false)

    await row(wrapper, 'Contrat de maintenance 2027').trigger('click')
    await expectNavigatedTo('/projets/1/taches/20')

    expect(panel(wrapper).find('h2').text()).toBe('Contrat de maintenance 2027')
    expect(row(wrapper, 'Contrat de maintenance 2027').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[role="tree"]').exists()).toBe(true)
  })

  it('s\'ouvre au clavier avec Entrée', async () => {
    const wrapper = await openApp('/projets/1')

    await row(wrapper, 'Refonte du portail client').trigger('keydown', { key: 'Enter' })
    await expectNavigatedTo('/projets/1/taches/10')

    expect(panel(wrapper).find('h2').text()).toBe('Refonte du portail client')
  })

  it('affiche le temps estimé et le temps restant en heures décimales', async () => {
    const wrapper = await openApp('/projets/1/taches/12')

    expect(hours(wrapper)).toEqual([
      ['Temps estimé', '12,5 h'],
      ['Temps restant', '4,25 h'],
    ])
    expect(panel(wrapper).find('.ref').text()).toBe('#12')
  })

  it('dit quand un temps n\'est pas renseigné', async () => {
    const wrapper = await openApp('/projets/1/taches/11')

    expect(hours(wrapper)).toEqual([
      ['Temps estimé', '16 h'],
      ['Temps restant', 'Non renseigné'],
    ])
  })

  it('affiche le parent, et ouvre son détail au clic', async () => {
    const wrapper = await openApp('/projets/1/taches/12')
    const parent = panel(wrapper).find('a.parent')

    expect(parent.text()).toBe('Tâche parente : Parcours de connexion')
    await parent.trigger('click')
    await expectNavigatedTo('/projets/1/taches/11')

    expect(panel(wrapper).find('h2').text()).toBe('Parcours de connexion')
    expect(row(wrapper, 'Parcours de connexion').attributes('aria-selected')).toBe('true')
    expect(row(wrapper, 'Migration des comptes existants').attributes('aria-selected')).toBe('false')
  })

  it('n\'affiche pas de parent pour une tâche de premier niveau', async () => {
    const wrapper = await openApp('/projets/1/taches/10')

    expect(panel(wrapper).find('h2').text()).toBe('Refonte du portail client')
    expect(panel(wrapper).find('a.parent').exists()).toBe(false)
  })

  it('déplie l\'arbre jusqu\'à la tâche ouverte depuis son adresse', async () => {
    const wrapper = await openApp('/projets/1/taches/12')

    expect(row(wrapper, 'Refonte du portail client').attributes('aria-expanded')).toBe('true')
    expect(row(wrapper, 'Parcours de connexion').attributes('aria-expanded')).toBe('true')
    expect(row(wrapper, 'Migration des comptes existants').attributes('aria-selected')).toBe('true')
    expect(row(wrapper, 'Migration des comptes existants').attributes('tabindex')).toBe('0')
  })

  it('montre le titre et le parent tirés de l\'arbre en attendant OP', async () => {
    const wrapper = await openApp('/projets/1')
    let answer: (value: unknown) => void = () => {}
    fakeApi.on('GET', '/tasks/12', () => new Promise((resolve) => {
      answer = resolve
    }))

    await row(wrapper, 'Refonte du portail client').trigger('keydown', { key: 'ArrowRight' })
    await row(wrapper, 'Parcours de connexion').trigger('keydown', { key: 'ArrowRight' })
    await row(wrapper, 'Migration des comptes existants').trigger('click')
    await expectNavigatedTo('/projets/1/taches/12')

    expect(panel(wrapper).find('h2').text()).toBe('Migration des comptes existants')
    expect(panel(wrapper).find('a.parent').text()).toContain('Parcours de connexion')
    expect(panel(wrapper).find('.hours').attributes('aria-busy')).toBe('true')
    expect(hours(wrapper).map(([, value]) => value)).toEqual(['…', '…'])

    answer({ task: details[12] })
    await flushPromises()
    expect(hours(wrapper).map(([, value]) => value)).toEqual(['12,5 h', '4,25 h'])
  })

  it('se ferme et rend la main à l\'arbre, sur la tâche qui était ouverte', async () => {
    const wrapper = await openApp('/projets/1/taches/20')

    await panel(wrapper).find('button[aria-label="Fermer le détail"]').trigger('click')
    await expectNavigatedTo('/projets/1')

    expect(panel(wrapper).exists()).toBe(false)
    expect(document.activeElement?.querySelector('.name')?.textContent).toBe('Contrat de maintenance 2027')
  })

  it('se ferme avec Échap', async () => {
    const wrapper = await openApp('/projets/1/taches/20')

    await row(wrapper, 'Contrat de maintenance 2027').trigger('keydown', { key: 'Escape' })
    await expectNavigatedTo('/projets/1')

    expect(panel(wrapper).exists()).toBe(false)
  })

  it('dit quand la tâche est introuvable ou inaccessible, sans fermer l\'arbre', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
    fakeApi.on('GET', '/tasks/99', () => {
      throw new ApiError(404, 'op_not_found')
    })
    const wrapper = await mountApp('/projets/1/taches/99')

    expect(panel(wrapper).find('[role="alert"]').text()).toContain('introuvable ou inaccessible')
    expect(panel(wrapper).find('h2').exists()).toBe(false)
    expect(wrapper.find('[role="tree"]').exists()).toBe(true)
  })

  it('mène à la page introuvable pour un identifiant de tâche invalide, sans appeler l\'API', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    const wrapper = await mountApp('/projets/1/taches/abc')

    expect(wrapper.text()).toContain('Cette page n\'existe pas')
    expect(currentPath()).toBe('/projets/1/taches/abc')
    expect(fakeApi.calls.some(call => call.path.startsWith('/tasks/'))).toBe(false)
  })
})
