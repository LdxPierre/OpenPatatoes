import type { TaskDetail } from '@openpatatoes/shared'
import type { OpApi } from '../op/client.js'
import type { OpError } from '../op/errors.js'
import type { OpWorkPackageDetail } from '../op/schemas.js'
import { okAsync, ResultAsync } from 'neverthrow'

/**
 * Complète la tâche lue dans OP avec le caractère fermé de son statut : le lien d'état
 * d'une tâche ne le dit pas, seuls les statuts le donnent. Sans eux, la tâche reste
 * lisible : son état est alors traité comme ouvert.
 */
export function withClosedStatus(api: OpApi, workPackage: ResultAsync<OpWorkPackageDetail, OpError>): ResultAsync<TaskDetail, OpError> {
  return ResultAsync.combine([
    workPackage,
    api.listStatuses().orElse(() => okAsync([])),
  ]).map(([task, statuses]) => ({
    ...task,
    status: {
      ...task.status,
      isClosed: statuses.find(status => status.id === task.status.id)?.isClosed ?? false,
    },
  }))
}
