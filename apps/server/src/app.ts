import Fastify, { type FastifyInstance } from "fastify";
import type { Database } from "./db/client.js";
import { healthRoutes } from "./routes/health.js";

export interface AppDependencies {
  db: Database;
}

export interface AppOptions {
  logger?: boolean;
}

export function buildApp(deps: AppDependencies, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.register(healthRoutes(deps), { prefix: "/api" });

  return app;
}
