import { buildApp } from "./app.js";
import { ensureAdminAccount } from "./auth/admin.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
await ensureAdminAccount(db, { username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD });
const app = buildApp({ db, cookie: { secure: config.COOKIE_SECURE } }, { logger: true });

const shutdown = async () => {
  await app.close();
  await db.$client.end();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
