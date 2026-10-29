// DOMPurify s'appuie sur l'analyse HTML du navigateur, que happy-dom ne reproduit pas fidèlement.
// @vitest-environment jsdom
import type { TaskDetail, TaskNode } from '@openpatatoes/shared'
import { flushPromises } from '@vue/test-utils'
import { MdEditor } from 'md-editor-v3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizePreview } from '@/features/tasks/markdown'
import { ApiError } from '@/shared/api/api-fetch'
import { fakeApi } from './support/fake-api'
import { expectNavigatedTo, mountApp } from './support/mount-app'

// jsdom n'a pas `matchMedia`, que le thème lit dès son import.
vi.hoisted(() => {
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
})

const tree: TaskNode[] = [
  {
    id: 11,
    subject: 'Parcours de connexion',
    status: { id: 1, name: 'Nouveau', isClosed: false },
    assignee: null,
    children: [],
  },
]

const stored: TaskDetail = {
  id: 11,
  subject: 'Parcours de connexion',
  lockVersion: 4,
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
  description: 'L\'utilisateur se connecte **sans** passer par OpenProject.',
}

async function openTask(task: TaskDetail = stored) {
  fakeApi.on('GET', '/projects/1', () => ({
    project: { id: 1, identifier: 'alpha', name: 'Alpha' },
  }))
  fakeApi.on('GET', '/projects/1/tasks', () => ({ tasks: tree }))
  fakeApi.on('GET', '/tasks/11', () => ({ task }))
  return mountApp('/projets/1/taches/11')
}

type Wrapper = Awaited<ReturnType<typeof openTask>>

function section(wrapper: Wrapper) {
  return wrapper.find('aside section.description')
}

function button(wrapper: Wrapper, text: string) {
  const found = wrapper.findAll('aside button').find(item => item.text() === text)
  if (!found)
    throw new Error(`Bouton absent : ${text}`)
  return found
}

/** Ouvre l'éditeur et y saisit le texte ; la frappe dans CodeMirror est couverte par les tests de bout en bout. */
async function writeDescription(wrapper: Wrapper, text: string) {
  await button(wrapper, 'Modifier la description').trigger('click')
  wrapper.getComponent(MdEditor).vm.$emit('update:modelValue', text)
  await flushPromises()
}

