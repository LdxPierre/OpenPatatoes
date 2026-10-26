import DOMPurify from 'dompurify'
import { config } from 'md-editor-v3'

/** Langue des libellés de md-editor-v3, déclarée ci-dessous : il ne connaît que le chinois et l'anglais. */
export const MARKDOWN_LANGUAGE = 'fr-FR'

/**
 * Outils de l'éditeur. Aucun ne charge de bibliothèque depuis un CDN : pas d'image (cropper),
 * de plein écran (screenfull), de formatage (prettier), de formule (katex) ni de diagramme (mermaid).
 */
export const MARKDOWN_TOOLBARS = [
  'bold',
  'italic',
  'strikeThrough',
  'title',
  '-',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'table',
  '=',
  'previewOnly',
  'pageFullscreen',
] as const

/**
 * HTML de l'aperçu, assaini : ni script, ni attribut d'événement, ni lien `javascript:`.
 * Les feuilles de style et les formulaires partent aussi : ils pourraient habiller ou imiter l'app.
 */
export function sanitizePreview(html: string) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form'],
  })
}

config({
  // Les descriptions d'OP mêlent du HTML au markdown (tableaux, images dimensionnées) :
  // md-editor-v3 l'ignore par défaut, il est rendu ici puis assaini par `sanitizePreview`.
  markdownItConfig: (md) => {
    md.set({ html: true })
  },
  editorConfig: {
    languageUserDefined: {
      [MARKDOWN_LANGUAGE]: {
        toolbarTips: {
          bold: 'Gras',
          italic: 'Italique',
          strikeThrough: 'Barré',
          title: 'Titre',
          quote: 'Citation',
          unorderedList: 'Liste à puces',
          orderedList: 'Liste numérotée',
          task: 'Liste de cases à cocher',
          codeRow: 'Code dans la ligne',
          code: 'Bloc de code',
          link: 'Lien',
          table: 'Tableau',
          previewOnly: 'Aperçu',
          pageFullscreen: 'Agrandir l\'éditeur',
        },
        titleItem: {
          h1: 'Titre 1',
          h2: 'Titre 2',
          h3: 'Titre 3',
          h4: 'Titre 4',
          h5: 'Titre 5',
          h6: 'Titre 6',
        },
        linkModalTips: {
          linkTitle: 'Ajouter un lien',
          descLabel: 'Texte',
          descLabelPlaceHolder: 'Texte du lien',
          urlLabel: 'Adresse',
          urlLabelPlaceHolder: 'https://',
          buttonOK: 'Ajouter',
        },
        copyCode: {
          text: 'Copier',
          successTips: 'Copié',
          failTips: 'Copie impossible',
        },
        footer: {
          markdownTotal: 'Caractères',
          scrollAuto: 'Défilement synchronisé',
        },
      },
    },
  },
})
