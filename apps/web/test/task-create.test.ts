import type { ProjectType, TaskDetail, TaskNode, TaskStatus } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTaskType, withNewTask } from '@/features/tasks/tasks'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { expectNavigatedTo, mountApp } from './support/mount-app'

const nouveau: TaskStatus = { id: 1, name: 'Nouveau', isClosed: false }

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
    node(11, 'Parcours de connexion'),
  ]),
  node(20, 'Contrat de maintenance 2027'),
]

const bug: ProjectType = { id: 7, name: 'Bug', isDefault: true }
const tache: ProjectType = { id: 1, name: 'Tâche', isDefault: false }
const jalon: ProjectType = { id: 2, name: 'Jalon', isDefault: false }

function created(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 30,
    subject: 'Préparer la démo',
    lockVersion: 0,
    status: nouveau,
    type: { id: tache.id, name: tache.name },
    priority: { id: 8, name: 'Normale' },
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
    ...overrides,
  }
}

/** Réponse d'OP tenue en attente : le test décide quand elle arrive. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function openProject(tasks: TaskNode[] = tree, types: ProjectType[] = [bug, tache, jalon]) {
  fakeApi.on('GET', '/projects/1', () => ({
    project: { id: 1, identifier: 'alpha', name: 'Alpha' },
  }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks }))
  fakeApi.on('GET', '/projects/1/types', () => ({ types }))
  fakeApi.on('GET', '/tasks/30', () => ({
    task: created(),
  }))
  return mountApp('/projets/1')
}

type Wrapper = Awaited<ReturnType<typeof openProject>>

function newTaskButton(wrapper: Wrapper) {
  const button = wrapper.findAll('button').find(item => item.text() === 'Nouvelle tâche')
  if (!button)
    throw new Error('Bouton « Nouvelle tâche » absent')
  return button
}

/** Le dialogue est rendu hors de la page, à la fin du document. */
function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]')
}

function dialogButton(text: string) {
  const button = [
    ...dialog()?.querySelectorAll('button') ?? [],
  ].find(item => item.textContent?.trim() === text)
  if (!button)
    throw new Error(`Bouton absent du dialogue : ${text}`)
  return button
}

function picker(label: string) {
  const button = [
    ...dialog()?.querySelectorAll('.trigger') ?? [],
  ].find(item => item.getAttribute('aria-label')?.startsWith(`${label} :`))
  if (!button)
    throw new Error(`Liste absente : ${label}`)
  return button
}

function subjectInput() {
  const input = dialog()?.querySelector<HTMLInputElement>('#new-task-subject')
  if (!input)
    throw new Error('Champ du titre absent')
  return input
}

async function openDialog(wrapper: Wrapper) {
  await newTaskButton(wrapper).trigger('click')
  await flushPromises()
}

