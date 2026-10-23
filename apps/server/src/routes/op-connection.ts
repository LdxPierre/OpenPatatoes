import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { currentUserId, requireSession } from "../auth/plugin.js";
import { deleteOpToken, opApiForUser, saveOpToken } from "../op/connections.js";
import { sendOpRouteError } from "./op-errors.js";

const saveTokenBodySchema = z.object({
  token: z.string().trim().min(1),
});

/** Jeton d'API OP de l'utilisateur connecté, dans son profil. */
export function opConnectionRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onRequest", requireSession(deps.db, deps.cookie));

    /** Vérifie le jeton enregistré auprès d'OP et renvoie le compte OP associé. */
    app.get("/profile/op-connection", async (request, reply) => {
      const result = await opApiForUser(deps, currentUserId(request)).andThen((api) => api.getCurrentUser());
      return result.match(
        (opUser) => ({ opUser }),
        (error) => sendOpRouteError(reply, error),
      );
    });

    app.put("/profile/op-connection", async (request, reply) => {
      const body = saveTokenBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_request" });

      const result = await saveOpToken(deps, currentUserId(request), body.data.token);
      return result.match(
        (opUser) => ({ opUser }),
        (error) => sendOpRouteError(reply, error),
      );
    });

    app.delete("/profile/op-connection", async (request, reply) => {
      await deleteOpToken(deps, currentUserId(request));
      return reply.code(204).send();
    });
  };
}
