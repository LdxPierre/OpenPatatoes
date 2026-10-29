/** Erreurs de l'adaptateur OP, retournées dans un `Result` et discriminées par `_tag`. */

/** OP ne reconnaît pas le jeton (401) : invalide, expiré ou révoqué. */
export class OpUnauthenticatedError extends Error {
  readonly _tag = 'OpUnauthenticated'

  constructor() {
    super('OpenProject a refusé le jeton d\'API')
  }
}

/** Le jeton est reconnu mais n'a pas la permission requise (403). */
export class OpForbiddenError extends Error {
  readonly _tag = 'OpForbidden'

  constructor() {
    super('OpenProject refuse l\'accès à cette ressource')
  }
}

/** La ressource n'existe pas ou n'est pas visible avec ce jeton (404). */
export class OpNotFoundError extends Error {
  readonly _tag = 'OpNotFound'

  constructor() {
    super('Ressource introuvable dans OpenProject')
  }
}

/** OP refuse une écriture (422) : valeur hors des valeurs permises, contrainte non respectée... */
export class OpRejectedError extends Error {
  readonly _tag = 'OpRejected'

  /** `reasons` : messages d'OP, un par contrainte violée. */
  constructor(readonly reasons: string[]) {
    super(`OpenProject a refusé la modification : ${reasons.join(' ')}`)
  }
}

/**
 * OP refuse une écriture faite sur une version périmée (409) : la ressource a été modifiée
 * depuis sa lecture, son `lockVersion` ne correspond plus.
 */
export class OpConflictError extends Error {
  readonly _tag = 'OpConflict'

  constructor() {
    super('La ressource a été modifiée dans OpenProject depuis sa lecture')
  }
}

/** OP est injoignable, trop lent ou répond par une erreur serveur. */
export class OpUnavailableError extends Error {
  readonly _tag = 'OpUnavailable'

  constructor(detail: string) {
    super(`OpenProject est indisponible : ${detail}`)
  }
}

/** La réponse d'OP ne correspond pas à ce que l'adaptateur attend (schéma Zod, statut imprévu). */
export class OpInvalidResponseError extends Error {
  readonly _tag = 'OpInvalidResponse'

  constructor(detail: string) {
    super(`Réponse inattendue d'OpenProject : ${detail}`)
  }
}

export type OpError
  = | OpUnauthenticatedError
    | OpForbiddenError
    | OpNotFoundError
    | OpRejectedError
    | OpConflictError
    | OpUnavailableError
    | OpInvalidResponseError
