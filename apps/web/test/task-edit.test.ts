import type { TaskDetail, TaskNode, TaskStatus } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseHours } from '@/features/tasks/format'
import { withParent, withTreeFields } from '@/features/tasks/tasks'
import { router } from '@/router'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { mountApp } from './support/mount-app'

const camille = { id: 3, name: 'Camille Roux' }
const bruno = { id: 4, name: 'Bruno Petit' }
const nouveau: TaskStatus = { id: 1, name: 'Nouveau', isClosed: false }
const enCours: TaskStatus = { id: 7, name: 'En cours', isClosed: false }

function node(id: number, subject: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    subject,
    status: nouveau,
    assignee: null,
    children,
  }
}

const tree = [
  node(10, 'Refonte du portail client', [
    {
      ...node(11, 'Parcours de connexion'),
      assignee: camille,
    },
  ]),
  node(20, 'Contrat de maintenance 2027'),
]

const stored: TaskDetail = {
  id: 11,
  subject: 'Parcours de connexion',
  lockVersion: 4,
  status: { id: 1, name: 'Nouveau', isClosed: false },
  type: { id: 1, name: 'Tâche' },
  priority: null,
  assignee: camille,
  responsible: null,
  estimatedHours: 16,
  remainingHours: 6,
  spentHours: null,
  startDate: null,
  dueDate: null,
  version: null,
  category: null,
  parent: { id: 10, subject: 'Refonte du portail client' },
  description: '',
}

/** Réponse d'OP tenue en attente : le test décide quand elle arrive. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function openTask() {
  fakeApi.on('GET', '/projects/1', () => ({
    project: { id: 1, identifier: 'alpha', name: 'Alpha' },
  }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
  fakeApi.on('GET', '/tasks/11', () => ({ task: stored }))
  return mountApp('/projets/1/taches/11')
}

type Wrapper = Awaited<ReturnType<typeof openTask>>

function hourButton(wrapper: Wrapper, label: string) {
  const button = wrapper.findAll('aside .hour button').find(item => item.attributes('aria-label')?.startsWith(`${label} :`))
  if (!button)
    throw new Error(`Heure absente : ${label}`)
  return button
}

async function typeHours(wrapper: Wrapper, label: string, text: string) {
  await hourButton(wrapper, label).trigger('click')
  const input = wrapper.find('aside .hour input')
  await input.setValue(text)
  await input.trigger('keydown', { key: 'Enter' })
}

function treeRow(wrapper: Wrapper, subject: string) {
  const row = wrapper.findAll('[role="treeitem"]').find(item => item.find('.name').text() === subject)
  if (!row)
    throw new Error(`Ligne absente : ${subject}`)
  return row
}

function treeAssignee(wrapper: Wrapper, subject: string) {
  return treeRow(wrapper, subject).find('.assignee').text()
}

/** Bouton d'une liste de choix du détail : « Assigné », « État », « Type »… */
function picker(wrapper: Wrapper, label: string) {
  const button = wrapper.findAll('aside .trigger').find(item => item.attributes('aria-label')?.startsWith(`${label} :`))
  if (!button)
    throw new Error(`Liste absente : ${label}`)
  return button
}

/** Choisit une valeur permise ; le choix dans la liste est couvert par les tests de bout en bout. */
async function selectAllowedValue(wrapper: Wrapper, field: 'status' | 'type' | 'priority', value: object) {
  const component = wrapper.findAllComponents({ name: 'TaskAllowedValuePicker' }).find(item => item.props('field') === field)
  if (!component)
    throw new Error(`Liste absente : ${field}`)
  component.vm.$emit('save', { [field]: value })
  await flushPromises()
}