describe('description d\'une tâche', () => {
  beforeEach(() => {
    fakeApi.signedIn()
  })

  it('affiche l\'aperçu du markdown', async () => {
    const wrapper = await openTask()

    const preview = section(wrapper).find('.preview')
    expect(preview.text()).toContain('L\'utilisateur se connecte sans passer par OpenProject.')
    expect(preview.find('strong').text()).toBe('sans')
  })

  it('n\'exécute ni script ni attribut d\'événement d\'une description malveillante', async () => {
    const wrapper = await openTask({
      ...stored,
      description: 'Texte <script>window.hacked = true</script>\n\n<img src="x.png" alt="schéma" onerror="window.hacked = true">\n\n[lien](javascript:alert(1)) <a href="javascript:alert(1)">autre</a>',
    })

    const preview = section(wrapper).find('.preview')
    expect(preview.find('script').exists()).toBe(false)
    expect(preview.find('img').attributes()).not.toHaveProperty('onerror')
    expect(preview.find('img').attributes('alt')).toBe('schéma')
    // markdown-it laisse un lien `javascript:` en texte ; DOMPurify retire l'attribut d'une balise.
    expect(preview.findAll('a').map(link => link.attributes('href'))).toEqual([undefined])
    expect((window as { hacked?: boolean }).hacked).toBeUndefined()
  })

  it('se ferme avec Échap depuis l\'aperçu, hors de toute saisie', async () => {
    const wrapper = await openTask()

    await section(wrapper).find('.preview .md-editor').trigger('keydown', { key: 'Escape' })

    await expectNavigatedTo('/projets/1')
  })

  it('propose d\'ajouter une description à une tâche qui n\'en a pas', async () => {
    const wrapper = await openTask({ ...stored, description: '' })

    expect(section(wrapper).find('.preview').exists()).toBe(false)
    await button(wrapper, 'Ajouter une description').trigger('click')

    expect(wrapper.findComponent(MdEditor).exists()).toBe(true)
  })

  it('enregistre la description, affichée avant la réponse d\'OP', async () => {
    const wrapper = await openTask()
    let respond: (value: unknown) => void = () => {}
    fakeApi.on('PATCH', '/tasks/11', () => new Promise((resolve) => {
      respond = resolve
    }))

    await writeDescription(wrapper, 'Connexion par **mot de passe**.')
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()

    expect(fakeApi.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      path: '/tasks/11',
      body: { lockVersion: 4, description: 'Connexion par **mot de passe**.' },
    })
    expect(wrapper.findComponent(MdEditor).exists()).toBe(false)
    const preview = section(wrapper).find('.preview')
    // md-editor-v3 rend l'aperçu après un court délai.
    await expect.poll(() => preview.text()).toContain('Connexion par mot de passe.')
    expect(preview.classes()).toContain('pending')

    respond({
      task: { ...stored, description: 'Connexion par **mot de passe**.', lockVersion: 5 },
    })
    await flushPromises()

    expect(section(wrapper).find('.preview').classes()).not.toContain('pending')
  })

  it('rend le texte refusé dans l\'éditeur, avec le refus d\'OP sous la description', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(422, 'op_rejected', {
        error: 'op_rejected',
        message: 'OpenProject a refusé la modification : La description est trop longue.',
        task: stored,
      })
    })

    await writeDescription(wrapper, 'Un texte refusé')
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(MdEditor).props('modelValue')).toBe('Un texte refusé')
    expect(section(wrapper).element.parentElement?.querySelector('[role="alert"]')?.textContent)
      .toBe('OpenProject a refusé la modification : La description est trop longue.')
    expect(wrapper.find('aside .hours + .edit-error').exists()).toBe(false)
  })

  it('garde la description saisie dans l\'éditeur quand la tâche a été modifiée dans OP entre-temps', async () => {
    const wrapper = await openTask()
    fakeApi.on('PATCH', '/tasks/11', () => {
      throw new ApiError(409, 'op_conflict', {
        error: 'op_conflict',
        message: 'Conflit.',
        task: { ...stored, description: 'Version d\'un collègue', lockVersion: 5 },
      })
    })

    await writeDescription(wrapper, 'Ma version')
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(MdEditor).props('modelValue')).toBe('Ma version')
    const alert = section(wrapper).element.parentElement?.querySelector('.edit-error')
    expect(alert?.querySelector('[role="alert"]')?.textContent).toBe(
      'Cette tâche a été modifiée dans OpenProject depuis son chargement, elle a été rechargée. Votre description est restée dans l\'éditeur : relisez-la, puis enregistrez-la à nouveau.',
    )
    // Réappliquer la description écraserait celle du collègue sans la lire : on l'enregistre depuis l'éditeur.
    expect(alert?.querySelector('button')).toBeNull()

    fakeApi.on('PATCH', '/tasks/11', () => ({
      task: { ...stored, description: 'Ma version', lockVersion: 6 },
    }))
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()

    expect(fakeApi.calls.at(-1)?.body).toEqual({ lockVersion: 5, description: 'Ma version' })
  })

  it('garde une saisie plus récente quand OP refuse une modification précédente', async () => {
    const wrapper = await openTask()
    let refuse: () => void = () => {}
    fakeApi.on('PATCH', '/tasks/11', () => new Promise((_resolve, reject) => {
      refuse = () => reject(new ApiError(422, 'op_rejected', {
        error: 'op_rejected',
        message: 'OpenProject a refusé la modification : La description est trop longue.',
        task: stored,
      }))
    }))

    await writeDescription(wrapper, 'Première version')
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()
    await writeDescription(wrapper, 'Seconde version, en cours')
    refuse()
    await flushPromises()

    expect(wrapper.getComponent(MdEditor).props('modelValue')).toBe('Seconde version, en cours')
  })

  it('n\'envoie rien quand la description n\'a pas changé', async () => {
    const wrapper = await openTask()

    await writeDescription(wrapper, stored.description)
    await button(wrapper, 'Enregistrer la description').trigger('click')
    await flushPromises()

    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
    expect(wrapper.findComponent(MdEditor).exists()).toBe(false)
  })

  it('abandonne la saisie avec Annuler, et garde le détail ouvert sur Échap', async () => {
    const wrapper = await openTask()

    await writeDescription(wrapper, 'Brouillon')
    await wrapper.find('aside .md-editor').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('aside.task-detail').exists()).toBe(true)

    await button(wrapper, 'Annuler').trigger('click')

    expect(wrapper.findComponent(MdEditor).exists()).toBe(false)
    expect(section(wrapper).find('.preview').text()).toContain('L\'utilisateur se connecte sans passer par OpenProject.')
    expect(fakeApi.calls.some(call => call.method === 'PATCH')).toBe(false)
  })

  it('garde la saisie de la description en passant par l\'onglet Activité', async () => {
    fakeApi.on('GET', '/tasks/11/activities', () => ({ activities: [] }))
    const wrapper = await openTask()
    await writeDescription(wrapper, 'Texte en cours')

    const tab = (name: string) => wrapper.findAll('[role="tab"]').find(item => item.text() === name)!
    // Reka active un onglet au clic gauche, sur l'appui du bouton.
    await tab('Activité').trigger('mousedown', { button: 0 })
    await flushPromises()
    await tab('Détail').trigger('mousedown', { button: 0 })
    await flushPromises()

    expect(wrapper.getComponent(MdEditor).props('modelValue')).toBe('Texte en cours')
  })
})

describe('assainissement de l\'aperçu', () => {
  it.each([
    ['un script', '<p>a</p><script>alert(1)</script>', '<p>a</p>'],
    ['un attribut d\'événement', '<img src="x.png" onerror="alert(1)">', '<img src="x.png">'],
    ['un lien javascript:', '<a href="javascript:alert(1)">lien</a>', '<a>lien</a>'],
    ['une feuille de style', '<style>body { display: none }</style><p>a</p>', '<p>a</p>'],
    ['un formulaire', '<form action="https://example.org"><p>a</p></form>', '<p>a</p>'],
    ['un bouton, dont le texte reste', '<p>a</p><button>Se connecter</button>', '<p>a</p>Se connecter'],
    ['un style en ligne', '<div style="position: fixed; inset: 0">a</div>', '<div>a</div>'],
  ])('retire %s', (_case, html, sanitized) => {
    expect(sanitizePreview(html)).toBe(sanitized)
  })

  it('garde le HTML de mise en forme', () => {
    const html = '<table><tbody><tr><td><strong>a</strong></td></tr></tbody></table>'

    expect(sanitizePreview(html)).toBe(html)
  })
})
