import type { Database } from '../../src/db/client.js'
import process from 'node:process'
import { sql } from 'drizzle-orm'
import { createDatabase } from '../../src/db/client.js'

export const testDatabaseUrl
  = process.env.TEST_DATABASE_URL
    ?? 'postgres://openpatatoes:openpatatoes@localhost:55432/openpatatoes_test'

export function createTestDatabase(): Database {
  return createDatabase(testDatabaseUrl)
}

/** Vide toutes les tables applicatives (schéma public) entre deux tests. */
export async function resetDatabase(db: Database): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  if (result.rows.length === 0)
    return
  const tables = result.rows.map(row => `"public"."${row.tablename}"`).join(', ')
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`))
}
