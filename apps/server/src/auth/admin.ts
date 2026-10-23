import type { Database } from '../db/client.js'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema.js'
import { hashPassword } from './password.js'

/**
 * Crée le compte administrateur s'il n'existe pas encore.
 * Un compte existant n'est jamais modifié : changer ADMIN_PASSWORD après le premier démarrage est sans effet.
 */
export async function ensureAdminAccount(
  db: Database,
  admin: { username: string, password: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, admin.username))
  if (existing)
    return

  await db
    .insert(users)
    .values({
      username: admin.username,
      passwordHash: await hashPassword(admin.password),
      isAdmin: true,
    })
    .onConflictDoNothing({ target: users.username })
}
