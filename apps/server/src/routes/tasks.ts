import type { FastifyPluginAsync } from "fastify";
import type { AppDependencies } from "../app.js";
import { currentUserId, requireSession } from "../auth/plugin.js";
import { opApiForUser } from "../op/connections.js";
import { sendOpRouteError } from "./op-errors.js";
import { idParamsSchema } from "./params.js";

const taskErrorMessages = {
  forbidden: "OpenProject refuse l'accès à cette tâche avec votre jeton.",
  // Comme pour les projets, OP masque les tâches des projets dont on n'est pas membre.
  notFound: "Cette tâche est introuvable ou inaccessible avec votre jeton OpenProject.",
};

/** Tâches OP lues avec le jeton de l'utilisateur connecté. */
export function taskRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onRequest", requireSession(deps.db, deps.cookie));

    /** Détail d'une tâche en lecture : temps en heures décimales et parent dans la hiérarchie. */
    app.get("/tasks/:id", async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_request" });

      const result = await opApiForUser(deps, currentUserId(request)).andThen((api) => api.getWorkPackage(params.data.id));
      return result.match(
        (task) => ({ task }),
        (error) => sendOpRouteError(reply, error, taskErrorMessages),
      );
    });
  };
}
