import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
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

/** Temps en heures décimales ; `null` efface la valeur dans OP. */
const hoursSchema = z.number().nonnegative().nullable().optional();

const taskChangesSchema = z
  .strictObject({
    lockVersion: z.number().int().nonnegative(),
    estimatedHours: hoursSchema,
    remainingHours: hoursSchema,
    assigneeId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    ({ estimatedHours, remainingHours, assigneeId }) =>
      [estimatedHours, remainingHours, assigneeId].some((value) => value !== undefined),
    "aucun champ à modifier",
  );

/** Tâches OP lues et modifiées avec le jeton de l'utilisateur connecté. */
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

    /**
     * Modifie le temps estimé, le temps restant ou l'assigné ; renvoie la tâche telle qu'OP l'a enregistrée.
     * Un refus d'OP renvoie aussi l'état réel de la tâche, pour que l'interface annule sa modification.
     */
    app.patch("/tasks/:id", async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);
      const changes = taskChangesSchema.safeParse(request.body);
      if (!params.success || !changes.success) return reply.code(400).send({ error: "invalid_request" });
      const { id } = params.data;

      const api = await opApiForUser(deps, currentUserId(request));
      if (api.isErr()) return sendOpRouteError(reply, api.error, taskErrorMessages);

      const updated = await api.value.updateWorkPackage(id, changes.data);
      if (updated.isOk()) return { task: updated.value };
      if (updated.error._tag !== "OpRejected") return sendOpRouteError(reply, updated.error, taskErrorMessages);

      // Sans relecture possible, le refus reste signalé ; l'interface rechargera la tâche.
      const current = await api.value.getWorkPackage(id);
      if (current.isErr()) return sendOpRouteError(reply, updated.error, taskErrorMessages);
      return reply.code(422).send({ error: "op_rejected", message: updated.error.message, task: current.value });
    });

    /** Utilisateurs à qui la tâche peut être assignée. */
    app.get("/tasks/:id/assignees", async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_request" });

      const result = await opApiForUser(deps, currentUserId(request)).andThen((api) =>
        api.listAvailableAssignees(params.data.id),
      );
      return result.match(
        (assignees) => ({ assignees }),
        (error) => sendOpRouteError(reply, error, taskErrorMessages),
      );
    });
  };
}