describe('modification d\'une tâche', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('affiche le nouveau temps avant la réponse d\'OP, puis la version enregistrée', async () => {
    const wrapper = await openTask()
    const answer = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => answer.promise)

    await typeHours(wrapper, 'Restant', '2,5')
    await flushPromises()

    expect(hourButton(wrapper, 'Restant').text()).toBe('2,5 h')
    expect(hourButton(wrapper, 'Restant').classes()).toContain('pending')
    expect(fakeApi.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { lockVersion: 4, remainingHours: 2.5 },
    })

    answer.resolve({
      task: { ...stored, remainingHours: 2.5, lockVersion: 5 },
    })
    await flushPromises()
    expect(hourButton(wrapper, 'Restant').text()).toBe('2,5 h')
    expect(hourButton(wrapper, 'Restant').classes()).not.toContain('pending')
  })

  it('envoie les modifications l\'une après l\'autre, chacune avec la version obtenue par la précédente', async () => {
    const wrapper = await openTask()
    const first = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => first.promise)

    await typeHours(wrapper, 'Estimé', '20')
    await flushPromises()
    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: {
        ...stored,
        estimatedHours: 20,
        remainingHours: 3,
        lockVersion: 6,
      },
    }))
    await typeHours(wrapper, 'Restant', '3')
    await flushPromises()

    // La seconde attend la première, et les deux valeurs restent affichées.
    expect(fakeApi.calls.filter(call => call.method === 'PATCH')).toHaveLength(1)
    expect(hourButton(wrapper, 'Estimé').text()).toBe('20 h')
    expect(hourButton(wrapper, 'Restant').text()).toBe('3 h')

    first.resolve({
      task: { ...stored, estimatedHours: 20, lockVersion: 5 },
    })
    await flushPromises()

    expect(fakeApi.calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([
      { lockVersion: 4, estimatedHours: 20 },
      { lockVersion: 5, remainingHours: 3 },
    ])
    expect(hourButton(wrapper, 'Estimé').text()).toBe('20 h')
    expect(hourButton(wrapper, 'Restant').text()).toBe('3 h')
  })

  it('revient à l\'état réel et affiche le refus d\'OP', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(422, 'op_rejected', {
        error: 'op_rejected',
        message: 'OpenProject a refusé la modification : Le temps restant ne peut pas dépasser le temps estimé.',
        // Un autre a modifié l'estimé entre-temps : c'est l'état réel qui s'affiche.
        task: { ...stored, estimatedHours: 18, lockVersion: 5 },
      })
    })

    await typeHours(wrapper, 'Restant', '40')
    await flushPromises()

    expect(hourButton(wrapper, 'Restant').text()).toBe('6 h')
    expect(hourButton(wrapper, 'Restant').classes()).toContain('rejected')
    expect(hourButton(wrapper, 'Estimé').text()).toBe('18 h')
    expect(wrapper.find('aside [role="alert"]').text()).toBe('OpenProject a refusé la modification : Le temps restant ne peut pas dépasser le temps estimé.')
    // Un refus ne change pas en réessayant.
    expect(wrapper.find('aside .edit-error').text()).not.toContain('Réessayer')
  })

  it('reprend la valeur d\'avant quand OP ne répond pas, et propose de réessayer', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(503, 'op_unavailable')
    })

    await typeHours(wrapper, 'Estimé', '30')
    await flushPromises()

    expect(hourButton(wrapper, 'Estimé').text()).toBe('16 h')
    expect(wrapper.find('aside [role="alert"]').text()).toBe('OpenProject ne répond pas. Réessayez dans un instant.')

    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...stored, estimatedHours: 30, lockVersion: 5 },
    }))
    const retry = wrapper.findAll('aside .edit-error button').find(button => button.text() === 'Réessayer')!
    await retry.trigger('click')
    await flushPromises()

    expect(hourButton(wrapper, 'Estimé').text()).toBe('30 h')
    expect(wrapper.find('aside .edit-error').exists()).toBe(false)
  })

  it('recharge la tâche modifiée dans OP entre-temps, rappelle les valeurs saisies et les réapplique', async () => {
    const wrapper = await openTask()
    // Un autre a changé l'estimé et l'assigné dans OP depuis l'ouverture du détail.
    const reloaded = {
      ...stored,
      estimatedHours: 18,
      assignee: bruno,
      lockVersion: 5,
    }
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(409, 'op_conflict', {
        error: 'op_conflict',
        message: 'Cette tâche a été modifiée dans OpenProject depuis son chargement : la modification n\'a pas été enregistrée.',
        task: reloaded,
      })
    })

    await typeHours(wrapper, 'Estimé', '30')
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, estimatedHours: 30 })
    expect(hourButton(wrapper, 'Estimé').text()).toBe('18\u202Fh')
    expect(hourButton(wrapper, 'Estimé').classes()).toContain('rejected')
    expect(picker(wrapper, 'Assigné').text()).toBe('Bruno Petit')
    expect(treeAssignee(wrapper, 'Parcours de connexion')).toBe('Bruno Petit')
    expect(wrapper.find('aside [role="alert"]').text()).toBe(
      'Cette tâche a été modifiée dans OpenProject depuis son chargement, elle a été rechargée. Votre modification n\'a pas été enregistrée : Estimé : 30\u202Fh.',
    )

    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...reloaded, estimatedHours: 30, lockVersion: 6 },
    }))
    const reapply = wrapper.findAll('aside .edit-error button').find(button => button.text() === 'Réappliquer mes modifications')!
    await reapply.trigger('click')
    await flushPromises()

    // Réappliquée sur la version relue, la valeur saisie ne touche pas à l'assigné changé entre-temps.
    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 5, estimatedHours: 30 })
    expect(hourButton(wrapper, 'Estimé').text()).toBe('30\u202Fh')
    expect(picker(wrapper, 'Assigné').text()).toBe('Bruno Petit')
    expect(wrapper.find('aside .edit-error').exists()).toBe(false)
  })

  it('relit la tâche après un conflit qui ne la joint pas, et rappelle la valeur saisie', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(409, 'op_conflict', { error: 'op_conflict', message: 'Conflit.' })
    })
    fakeApi.on('GET', '/tasks/11', () => ({
      task: { ...stored, remainingHours: 2, lockVersion: 5 },
    }))

    await typeHours(wrapper, 'Restant', '')
    await flushPromises()

    expect(hourButton(wrapper, 'Restant').text()).toBe('2\u202Fh')
    expect(wrapper.find('aside [role="alert"]').text()).toBe(
      'Cette tâche a été modifiée dans OpenProject depuis son chargement, elle a été rechargée. Votre modification n\'a pas été enregistrée : Restant : vide.',
    )
  })

  it('distingue une panne de l\'app d\'une indisponibilité d\'OP', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(500, 'unknown_error')
    })

    await typeHours(wrapper, 'Estimé', '30')
    await flushPromises()

    expect(wrapper.find('aside [role="alert"]').text()).toBe('L\'app n\'a pas pu modifier le temps estimé. Réessayez dans un instant.')
    expect(wrapper.find('aside [role="alert"]').text()).not.toContain('OpenProject')
  })

  it('affiche le refus d\'une modification même si une autre a été lancée depuis', async () => {
    const wrapper = await openTask()
    const first = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => first.promise)

    await typeHours(wrapper, 'Estimé', '5')
    await flushPromises()
    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...stored, remainingHours: 3, lockVersion: 5 },
    }))
    await typeHours(wrapper, 'Restant', '3')
    await flushPromises()
    expect(hourButton(wrapper, 'Estimé').classes()).toContain('pending')
    expect(hourButton(wrapper, 'Restant').classes()).toContain('pending')

    first.reject(new ApiError(422, 'op_rejected', {
      error: 'op_rejected',
      message: 'OpenProject a refusé la modification : Le temps estimé est trop court.',
      task: stored,
    }))
    await flushPromises()

    expect(hourButton(wrapper, 'Estimé').text()).toBe('16\u202Fh')
    expect(hourButton(wrapper, 'Estimé').classes()).toContain('rejected')
    expect(hourButton(wrapper, 'Restant').text()).toBe('3\u202Fh')
    expect(wrapper.find('aside [role="alert"]').text()).toBe('OpenProject a refusé la modification : Le temps estimé est trop court.')
  })

  it('relit la tâche après un échec sans état réel, sans garder une valeur jamais enregistrée', async () => {
    const wrapper = await openTask()
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => first.promise)
    await typeHours(wrapper, 'Estimé', '5')
    await flushPromises()
    fakeApi.on('PATCH', '/tasks/11', () => second.promise)
    await typeHours(wrapper, 'Estimé', '6')
    await flushPromises()

    // OP refuse 5 et renvoie l'état réel ; 6 reste affiché, en attente.
    first.reject(new ApiError(422, 'op_rejected', { error: 'op_rejected', message: 'Refusé.', task: stored }))
    await flushPromises()
    expect(hourButton(wrapper, 'Estimé').text()).toBe('6\u202Fh')

    // 6 échoue sans état réel : la tâche est relue, et 5 ne revient pas.
    second.reject(new ApiError(0, 'network_error'))
    await flushPromises()
    expect(hourButton(wrapper, 'Estimé').text()).toBe('16\u202Fh')
    expect(fakeApi.calls.filter(call => call.method === 'GET' && call.path === '/tasks/11')).toHaveLength(2)
  })

  it('abandonne une saisie invalide quand le champ perd le focus', async () => {
    const wrapper = await openTask()

    await hourButton(wrapper, 'Estimé').trigger('click')
    const input = wrapper.find('aside .hour input')
    await input.setValue('deux')
    await input.trigger('blur')

    expect(wrapper.find('aside .hour input').exists()).toBe(false)
    expect(hourButton(wrapper, 'Estimé').text()).toBe('16\u202Fh')
    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
  })

  it('vide un temps quand le champ est effacé', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...stored, remainingHours: null, lockVersion: 5 },
    }))

    await typeHours(wrapper, 'Restant', '')
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, remainingHours: null })
    expect(hourButton(wrapper, 'Restant').text()).toBe('Non renseigné')
  })

  it('refuse une saisie qui n\'est pas un temps, sans rien envoyer', async () => {
    const wrapper = await openTask()

    await typeHours(wrapper, 'Estimé', 'deux heures')

    expect(wrapper.find('aside .hour input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('aside .hour [role="alert"]').text()).toContain('Saisissez des heures')
    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
  })

  it('annule la saisie avec Échap, sans fermer le détail', async () => {
    const wrapper = await openTask()

    await hourButton(wrapper, 'Estimé').trigger('click')
    const input = wrapper.find('aside .hour input')
    await input.setValue('99')
    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.find('aside .hour input').exists()).toBe(false)
    expect(hourButton(wrapper, 'Estimé').text()).toBe('16 h')
    expect(wrapper.find('aside.task-detail').exists()).toBe(true)
    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
  })

  it('n\'envoie rien quand la valeur n\'a pas changé', async () => {
    const wrapper = await openTask()

    await typeHours(wrapper, 'Estimé', '16')
    await flushPromises()

    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
  })

  it('montre le nouvel assigné dans l\'arbre avant la réponse d\'OP, et revient en arrière sur un refus', async () => {
    const wrapper = await openTask()
    const answer = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => answer.promise)
    expect(treeAssignee(wrapper, 'Parcours de connexion')).toBe('Camille Roux')

    // Le choix dans la liste est couvert par les tests de bout en bout ; ici, l'effet de la sélection.
    wrapper.findComponent({ name: 'TaskAssigneePicker' }).vm.$emit('select', bruno)
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, assigneeId: 4 })
    expect(picker(wrapper, 'Assigné').text()).toBe('Bruno Petit')
    expect(treeAssignee(wrapper, 'Parcours de connexion')).toBe('Bruno Petit')

    answer.reject(new ApiError(422, 'op_rejected', {
      error: 'op_rejected',
      message: 'OpenProject a refusé la modification : Assignee is not set to one of the allowed values.',
      task: stored,
    }))
    await flushPromises()

    expect(picker(wrapper, 'Assigné').text()).toBe('Camille Roux')
    expect(picker(wrapper, 'Assigné').classes()).toContain('rejected')
    expect(treeAssignee(wrapper, 'Parcours de connexion')).toBe('Camille Roux')
  })

  it('montre le nouvel état dans le détail et dans l\'arbre avant la réponse d\'OP', async () => {
    const wrapper = await openTask()
    const answer = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => answer.promise)

    await selectAllowedValue(wrapper, 'status', enCours)

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, statusId: 7 })
    expect(picker(wrapper, 'État').text()).toBe('En cours')
    expect(picker(wrapper, 'État').classes()).toContain('pending')
    expect(treeRow(wrapper, 'Parcours de connexion').find('.status').text()).toBe('En cours')

    answer.resolve({
      task: { ...stored, status: enCours, lockVersion: 5 },
    })
    await flushPromises()
    expect(picker(wrapper, 'État').text()).toBe('En cours')
    expect(picker(wrapper, 'État').classes()).not.toContain('pending')
  })

  it('revient à l\'état réel, dans le détail et dans l\'arbre, quand OP refuse la transition', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(422, 'op_rejected', {
        error: 'op_rejected',
        message: 'OpenProject a refusé la modification : Status is invalid because no valid transition exists.',
        task: stored,
      })
    })

    await selectAllowedValue(wrapper, 'status', enCours)

    expect(picker(wrapper, 'État').text()).toBe('Nouveau')
    expect(picker(wrapper, 'État').classes()).toContain('rejected')
    expect(treeRow(wrapper, 'Parcours de connexion').find('.status').text()).toBe('Nouveau')
    expect(wrapper.find('aside [role="alert"]').text()).toBe('OpenProject a refusé la modification : Status is invalid because no valid transition exists.')
  })

  it('change le type et la priorité', async () => {
    const wrapper = await openTask()
    const bug = { id: 7, name: 'Anomalie' }
    const haute = { id: 9, name: 'Haute' }
    const answers = [
      { ...stored, type: bug, lockVersion: 5 },
      {
        ...stored,
        type: bug,
        priority: haute,
        lockVersion: 6,
      },
    ]
    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: answers.shift(),
    }))

    expect(picker(wrapper, 'Priorité').text()).toBe('Non renseignée')
    await selectAllowedValue(wrapper, 'type', bug)
    await selectAllowedValue(wrapper, 'priority', haute)

    expect(fakeApi.calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([
      { lockVersion: 4, typeId: 7 },
      { lockVersion: 5, priorityId: 9 },
    ])
    expect(picker(wrapper, 'Type').text()).toBe('Anomalie')
    expect(picker(wrapper, 'Priorité').text()).toBe('Haute')
  })

  it('propose pour parent les tâches du projet, hors la tâche et ses sous-tâches', async () => {
    const wrapper = await openTask()
    expect(picker(wrapper, 'Parent').text()).toBe('Refonte du portail client')
    expect(wrapper.findComponent({ name: 'TaskParentPicker' }).findComponent({ name: 'TaskChoicePicker' }).props('choices')).toEqual([
      { id: 10, name: 'Refonte du portail client' },
      { id: 20, name: 'Contrat de maintenance 2027' },
    ])

    fakeApi.on('GET', '/tasks/10', () => ({
      task: {
        ...stored,
        id: 10,
        subject: 'Refonte du portail client',
        parent: null,
      },
    }))
    await router.push('/projets/1/taches/10')
    await flushPromises()

    expect(picker(wrapper, 'Parent').text()).toBe('Aucun parent')
    expect(wrapper.findComponent({ name: 'TaskParentPicker' }).findComponent({ name: 'TaskChoicePicker' }).props('choices')).toEqual([
      { id: 20, name: 'Contrat de maintenance 2027' },
    ])
  })

  it('déplace la tâche sous son nouveau parent dans l\'arbre, avant la réponse d\'OP', async () => {
    const wrapper = await openTask()
    const answer = deferred<unknown>()
    fakeApi.on('PATCH', '/tasks/11', () => answer.promise)
    const contrat = { id: 20, subject: 'Contrat de maintenance 2027' }

    wrapper.findComponent({ name: 'TaskParentPicker' }).vm.$emit('select', contrat)
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, parentId: 20 })
    expect(picker(wrapper, 'Parent').text()).toBe('Contrat de maintenance 2027')
    expect(picker(wrapper, 'Parent').classes()).toContain('pending')
    expect(wrapper.find('aside .parent').text()).toContain('Contrat de maintenance 2027')
    expect(treeRow(wrapper, 'Refonte du portail client').attributes('aria-expanded')).toBeUndefined()
    expect(treeRow(wrapper, 'Contrat de maintenance 2027').attributes('aria-expanded')).toBe('true')
    // La tâche ouverte reste visible : son nouveau parent est déplié.
    expect(treeRow(wrapper, 'Parcours de connexion').attributes('aria-level')).toBe('2')

    answer.resolve({
      task: { ...stored, parent: contrat, lockVersion: 5 },
    })
    await flushPromises()
    expect(picker(wrapper, 'Parent').classes()).not.toContain('pending')
    expect(treeRow(wrapper, 'Contrat de maintenance 2027').attributes('aria-expanded')).toBeDefined()
  })

  it('fait de la tâche une racine', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...stored, parent: null, lockVersion: 5 },
    }))

    wrapper.findComponent({ name: 'TaskParentPicker' }).vm.$emit('select', null)
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 4, parentId: null })
    expect(picker(wrapper, 'Parent').text()).toBe('Aucun parent')
    expect(wrapper.find('aside .parent').exists()).toBe(false)
    expect(treeRow(wrapper, 'Parcours de connexion').attributes('aria-level')).toBe('1')
  })

  it('revient au parent réel et affiche le refus du serveur pour un parent qui créerait un cycle', async () => {
    const wrapper = await openTask()
    const message = 'Ce parent est l\'une de ses sous-tâches : une tâche ne peut pas devenir la sous-tâche de ses propres sous-tâches.'
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(422, 'task_parent_cycle', { error: 'task_parent_cycle', message, task: stored })
    })

    wrapper.findComponent({ name: 'TaskParentPicker' }).vm.$emit('select', { id: 20, subject: 'Contrat de maintenance 2027' })
    await flushPromises()

    expect(picker(wrapper, 'Parent').text()).toBe('Refonte du portail client')
    expect(picker(wrapper, 'Parent').classes()).toContain('rejected')
    expect(treeRow(wrapper, 'Contrat de maintenance 2027').attributes('aria-expanded')).toBeUndefined()
    expect(wrapper.find('aside [role="alert"]').text()).toBe(message)
    expect(wrapper.find('aside .edit-error').text()).not.toContain('Réessayer')
  })
})

