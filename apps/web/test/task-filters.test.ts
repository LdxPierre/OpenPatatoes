import type { TaskNode } from '@openpatatoes/shared'
import type { TaskCriteria } from '@/features/tasks/task-filters'
import { describe, expect, it } from 'vitest'
import { criteriaFromQuery, criteriaOptions, filterTaskTree, knownCriteria, NO_CRITERIA, queryWithCriteria, taskIdsWithChildren } from '@/features/tasks/task-filters'

const nouveau = { id: 1, name: 'Nouveau', isClosed: false }
const enCours = { id: 7, name: 'En cours', isClosed: false }
const ferme = { id: 12, name: 'Fermé', isClosed: true }
const tache = { id: 1, name: 'Tâche' }
const bug = { id: 7, name: 'Bug' }
const alice = { id: 3, name: 'Alice' }
const bob = { id: 4, name: 'Bob' }

function task(id: number, subject: string, children: TaskNode[] = [], extra: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    subject,
    status: nouveau,
    type: tache,
    assignee: null,
    children,
    ...extra,
  }
}

// 1 Lancement
// ├ 2 État des lieux (en cours, Alice)
// │ ├ 3 Relevé 123 (bug, fermé)
// │ └ 4 Inventaire (Bob)
// └ 5 Cahier des charges (fermé, Alice)
// 123 Export CSV (bug)
const tree = [
  task(1, 'Lancement', [
    task(2, 'État des lieux', [
      task(3, 'Relevé 123', [], { type: bug, status: ferme }),
      task(4, 'Inventaire', [], { assignee: bob }),
    ], { status: enCours, assignee: alice }),
    task(5, 'Cahier des charges', [], { status: ferme, assignee: alice }),
  ]),
  task(123, 'Export CSV', [], { type: bug }),
]

/** Arbre réduit aux identifiants. */
type IdTree = [id: number, children: IdTree[]]
function idTree(nodes: TaskNode[]): IdTree[] {
  return nodes.map(node => [
    node.id,
    idTree(node.children),
  ])
}

function filter(criteria: Partial<TaskCriteria>, currentUserId: number | null = alice.id) {
  const result = filterTaskTree(tree, {
    ...NO_CRITERIA,
    ...criteria,
  }, currentUserId)
  return {
    tree: idTree(result.tasks),
    matches: [...result.matchIds].sort((a, b) => a - b),
  }
}

