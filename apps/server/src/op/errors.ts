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
    | OpUnavailableError
    | OpInvalidResponseError
