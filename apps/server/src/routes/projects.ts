import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { currentUserId, requireSession } from "../auth/plugin.js";
import { opApiForUser } from "../op/connections.js";
import { sendOpRouteError } from "./op-errors.js";

const projectParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/).transform(Number),
});

const projectErrorMessages = {
  forbidden: "OpenProject refuse l'accès à ce projet avec votre jeton : demandez à en devenir membre dans OpenProject.",
  // OP masque l'existence des projets dont on n'est pas membre : un 404 peut aussi être un refus.
  notFound: "Ce projet est introuvable ou inaccessible avec votre jeton OpenProject.",
};

/** Projets OP visibles avec le jeton de l'utilisateur connecté. */
export function projectRoutes(deps: AppDependencies): FastifyPluginAsync {
  return async (app) => {
    app.addHook("onRequest", requireSession(deps.db, deps.cookie));

    app.get("/projects", async (request, reply) => {
      const result = await opApiForUser(deps, currentUserId(request)).andThen((api) => api.listProjects());
      return result.match(
        (projects) => ({ projects }),
        (error) => sendOpRouteError(reply, error, projectErrorMessages),
      );
    });

    /** Ouverture d'un projet : sert d'en-tête à sa vue de tâches. */
    app.get("/projects/:id", async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_request" });

      const result = await opApiForUser(deps, currentUserId(request)).andThen((api) => api.getProject(params.data.id));
      return result.match(
        (project) => ({ project }),
        (error) => sendOpRouteError(reply, error, projectErrorMessages),
      );
    });
  };
}
