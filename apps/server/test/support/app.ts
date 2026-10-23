import { randomBytes } from "node:crypto";
import { buildApp, type AppDependencies } from "../../src/app.js";
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
