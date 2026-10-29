import type { TaskNode, TaskTreeResponse } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withParent, withTreeFields } from '@/features/tasks/tasks'
import { router } from '@/router'
import { queryClient } from '@/shared/query-client'
import { fakeApi } from './support/fake-api'
import { currentPath, mountApp } from './support/mount-app'

const alpha = { id: 1, identifier: 'alpha', name: 'Alpha' }
const enCours = { id: 7, name: 'En cours', isClosed: false }
const ferme = { id: 12, name: 'Fermé', isClosed: true }
const bug = { id: 7, name: 'Bug' }
const moi = { id: 3, name: 'Camille Roux' }

function task(id: number, subject: string, children: TaskNode[] = [], extra: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    subject,
    status: { id: 1, name: 'Nouveau', isClosed: false },
    type: { id: 1, name: 'Tâche' },
    assignee: null,
    children,
    ...extra,
  }
}

const tree = [
  task(10, 'Refonte du portail client', [
    task(11, 'Parcours de connexion', [
      task(12, 'Migration des comptes existants', [], { status: enCours, assignee: moi }),
    ]),
    task(13, 'Espace documents', [], { status: ferme, type: bug }),
  ], { status: enCours }),
  task(20, 'Contrat de maintenance 2027'),
]

async function openProject(path = '/projets/1') {
  fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ currentUserId: moi.id, tasks: tree }))
  fakeApi.on('GET', '/tasks/12', () => ({
    task: {
      id: 12,
      subject: 'Migration des comptes existants',
      lockVersion: 0,
      status: enCours,
      type: { id: 1, name: 'Tâche' },
      priority: null,
      assignee: moi,
      responsible: null,
      estimatedHours: null,
      remainingHours: null,
      spentHours: null,
      startDate: null,
      dueDate: null,
      version: null,
      category: null,
      parent: { id: 11, subject: 'Parcours de connexion' },
      description: '',
    },
  }))
  fakeApi.on('GET', '/tasks/12/activities', () => ({ activities: [] }))
  return mountApp(path)
}

type Wrapper = Awaited<ReturnType<typeof openProject>>

function rowTitles(wrapper: Wrapper) {
  return wrapper.findAll('[role="treeitem"] .name').map(name => name.text())
}

function contextTitles(wrapper: Wrapper) {
  return wrapper.findAll('[role="treeitem"].context .name').map(name => name.text())
}

function count(wrapper: Wrapper) {
  return wrapper.find('.count').text()
}

function searchField(wrapper: Wrapper) {
  return wrapper.find<HTMLInputElement>('input[type="search"]')
}

async function search(wrapper: Wrapper, text: string) {
  await searchField(wrapper).setValue(text)
  await vi.advanceTimersByTimeAsync(150)
  await flushPromises()
}

/** Choisit les valeurs d'un filtre ; le choix dans la liste est couvert par les tests de bout en bout. */
async function selectCriterion(wrapper: Wrapper, label: string, values: unknown[]) {
  const filter = wrapper.findAllComponents({ name: 'TaskCriterionFilter' }).find(item => item.props('label') === label)
  if (!filter)
    throw new Error(`Filtre absent : ${label}`)
  filter.vm.$emit('update:modelValue', values)
  await flushPromises()
}

function filterButton(wrapper: Wrapper, label: string) {
  const button = wrapper.findAll('[role="search"] button').find(item => item.text().startsWith(label))
  if (!button)
    throw new Error(`Bouton absent : ${label}`)
  return button
}

function clearButton(wrapper: Wrapper) {
  return wrapper.findAll('button').find(button => button.text() === 'Effacer les filtres')
}

