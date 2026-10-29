import type { OpNamedRef, TaskAllowedValuesResponse, TaskDetail } from '@openpatatoes/shared'
import { z } from 'zod'
import { isoDurationToHours } from './duration.js'
import { sanitizeMarkdown } from './sanitize-markdown.js'

/**
 * Schémas Zod des réponses de l'API OP v3 (HAL). Ils ne retiennent que les champs
 * utilisés et projettent la réponse vers les types de l'application.
 */

export const opUserSchema = z
  .object({
    _type: z.literal('User'),
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ id, name }) => ({ id, name }))

export type OpUser = z.output<typeof opUserSchema>

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
  .transform(({ _type, id, name }) => (_type === 'User'
    ? { id, name }
    : null))

/** OP liste aussi les portefeuilles et les programmes parmi les projets : ils ont le même identifiant et le même nom. */
export const opProjectSchema = z
  .object({
    _type: z.enum(['Project', 'Program', 'Portfolio']),
    id: z.number().int(),
    identifier: z.string(),
    name: z.string(),
  })
  .transform(({ id, identifier, name }) => ({ id, identifier, name }))

export type OpProject = z.output<typeof opProjectSchema>

const idFromHref = (href: string) => Number(href.slice(href.lastIndexOf('/') + 1))

/** Lien HAL vers une ressource OP, projeté en `{ id, name }`. */
const opResourceLinkSchema = z
  .object({
    href: z.string().regex(/\/\d+$/),
    title: z.string(),
  })
  .transform(({ href, title }) => ({
    id: idFromHref(href),
    name: title,
  }))

/** Lien HAL facultatif : OP renvoie `href: null` (ou omet le lien) quand il est vide. */
const opOptionalLinkSchema = z
  .union([
    z.object({
      href: z.null(),
    }),
    opResourceLinkSchema,
  ])
  .optional()
  .transform(link => (link && 'id' in link
    ? link
    : null))

/** Champs communs à la tâche lue en liste et en détail. */
const opWorkPackageBaseSchema = z.object({
  _type: z.literal('WorkPackage'),
  id: z.number().int(),
  subject: z.string(),
  _links: z.object({
    parent: opOptionalLinkSchema,
  }),
})

export const opWorkPackageSchema = opWorkPackageBaseSchema
  .extend({
    _links: opWorkPackageBaseSchema.shape._links.extend({
      status: opResourceLinkSchema,
      assignee: opOptionalLinkSchema,
    }),
  })
  .transform(({ id, subject, _links }) => ({
    id,
    subject,
    parentId: _links.parent?.id ?? null,
    status: _links.status,
    assignee: _links.assignee,
  }))

export type OpWorkPackage = z.output<typeof opWorkPackageSchema>

/** Statut OP. Le lien d'une tâche ne dit pas s'il est fermé : seule la liste des statuts le donne. */
export const opStatusSchema = z
  .object({
    _type: z.literal('Status'),
    id: z.number().int(),
    name: z.string(),
    isClosed: z.boolean(),
  })
  .transform(({ id, name, isClosed }) => ({ id, name, isClosed }))

export type OpStatus = z.output<typeof opStatusSchema>

/** Durée ISO 8601 d'OP convertie en heures décimales ; `null` (ou absente) si non renseignée. */
const opDurationAsHoursSchema = z
  .string()
  .nullish()
  .transform((duration, ctx) => {
    if (duration == null)
      return null
    const hours = isoDurationToHours(duration)
    if (hours === null) {
      ctx.addIssue({ code: 'custom', message: `durée ISO 8601 inexploitable : ${duration}` })
      return z.NEVER
    }
    return hours
  })

/** Jour ISO (`2026-10-31`) ; `null` (ou absent) si non renseigné. */
const opDateSchema = z.iso.date().nullish().transform(date => date ?? null)

/**
 * Tâche lue pour son détail. Schéma distinct de la liste : une durée inexploitable
 * sur une tâche ne doit pas faire échouer l'arbre de tout le projet.
 * Le statut n'a que son nom : la route y ajoute `isClosed` depuis la liste des statuts.
 * `spentTime` n'est présent que si le jeton a le droit de voir le temps passé.
 * Un jalon n'a qu'une date (`date`) : elle sert de début et d'échéance.
 * La description garde son markdown, assaini : l'interface en fait l'aperçu et l'édite.
 */
export const opWorkPackageDetailSchema = opWorkPackageBaseSchema
  .extend({
    lockVersion: z.number().int(),
    estimatedTime: opDurationAsHoursSchema,
    remainingTime: opDurationAsHoursSchema,
    spentTime: opDurationAsHoursSchema,
    startDate: opDateSchema,
    dueDate: opDateSchema,
    date: opDateSchema,
    description: z.object({
      raw: z.string().nullish(),
    }).nullish(),
    _links: opWorkPackageBaseSchema.shape._links.extend({
      status: opResourceLinkSchema,
      type: opResourceLinkSchema,
      priority: opOptionalLinkSchema,
      assignee: opOptionalLinkSchema,
      responsible: opOptionalLinkSchema,
      version: opOptionalLinkSchema,
      category: opOptionalLinkSchema,
    }),
  })
  .transform(({ id, subject, lockVersion, estimatedTime, remainingTime, spentTime, startDate, dueDate, date, description, _links }) => ({
    id,
    subject,
    lockVersion,
    status: _links.status,
    type: _links.type,
    priority: _links.priority,
    assignee: _links.assignee,
    responsible: _links.responsible,
    estimatedHours: estimatedTime,
    remainingHours: remainingTime,
    spentHours: spentTime,
    startDate: startDate ?? date,
    dueDate: dueDate ?? date,
    version: _links.version,
    category: _links.category,
    parent: _links.parent && { id: _links.parent.id, subject: _links.parent.name },
    description: sanitizeMarkdown(description?.raw ?? ''),
  }) satisfies Omit<TaskDetail, 'status'> & { status: OpNamedRef })