describe('saisie des heures', () => {
  it.each([
    ['2', 2],
    ['2,5', 2.5],
    ['2.5', 2.5],
    [' 12 h ', 12],
    ['1h30', 1.5],
    ['1 h 45', 1.75],
    ['0', 0],
    ['', null],
  ])('lit « %s »', (text, hours) => {
    expect(parseHours(text)).toBe(hours)
  })

  it.each([
    'deux',
    '-1',
    '1,5 h 30',
    '1 h 60',
    '2,',
    '100001',
    '0,0001',
  ])('refuse « %s »', (text) => {
    expect(parseHours(text)).toBeUndefined()
  })
})

describe('état et assigné dans l\'arbre', () => {
  it('ne copie que le chemin de la tâche modifiée', () => {
    const updated = withTreeFields(tree, 11, { status: enCours, assignee: bruno })

    expect(updated[0]!.children[0]).toMatchObject({ status: enCours, assignee: bruno })
    expect(updated[1]).toBe(tree[1])
    expect(tree[0]!.children[0]).toMatchObject({ status: nouveau, assignee: camille })
  })

  it('rend l\'arbre tel quel quand ni l\'état ni l\'assigné ne changent', () => {
    expect(withTreeFields(tree, 11, {
      status: { ...nouveau },
      assignee: { ...camille },
    })).toBe(tree)
    expect(withTreeFields(tree, 99, { status: enCours, assignee: bruno })).toBe(tree)
  })
})

