import { ApiError } from '@/shared/api/api-fetch'

interface OpErrorMessages {
  /** OP refuse l'accès à la ressource avec ce jeton. */
  forbidden: string
  /** OP ne trouve pas la ressource, ou la masque à ce jeton. */
  notFound?: string
  /** Toute autre erreur de l'app. */
  fallback: string
}

/**
 * Message d'une erreur d'accès à OP. Un refus d'OP reste distinct d'une panne d'OP ou de l'app,
 * et chaque message dit d'où vient le problème.
 */
export function opErrorText(error: Error, messages: OpErrorMessages) {
  if (!(error instanceof ApiError))
    return messages.fallback
  switch (error.code) {
    case 'op_token_invalid':
      return 'OpenProject refuse votre jeton d\'API : il a peut-être été révoqué. Générez-en un nouveau dans OpenProject.'
    case 'op_forbidden':
      return messages.forbidden
    case 'op_not_found':
      return messages.notFound ?? messages.fallback
    case 'op_unavailable':
      return 'OpenProject ne répond pas. Réessayez dans un instant.'
  }
  if (error.status === 0)
    return 'L\'app ne répond pas. Vérifiez votre connexion, puis réessayez.'
  return messages.fallback
}

/** Un refus (4xx) ne changera pas en réessayant ; une panne d'OP ou du réseau, peut-être. */
export function canRetry(error: Error) {
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500)
}
