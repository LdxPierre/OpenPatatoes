import { describe, expect, it } from 'vitest'
import { sanitizeMarkdown } from '../src/op/sanitize-markdown.js'

describe('assainissement d\'une description markdown', () => {
  it('garde le markdown et le HTML inoffensif tels quels', () => {
    const markdown = '# Titre\n\nDu **gras**, un [lien](https://example.org) et <kbd>Ctrl</kbd>.\n\n<img src="x.png" alt="a > b">'

    expect(sanitizeMarkdown(markdown)).toBe(markdown)
  })

  it.each([
    ['un élément script', 'a<script>alert(1)</script>b', 'ab'],
    ['un script en majuscules, sur plusieurs lignes', 'a<SCRIPT type="module">\nalert(1)\n</SCRIPT >b', 'ab'],
    ['un script dont un attribut contient un chevron', 'a<script data-x=">">alert(1)</script>b', 'ab'],
    ['une balise script ouvrante restée seule', 'a<script src="x.js">b', 'ab'],
    ['une balise script fermante restée seule', 'a</script>b', 'ab'],
    ['un script recollé par la suppression d\'un autre', 'a<scr<script></script>ipt>alert(1)</script>b', 'aalert(1)b'],
  ])('retire %s', (_case, markdown, sanitized) => {
    expect(sanitizeMarkdown(markdown)).toBe(sanitized)
  })

  it.each([
    ['entre guillemets', '<img src="x" onerror="alert(1)">', '<img src="x" >'],
    ['entre apostrophes', '<img src="x" onerror=\'alert(1)\'>', '<img src="x" >'],
    ['sans guillemets', '<img src=x onerror=alert(1)>', '<img src=x >'],
    ['en majuscules, avec des espaces autour du égal', '<a href="#" ONCLICK = "alert(1)">lien</a>', '<a href="#" >lien</a>'],
    ['collé au nom de la balise par une barre oblique', '<svg/onload=alert(1)>', '<svg/>'],
    ['collé à la valeur précédente', '<a title="x"onclick="alert(1)">lien</a>', '<a title="x">lien</a>'],
    ['à la suite d\'un autre', '<a onmouseover="a()"onclick="b()">lien</a>', '<a >lien</a>'],
    ['après une valeur qui contient un chevron', '<a title="a > b" onclick="alert(1)">lien</a>', '<a title="a > b" >lien</a>'],
    ['sur plusieurs lignes', '<div\n  class="note"\n  onclick="alert(1)"\n>texte</div>', '<div\n  class="note"\n  \n>texte</div>'],
  ])('retire un attribut d\'événement %s', (_case, markdown, sanitized) => {
    expect(sanitizeMarkdown(markdown)).toBe(sanitized)
  })

  it.each([
    ['après une apostrophe sans paire', '<p><img src=x \'x onerror=alert(1)>', '<p><img src=x \'x >'],
    ['après un guillemet dans un nom', '<p><img src=x a"b onerror=alert(1)>', '<p><img src=x a"b >'],
    ['après une valeur sans guillemets qui en contient un', '<img src=x\' onerror=alert(1)>', '<img src=x\' >'],
    ['après un chevron dans une valeur', '<div>\n<img src=x title=< onerror=alert(1)>\n</div>', '<div>\n<img src=x title=< >\n</div>'],
    // Le navigateur ferme la valeur de `x` au guillemet brut de `y=` : le guillemet du texte, échappé par markdown-it, ne compte pas.
    ['après une valeur que le texte du markdown décale', '<div x="\n\na"\n\n<b y=" onerror=alert(1) >', '<div x="\n\na"\n\n<b y="  >'],
    // markdown-it retire le `>` de la citation : l'attribut suit alors un saut de ligne.
    ['sur la ligne suivante d\'une citation', '> <img src=x\n>onerror=alert(1)>', '> <img src=x\n>>'],
    ['sur la ligne suivante d\'une citation imbriquée', '> > <div\n>>onmouseover=alert(1)>x</div>', '> > <div\n>>>x</div>'],
    ['dont l\'égal est sur la ligne suivante d\'une citation', '> <img src=x onerror\n> =alert(1)>', '> <img src=x >'],
    ['dont l\'égal est sur la ligne suivante d\'une citation imbriquée', '> > <img src=x onerror\n> > =alert(1)>', '> > <img src=x >'],
    ['dont l\'égal est sur la ligne suivante d\'une citation dans une liste', '- > <img src=x onerror\n  > =alert(1)>', '- > <img src=x >'],
    ['dont la valeur entre guillemets continue à la ligne suivante', '<a onclick="alert(1)\n">lien</a>', '<a "alert(1)\n">lien</a>'],
  ])('retire un attribut d\'événement %s', (_case, markdown, sanitized) => {
    expect(sanitizeMarkdown(markdown)).toBe(sanitized)
  })

  it('retire le document d\'un cadre, dont les entités cachent des scripts', () => {
    expect(sanitizeMarkdown('<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>')).toBe('<iframe ></iframe>')
  })

  it('retire aussi un attribut d\'événement cité dans le texte : rien ne dit sûrement qu\'il est hors d\'une balise', () => {
    expect(sanitizeMarkdown('Le paramètre onclick="x" se règle dans le fichier.')).toBe('Le paramètre  se règle dans le fichier.')
  })

  it.each([
    ['une comparaison', 'Seulement si only >= 3 et once == 2.'],
    ['un titre souligné', 'Onboarding\n==========\n\ntexte'],
    ['un titre souligné dans une citation', '> Online\n> =====\n\nsuite'],
  ])('garde %s dont un mot commence par « on »', (_case, markdown) => {
    expect(sanitizeMarkdown(markdown)).toBe(markdown)
  })

  it('garde les mots qui commencent par « on » sans être suivis d\'un égal, et les attributs qui finissent par « on… »', () => {
    const markdown = 'On online <a title="ongoing" data-onclick="x">lien</a>'

    expect(sanitizeMarkdown(markdown)).toBe(markdown)
  })

  it('neutralise tout le HTML d\'une description fabriquée pour rester instable', () => {
    const nested = `${'<scr'.repeat(10)}<script></script>${'ipt>'.repeat(10)}alert(1)`

    const sanitized = sanitizeMarkdown(nested)

    expect(sanitized).not.toMatch(/<script/i)
    expect(sanitized).not.toContain('<')
  })

  it('reste rapide sur une longue description hostile', () => {
    const hostile = '<script>'.repeat(50_000) + '<a '.repeat(50_000)

    const start = performance.now()
    sanitizeMarkdown(hostile)

    expect(performance.now() - start).toBeLessThan(1000)
  })
})