describe('parent dans l\'arbre', () => {
  const deep = [
    node(10, 'A', [
      node(11, 'A1', [
        node(12, 'A1a'),
      ]),
      node(13, 'A2'),
    ]),
    node(20, 'B', [
      node(19, 'B0'),
      node(21, 'B1'),
    ]),
    node(30, 'C'),
  ]

  const ids = (roots: TaskNode[]): unknown[] => roots.map(task => task.children.length
    ? [
        task.id,
        ids(task.children),
      ]
    : task.id)

  it('range la tâche parmi ses nouveaux frères par identifiant, avec ses sous-tâches', () => {
    expect(ids(withParent(deep, 11, 20))).toEqual([
      [
        10,
        [13],
      ],
      [
        20,
        [
          [
            11,
            [12],
          ],
          19,
          21,
        ],
      ],
      30,
    ])
  })

  it('fait de la tâche une racine, sans parent ou avec un parent hors de l\'arbre', () => {
    const expected = [
      [
        10,
        [13],
      ],
      [
        11,
        [12],
      ],
      [
        20,
        [19, 21],
      ],
      30,
    ]
    expect(ids(withParent(deep, 11, null))).toEqual(expected)
    expect(ids(withParent(deep, 11, 99))).toEqual(expected)
  })

  it('ne copie que les chemins touchés', () => {
    const updated = withParent(deep, 12, 13)

    expect(ids(updated)).toEqual([
      [
        10,
        [
          11,
          [
            13,
            [12],
          ],
        ],
      ],
      [
        20,
        [19, 21],
      ],
      30,
    ])
    expect(updated[1]).toBe(deep[1])
    expect(ids(deep)[0]).toEqual([
      10,
      [
        [
          11,
          [12],
        ],
        13,
      ],
    ])
  })

  it('rend l\'arbre tel quel quand le parent ne change pas ou créerait un cycle', () => {
    expect(withParent(deep, 11, 10)).toBe(deep)
    expect(withParent(deep, 30, null)).toBe(deep)
    expect(withParent(deep, 10, 12)).toBe(deep)
    expect(withParent(deep, 10, 10)).toBe(deep)
    expect(withParent(deep, 99, 10)).toBe(deep)
  })
})
