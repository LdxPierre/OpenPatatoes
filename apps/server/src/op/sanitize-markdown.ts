/**
 * Balise `<script>` ouvrante ou fermante, attributs compris. Un `>` entre guillemets ne la ferme pas.
 * Aucun motif ne peut repasser un `<` hors guillemets : chaque recherche reste linéaire.
 */
const SCRIPT_TAG = /<(\/?)script\b(?:[^>"'<]|"[^"]*"|'[^']*')*>?/gi

/**
 * Attribut d'événement (`onclick`, `onerror`…) et sa valeur, cherché partout dans le texte et non
 * dans les seules balises : le markdown ne dit pas sûrement où le navigateur fermera une balise
 * (markdown-it échappe les guillemets du texte, pas ceux du HTML brut). `srcdoc` part aussi :
 * le navigateur décode les entités de sa valeur, qui devient un document avec ses scripts.
 *
 * Le texte autour n'est pas non plus celui que verra le navigateur : markdown-it retire le `>`
 * d'une citation en début de ligne, avant le nom comme avant le `=`. Seul un caractère de nom
 * (`data-onclick`) écarte donc la correspondance, et des `>` peuvent séparer le nom du `=` après
 * un saut de ligne. Un `==` est laissé : une valeur qui commence par `=` ne s'exécute pas, et le
 * texte (« only >= 3 », un titre souligné de `=`) reste intact.
 * Une valeur entre guillemets ne passe pas la ligne : si elle continue, seul le nom part,
 * et le `=` qui reste ne fait plus qu'un attribut inerte.
 */
const ACTIVE_ATTRIBUTE = /(?<![\w-])(?:on[a-z]+|srcdoc)[^\S\n]*(?:\n[\s>]*)?=(?!=)\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s>"']*)/gi

/**
 * Passes au-delà desquelles la description est jugée fabriquée pour déjouer l'assainissement.
 * Une description ordinaire est stable dès la deuxième.
 */
const MAX_PASSES = 5

/** Retire les éléments `<script>` avec leur contenu, et les balises `<script>` restées seules. */
function removeScripts(markdown: string) {
  let kept = ''
  let from = 0
  let open: { start: number, end: number } | null = null
  for (const match of markdown.matchAll(SCRIPT_TAG)) {
    const start = match.index
    const end = start + match[0].length
    const closing = match[1] === '/'
    if (open && closing) {
      kept += markdown.slice(from, open.start)
      from = end
      open = null
    }
    else if (!open && closing) {
      kept += markdown.slice(from, start)
      from = end
    }
    // Dans un script, une autre balise ouvrante n'est que du texte : seule la fermeture compte.
    else if (!open) {
      open = { start, end }
    }
  }
  // Sans fermeture, seule la balise ouvrante part : le texte qui suit reste lisible.
  if (open) {
    kept += markdown.slice(from, open.start)
    from = open.end
  }
  return kept + markdown.slice(from)
}

/** Une passe d'assainissement : les scripts, puis les attributs d'événement et `srcdoc`. */
function removeOnce(markdown: string) {
  return removeScripts(markdown).replace(ACTIVE_ATTRIBUTE, '')
}

/**
 * Retire d'une description markdown les éléments `<script>`, les attributs d'événement
 * et les `srcdoc` de son HTML. Le reste du markdown et du HTML est gardé tel quel : l'interface assainit
 * aussi l'aperçu, ceci n'est qu'une première barrière.
 * Le code et le texte ne sont pas épargnés : un exemple de `<script>` dans un bloc de code,
 * ou un `onclick="…"` cité dans une phrase, disparaît aussi. Les distinguer du HTML demanderait
 * d'analyser le markdown comme le fait l'aperçu, et la moindre différence laisserait passer du HTML.
 * L'éditeur part de ce texte assaini : l'enregistrer écrit ces retraits dans OP.
 */
export function sanitizeMarkdown(markdown: string) {
  // Une suppression peut en recoller une autre (`<scr<script></script>ipt>`) : on recommence
  // jusqu'à ce que rien ne change.
  let current = markdown
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = removeOnce(current)
    if (next === current)
      return current
    current = next
  }
  // Toujours instable : plus aucun HTML ne passe. Le markdown affiche `&lt;` comme un `<`.
  return current.replaceAll('<', '&lt;')
}
