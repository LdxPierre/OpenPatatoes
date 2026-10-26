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
 * Les styles, les formulaires et leurs champs partent aussi : ils pourraient couvrir ou imiter l'app.
 * Les cases à cocher restent : md-editor-v3 en fait les listes de tâches.
 */
export function sanitizePreview(html: string) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      'style',
      'form',
      'button',
      'textarea',
      'select',
    ],
    FORBID_ATTR: ['style'],
  })
}

/**
 * La touche vient-elle de l'éditeur markdown ? Ses fenêtres sont placées à la fin de la page,
 * hors de l'éditeur : elles comptent aussi. L'aperçu en lecture porte aussi la classe `md-editor` :
 * md-editor-v3 l'en distingue par `md-editor-previewOnly`.
 */
export function isFromMarkdownEditor(event: Event) {
  return event.target instanceof Element && !!event.target.closest('.md-editor:not(.md-editor-previewOnly), .md-editor-modal-container')
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
