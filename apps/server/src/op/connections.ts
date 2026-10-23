import { eq } from "drizzle-orm";
import { err, ResultAsync } from "neverthrow";
import type { Database } from "../db/client.js";
import { opConnections } from "../db/schema.js";
import type { OpApi, OpClient } from "./client.js";
import type { OpError } from "./errors.js";
import type { OpUser } from "./schemas.js";
import type { TokenCipher, TokenDecryptionError } from "./token-cipher.js";

/** L'utilisateur n'a pas encore saisi de jeton OP, ou l'a supprimé. */
export class OpNotConnectedError extends Error {
  readonly _tag = "OpNotConnected";

  constructor() {
    super("Aucun jeton OP n'est enregistré pour cet utilisateur");
  }
}

export interface OpConnectionDependencies {
  db: Database;
  op: OpClient;
  tokenCipher: TokenCipher;
}

/**
 * Valide le jeton auprès d'OP puis l'enregistre chiffré, en remplaçant le précédent.
 * Un jeton refusé par OP n'est pas enregistré et l'ancien reste en place.
 */
export function saveOpToken(
  { db, op, tokenCipher }: OpConnectionDependencies,
  userId: string,
  token: string,
): ResultAsync<OpUser, OpError> {
  return op
    .withToken(token)
    .getCurrentUser()
    .andThen((opUser) => {
      const encryptedToken = tokenCipher.encrypt(token, userId);
      const saved = db
        .insert(opConnections)
        .values({ userId, encryptedToken })
        .onConflictDoUpdate({
          target: opConnections.userId,
          set: { encryptedToken, updatedAt: new Date() },
        })
        .then(() => opUser);
      // Une erreur de base n'est pas une erreur OP : elle remonte en 500 comme les autres.
      return ResultAsync.fromSafePromise(saved);
    });
}

export async function deleteOpToken({ db }: Pick<OpConnectionDependencies, "db">, userId: string): Promise<void> {
  await db.delete(opConnections).where(eq(opConnections.userId, userId));
}

/**
 * Seul moyen d'obtenir un accès OP pour une requête : il utilise le jeton de
 * l'utilisateur donné, et jamais un autre.
 */
export function opApiForUser(
  { db, op, tokenCipher }: OpConnectionDependencies,
  userId: string,
): ResultAsync<OpApi, OpNotConnectedError | TokenDecryptionError> {
  return ResultAsync.fromSafePromise(
    db
      .select({ encryptedToken: opConnections.encryptedToken })
      .from(opConnections)
      .where(eq(opConnections.userId, userId)),
  ).andThen(([connection]) => {
    if (!connection) return err(new OpNotConnectedError());
    return tokenCipher.decrypt(connection.encryptedToken, userId).map((token) => op.withToken(token));
  });
}
