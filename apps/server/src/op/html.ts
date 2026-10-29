import sanitizeHtml from 'sanitize-html'

/**
 * Assainit le HTML rendu par OP (les commentaires) avant de l'envoyer au navigateur.
 * Ni script, ni attribut `on*`, ni lien `javascript:` ne passent, même si OP les laissait passer.
 * Les liens et images relatifs pointent vers l'instance OP, pas vers l'app ; les liens
 * s'ouvrent dans un nouvel onglet. Les balises inconnues (mentions d'OP) gardent leur texte.
 */
export function sanitizeOpHtml(html: string, instanceUrl: string): string {
  const absolute = (url: string | undefined) => {
    if (url === undefined)
      return undefined
    try {
      return new URL(url, `${instanceUrl}/`).toString()
    }
    catch {
      return undefined
    }
  }
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'del',
      's',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: [
        'src',
        'alt',
        'title',
        'width',
        'height',
      ],
      th: ['align', 'colspan', 'rowspan'],
      td: ['align', 'colspan', 'rowspan'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.href !== undefined && { href: absolute(attribs.href) ?? '' }),
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.src !== undefined && { src: absolute(attribs.src) ?? '' }),
        },
      }),
    },
  })
}
