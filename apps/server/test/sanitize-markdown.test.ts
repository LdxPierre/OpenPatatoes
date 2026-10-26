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

  it('ne touche pas au texte qui ressemble à un attribut hors d\'une balise', () => {
    const markdown = 'Le paramètre onclick="x" se règle dans le fichier.'

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
