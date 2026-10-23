import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { testDatabaseUrl } from './database.js'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Recrée la base de test à vide puis applique les migrations Drizzle. */
export default async function setup() {
  const url = new URL(testDatabaseUrl)
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

  const pool = new pg.Pool({ connectionString: testDatabaseUrl })
  try {
    await migrate(drizzle(pool), { migrationsFolder })
  }
  finally {
    await pool.end()
  }
}
