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
      { id: 10, projectId: 1, subject: 'Pailler les allées' },
      {
        id: 11,
        projectId: 1,
        subject: 'Arroser les semis',
        parentId: 10,
      },
    ],
  },
}

test.describe('création d\'une tâche', () => {
  test.use({ scenario })

  test('crée une tâche sous un parent replié, puis ouvre son détail', async ({ page }) => {
    await signIn(page, alice)
    await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
    await page.goto('/projets/1')

    const newTask = page.getByRole('button', { name: 'Nouvelle tâche' })
    await newTask.click()
    const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche dans Potager' })
    await expect(dialog.getByLabel('Titre')).toBeFocused()
    await expect(dialog.getByRole('button', { name: /^Type : Task/ })).toBeVisible()

    await dialog.getByRole('button', { name: /^Type : Task/ }).click()
    await page.getByRole('option', { name: 'Bug' }).click()
    await dialog.getByRole('button', { name: /^Parent : Aucun parent/ }).click()
    await page.getByRole('option', { name: /Pailler les allées/ }).click()
    await dialog.getByLabel('Titre').fill('Réparer le tuyau')
    await page.keyboard.press('Enter')

    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL('/projets/1/taches/12')
    const panel = page.getByRole('complementary')
    await expect(panel.getByRole('heading', { name: 'Réparer le tuyau' })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^Type : Bug/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Fermer le détail' })).toBeFocused()
    const row = page.getByRole('treeitem', { name: /Réparer le tuyau/ })
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(row).toHaveAttribute('aria-level', '2')

    await page.reload()
    await expect(panel.getByRole('heading', { name: 'Réparer le tuyau' })).toBeVisible()
  })
})

test.describe('refus de la création', () => {
  test.use({
    scenario: {
      ...scenario,
      op: {
        ...scenario.op,
        interceptions: [
          {
            method: 'POST',
            path: '/api/v3/projects/1/work_packages',
            status: 422,
            body: {
              _type: 'Error',
              errorIdentifier: 'urn:openproject-org:api:v3:errors:PropertyConstraintViolation',
              message: 'Subject is too long.',
            },
          },
        ],
      },
    },
  })

  test('garde la saisie et affiche le refus d\'OP, puis ferme avec Échap', async ({ page }) => {
    await signIn(page, alice)
    await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
    await page.goto('/projets/1')

    await page.getByRole('button', { name: 'Nouvelle tâche' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Titre').fill('Réparer le tuyau')
    await dialog.getByRole('button', { name: 'Créer' }).click()

    await expect(dialog.getByRole('alert')).toContainText('OpenProject a refusé la création : Subject is too long.')
    await expect(dialog.getByLabel('Titre')).toHaveValue('Réparer le tuyau')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Nouvelle tâche' })).toBeFocused()
    await expect(page.getByRole('treeitem')).toHaveCount(1)
  })
})
