import type { Database } from '../db/client.js'
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { sessions, users } from '../db/schema.js'

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  username: string
  isAdmin: boolean
}

export interface ValidSession {
  user: SessionUser
  expiresAt: Date
}

function sessionIdFromToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Crée une session et renvoie le jeton à placer dans le cookie (seule son empreinte est stockée). */
export async function createSession(
  db: Database,
  userId: string,
): Promise<{ token: string, expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await db.insert(sessions).values({
    id: sessionIdFromToken(token),
    userId,
    expiresAt,
  })
  return { token, expiresAt }
}

/**
 * Valide le jeton et fait glisser l'expiration de 7 jours à partir de maintenant.
 * Une session expirée est supprimée et refusée.
 */
export async function validateSession(db: Database, token: string): Promise<ValidSession | null> {
  const id = sessionIdFromToken(token)
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, username: users.username, isAdmin: users.isAdmin },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
  if (!row)
    return null

  const now = Date.now()
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  const expiresAt = new Date(now + SESSION_DURATION_MS)
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
  return { user: row.user, expiresAt }
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionIdFromToken(token)))
}
