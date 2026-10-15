import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const app = buildApp({ db }, { logger: true });

const shutdown = async () => {
  await app.close();
  await db.$client.end();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
