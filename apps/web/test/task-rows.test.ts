import type { TaskNode } from '@openpatatoes/shared'
import { describe, expect, it } from 'vitest'
import { dueHint, formatDay, formatFullDay, formatHours } from '@/features/tasks/format'
import { countTasks, taskPath, visibleTaskRows } from '@/features/tasks/tasks'

function task(id: number, children: TaskNode[] = []): TaskNode {
  return {
    id,
    subject: `Tâche ${id}`,
    status: { id: 1, name: 'Nouveau', isClosed: false },
    assignee: null,
    children,
  }
}

// 1
// ├ 2
// │ ├ 3
// │ └ 4
// └ 5
// 6
const tree = [
  task(1, [
    task(2, [
      task(3),
      task(4),
    ]),
    task(5),
  ]),
  task(6),
]

describe('lignes visibles de l\'arbre', () => {
  it('ne montre que les racines quand rien n\'est déplié', () => {
    const rows = visibleTaskRows(tree, new Set())

    expect(rows.map(row => row.task.id)).toEqual([1, 6])
    expect(rows.every(row => !row.expanded)).toBe(true)
  })

  it('montre les enfants des nœuds dépliés, dans l\'ordre de l\'arbre', () => {
    const rows = visibleTaskRows(tree, new Set([1, 2]))

    expect(rows.map(row => [row.task.id, row.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 1],
      [6, 0],
    ])
  })

  it('cache les enfants d\'un nœud déplié sous un parent replié', () => {
    const rows = visibleTaskRows(tree, new Set([2]))

    expect(rows.map(row => row.task.id)).toEqual([1, 6])
  })

  it('dit pour chaque ligne si ses traits de racine continuent plus bas', () => {
    const rows = visibleTaskRows(tree, new Set([1, 2]))
    const guidesOf = (id: number) => rows.find(row => row.task.id === id)?.guides

    expect(guidesOf(1)).toEqual([])
    // 2 a un frère plus bas (5) : son trait continue, sous 3 et sous 4.
    expect(guidesOf(2)).toEqual([true])
    expect(guidesOf(3)).toEqual([true, true])
    expect(guidesOf(4)).toEqual([true, false])
    // 5 est le dernier enfant de 1 : coude sans suite.
    expect(guidesOf(5)).toEqual([false])
  })

  it('donne la position parmi les frères et la ligne parente', () => {
    const rows = visibleTaskRows(tree, new Set([1, 2]))
    const four = rows.find(row => row.task.id === 4)!

    expect([four.position, four.siblingCount]).toEqual([2, 2])
    expect(rows[four.parentIndex]?.task.id).toBe(2)
    expect(rows[0]?.parentIndex).toBe(-1)
  })

  it('suit une hiérarchie très profonde sans déborder la pile', () => {
    let deep = task(20_000)
    const expanded = new Set<number>()
    for (let id = 19_999; id >= 1; id--) {
      deep = task(id, [deep])
      expanded.add(id)
    }

    const rows = visibleTaskRows([deep], expanded)

    expect(rows).toHaveLength(20_000)
    expect(rows.at(-1)?.depth).toBe(19_999)
  })

  it('compte les tâches à tous les niveaux', () => {
    expect(countTasks(tree)).toBe(6)
  })
})

describe('chemin d\'une tâche dans l\'arbre', () => {
  it('va de la racine à la tâche, la tâche comprise', () => {
    expect(taskPath(tree, 4)?.map(task => task.id)).toEqual([1, 2, 4])
    expect(taskPath(tree, 6)?.map(task => task.id)).toEqual([6])
  })

  it('vaut null pour une tâche absente de l\'arbre', () => {
    expect(taskPath(tree, 99)).toBeNull()
  })
})

describe('affichage des heures', () => {
  it('écrit les heures décimales à la française, au centième au plus', () => {
    expect(formatHours(12.5)).toBe('12,5\u202Fh')
    expect(formatHours(8)).toBe('8\u202Fh')
    expect(formatHours(0.25)).toBe('0,25\u202Fh')
    expect(formatHours(1 / 3)).toBe('0,33\u202Fh')
    expect(formatHours(1234.5)).toBe('1\u202F234,5\u202Fh')
  })
})

describe('affichage des dates', () => {
  const now = new Date(2026, 9, 25, 14, 30)

  it('écrit un jour court, avec l\'année seulement si ce n\'est pas l\'année en cours', () => {
    expect(formatDay('2026-10-31', now)).toBe('31 oct.')
    expect(formatDay('2027-01-05', now)).toBe('5 janv. 2027')
  })

  it('écrit le jour complet pour l\'infobulle', () => {
    expect(formatFullDay('2026-10-31')).toBe('samedi 31 octobre 2026')
  })

  it('situe l\'échéance par rapport au jour local, quelle que soit l\'heure', () => {
    expect(dueHint('2026-10-25', now)).toEqual({ text: 'aujourd\'hui', overdue: false })
    expect(dueHint('2026-10-26', now)).toEqual({ text: 'demain', overdue: false })
    expect(dueHint('2026-10-31', now)).toEqual({ text: 'dans 6 jours', overdue: false })
    expect(dueHint('2026-10-24', now)).toEqual({ text: 'en retard d\'un jour', overdue: true })
    expect(dueHint('2026-10-20', now)).toEqual({ text: 'en retard de 5 jours', overdue: true })
  })
})
