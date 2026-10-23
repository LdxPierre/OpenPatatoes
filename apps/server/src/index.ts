import process from 'node:process'
import { buildApp } from './app.js'
import { ensureAdminAccount } from './auth/admin.js'
import { loadConfig } from './config.js'
import { createDatabase } from './db/client.js'
import { createOpClient } from './op/client.js'
import { createTokenCipher } from './op/token-cipher.js'

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)
await ensureAdminAccount(db, { username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD })
const app = buildApp(
  {
    db,
    cookie: { secure: config.COOKIE_SECURE },
    op: createOpClient({ baseUrl: config.OP_BASE_URL }),
    tokenCipher: createTokenCipher(config.OP_TOKEN_ENCRYPTION_KEY),
  },
  { logger: true },
)

async function shutdown() {
  await app.close()
  await db.$client.end()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: config.PORT, host: config.HOST })