export type OpWorkPackageDetail = z.output<typeof opWorkPackageDetailSchema>

/** Ressource OP (type, priorité) proposée par un formulaire. */
const opNamedResourceSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ id, name }) => ({ id, name }))

/**
 * Champ du schéma d'un formulaire OP, réduit à ses valeurs permises. OP les donne
 * en entier dans `_embedded.allowedValues`. Un champ en lecture seule n'en a aucune.
 */
function opFormFieldSchema<T extends z.ZodType>(value: T) {
  return z
    .object({
      writable: z.boolean(),
      _embedded: z.object({
        allowedValues: z.array(value),
      }).optional(),
    })
    .transform(({ writable, _embedded }) => (writable
      ? _embedded?.allowedValues ?? []
      : []))
}

/**
 * Formulaire de modification d'une tâche (`POST /work_packages/:id/form`), réduit aux valeurs
 * permises pour l'état, le type et la priorité. Les états sont les transitions qu'OP autorise
 * depuis l'état actuel, pour ce type et les rôles de l'utilisateur.
 */
export const opWorkPackageFormSchema = z
  .object({
    _type: z.literal('Form'),
    _embedded: z.object({
      schema: z.object({
        status: opFormFieldSchema(opStatusSchema),
        type: opFormFieldSchema(opNamedResourceSchema),
        priority: opFormFieldSchema(opNamedResourceSchema),
      }),
    }),
  })
  .transform(({ _embedded: { schema } }) => ({
    statuses: schema.status,
    types: schema.type,
    priorities: schema.priority,
  }) satisfies TaskAllowedValuesResponse)

export type OpWorkPackageForm = z.output<typeof opWorkPackageFormSchema>

/**
 * Auteur d'une activité, lu à part : le lien d'une activité ne donne pas son nom.
 * Ce peut être un utilisateur, un utilisateur supprimé ou le système d'OP.
 */
export const opPrincipalSchema = z
  .object({
    _type: z.string(),
    id: z.number().int(),
    name: z.string(),
  })
  .transform(({ id, name }) => ({ id, name }))

/** Texte mis en forme par OP : la source (`raw`) et son rendu HTML. */
const opFormattableSchema = z.object({
  raw: z.string().nullish(),
  html: z.string().nullish(),
})

/**
 * Activité d'une tâche (`GET /work_packages/:id/activities`). Le commentaire est le HTML
 * rendu par OP, pas encore assaini : le client le fait. Les modifications gardent leur phrase en texte brut.
 * La première version d'une tâche est sa création.
 */
export const opActivitySchema = z
  .object({
    _type: z.enum(['Activity', 'Activity::Comment']),
    id: z.number().int(),
    version: z.number().int(),
    comment: opFormattableSchema.nullish(),
    details: z.array(opFormattableSchema).nullish(),
    createdAt: z.iso.datetime({ offset: true }),
    _links: z.object({
      user: z.object({
        href: z.string().nullable(),
      }).optional(),
    }),
  })
  .transform(({ id, version, comment, details, createdAt, _links }) => {
    const href = _links.user?.href
    // L'auteur est un utilisateur : un autre lien ne désignerait pas la bonne ressource.
    const userId = href && /\/users\/\d+$/.test(href)
      ? idFromHref(href)
      : null
    return {
      id,
      userId,
      createdAt,
      creation: version === 1,
      comment: comment?.raw?.trim() && comment.html
        ? comment.html
        : null,
      changes: (details ?? []).flatMap(detail => detail.raw?.trim() || []),
    }
  })

export type OpActivity = z.output<typeof opActivitySchema>

/**
 * Page d'une collection HAL ; `nextByOffset` n'est présent que s'il reste des pages.
 * Le type varie selon la ressource : `Collection`, mais `WorkPackageCollection` pour les tâches.
 */
export function opCollectionPageSchema<T extends z.ZodType>(element: T) {
  return z.object({
    _type: z.string().regex(/^\w*Collection$/),
    _embedded: z.object({
      elements: z.array(element),
    }),
    _links: z.object({
      nextByOffset: z.object({
        href: z.string(),
      }).optional(),
    }),
  })
}

/**
 * Erreur 422 d'OP. Une seule contrainte violée donne son message ; plusieurs donnent
 * `MultipleErrors`, dont le message générique cède la place à ceux de `_embedded.errors`.
 */
export const opRejectionSchema = z
  .object({
    _type: z.literal('Error'),
    message: z.string(),
    _embedded: z.object({
      errors: z.array(z.object({
        message: z.string(),
      })).optional(),
    }).optional(),
  })
  .transform(({ message, _embedded }) => (_embedded?.errors?.length
    ? _embedded.errors.map(error => error.message)
    : [message]))
