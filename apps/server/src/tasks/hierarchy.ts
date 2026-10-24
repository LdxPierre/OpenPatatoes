import type { TaskNode } from '@openpatatoes/shared'
import type { OpStatus, OpWorkPackage } from '../op/schemas.js'
import { forEachTask } from '@openpatatoes/shared'

/**
 * Construit l'arbre des tâches depuis la liste plate d'OP. Le premier niveau contient
 * les racines ; racines et enfants gardent l'ordre de la liste.
 *
 * Une tâche dont le parent est absent de la liste (autre projet, invisible avec le jeton)
 * est une racine. Si OP renvoie une boucle de parents, la première tâche de la boucle
 * devient racine, pour qu'aucune tâche ne disparaisse. Le parcours est itératif :
 * une hiérarchie profonde ne fait pas déborder la pile.
 *
 * `statuses` dit quels statuts sont fermés : un statut absent de la liste est ouvert.
 */
export function buildTaskTree(workPackages: OpWorkPackage[], statuses: OpStatus[]): TaskNode[] {
  const closedStatusIds = new Set(statuses.filter(status => status.isClosed).map(status => status.id))
  const nodes = new Map<number, TaskNode>()
  for (const { id, subject, status, assignee } of workPackages) {
    nodes.set(id, {
      id,
      subject,
      status: {
        ...status,
        isClosed: closedStatusIds.has(status.id),
      },
      assignee,
      children: [],
    })
  }

  const roots: TaskNode[] = []
  const parentOf = new Map<number, TaskNode>()
  for (const { id, parentId } of workPackages) {
    const node = nodes.get(id)!
    const parent = parentId === null
      ? undefined
      : nodes.get(parentId)
    if (parent) {
      parent.children.push(node)
      parentOf.set(id, parent)
    }
    else {
      roots.push(node)
    }
  }

  const reached = new Set<number>()
  const reachFrom = (start: TaskNode) => forEachTask([start], node => reached.add(node.id))
  roots.forEach(reachFrom)

  // Les tâches non atteintes depuis les racines sont prises dans une boucle de parents.
  for (const node of nodes.values()) {
    if (reached.has(node.id))
      continue
    const parent = parentOf.get(node.id)!
    parent.children = parent.children.filter(child => child !== node)
    roots.push(node)
    reachFrom(node)
  }

  return roots
}
