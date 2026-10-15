import { errAsync, ResultAsync, okAsync } from "neverthrow";
import { z } from "zod";
import {
  OpForbiddenError,
  OpInvalidResponseError,
  OpNotFoundError,
  OpUnauthenticatedError,
  OpUnavailableError,
  type OpError,
} from "./errors.js";
import { opUserSchema, type OpUser } from "./schemas.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** Accès à l'API OP au nom d'un utilisateur, avec son seul jeton. */
export interface OpApi {
  getCurrentUser(): ResultAsync<OpUser, OpError>;
}

/** Seule couche qui parle à l'API OP. Elle n'a pas de jeton propre : chaque appel passe par `withToken`. */
export interface OpClient {
  withToken(token: string): OpApi;
}

export interface OpClientOptions {
  /** URL de l'instance, sans `/api/v3`. */
  baseUrl: string;
}

function errorForStatus(status: number): OpError {
  if (status === 401) return new OpUnauthenticatedError();
  if (status === 403) return new OpForbiddenError();
  if (status === 404) return new OpNotFoundError();
  if (status >= 500) return new OpUnavailableError(`statut HTTP ${status}`);
  return new OpInvalidResponseError(`statut HTTP ${status}`);
}

export function createOpClient({ baseUrl }: OpClientOptions): OpClient {
  const apiRoot = `${baseUrl.replace(/\/+$/, "")}/api/v3`;

  return {
    withToken(token) {
      const authorization = `Basic ${Buffer.from(`apikey:${token}`).toString("base64")}`;

      const get = <T>(path: string, schema: z.ZodType<T>): ResultAsync<T, OpError> =>
        ResultAsync.fromPromise(
          fetch(`${apiRoot}${path}`, {
            headers: { authorization, accept: "application/hal+json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
          (cause) => new OpUnavailableError(cause instanceof Error ? cause.message : "requête impossible"),
        )
          .andThen((response) => {
            if (!response.ok) return errAsync(errorForStatus(response.status));
            return ResultAsync.fromPromise(
              response.json() as Promise<unknown>,
              () => new OpInvalidResponseError("corps JSON illisible"),
            );
          })
          .andThen((body) => {
            const parsed = schema.safeParse(body);
            return parsed.success
              ? okAsync(parsed.data)
              : errAsync(new OpInvalidResponseError(`${path} : ${z.prettifyError(parsed.error)}`));
          });

      return {
        getCurrentUser: () => get("/users/me", opUserSchema),
      };
    },
  };
}