describe('filtrage de l\'arbre des tâches', () => {
  it('garde tout l\'arbre sans critère', () => {
    expect(filter({}).tree).toEqual(idTree(tree))
  })

  it('garde les ancêtres des tâches qui correspondent, sans les compter', () => {
    expect(filter({ search: 'inventaire' })).toEqual({
      tree: [
        [
          1,
          [
            [
              2,
              [
                [4, []],
              ],
            ],
          ],
        ],
      ],
      matches: [4],
    })
  })

  it('ne garde sous une tâche qui correspond que les enfants qui correspondent', () => {
    expect(filter({
      statuses: [enCours.id],
    }).tree).toEqual([
      [
        1,
        [
          [2, []],
        ],
      ],
    ])
  })

  it('renvoie un arbre vide quand rien ne correspond', () => {
    expect(filter({ search: 'introuvable' })).toEqual({ tree: [], matches: [] })
  })

  describe('recherche', () => {
    it('trouve l\'identifiant exact, avec ou sans #, et le nombre dans les titres', () => {
      expect(filter({ search: '123' }).matches).toEqual([3, 123])
      expect(filter({ search: '#123' }).matches).toEqual([123])
      expect(filter({ search: '12' }).matches).toEqual([3])
      expect(filter({ search: '4' }).matches).toEqual([4])
    })

    it('cherche dans le titre sans tenir compte de la casse ni des accents', () => {
      expect(filter({ search: 'etat' }).matches).toEqual([2])
      expect(filter({ search: 'RELEVE' }).matches).toEqual([3])
      expect(filter({ search: '  cahier  ' }).matches).toEqual([5])
    })
  })

  describe('filtres', () => {
    it('garde tous les statuts ouverts ou fermés, ou un statut précis', () => {
      expect(filter({
        statuses: ['closed'],
      }).matches).toEqual([3, 5])
      expect(filter({
        statuses: ['open'],
      }).matches).toEqual([1, 2, 4, 123])
      expect(filter({
        statuses: [enCours.id, ferme.id],
      }).matches).toEqual([2, 3, 5])
    })

    it('garde les types choisis', () => {
      expect(filter({
        types: [bug.id],
      }).matches).toEqual([3, 123])
    })

    it('garde les tâches de l\'utilisateur du jeton, les tâches sans assigné ou celles d\'un assigné', () => {
      expect(filter({
        assignees: ['me'],
      }).matches).toEqual([2, 5])
      expect(filter({
        assignees: ['me'],
      }, bob.id).matches).toEqual([4])
      expect(filter({
        assignees: ['none'],
      }).matches).toEqual([1, 3, 123])
      expect(filter({
        assignees: [bob.id, 'none'],
      }).matches).toEqual([1, 3, 4, 123])
    })

    it('garde toute la descendance d\'un parent, sans le parent lui-même', () => {
      expect(filter({
        parents: [1],
      })).toEqual({
        tree: idTree(tree.slice(0, 1)),
        matches: [2, 3, 4, 5],
      })
      expect(filter({
        parents: [2, 123],
      }).matches).toEqual([3, 4])
    })

    it('combine les valeurs d\'un critère en OU, et les critères entre eux en ET', () => {
      expect(filter({
        statuses: ['closed'],
        assignees: ['me'],
      }).matches).toEqual([5])
      expect(filter({
        types: [bug.id],
        search: 'export',
      }).matches).toEqual([123])
      expect(filter({
        parents: [1],
        statuses: ['open'],
        assignees: [bob.id],
      }).matches).toEqual([4])
    })
  })

  it('ne copie pas les tâches dont les enfants ne changent pas', () => {
    const result = filterTaskTree(tree, { ...NO_CRITERIA, search: 'lancement' }, null)
    expect(result.tasks[0]).not.toBe(tree[0])

    const all = filterTaskTree(tree, {
      ...NO_CRITERIA,
      statuses: ['open', 'closed'],
    }, null)
    expect(all.tasks[0]).toBe(tree[0])
  })

  it('tient une hiérarchie très profonde', () => {
    let deep = task(100_000, 'Feuille')
    for (let id = 99_999; id > 90_000; id--)
      deep = task(id, `Niveau ${id}`, [deep])

    const result = filterTaskTree([deep], { ...NO_CRITERIA, search: 'feuille' }, null)

    expect([...result.matchIds]).toEqual([100_000])
  })

  it('dit quelles tâches déplier pour montrer chaque résultat', () => {
    const result = filterTaskTree(tree, { ...NO_CRITERIA, search: 'inventaire' }, null)

    expect(taskIdsWithChildren(result.tasks).sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('valeurs proposées par les filtres', () => {
  const options = criteriaOptions(tree, alice.id)

  it('propose les statuts présents, après les ouverts et les fermés, avec leur nombre de tâches', () => {
    expect(options.statuses).toEqual([
      { value: 'open', name: 'Tous les ouverts', count: 4 },
      { value: 'closed', name: 'Tous les fermés', count: 2 },
      { value: enCours.id, name: 'En cours', count: 1 },
      { value: ferme.id, name: 'Fermé', count: 2 },
      { value: nouveau.id, name: 'Nouveau', count: 3 },
    ])
  })

  it('propose les types présents', () => {
    expect(options.types).toEqual([
      { value: bug.id, name: 'Bug', count: 2 },
      { value: tache.id, name: 'Tâche', count: 4 },
    ])
  })

  it('propose « Moi » et « Non assigné », puis les assignés présents', () => {
    expect(options.assignees).toEqual([
      { value: 'me', name: 'Moi', count: 2 },
      { value: 'none', name: 'Non assigné', count: 3 },
      { value: alice.id, name: 'Alice', count: 2 },
      { value: bob.id, name: 'Bob', count: 1 },
    ])
  })

  it('ne propose comme parents que les tâches qui ont des sous-tâches, par identifiant', () => {
    expect(options.parents).toEqual([
      { value: 1, name: 'Lancement' },
      { value: 2, name: 'État des lieux' },
    ])
  })
})

describe('critères dans l\'adresse', () => {
  it('écrit les critères non vides et garde les autres paramètres', () => {
    expect(queryWithCriteria({ autre: 'x', status: 'open' }, {
      search: 'export',
      statuses: [],
      types: [7],
      assignees: ['me', 4],
      parents: [1, 2],
    })).toEqual({
      autre: 'x',
      q: 'export',
      type: '7',
      assignee: 'me,4',
      parent: '1,2',
    })
  })

  it('relit les critères qu\'elle a écrits', () => {
    const criteria: TaskCriteria = {
      search: '#12 état',
      statuses: ['open', 12],
      types: [1],
      assignees: ['none', 'me', 3],
      parents: [5],
    }

    expect(criteriaFromQuery(queryWithCriteria({}, criteria) as Record<string, string>)).toEqual(criteria)
  })

  it('n\'écrit pas une recherche faite seulement d\'espaces', () => {
    expect(queryWithCriteria({ q: 'avant' }, { ...NO_CRITERIA, search: '   ' })).toEqual({})
  })

  it('ignore un identifiant bien formé que les filtres ne proposent pas', () => {
    const options = criteriaOptions(tree, alice.id)

    expect(knownCriteria({
      search: 'export',
      statuses: ['closed', 99],
      types: [bug.id, 99],
      assignees: ['me', bob.id, 99],
      // 3 n'a pas de sous-tâches.
      parents: [2, 3],
    }, options)).toEqual({
      search: 'export',
      statuses: ['closed'],
      types: [bug.id],
      assignees: ['me', bob.id],
      parents: [2],
    })
  })

  it('ignore une valeur inconnue ou invalide', () => {
    expect(criteriaFromQuery({
      q: ['a', 'b'],
      status: 'ouvert,0,-3,7,7',
      type: 'bug,1.5,2',
      assignee: 'moi,me',
      parent: '9999999999999999,8',
    })).toEqual({
      search: '',
      statuses: [7],
      types: [2],
      assignees: ['me'],
      parents: [8],
    })
  })
})
