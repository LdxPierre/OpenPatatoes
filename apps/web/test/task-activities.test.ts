import type { TaskActivity, TaskDetail, TaskNode } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { expectNavigatedTo, mountApp } from './support/mount-app'

const alpha = { id: 1, identifier: 'alpha', name: 'Alpha' }
const camille = { id: 3, name: 'Camille Roux' }
const alex = { id: 5, name: 'Alex Martin' }

function node(id: number, subject: string): TaskNode {
  return {
    id,
    subject,
    status: { id: 1, name: 'Nouveau', isClosed: false },
    type: { id: 1, name: 'Tâche' },
    assignee: null,
    children: [],
  }
}

function detail(id: number, subject: string): TaskDetail {
  return {
    id,
    subject,
    lockVersion: 0,
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
    description: '',
  }
}

function activity(values: Pick<TaskActivity, 'id'> & Partial<TaskActivity>): TaskActivity {
  return {
    author: camille,
    createdAt: '2026-10-14T09:12:00.000Z',
    creation: false,
    comment: null,
    changes: [],
    ...values,
  }
}

const history: TaskActivity[] = [
  activity({ id: 1, creation: true, createdAt: '2026-10-01T08:00:00.000Z' }),
  activity({
    id: 2,
    author: alex,
    comment: '<p>Pense à la <strong>déconnexion</strong>.</p>',
    createdAt: '2026-10-14T09:12:00.000Z',
  }),
  activity({
    id: 3,
    changes: ['Status changed from New to In progress', 'Remaining work set to 6.50 h'],
    createdAt: '2026-10-20T16:40:00.000Z',
  }),
]

