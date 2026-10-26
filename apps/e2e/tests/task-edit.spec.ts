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
      {
        id: 10,
        projectId: 1,
        subject: 'Pailler les allées',
        assigneeId: 1,
        estimatedTime: 'PT8H',
        remainingTime: 'PT6H',
      },
    ],
  },
}

/** Ouvre le détail de la tâche, à côté de l'arbre du projet. */
async function openTask(page: Page) {
  await signIn(page, alice)
  await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
  await page.goto('/projets/1/taches/10')
  return page.getByRole('complementary')
}

test.describe('modification d\'une tâche', () => {
  test.use({ scenario })

  test('modifie le temps estimé et le temps restant, enregistrés dans OP', async ({ page }) => {
    const panel = await openTask(page)

    await panel.getByRole('button', { name: /^Estimé : 8/ }).click()
    await panel.getByRole('textbox', { name: 'Estimé' }).fill('12,5')
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('button', { name: /^Estimé : 12,5/ })).toBeVisible()

    await panel.getByRole('button', { name: /^Restant : 6/ }).click()
    await panel.getByRole('textbox', { name: 'Restant' }).fill('1 h 30')
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.keyboard.press('Enter')
    // Affiché avant la réponse d'OP.
    await expect(panel.getByRole('button', { name: /^Restant : 1,5/ })).toBeVisible()

    // OP a gardé les deux valeurs : elles reviennent après un rechargement.
    await saved
    await page.reload()
    await expect(panel.getByRole('button', { name: /^Estimé : 12,5/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^Restant : 1,5/ })).toBeVisible()
  })

  test('change l\'assigné, dans le détail comme dans l\'arbre', async ({ page }) => {
    const panel = await openTask(page)
    const row = page.getByRole('treeitem', { name: /Pailler les allées/ })
    await expect(row).toContainText('Alice Martin')

    // Échap ferme la liste, pas le détail.
    await panel.getByRole('button', { name: /^Assigné : Alice Martin/ }).click()
    await expect(page.getByRole('option', { name: 'Bruno Petit' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('option')).toHaveCount(0)
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: /^Assigné : Alice Martin/ }).click()
    await page.getByPlaceholder('Rechercher un membre').fill('bru')
    await expect(page.getByRole('option')).toHaveCount(1)
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByRole('option', { name: 'Bruno Petit' }).click()

    await expect(panel.getByRole('button', { name: /^Assigné : Bruno Petit/ })).toBeVisible()
    await expect(row).toContainText('Bruno Petit')
    await saved
    await page.reload()
    await expect(panel.getByRole('button', { name: /^Assigné : Bruno Petit/ })).toBeVisible()
  })

  test.describe('quand OP refuse la modification', () => {
    test.use({
      scenario: {
        ...scenario,
        op: {
          ...scenario.op,
          interceptions: [
            {
              method: 'PATCH',
              path: '/api/v3/work_packages/10',
              status: 422,
              body: {
                _type: 'Error',
                errorIdentifier: 'urn:openproject-org:api:v3:errors:PropertyConstraintViolation',
                message: 'Le temps restant ne peut pas dépasser le temps estimé.',
              },
            },
          ],
        },
      },
    })

    test('revient à la valeur enregistrée et affiche la raison', async ({ page }) => {
      const panel = await openTask(page)

      await panel.getByRole('button', { name: /^Restant : 6/ }).click()
      await panel.getByRole('textbox', { name: 'Restant' }).fill('40')
      await page.keyboard.press('Enter')

      await expect(panel.getByRole('alert')).toHaveText(
        'OpenProject a refusé la modification : Le temps restant ne peut pas dépasser le temps estimé.',
      )
      await expect(panel.getByRole('button', { name: /^Restant : 6/ })).toBeVisible()
    })
  })
})
