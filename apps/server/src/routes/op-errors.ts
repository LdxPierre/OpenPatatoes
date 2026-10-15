import type { FastifyReply } from 'fastify'
import type { OpNotConnectedError } from '../op/connections.js'
import type { OpError } from '../op/errors.js'
import type { TokenDecryptionError } from '../op/token-cipher.js'

export type OpRouteError = OpError | OpNotConnectedError | TokenDecryptionError

/** Messages propres à la ressource demandée, à la place des messages génériques. */
export interface OpRouteErrorMessages {
  forbidden?: string
  notFound?: string
}

/**
 * Traduit une erreur d'accès à OP en réponse HTTP pour le frontend.
 * Les erreurs venant d'OP (indisponible, réponse non conforme) restent distinctes des erreurs de l'application.
 */
export function sendOpRouteError(reply: FastifyReply, error: OpRouteError, messages: OpRouteErrorMessages = {}) {
  switch (error._tag) {
    case 'OpUnauthenticated':
      return reply.code(422).send({
        error: 'op_token_invalid',
        message:
          'OpenProject a refusé ce jeton d\'API : vérifiez qu\'il est complet, qu\'il n\'a pas été révoqué, puis saisissez-le à nouveau.',
      })
    case 'OpForbidden':
      return reply.code(403).send({
        error: 'op_forbidden',
        message: messages.forbidden ?? 'OpenProject refuse l\'accès à cette ressource.',
      })
    case 'OpNotFound':
      return reply.code(404).send({
        error: 'op_not_found',
        message: messages.notFound ?? 'Ressource introuvable dans OpenProject.',
      })
    case 'OpUnavailable':
      return reply
        .code(503)
        .send({ error: 'op_unavailable', message: 'OpenProject est indisponible pour le moment, réessayez plus tard.' })
    case 'OpInvalidResponse':
      reply.log.error({ err: error }, 'réponse OP non conforme')
      return reply
        .code(502)
        .send({ error: 'op_invalid_response', message: 'OpenProject a renvoyé une réponse inattendue.' })
    case 'OpNotConnected':
      return reply
        .code(409)
        .send({ error: 'op_not_connected', message: 'Aucun jeton OpenProject n\'est enregistré dans votre profil.' })
    case 'TokenDecryptionError':
      reply.log.error({ err: error }, 'jeton OP indéchiffrable')
      return reply.code(500).send({
        error: 'op_token_unreadable',
        message: 'Votre jeton OpenProject enregistré est illisible : saisissez-le à nouveau.',
      })
  }
}
