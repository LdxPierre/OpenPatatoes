import { recreateDatabase, testDatabaseUrl } from './database.js'

/** Recrée la base de test à vide puis applique les migrations Drizzle. */
export default async function setup() {
  await recreateDatabase(testDatabaseUrl)
}
