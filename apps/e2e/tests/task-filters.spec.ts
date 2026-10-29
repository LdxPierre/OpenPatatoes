import type { Scenario } from './fixtures'
import { alice, expect, signIn, test } from './fixtures'

const scenario: Scenario = {
  accounts: [
    { ...alice, opToken: 'jeton-alice' },
  ],
  op: {
    users: [
      { name: 'Alice Martin', token: 'jeton-alice' },
      { name: 'Bruno Petit', token: 'jeton-bruno' },
    ],
    projects: [
      {
        id: 1,
        identifier: 'potager',
        name: 'Potager',
        memberIds: [1, 2],
      },
    ],
    workPackages: [
      { id: 10, projectId: 1, subject: 'Préparer le terrain' },
      {
        id: 11,
        projectId: 1,
        subject: 'Bêcher les planches',
        parentId: 10,
        assigneeId: 1,
        statusId: 7,
      },
      {
        id: 12,
        projectId: 1,
        subject: 'Réparer la clôture',
        parentId: 10,
        assigneeId: 2,
        type: { id: 7, name: 'Bug' },
      },
      {
        id: 13,
        projectId: 1,
        subject: 'Commander le terreau',
        statusId: 12,
      },
    ],
  },
}

test.describe('filtres et recherche de l\'arbre', () => {
  test.use({ scenario })

  test('cherche, filtre, garde les critères dans l\'adresse et dit quand rien ne correspond', async ({ page }) => {
    await signIn(page, alice)
    await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
    await page.goto('/projets/1')
    const tree = page.getByRole('tree', { name: 'Tâches de Potager' })
    await expect(tree.getByRole('treeitem')).toHaveCount(2)

    // Recherche sans accent : l'ancêtre s'affiche pour le contexte, l'arbre se déplie jusqu'au résultat.
    await page.keyboard.press('/')
    const search = page.getByRole('searchbox', { name: 'Rechercher une tâche par numéro ou titre' })
    await expect(search).toBeFocused()
    await search.fill('becher')
    await expect(page).toHaveURL('/projets/1?q=becher')
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Bêcher les planches/])
    await expect(page.getByText('1 tâche sur 4')).toBeVisible()
    await search.press('Escape')
    await expect(page).toHaveURL('/projets/1')

    // Choix dans les listes : les valeurs d'un filtre en OU, les filtres en ET.
    await page.getByRole('button', { name: /^Assigné/ }).click()
    await page.getByRole('option', { name: /Moi/ }).click()
    await page.getByRole('option', { name: /Bruno Petit/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Assigné · 2' })).toBeVisible()
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Bêcher les planches/, /Réparer la clôture/])

    await page.getByRole('button', { name: /^Type/ }).click()
    await page.getByRole('option', { name: /Bug/ }).click()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL('/projets/1?type=7&assignee=me,2')
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Réparer la clôture/])

    // Les critères survivent au rechargement.
    await page.reload()
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Réparer la clôture/])
    await expect(page.getByRole('button', { name: 'Type · 1' })).toBeVisible()

    // Le parent se cherche par numéro et garde sa descendance.
    await page.getByRole('button', { name: 'Effacer les filtres' }).click()
    await expect(page).toHaveURL('/projets/1')
    await page.getByRole('button', { name: /^Parent/ }).click()
    await page.getByPlaceholder('Rechercher par numéro ou titre').last().fill('#10')
    await page.getByRole('option', { name: /Préparer le terrain/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('2 tâches sur 4')).toBeVisible()

    await search.fill('introuvable')
    await expect(page.getByText('Aucune tâche ne correspond à ces critères.')).toBeVisible()
    await expect(tree).toBeHidden()
  })

  test('déplie et replie tout l\'arbre, filtré ou non', async ({ page }) => {
    await signIn(page, alice)
    await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
    await page.goto('/projets/1')
    const tree = page.getByRole('tree', { name: 'Tâches de Potager' })
    await expect(tree.getByRole('treeitem')).toHaveCount(2)

    await page.getByRole('button', { name: 'Tout déplier' }).click()
    await expect(tree.getByRole('treeitem')).toHaveCount(4)
    await page.getByRole('button', { name: 'Tout replier' }).click()
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Commander le terreau/])

    // Sous un filtre, le bouton agit sur l'arbre filtré, déplié jusqu'au résultat.
    await page.getByRole('searchbox', { name: 'Rechercher une tâche par numéro ou titre' }).fill('becher')
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Bêcher les planches/])
    await page.getByRole('button', { name: 'Tout replier' }).click()
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/])
    await page.getByRole('button', { name: 'Tout déplier' }).click()
    await expect(tree.getByRole('treeitem')).toHaveCount(2)

    // Sans critère, l'arbre retrouve le dépliage d'avant le filtre.
    await page.getByRole('button', { name: 'Effacer les filtres' }).click()
    await expect(tree.getByRole('treeitem')).toHaveText([/Préparer le terrain/, /Commander le terreau/])
  })
})