async function typeSubject(text: string) {
  const input = subjectInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit() {
  dialog()?.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}

describe('création d\'une tâche', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('ouvre un dialogue avec le type, le titre et le parent, focus sur le titre', async () => {
    const wrapper = await openProject()

    await openDialog(wrapper)

    expect(dialog()?.querySelector('h2')?.textContent).toBe('Nouvelle tâche dans Alpha')
    expect(picker('Type').textContent?.trim()).toBe('Tâche')
    expect(subjectInput().value).toBe('')
    expect(picker('Parent').textContent?.trim()).toBe('Aucun parent')
    await vi.waitFor(() => expect(document.activeElement).toBe(subjectInput()))
    expect(dialogButton('Créer').disabled).toBe(true)
  })

  it('propose le bouton même dans un projet sans tâche, et l\'annonce dans l\'état vide', async () => {
    const wrapper = await openProject([])

    expect(newTaskButton(wrapper).exists()).toBe(true)
    expect(wrapper.text()).toContain('Ce projet n\'a encore aucune tâche. Créez la première avec « Nouvelle tâche ».')
  })

  it('propose pour parent toutes les tâches du projet', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)

    const parentPicker = wrapper.findComponent({ name: 'TaskCreateDialog' }).findComponent({ name: 'TaskParentPicker' })
    expect(parentPicker.findComponent({ name: 'TaskChoicePicker' }).props('choices')).toEqual([
      { id: 10, name: 'Refonte du portail client' },
      { id: 11, name: 'Parcours de connexion' },
      { id: 20, name: 'Contrat de maintenance 2027' },
    ])
  })

  it('crée la tâche, ferme le dialogue et ouvre son détail, sélectionné dans l\'arbre', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    const answer = deferred<unknown>()
    fakeApi.on('POST', '/projects/1/tasks', () => answer.promise)

    await typeSubject('  Préparer la démo ')
    await submit()

    expect(fakeApi.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/projects/1/tasks',
      body: { typeId: tache.id, subject: 'Préparer la démo', parentId: null },
    })
    expect(dialogButton('Création…').disabled).toBe(true)
    // Un second envoi pendant l'attente ne crée pas une seconde tâche.
    await submit()
    expect(fakeApi.calls.filter(call => call.method === 'POST')).toHaveLength(1)

    fakeApi.on('GET', '/projects/1/tasks', () => ({
      tasks: [
        ...tree,
        node(30, 'Préparer la démo'),
      ],
    }))
    answer.resolve({
      task: created(),
    })
    await expectNavigatedTo('/projets/1/taches/30')

    expect(wrapper.find('aside h2').text()).toBe('Préparer la démo')
    expect(wrapper.find('[role="treeitem"][aria-selected="true"] .name').text()).toBe('Préparer la démo')
    expect(wrapper.find('.count').text()).toBe('4 tâches')
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Fermer le détail'))
  })

  it('crée la tâche sous le parent choisi, avec le type choisi, et déplie son parent', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    const createDialog = wrapper.findComponent({ name: 'TaskCreateDialog' })
    const task = created({
      id: 31,
      subject: 'Corriger le lien',
      type: { id: bug.id, name: bug.name },
      parent: { id: 10, subject: 'Refonte du portail client' },
    })
    fakeApi.on('POST', '/projects/1/tasks', () => ({ task }))
    fakeApi.on('GET', '/tasks/31', () => ({ task }))
    // L'arbre relu reste celui d'avant : la tâche y est déjà, depuis la réponse de la création.
    const answer = deferred<unknown>()
    fakeApi.on('GET', '/projects/1/tasks', () => answer.promise)

    createDialog.findComponent({ name: 'TaskChoicePicker' }).vm.$emit('select', bug)
    createDialog.findComponent({ name: 'TaskParentPicker' }).vm.$emit('select', { id: 10, subject: 'Refonte du portail client' })
    await flushPromises()
    expect(picker('Type').textContent?.trim()).toBe('Bug')
    expect(picker('Parent').textContent?.trim()).toBe('Refonte du portail client')
    await typeSubject('Corriger le lien')
    await submit()

    expect(fakeApi.calls).toContainEqual({
      method: 'POST',
      path: '/projects/1/tasks',
      body: { typeId: bug.id, subject: 'Corriger le lien', parentId: 10 },
    })
    await expectNavigatedTo('/projets/1/taches/31')
    const names = wrapper.findAll('[role="treeitem"] .name').map(item => item.text())
    expect(names).toEqual([
      'Refonte du portail client',
      'Parcours de connexion',
      'Corriger le lien',
      'Contrat de maintenance 2027',
    ])
  })

  it('n\'envoie pas un titre vide ou fait d\'espaces', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)

    await typeSubject('   ')
    await submit()

    expect(dialogButton('Créer').disabled).toBe(true)
    expect(fakeApi.calls.some(call => call.method === 'POST')).toBe(false)
  })

  it('garde la saisie et affiche le refus d\'OP dans le dialogue', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    const message = 'OpenProject a refusé la création : Type is not set to one of the allowed values.'
    fakeApi.on('POST', '/projects/1/tasks', () => {
      throw new ApiError(422, 'op_rejected', { error: 'op_rejected', message })
    })

    await typeSubject('Préparer la démo')
    await submit()

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(message)
    expect(subjectInput().value).toBe('Préparer la démo')
    expect(picker('Type').textContent?.trim()).toBe('Tâche')
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/projets/1')
  })

  it('affiche une panne d\'OP comme ailleurs dans l\'app, et laisse réessayer sans perdre la saisie', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    fakeApi.on('POST', '/projects/1/tasks', () => {
      throw new ApiError(503, 'op_unavailable')
    })

    await typeSubject('Préparer la démo')
    await submit()

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('OpenProject ne répond pas')
    fakeApi.on('POST', '/projects/1/tasks', () => ({
      task: created(),
    }))
    dialogButton('Réessayer').click()
    await expectNavigatedTo('/projets/1/taches/30')
  })

  it('signale les types illisibles et empêche la création', async () => {
    fakeApi.on('GET', '/projects/1/types', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    const wrapper = await openProject()
    fakeApi.on('GET', '/projects/1/types', () => {
      throw new ApiError(403, 'op_forbidden')
    })
    await openDialog(wrapper)
    await typeSubject('Préparer la démo')

    expect(dialog()?.textContent).toContain('Sans les types du projet, la tâche ne peut pas être créée.')
    expect(picker('Type').textContent?.trim()).toBe('Aucun type')
    expect(dialogButton('Créer').disabled).toBe(true)
  })

  it('relit les types après une panne d\'OP', async () => {
    const wrapper = await openProject()
    fakeApi.on('GET', '/projects/1/types', () => {
      throw new ApiError(503, 'op_unavailable')
    })
    await openDialog(wrapper)
    // Un 5xx est retenté une fois avant d'être affiché.
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Sans les types du projet'), { timeout: 3000 })

    fakeApi.on('GET', '/projects/1/types', () => ({
      types: [tache],
    }))
    wrapper.findComponent({ name: 'TaskCreateDialog' }).findComponent({ name: 'TaskChoicePicker' }).vm.$emit('retry')
    await flushPromises()

    expect(picker('Type').textContent?.trim()).toBe('Tâche')
    expect(dialog()?.textContent).not.toContain('Sans les types du projet')
  })

  it('reste ouvert pendant l\'envoi', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    const answer = deferred<unknown>()
    fakeApi.on('POST', '/projects/1/tasks', () => answer.promise)
    await typeSubject('Préparer la démo')
    await submit()

    expect(dialogButton('Annuler').disabled).toBe(true)
    subjectInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(dialog()).not.toBeNull()

    answer.resolve({
      task: created(),
    })
    await expectNavigatedTo('/projets/1/taches/30')
  })

  it('ferme sans rien créer, rend le focus au bouton et oublie la saisie', async () => {
    const wrapper = await openProject()
    await openDialog(wrapper)
    await typeSubject('Brouillon')

    dialogButton('Annuler').click()
    await flushPromises()

    expect(dialog()).toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(newTaskButton(wrapper).element))
    expect(fakeApi.calls.some(call => call.method === 'POST')).toBe(false)

    await openDialog(wrapper)
    expect(subjectInput().value).toBe('')
  })

  it('se ferme avec Échap sans fermer le détail ouvert', async () => {
    fakeApi.on('GET', '/tasks/11', () => ({
      task: created({ id: 11, subject: 'Parcours de connexion' }),
    }))
    fakeApi.on('GET', '/projects/1', () => ({
      project: { id: 1, identifier: 'alpha', name: 'Alpha' },
    }))
    fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
    fakeApi.on('GET', '/projects/1/types', () => ({
      types: [tache],
    }))
    const wrapper = await mountApp('/projets/1/taches/11')
    await openDialog(wrapper)

    subjectInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/projets/1/taches/11')
  })
})

