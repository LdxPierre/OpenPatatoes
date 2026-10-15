import { z } from "zod";
import { isoDurationToHours } from "./duration.js";

/**
 * Schémas Zod des réponses de l'API OP v3 (HAL). Ils ne retiennent que les champs
 * utilisés et projettent la réponse vers les types de l'application.
 */

export const opUserSchema = z
  .object({
    _type: z.literal("User"),
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ id, name }) => ({ id, name }));

export type OpUser = z.output<typeof opUserSchema>;

/**
 * Assignable d'une tâche. OP propose aussi des groupes et des utilisateurs fictifs ;
 * l'application n'assigne qu'à des utilisateurs, les autres donnent `null`.
 */
export const opAvailableAssigneeSchema = z
  .object({
    _type: z.string(),
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ _type, id, name }) => (_type === "User" ? { id, name } : null));

export const opProjectSchema = z
  .object({
    _type: z.literal("Project"),
    id: z.number().int(),
    identifier: z.string(),
    name: z.string(),
  })
  .transform(({ id, identifier, name }) => ({ id, identifier, name }));

export type OpProject = z.output<typeof opProjectSchema>;

/** Lien HAL vers une ressource OP ; l'identifiant est le dernier segment (`/api/v3/statuses/7` → 7). */
const opResourceLinkSchema = z.object({
  href: z.string().regex(/\/\d+$/),
  title: z.string(),
});

const idFromHref = (href: string) => Number(href.slice(href.lastIndexOf("/") + 1));

/** Lien HAL facultatif : OP renvoie `href: null` (ou omet le lien) quand il est vide. */
const opOptionalLinkSchema = z
  .union([z.object({ href: z.null() }), opResourceLinkSchema])
  .optional()
  .transform((link) => (link?.href ? { id: idFromHref(link.href), name: link.title } : null));

export const opWorkPackageSchema = z
  .object({
    _type: z.literal("WorkPackage"),
    id: z.number().int(),
    subject: z.string(),
    _links: z.object({
      status: opResourceLinkSchema,
      assignee: opOptionalLinkSchema,
      parent: opOptionalLinkSchema,
    }),
  })
  .transform(({ id, subject, _links }) => ({
    id,
    subject,
    parentId: _links.parent?.id ?? null,
    status: { id: idFromHref(_links.status.href), name: _links.status.title },
    assignee: _links.assignee,
  }));

export type OpWorkPackage = z.output<typeof opWorkPackageSchema>;

/** Durée ISO 8601 d'OP convertie en heures décimales ; `null` (ou absente) si non renseignée. */
const opDurationAsHoursSchema = z
  .string()
  .nullish()
  .transform((duration, ctx) => {
    if (duration == null) return null;
    const hours = isoDurationToHours(duration);
    if (hours === null) {
      ctx.addIssue({ code: "custom", message: `durée ISO 8601 inexploitable : ${duration}` });
      return z.NEVER;
    }
    return hours;
  });

/**
 * Tâche lue pour son détail. Schéma distinct de la liste : une durée inexploitable
 * sur une tâche ne doit pas faire échouer l'arbre de tout le projet.
 */
export const opWorkPackageDetailSchema = z
  .object({
    _type: z.literal("WorkPackage"),
    id: z.number().int(),
    subject: z.string(),
    /** Version de la tâche dans OP, à renvoyer avec chaque écriture. */
    lockVersion: z.number().int(),
    estimatedTime: opDurationAsHoursSchema,
    remainingTime: opDurationAsHoursSchema,
    _links: z.object({ assignee: opOptionalLinkSchema, parent: opOptionalLinkSchema }),
  })
  .transform(({ id, subject, lockVersion, estimatedTime, remainingTime, _links }) => ({
    id,
    subject,
    lockVersion,
    estimatedHours: estimatedTime,
    remainingHours: remainingTime,
    assignee: _links.assignee,
    parent: _links.parent && { id: _links.parent.id, subject: _links.parent.name },
  }));

export type OpWorkPackageDetail = z.output<typeof opWorkPackageDetailSchema>;

/** Page d'une collection HAL ; `nextByOffset` n'est présent que s'il reste des pages. */
export function opCollectionPageSchema<T extends z.ZodType>(element: T) {
  return z.object({
    _type: z.literal("Collection"),
    _embedded: z.object({ elements: z.array(element) }),
    _links: z.object({ nextByOffset: z.object({ href: z.string() }).optional() }),
  });
}

/**
 * Erreur 422 d'OP. Une seule contrainte violée donne son message ; plusieurs donnent
 * `MultipleErrors`, dont le message générique cède la place à ceux de `_embedded.errors`.
 */
export const opRejectionSchema = z
  .object({
    _type: z.literal("Error"),
    message: z.string(),
    _embedded: z.object({ errors: z.array(z.object({ message: z.string() })).optional() }).optional(),
  })
  .transform(({ message, _embedded }) =>
    _embedded?.errors?.length ? _embedded.errors.map((error) => error.message) : [message],
  );
