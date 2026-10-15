import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppDependencies } from "../../src/app.js";
import { SESSION_COOKIE } from "../../src/auth/plugin.js";
import type { Database } from "../../src/db/client.js";
import { createOpClient } from "../../src/op/client.js";
import { createTokenCipher } from "../../src/op/token-cipher.js";

/** URL d'une instance OP injoignable, pour les tests qui ne parlent pas à OP. */
const UNREACHABLE_OP_URL = "http://127.0.0.1:9";

/** Construit l'application avec une clé de chiffrement propre au test et l'URL d'OP donnée. */
export function buildTestApp(
  db: Database,
  { opBaseUrl = UNREACHABLE_OP_URL, ...overrides }: Partial<AppDependencies> & { opBaseUrl?: string } = {},
) {
  return buildApp({
    db,
    cookie: { secure: false },
    op: createOpClient({ baseUrl: opBaseUrl }),
    tokenCipher: createTokenCipher(randomBytes(32)),
    ...overrides,
  });
}

/** Connecte le compte et enregistre son jeton OP ; renvoie la valeur du cookie de session. */
export async function connectAs(
  app: FastifyInstance,
  account: { username: string; password: string },
  token: string,
): Promise<string> {
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: account });
  const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("cookie de session absent");
  const saved = await app.inject({
    method: "PUT",
    url: "/api/profile/op-connection",
    cookies: { [SESSION_COOKIE]: cookie.value },
    payload: { token },
  });
  if (saved.statusCode !== 200) throw new Error(`jeton refusé : ${saved.body}`);
  return cookie.value;
}
