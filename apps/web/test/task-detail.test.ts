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

/** Détail renvoyé par l'API ; seules les valeurs utiles au test sont données. */
function detail(task: Pick<TaskDetail, 'id' | 'subject'> & Partial<TaskDetail>): TaskDetail {
  return {
    status: { id: 1, name: 'Nouveau', isClosed: false },
    type: { id: 1, name: 'Tâche' },
    priority: null,
    assignee: null,
    responsible: null,
    estimatedHours: null,
    remainingHours: null,
    spentHours: null,
    startDate: null,
    dueDate: null,
    version: null,
    category: null,
    parent: null,
    ...task,
  }
}

/** Jour ISO à `offset` jours d'aujourd'hui, en heure locale comme l'interface. */
function isoDay(offset: number) {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return [
    day.getFullYear(),
    day.getMonth() + 1,
    day.getDate(),
  ]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}

const details: Record<number, TaskDetail> = {
  10: detail({
    id: 10,
    subject: 'Refonte du portail client',
    estimatedHours: 120,
    remainingHours: 80,
  }),
  11: detail({
    id: 11,
    subject: 'Parcours de connexion',
    estimatedHours: 16,
    parent: { id: 10, subject: 'Refonte du portail client' },
  }),
  12: detail({
    id: 12,
    subject: 'Migration des comptes existants',
    status: { id: 7, name: 'En cours', isClosed: false },
    assignee: { id: 3, name: 'Camille Roux' },
    estimatedHours: 12.5,
    remainingHours: 4.25,
    spentHours: 11,
    parent: { id: 11, subject: 'Parcours de connexion' },
  }),
  20: detail({
    id: 20,
    subject: 'Contrat de maintenance 2027',
  }),
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

function fields(wrapper: Wrapper) {
  return panel(wrapper).findAll('.field').map(item => [
    item.find('dt').text(),
    item.find('dd').text(),
  ])
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

  it('affiche les temps estimé, restant et passé en heures décimales', async () => {
    const wrapper = await openApp('/projets/1/taches/12')

    expect(hours(wrapper)).toEqual([
      ['Estimé', '12,5\u202Fh'],
      ['Restant', '4,25\u202Fh'],
      ['Passé', '11\u202Fh'],
    ])
  })

  it('dit quand un temps n\'est pas renseigné, et tait le temps passé qu\'OP ne donne pas', async () => {
    const wrapper = await openApp('/projets/1/taches/11')

    expect(hours(wrapper)).toEqual([
      ['Estimé', '16\u202Fh'],
      ['Restant', 'Non renseigné'],
    ])
  })

  it('affiche l\'état, l\'assigné et le numéro de la tâche dans l\'en-tête', async () => {
    const wrapper = await openApp('/projets/1/taches/12')
    const summary = panel(wrapper).find('.summary')

    expect(summary.find('.status').text()).toBe('En cours')
    expect(summary.find('.status').attributes('data-family')).toBe('active')
    expect(summary.text()).toContain('Camille Roux')
    expect(summary.find('.ref').text()).toBe('#12')
  })

  it('affiche les propriétés renseignées, et seulement celles-là', async () => {
    details[30] = detail({
      id: 30,
      subject: 'Tâche complète',
      type: { id: 4, name: 'Fonctionnalité' },
      priority: { id: 9, name: 'Haute' },
      responsible: { id: 5, name: 'Alex Martin' },
      // Dates de l'année en cours : l'année n'est alors pas affichée.
      startDate: `${new Date().getFullYear()}-10-06`,
      dueDate: `${new Date().getFullYear()}-10-31`,
      version: { id: 2, name: 'POC 0.1' },
      category: { id: 3, name: 'Authentification' },
      status: { id: 12, name: 'Fermé', isClosed: true },
    })
    const wrapper = await openApp('/projets/1/taches/30')

    expect(fields(wrapper)).toEqual([
      ['Responsable', 'Alex Martin'],
      ['Dates', '6 oct. → 31 oct.'],
      ['Type', 'Fonctionnalité'],
      ['Priorité', 'Haute'],
      ['Version', 'POC 0.1'],
      ['Catégorie', 'Authentification'],
    ])
    // Une tâche fermée n'a plus d'échéance à tenir : pas d'indication relative.
    expect(panel(wrapper).find('.hint').exists()).toBe(false)
    delete details[30]

    const sparse = await openApp('/projets/1/taches/20')
    expect(fields(sparse)).toEqual([
      ['Type', 'Tâche'],
    ])
  })

  it('situe l\'échéance par rapport à aujourd\'hui, et signale un retard', async () => {
    details[31] = detail({
      id: 31,
      subject: 'À rendre',
      dueDate: isoDay(6),
    })
    details[32] = detail({
      id: 32,
      subject: 'En retard',
      dueDate: isoDay(-2),
    })

    const soon = await openApp('/projets/1/taches/31')
    expect(panel(soon).find('.hint').text()).toBe('dans 6 jours')
    expect(panel(soon).find('.hint').classes()).not.toContain('overdue')
    soon.unmount()

    const late = await openApp('/projets/1/taches/32')
    expect(panel(late).find('.hint').text()).toBe('en retard de 2 jours')
    expect(panel(late).find('.hint').classes()).toContain('overdue')
    delete details[31]
    delete details[32]
  })

  it('liste les sous-tâches, et ouvre leur détail au clic', async () => {
    const wrapper = await openApp('/projets/1/taches/10')
    const section = panel(wrapper).find('section[aria-labelledby="subtasks-title"]')

    expect(section.find('h3').text()).toBe('Sous-tâches 0 sur 1 fermée')
    expect(section.findAll('li').map(item => item.find('a').text())).toEqual(['Parcours de connexion'])

    await section.find('a').trigger('click')
    await expectNavigatedTo('/projets/1/taches/11')
    expect(panel(wrapper).find('h2').text()).toBe('Parcours de connexion')
  })

  it('n\'affiche pas de section Sous-tâches pour une tâche qui n\'en a pas', async () => {
    const wrapper = await openApp('/projets/1/taches/20')

    expect(panel(wrapper).find('section[aria-labelledby="subtasks-title"]').exists()).toBe(false)
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

  it('montre l\'en-tête tiré de l\'arbre en attendant OP', async () => {
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
    expect(panel(wrapper).find('.summary .status').text()).toBe('Nouveau')
    expect(panel(wrapper).find('[aria-busy="true"]').text()).toContain('Chargement des heures et des propriétés')

    answer({ task: details[12] })
    await flushPromises()
    expect(hours(wrapper).map(([, value]) => value)).toEqual(['12,5\u202Fh', '4,25\u202Fh', '11\u202Fh'])
    // La réponse d'OP fait foi : l'état a changé depuis le chargement de l'arbre.
    expect(panel(wrapper).find('.summary .status').text()).toBe('En cours')
  })

  it('se ferme et rend la main à l\'arbre, sur la tâche qui était ouverte', async () => {
    const wrapper = await openApp('/projets/1/taches/20')

    await panel(wrapper).find('button[aria-label="Fermer le détail"]').trigger('click')
    await expectNavigatedTo('/projets/1')

    expect(panel(wrapper).exists()).toBe(false)
    expect(document.activeElement?.querySelector('.name')?.textContent).toBe('Contrat de maintenance 2027')
  })

  it('se ferme avec Échap, où que soit le focus', async () => {
    const wrapper = await openApp('/projets/1/taches/20')

    await row(wrapper, 'Contrat de maintenance 2027').trigger('keydown', { key: 'Escape' })
    await expectNavigatedTo('/projets/1')
    expect(panel(wrapper).exists()).toBe(false)

    await row(wrapper, 'Contrat de maintenance 2027').trigger('click')
    await expectNavigatedTo('/projets/1/taches/20')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expectNavigatedTo('/projets/1')
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

  it('affiche un refus d\'OP sans proposer de réessayer', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
    fakeApi.on('GET', '/tasks/20', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    const wrapper = await mountApp('/projets/1/taches/20')

    expect(panel(wrapper).find('[role="alert"]').text()).toContain('OpenProject refuse l\'accès à cette tâche')
    expect(panel(wrapper).findAll('button').map(button => button.text())).not.toContain('Réessayer')
  })

  it('mène à la page introuvable pour un identifiant de tâche invalide, sans appeler l\'API', async () => {
    fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
    const wrapper = await mountApp('/projets/1/taches/abc')

    expect(wrapper.text()).toContain('Cette page n\'existe pas')
    expect(currentPath()).toBe('/projets/1/taches/abc')
    expect(fakeApi.calls.some(call => call.path.startsWith('/tasks/'))).toBe(false)
  })
})
