import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase } from './db/client.js'

// Point d'entrée de production : applique les migrations Drizzle avant le démarrage du serveur.
// `drizzle-kit migrate` reste l'outil du développement, mais c'est une dépendance de dev.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL est requis')
}

const db = createDatabase(databaseUrl)
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
}
finally {
  await db.$client.end()
}