describe('filtres et recherche de l\'arbre', () => {
  beforeEach(() => {
    fakeApi.signedIn()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    })
    return () => vi.useRealTimers()
  })

  it('cherche pendant la frappe, montre les ancêtres atténués et déplie jusqu\'au résultat', async () => {
    const wrapper = await openProject()

    await search(wrapper, 'migration')

    expect(rowTitles(wrapper)).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Migration des comptes existants',
    ])
    expect(contextTitles(wrapper)).toEqual(['Refonte du portail client', 'Parcours de connexion'])
    expect(count(wrapper)).toBe('1 tâche sur 5')
    expect(currentPath()).toBe('/projets/1?q=migration')
  })

  it('attend la fin de la frappe avant de filtrer', async () => {
    const wrapper = await openProject()

    await searchField(wrapper).setValue('migr')
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()

    expect(rowTitles(wrapper)).toHaveLength(2)
    expect(currentPath()).toBe('/projets/1')
  })

  it('trouve une tâche par son numéro', async () => {
    const wrapper = await openProject()

    await search(wrapper, '#13')

    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client', 'Espace documents'])
  })

  it('écrit les filtres dans l\'adresse sans remplir l\'historique, et affiche leur nombre sur le bouton', async () => {
    const wrapper = await openProject()
    const replace = vi.spyOn(router, 'replace')
    const push = vi.spyOn(router, 'push')

    await selectCriterion(wrapper, 'Statut', [enCours.id])
    await selectCriterion(wrapper, 'Assigné', ['me'])

    expect(currentPath()).toBe('/projets/1?status=7&assignee=me')
    expect(replace).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(filterButton(wrapper, 'Statut').text()).toBe('Statut · 1')
    expect(rowTitles(wrapper)).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Migration des comptes existants',
    ])
    expect(contextTitles(wrapper)).toEqual(['Refonte du portail client', 'Parcours de connexion'])
  })

  it('redonne les critères et l\'arbre filtré depuis l\'adresse, en ignorant les valeurs inconnues', async () => {
    const wrapper = await openProject('/projets/1?type=7,abc&status=nimporte')

    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client', 'Espace documents'])
    expect(filterButton(wrapper, 'Type').text()).toBe('Type · 1')
    expect(filterButton(wrapper, 'Statut').text()).toBe('Statut')
  })

  it('garde la descendance d\'un parent', async () => {
    const wrapper = await openProject()

    await selectCriterion(wrapper, 'Parent', [11])

    expect(rowTitles(wrapper)).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Migration des comptes existants',
    ])
    expect(count(wrapper)).toBe('1 tâche sur 5')
  })

  it('dit quand aucune tâche ne correspond, sans proposer de bouton', async () => {
    const wrapper = await openProject()

    await search(wrapper, 'introuvable')

    const message = wrapper.findAll('[role="status"]').find(item => item.text() === 'Aucune tâche ne correspond à ces critères.')
    expect(message).toBeDefined()
    expect(message!.find('button').exists()).toBe(false)
    expect(wrapper.find('[role="tree"]').isVisible()).toBe(false)
  })

  it('efface tous les critères, recherche comprise, et retrouve le dépliage d\'avant', async () => {
    const wrapper = await openProject()
    expect(clearButton(wrapper)).toBeUndefined()
    await wrapper.find('[role="treeitem"] .toggle').trigger('click')
    const before = rowTitles(wrapper)

    await search(wrapper, 'migration')
    await selectCriterion(wrapper, 'Type', [bug.id])
    expect(rowTitles(wrapper)).toEqual([])
    await clearButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(currentPath()).toBe('/projets/1')
    expect(searchField(wrapper).element.value).toBe('')
    expect(rowTitles(wrapper)).toEqual(before)
    expect(before).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Espace documents',
      'Contrat de maintenance 2027',
    ])
    expect(count(wrapper)).toBe('5 tâches')
    expect(clearButton(wrapper)).toBeUndefined()
  })

  it('vide la recherche avec Échap', async () => {
    const wrapper = await openProject('/projets/1?q=migration')
    expect(searchField(wrapper).element.value).toBe('migration')

    await searchField(wrapper).trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(searchField(wrapper).element.value).toBe('')
    expect(currentPath()).toBe('/projets/1')
  })

  it('vide la recherche avec Échap sans fermer le détail ouvert', async () => {
    const wrapper = await openProject('/projets/1/taches/12?q=migration')
    expect(wrapper.find('aside').exists()).toBe(true)

    await searchField(wrapper).trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(searchField(wrapper).element.value).toBe('')
    expect(currentPath()).toBe('/projets/1/taches/12')
    expect(wrapper.find('aside').exists()).toBe(true)
  })

  it('ignore un identifiant que le projet ne propose pas', async () => {
    // 999 : aucun type de ce numéro ; 13 : une tâche sans sous-tâche.
    const wrapper = await openProject('/projets/1?type=999&parent=13')

    expect(filterButton(wrapper, 'Type').text()).toBe('Type')
    expect(filterButton(wrapper, 'Parent').text()).toBe('Parent')
    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client', 'Contrat de maintenance 2027'])
    expect(count(wrapper)).toBe('5 tâches')
    expect(currentPath()).toBe('/projets/1')
  })

  it('garde un critère choisi quand une modification lui retire ses dernières tâches', async () => {
    const wrapper = await openProject('/projets/1?status=7&q=migration')
    expect(rowTitles(wrapper)).toContain('Migration des comptes existants')

    // Les tâches « En cours » passent à « Fermé », comme après des modifications dans le détail.
    queryClient.setQueryData<TaskTreeResponse>(['projects', 1, 'tasks'], data => data && {
      ...data,
      tasks: withTreeFields(
        withTreeFields(data.tasks, 12, {
          status: ferme,
          type: { id: 1, name: 'Tâche' },
          assignee: moi,
        }),
        10,
        {
          status: ferme,
          type: { id: 1, name: 'Tâche' },
          assignee: null,
        },
      ),
    })
    await flushPromises()

    expect(filterButton(wrapper, 'Statut').text()).toBe('Statut · 1')
    expect(wrapper.text()).toContain('Aucune tâche ne correspond à ces critères.')
    expect(currentPath()).toBe('/projets/1?status=7&q=migration')
  })

  it('garde le repli choisi quand les résultats ne changent pas, et déplie un nouvel ancêtre', async () => {
    const wrapper = await openProject('/projets/1?q=migration')
    await wrapper.find('[role="treeitem"] .toggle').trigger('click')
    expect(rowTitles(wrapper)).toEqual(['Refonte du portail client'])

    // Même résultat, sous un autre parent, comme après un changement de parent dans le détail.
    queryClient.setQueryData<TaskTreeResponse>(['projects', 1, 'tasks'], data => data && {
      ...data,
      tasks: withParent(data.tasks, 12, 20),
    })
    await flushPromises()

    expect(rowTitles(wrapper)).toEqual(['Contrat de maintenance 2027', 'Migration des comptes existants'])
  })

  it('place le curseur dans la recherche avec /, sauf pendant une saisie', async () => {
    const wrapper = await openProject()

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(document.activeElement).toBe(searchField(wrapper).element)

    searchField(wrapper).element.blur()
    const other = document.createElement('textarea')
    document.body.append(other)
    other.focus()
    other.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it('garde les critères en ouvrant puis en fermant une tâche, sans fermer le panneau en changeant de critères', async () => {
    const wrapper = await openProject('/projets/1?q=migration')

    await wrapper.findAll('[role="treeitem"]').at(-1)!.trigger('click')
    await vi.waitFor(() => expect(currentPath()).toBe('/projets/1/taches/12?q=migration'))
    await flushPromises()

    await search(wrapper, 'contrat')
    expect(currentPath()).toBe('/projets/1/taches/12?q=contrat')
    expect(wrapper.find('aside').exists()).toBe(true)

    await wrapper.find('aside button[aria-label="Fermer le détail"]').trigger('click')
    await vi.waitFor(() => expect(currentPath()).toBe('/projets/1?q=contrat'))
    await flushPromises()
    // La tâche fermée n'est plus dans l'arbre : la main va à la première ligne.
    expect(document.activeElement?.querySelector('.name')?.textContent).toBe('Contrat de maintenance 2027')
  })

  it('rend la main à la recherche en fermant une tâche quand aucune ligne ne correspond', async () => {
    const wrapper = await openProject('/projets/1/taches/12?q=introuvable')

    await wrapper.find('aside button[aria-label="Fermer le détail"]').trigger('click')
    await vi.waitFor(() => expect(currentPath()).toBe('/projets/1?q=introuvable'))
    await flushPromises()

    expect(document.activeElement).toBe(searchField(wrapper).element)
  })
})
