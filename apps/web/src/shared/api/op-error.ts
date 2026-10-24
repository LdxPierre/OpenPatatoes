import { ApiError } from './api-fetch'

/** Messages propres à la page. Les autres erreurs ont un message commun à toute l'app. */
export interface OpErrorMessages {
  /** Toute erreur sans message propre. */
  fallback: string
  /** OP refuse le jeton : par défaut, celui enregistré dans le profil. */
  tokenInvalid?: string
  /** OP refuse l'accès à la ressource avec ce jeton. */
  forbidden?: string
  /** OP ne trouve pas la ressource, ou la masque à ce jeton. */
  notFound?: string
}

/** Ce que l'utilisateur peut faire après l'erreur, à part lire le message. */
export type OpErrorRecovery = 'retry' | 'sign-in' | 'op-token' | 'none'

/** Codes d'erreur que seul un nouveau jeton OP peut résoudre. */
const TOKEN_ERROR_CODES = new Set(['op_token_invalid', 'op_not_connected', 'op_token_unreadable'])

/**
 * Message d'une erreur d'accès à OP. Un refus d'OP reste distinct d'une panne d'OP ou de l'app,
 * et chaque message dit d'où vient le problème.
 */
export function opErrorText(error: Error, messages: OpErrorMessages) {
  if (!(error instanceof ApiError))
    return messages.fallback
  switch (error.code) {
    case 'op_token_invalid':
      return messages.tokenInvalid
        ?? 'OpenProject refuse votre jeton d\'API : il a peut-être été révoqué. Générez-en un nouveau dans OpenProject, puis saisissez-le.'
    case 'op_not_connected':
      return 'Aucun jeton OpenProject n\'est enregistré dans votre profil. Saisissez un nouveau jeton.'
    case 'op_token_unreadable':
      return 'L\'app ne peut plus lire votre jeton OpenProject enregistré. Saisissez un nouveau jeton.'
    case 'op_forbidden':
      return messages.forbidden ?? messages.fallback
    case 'op_not_found':
      return messages.notFound ?? messages.fallback
    case 'op_unavailable':
      return 'OpenProject ne répond pas. Réessayez dans un instant.'
    case 'op_invalid_response':
      return 'OpenProject a renvoyé une réponse inattendue. Réessayez dans un instant.'
  }
  if (error.status === 401)
    return 'Votre session a expiré. Connectez-vous à nouveau.'
  if (error.status === 0)
    return 'L\'app ne répond pas. Vérifiez votre connexion, puis réessayez.'
  return messages.fallback
}

/** Un refus (4xx) ne changera pas en réessayant ; une panne d'OP ou du réseau, peut-être. */
export function opErrorRecovery(error: Error): OpErrorRecovery {
  if (!(error instanceof ApiError))
    return 'retry'
  if (TOKEN_ERROR_CODES.has(error.code))
    return 'op-token'
  if (error.status === 401)
    return 'sign-in'
  if (error.status >= 400 && error.status < 500)
    return 'none'
  return 'retry'
}
