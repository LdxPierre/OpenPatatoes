import cookiePlugin from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { SessionCookieOptions } from "./auth/plugin.js";
import type { Database } from "./db/client.js";
import type { OpClient } from "./op/client.js";
import type { TokenCipher } from "./op/token-cipher.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { opConnectionRoutes } from "./routes/op-connection.js";

export interface AppDependencies {
  db: Database;
  cookie: SessionCookieOptions;
  op: OpClient;
  tokenCipher: TokenCipher;
}

export interface AppOptions {
  logger?: boolean;
}

export function buildApp(deps: AppDependencies, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.decorateRequest("user", null);
  app.register(cookiePlugin);
  app.register(healthRoutes(deps), { prefix: "/api" });
  app.register(authRoutes(deps), { prefix: "/api" });
  app.register(opConnectionRoutes(deps), { prefix: "/api" });

  return app;
}