function openApp(path: string, activities: Record<number, TaskActivity[]> = { 11: history }) {
  fakeApi.on('GET', '/projects/1', () => ({ project: alpha }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({
    currentUserId: 1,
    tasks: [
      node(11, 'Parcours de connexion'),
      node(20, 'Contrat de maintenance'),
    ],
  }))
  fakeApi.on('GET', '/tasks/11', () => ({
    task: detail(11, 'Parcours de connexion'),
  }))
  fakeApi.on('GET', '/tasks/20', () => ({
    task: detail(20, 'Contrat de maintenance'),
  }))
  for (const [taskId, list] of Object.entries(activities))
    fakeApi.on('GET', `/tasks/${taskId}/activities`, () => ({ activities: list }))
  return mountApp(path)
}

type Wrapper = Awaited<ReturnType<typeof openApp>>

function tab(wrapper: Wrapper, name: string) {
  const found = wrapper.findAll('[role="tab"]').find(item => item.text().startsWith(name))
  if (!found)
    throw new Error(`Onglet absent : ${name}`)
  return found
}

async function openActivity(wrapper: Wrapper) {
  // Reka active un onglet au clic gauche, sur l'appui du bouton.
  await tab(wrapper, 'Activité').trigger('mousedown', { button: 0 })
  await flushPromises()
}

function feedItems(wrapper: Wrapper) {
  return wrapper.findAll('.feed > li')
}

function textarea(wrapper: Wrapper) {
  return wrapper.find('textarea[aria-label="Commentaire"]')
}

describe('activité d\'une tâche', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('n\'est lue qu\'à l\'ouverture de l\'onglet Activité', async () => {
    const wrapper = await openApp('/projets/1/taches/11')

    expect(tab(wrapper, 'Détail').attributes('aria-selected')).toBe('true')
    expect(fakeApi.calls.some(call => call.path === '/tasks/11/activities')).toBe(false)

    await openActivity(wrapper)

    expect(tab(wrapper, 'Activité').attributes('aria-selected')).toBe('true')
    expect(fakeApi.calls.some(call => call.path === '/tasks/11/activities')).toBe(true)
  })

  it('affiche l\'historique du plus ancien au plus récent : création, commentaire, modifications', async () => {
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    const items = feedItems(wrapper)
    expect(items).toHaveLength(3)
    expect(items[0]!.find('.what').text()).toBe('Camille Roux a créé la tâche')
    expect(items[1]!.find('.who').text()).toBe('Alex Martin')
    expect(items[1]!.find('.mark').text()).toBe('AM')
    expect(items[1]!.find('.markdown').html()).toContain('<p>Pense à la <strong>déconnexion</strong>.</p>')
    expect(items[1]!.find('time').attributes('title')).toContain('2026')
    expect(items[2]!.find('.what').text()).toBe('Camille Roux a fait 2 modifications')
    expect(items[2]!.findAll('.pop li').map(item => item.text())).toEqual([
      'Status changed from New to In progress',
      'Remaining work set to 6.50 h',
    ])
  })

  it('nomme un auteur qu\'OP ne donne pas « Utilisateur inconnu »', async () => {
    const wrapper = await openApp('/projets/1/taches/11', {
      11: [
        activity({ id: 1, author: null, comment: '<p>Bonjour</p>' }),
      ],
    })
    await openActivity(wrapper)

    expect(feedItems(wrapper)[0]!.find('.who').text()).toBe('Utilisateur inconnu')
  })

  it('ajoute un commentaire markdown à la fin de l\'historique et vide le champ', async () => {
    fakeApi.on('POST', '/tasks/11/activities', () => ({
      activity: activity({
        id: 4,
        author: camille,
        comment: '<p>C\'est <strong>fait</strong>.</p>',
        createdAt: new Date().toISOString(),
      }),
    }))
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    await textarea(wrapper).setValue('  C\'est **fait**.  ')
    await wrapper.find('form.composer').trigger('submit')
    await flushPromises()

    expect(fakeApi.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/tasks/11/activities',
      body: { comment: 'C\'est **fait**.' },
    })
    const last = feedItems(wrapper).at(-1)!
    expect(last.find('.markdown').html()).toContain('<strong>fait</strong>')
    expect(last.find('time').text()).toBe('aujourd\'hui')
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe('')
  })

  it('envoie le commentaire avec Ctrl + Entrée', async () => {
    fakeApi.on('POST', '/tasks/11/activities', () => ({
      activity: activity({ id: 4, comment: '<p>Vu</p>' }),
    }))
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    await textarea(wrapper).setValue('Vu')
    await textarea(wrapper).trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()

    expect(fakeApi.calls.at(-1)).toMatchObject({
      method: 'POST',
      body: { comment: 'Vu' },
    })
  })

  it('n\'envoie pas un commentaire vide', async () => {
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    await textarea(wrapper).setValue('   ')

    expect(wrapper.find('form.composer button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('form.composer').trigger('submit')
    expect(fakeApi.calls.some(call => call.method === 'POST')).toBe(false)
  })

  it('garde le commentaire dans le champ et explique le refus d\'OP', async () => {
    fakeApi.on('POST', '/tasks/11/activities', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    await textarea(wrapper).setValue('Mon commentaire')
    await wrapper.find('form.composer').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.composer [role="alert"]').text()).toContain('OpenProject ne vous permet pas de commenter cette tâche')
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe('Mon commentaire')
    expect(feedItems(wrapper)).toHaveLength(3)
  })

  it('dit quand l\'activité ne peut pas être lue', async () => {
    const wrapper = await openApp('/projets/1/taches/11', {})
    fakeApi.on('GET', '/tasks/11/activities', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    await openActivity(wrapper)

    expect(wrapper.find('.feed-section [role="alert"]').text()).toContain('OpenProject ne vous permet pas de lire l\'activité de cette tâche')
  })

  it('reste sur l\'onglet Activité en passant à une autre tâche', async () => {
    const wrapper = await openApp('/projets/1/taches/11', { 11: history, 20: [] })
    await openActivity(wrapper)

    await wrapper.findAll('[role="treeitem"]').find(item => item.text().includes('Contrat de maintenance'))!.trigger('click')
    await expectNavigatedTo('/projets/1/taches/20')

    expect(tab(wrapper, 'Activité').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.feed-section').text()).toContain('Aucune activité pour l\'instant.')
  })

  it('remplace la dernière activité quand OP y fond le commentaire', async () => {
    fakeApi.on('POST', '/tasks/11/activities', () => ({
      activity: { ...history[2]!, comment: '<p>Et voilà.</p>' },
    }))
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)

    await textarea(wrapper).setValue('Et voilà.')
    await wrapper.find('form.composer').trigger('submit')
    await flushPromises()

    const items = feedItems(wrapper)
    expect(items).toHaveLength(3)
    expect(items[2]!.find('.markdown').text()).toBe('Et voilà.')
    expect(items[2]!.findAll('.comment-changes li').map(item => item.text())).toEqual(history[2]!.changes)
  })

  it('garde le brouillon de chaque tâche, et l\'échec d\'un envoi sur sa tâche', async () => {
    let fail: (error: Error) => void = () => {}
    fakeApi.on('POST', '/tasks/11/activities', () => new Promise((_resolve, reject) => {
      fail = reject
    }))
    const wrapper = await openApp('/projets/1/taches/11', { 11: history, 20: [] })
    await openActivity(wrapper)
    await textarea(wrapper).setValue('Commentaire sur la 11')
    await wrapper.find('form.composer').trigger('submit')

    await wrapper.findAll('[role="treeitem"]').find(item => item.text().includes('Contrat de maintenance'))!.trigger('click')
    await expectNavigatedTo('/projets/1/taches/20')
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe('')
    fail(new ApiError(503, 'op_unavailable'))
    await flushPromises()
    expect(wrapper.find('.composer [role="alert"]').exists()).toBe(false)

    await wrapper.findAll('[role="treeitem"]').find(item => item.text().includes('Parcours de connexion'))!.trigger('click')
    await expectNavigatedTo('/projets/1/taches/11')
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe('Commentaire sur la 11')
    expect(wrapper.find('.composer [role="alert"]').text()).toContain('OpenProject ne répond pas')
  })

  it('garde le brouillon d\'un commentaire en passant par l\'onglet Détail', async () => {
    const wrapper = await openApp('/projets/1/taches/11')
    await openActivity(wrapper)
    await textarea(wrapper).setValue('Brouillon')

    await tab(wrapper, 'Détail').trigger('mousedown', { button: 0 })
    await flushPromises()
    expect(textarea(wrapper).isVisible()).toBe(false)
    await openActivity(wrapper)

    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe('Brouillon')
  })
})