describe('type proposé pour une nouvelle tâche', () => {
  it.each([
    [
      'le type « Tâche »',
      [bug, tache],
      tache,
    ],
    [
      'le type « Task », sans tenir compte de la casse',
      [
        bug,
        { id: 3, name: 'TASK', isDefault: false },
      ],
      { id: 3, name: 'TASK', isDefault: false },
    ],
    [
      'à défaut, le type par défaut d\'OP',
      [jalon, bug],
      bug,
    ],
    [
      'à défaut, le premier type',
      [
        jalon,
        { ...bug, isDefault: false },
      ],
      jalon,
    ],
  ])('choisit %s', (_case, types, expected) => {
    expect(defaultTaskType(types)).toEqual(expected)
  })

  it('ne choisit rien sans type', () => {
    expect(defaultTaskType([])).toBeNull()
  })
})

describe('nouvelle tâche dans l\'arbre', () => {
  const ids = (roots: TaskNode[]): unknown[] => roots.map(task => task.children.length
    ? [
        task.id,
        ids(task.children),
      ]
    : task.id)

  it('range la tâche parmi ses frères, par identifiant', () => {
    expect(ids(withNewTask(tree, node(15, 'Nouvelle'), null))).toEqual([
      [
        10,
        [11],
      ],
      15,
      20,
    ])
    expect(ids(withNewTask(tree, node(30, 'Nouvelle'), 10))).toEqual([
      [
        10,
        [11, 30],
      ],
      20,
    ])
  })

  it('fait une racine d\'une tâche dont le parent n\'est pas dans l\'arbre', () => {
    expect(ids(withNewTask(tree, node(30, 'Nouvelle'), 99))).toEqual([
      [
        10,
        [11],
      ],
      20,
      30,
    ])
  })
})
