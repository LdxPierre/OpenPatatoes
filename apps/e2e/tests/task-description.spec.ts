import type { Page } from '@playwright/test'
import type { Scenario } from './fixtures'
import { alice, expect, signIn, test } from './fixtures'

const scenario: Scenario = {
  accounts: [
    { ...alice, opToken: 'jeton-alice' },
  ],
  op: {
    users: [
      { name: 'Alice Martin', token: 'jeton-alice' },
    ],
    projects: [
      {
        id: 1,
        identifier: 'potager',
        name: 'Potager',
        memberIds: [1],
      },
    ],
    workPackages: [
      {
        id: 10,
        projectId: 1,
        subject: 'Pailler les allées',
        description: 'Couvrir les allées de **paille**.\n\n<img src="/x.png" alt="plan" onerror="window.hacked = true">\n\n<script>window.hacked = true</script>',
      },
    ],
  },
}

async function openTask(page: Page) {
  await signIn(page, alice)
  await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
  await page.goto('/projets/1/taches/10')
  return page.getByRole('complementary')
}

function hacked(page: Page) {
  return page.evaluate(() => (globalThis as { hacked?: boolean }).hacked ?? false)
}

test.describe('description d\'une tâche', () => {
  test.use({ scenario })

  test('affiche la description venue d\'OP sans en exécuter les scripts', async ({ page }) => {
    const panel = await openTask(page)
    const description = panel.getByRole('region', { name: 'Description' })

    await expect(description.locator('strong')).toHaveText('paille')
    await expect(description.getByRole('img', { name: 'plan' })).toBeAttached()
    await expect(description.locator('[onerror], script')).toHaveCount(0)
    expect(await hacked(page)).toBe(false)
  })

  test('modifie la description avec l\'éditeur, aperçu assaini compris, et l\'enregistre dans OP', async ({ page }) => {
    // md-editor-v3 charge ses bibliothèques optionnelles depuis un CDN : aucune ne doit l'être.
    const external: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== 'localhost')
        external.push(request.url())
    })
    const panel = await openTask(page)
    const description = panel.getByRole('region', { name: 'Description' })

    await description.getByRole('button', { name: 'Modifier la description' }).click()
    const editor = description.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Paillage **épais**\n\n<b onclick="window.hacked = true">gras</b><script>window.hacked = true</script>')

    // L'aperçu de l'éditeur rend le markdown, sans script ni attribut d'événement.
    await description.getByRole('button', { name: 'Aperçu' }).click()
    const preview = description.locator('.md-editor-preview')
    await expect(preview.locator('strong')).toHaveText('épais')
    await expect(preview.locator('b')).toHaveText('gras')
    await expect(preview.locator('[onclick], script')).toHaveCount(0)
    await preview.locator('b').click()
    expect(await hacked(page)).toBe(false)

    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await description.getByRole('button', { name: 'Enregistrer la description' }).click()
    const response = await saved
    expect(response.status()).toBe(200)
    expect((await response.json()).task.description).toBe('Paillage **épais**\n\n<b >gras</b>')

    expect(external).toEqual([])

    await page.reload()
    await expect(page.getByRole('region', { name: 'Description' }).locator('strong')).toHaveText('épais')
  })

  test('n\'enregistre rien en annulant, et Échap ne ferme pas le détail', async ({ page }) => {
    const panel = await openTask(page)
    const description = panel.getByRole('region', { name: 'Description' })

    await description.getByRole('button', { name: 'Modifier la description' }).click()
    await description.locator('.cm-content').click()
    await page.keyboard.type(' brouillon')
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible()
    await expect(description.locator('.cm-content')).toContainText('brouillon')

    await description.getByRole('button', { name: 'Annuler' }).click()
    await expect(description.locator('.cm-content')).toHaveCount(0)
    await expect(description).not.toContainText('brouillon')
  })

  test('agrandit l\'éditeur par-dessus l\'arbre et son en-tête', async ({ page }) => {
    const panel = await openTask(page)
    const description = panel.getByRole('region', { name: 'Description' })
    const head = page.locator('.tree-head')
    await expect(head).toBeVisible()

    await description.getByRole('button', { name: 'Modifier la description' }).click()
    await description.getByRole('button', { name: 'Agrandir l\'éditeur' }).click()

    const box = await head.boundingBox()
    if (!box)
      throw new Error('En-tête de l\'arbre absent')
    const covered = await description.locator('.md-editor').evaluate(
      (editor, { x, y }) => editor.contains(editor.ownerDocument.elementFromPoint(x, y)),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(covered).toBe(true)
  })
})
