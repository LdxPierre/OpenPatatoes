import type { Database } from '../../src/db/client.js'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { createDatabase } from '../../src/db/client.js'

export const testDatabaseUrl
  = process.env.TEST_DATABASE_URL
    ?? 'postgres://openpatatoes:openpatatoes@localhost:55432/openpatatoes_test'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Recrée la base de l'URL à vide puis applique les migrations Drizzle. */
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl)
  const dbName = url.pathname.slice(1)
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'

  const admin = new pg.Client({
    connectionString: adminUrl.toString(),
  })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${dbName}"`)
  }
  finally {
    await admin.end()
  }

  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    await migrate(drizzle(pool), { migrationsFolder })
  }
  finally {
    await pool.end()
  }
}

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
