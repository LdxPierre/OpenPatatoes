import type { Result } from 'neverthrow'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { err, ok } from 'neverthrow'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const FORMAT_VERSION = 'v1'

export class TokenDecryptionError extends Error {
  readonly _tag = 'TokenDecryptionError'

  constructor() {
    super('Le jeton OP stocké ne peut pas être déchiffré')
  }
}

/**
 * Chiffrement AES-256-GCM des jetons OP. Le chiffré est lié à l'utilisateur
 * (donnée authentifiée) : recopié sur un autre compte, il ne se déchiffre pas.
 */
export interface TokenCipher {
  /** Renvoie `v1.<iv>.<tag>.<chiffré>`, chaque partie en base64url. */
  encrypt: (token: string, userId: string) => string
  decrypt: (stored: string, userId: string) => Result<string, TokenDecryptionError>
}

export function createTokenCipher(key: Buffer): TokenCipher {
  if (key.length !== 32)
    throw new Error('La clé AES-256-GCM doit faire 32 octets')

  return {
    encrypt(token, userId) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(Buffer.from(userId, 'utf8'))
      const ciphertext = Buffer.concat([
        cipher.update(token, 'utf8'),
        cipher.final(),
      ])
      return [
        FORMAT_VERSION,
        iv,
        cipher.getAuthTag(),
        ciphertext,
      ]
        .map(part => (typeof part === 'string'
          ? part
          : part.toString('base64url')))
        .join('.')
    },

    decrypt(stored, userId) {
      const [version, iv, tag, ciphertext, ...rest] = stored.split('.')
      if (version !== FORMAT_VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
        return err(new TokenDecryptionError())
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
          authTagLength: TAG_BYTES,
        })
        decipher.setAAD(Buffer.from(userId, 'utf8'))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        const token = Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ])
        return ok(token.toString('utf8'))
      }
      catch {
        return err(new TokenDecryptionError())
      }
    },
  }
}
