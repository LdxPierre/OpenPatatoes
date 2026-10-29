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
        statusId: 1,
        allowedStatusIds: [7],
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

  test('change l\'état parmi les transitions permises par OP, dans le détail comme dans l\'arbre', async ({ page }) => {
    const panel = await openTask(page)
    const row = page.getByRole('treeitem', { name: /Pailler les allées/ })
    await expect(row).toContainText('New')

    await panel.getByRole('button', { name: /^État : New/ }).click()
    // Le faux OP ne permet que In progress depuis New : Closed n'est pas proposé.
    await expect(page.getByRole('option')).toHaveText(['New', 'In progress'])
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByRole('option', { name: 'In progress' }).click()

    await expect(panel.getByRole('button', { name: /^État : In progress/ })).toBeVisible()
    await expect(row).toContainText('In progress')
    await saved
    await page.reload()
    await expect(panel.getByRole('button', { name: /^État : In progress/ })).toBeVisible()
    await expect(row).toContainText('In progress')
  })

  test('change le type et la priorité, enregistrés dans OP', async ({ page }) => {
    const panel = await openTask(page)

    await panel.getByRole('button', { name: /^Type : Task/ }).click()
    await page.getByRole('option', { name: 'Bug' }).click()
    await expect(panel.getByRole('button', { name: /^Type : Bug/ })).toBeVisible()

    await panel.getByRole('button', { name: /^Priorité : Normal/ }).click()
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByRole('option', { name: 'High' }).click()
    await expect(panel.getByRole('button', { name: /^Priorité : High/ })).toBeVisible()

    await saved
    await page.reload()
    await expect(panel.getByRole('button', { name: /^Type : Bug/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /^Priorité : High/ })).toBeVisible()
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

  test.describe('quand OP refuse la transition d\'état', () => {
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
                message: 'Status is invalid because no valid transition exists.',
              },
            },
          ],
        },
      },
    })

    test('revient à l\'état enregistré, dans le détail comme dans l\'arbre', async ({ page }) => {
      const panel = await openTask(page)
      const row = page.getByRole('treeitem', { name: /Pailler les allées/ })

      await panel.getByRole('button', { name: /^État : New/ }).click()
      await page.getByRole('option', { name: 'In progress' }).click()

      await expect(panel.getByRole('alert')).toHaveText(
        'OpenProject a refusé la modification : Status is invalid because no valid transition exists.',
      )
      await expect(panel.getByRole('button', { name: /^État : New/ })).toBeVisible()
      await expect(row).toContainText('New')
    })
  })

  test.describe('sans droit de modifier la tâche', () => {
    test.use({
      scenario: {
        ...scenario,
        op: {
          ...scenario.op,
          interceptions: [
            { method: 'POST', path: '/api/v3/work_packages/10/form', status: 403 },
          ],
        },
      },
    })

    test('le dit, sans proposer de réessayer', async ({ page }) => {
      const panel = await openTask(page)

      await panel.getByRole('button', { name: /^État : New/ }).click()

      await expect(page.getByRole('alert')).toHaveText('OpenProject ne vous permet pas de modifier cette tâche.')
      await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0)
    })
  })

  test.describe('quand la tâche a été modifiée dans OP depuis son ouverture', () => {
    const bruno = { username: 'bruno', password: 'mot-de-passe-bruno' }
    test.use({
      scenario: {
        ...scenario,
        accounts: [
          ...scenario.accounts!,
          { ...bruno, opToken: 'jeton-bruno' },
        ],
      },
    })

    test('recharge la tâche, rappelle la valeur saisie et la réapplique', async ({ page, browser }) => {
      const panel = await openTask(page)
      await expect(panel.getByRole('button', { name: /^Estimé : 8/ })).toBeVisible()

      // Pendant ce temps, Bruno change l'estimé de la même tâche.
      const brunoContext = await browser.newContext()
      const brunoPage = await brunoContext.newPage()
      await signIn(brunoPage, bruno)
      await expect(brunoPage.getByRole('heading', { name: 'Projets' })).toBeVisible()
      await brunoPage.goto('/projets/1/taches/10')
      const brunoPanel = brunoPage.getByRole('complementary')
      await brunoPanel.getByRole('button', { name: /^Estimé : 8/ }).click()
      await brunoPanel.getByRole('textbox', { name: 'Estimé' }).fill('10')
      const brunoSaved = brunoPage.waitForResponse(response => response.request().method() === 'PATCH')
      await brunoPage.keyboard.press('Enter')
      expect((await brunoSaved).status()).toBe(200)
      await brunoContext.close()

      await panel.getByRole('button', { name: /^Restant : 6/ }).click()
      await panel.getByRole('textbox', { name: 'Restant' }).fill('2')
      await page.keyboard.press('Enter')

      await expect(page.getByRole('alert')).toHaveText(
        'Cette tâche a été modifiée dans OpenProject depuis son chargement, elle a été rechargée. Votre modification n\'a pas été enregistrée : Restant : 2\u202Fh.',
      )
      await expect(panel.getByRole('button', { name: /^Estimé : 10/ })).toBeVisible()
      await expect(panel.getByRole('button', { name: /^Restant : 6/ })).toBeVisible()

      await panel.getByRole('button', { name: 'Réappliquer mes modifications' }).click()
      await expect(panel.getByRole('button', { name: /^Restant : 2/ })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)

      // OP a gardé l'estimé de Bruno et le restant d'Alice.
      await page.reload()
      await expect(panel.getByRole('button', { name: /^Estimé : 10/ })).toBeVisible()
      await expect(panel.getByRole('button', { name: /^Restant : 2/ })).toBeVisible()
    })
  })
})

test.describe('changement de parent', () => {
  test.use({
    scenario: {
      ...scenario,
      op: {
        ...scenario.op,
        projects: [
          ...scenario.op!.projects!,
          {
            id: 2,
            identifier: 'verger',
            name: 'Verger',
            memberIds: [1],
          },
        ],
        workPackages: [
          ...scenario.op!.workPackages!,
          {
            id: 11,
            projectId: 1,
            subject: 'Commander la paille',
            parentId: 10,
          },
          { id: 20, projectId: 1, subject: 'Tailler la haie' },
          { id: 30, projectId: 2, subject: 'Greffer les pommiers' },
        ],
      },
    },
  })

  test('ne propose que les tâches du même projet, hors la tâche et ses sous-tâches, et déplace la tâche dans l\'arbre', async ({ page }) => {
    const panel = await openTask(page)
    const row = page.getByRole('treeitem', { name: /Pailler les allées/ })
    await expect(row).toHaveAttribute('aria-level', '1')

    await panel.getByRole('button', { name: /^Parent : Aucun parent/ }).click()
    await expect(page.getByRole('option')).toHaveText(['Aucun parent', '#20 Tailler la haie'])
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByRole('option', { name: /Tailler la haie/ }).click()

    await expect(panel.getByRole('button', { name: /^Parent : Tailler la haie/ })).toBeVisible()
    await expect(panel.getByRole('link', { name: /Tailler la haie/ })).toBeVisible()
    await expect(row).toHaveAttribute('aria-level', '2')
    await saved
    await page.reload()
    await expect(panel.getByRole('button', { name: /^Parent : Tailler la haie/ })).toBeVisible()
    await expect(row).toHaveAttribute('aria-level', '2')
  })
})
