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
      { id: 10, projectId: 1, subject: 'Pailler les allées' },
    ],
    activities: [
      { workPackageId: 10, userId: 2, createdAt: '2026-10-01T08:00:00.000Z' },
      {
        workPackageId: 10,
        userId: 2,
        comment: 'Prévoir **trois** ballots.',
        createdAt: '2026-10-02T08:00:00.000Z',
      },
      {
        workPackageId: 10,
        userId: 2,
        details: ['Status changed from New to In progress'],
        createdAt: '2026-10-03T08:00:00.000Z',
      },
    ],
  },
}

test.describe('activité d\'une tâche', () => {
  test.use({ scenario })

  test('affiche l\'historique et ajoute un commentaire markdown, enregistré dans OP', async ({ page }) => {
    await signIn(page, alice)
    await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
    await page.goto('/projets/1/taches/10')
    const panel = page.getByRole('complementary')

    await panel.getByRole('tab', { name: 'Activité' }).click()
    // Le faux OP ne rend pas le markdown : le HTML du commentaire en reprend le texte.
    const feed = panel.getByRole('list').first()
    await expect(feed).toContainText('Bruno Petit a créé la tâche')
    await expect(feed).toContainText('Prévoir **trois** ballots.')
    await expect(feed).toContainText('Bruno Petit a modifié la tâche')

    await panel.getByRole('textbox', { name: 'Commentaire' }).fill('Paillage **terminé**.')
    await panel.getByRole('button', { name: 'Commenter' }).click()

    await expect(panel.getByRole('textbox', { name: 'Commentaire' })).toHaveValue('')
    await expect(feed).toContainText('Paillage **terminé**.')

    // Relu depuis OP : le commentaire y est enregistré, au nom d'Alice.
    await page.reload()
    await panel.getByRole('tab', { name: 'Activité' }).click()
    await expect(feed).toContainText('Paillage **terminé**.')
    await expect(feed).toContainText('Alice Martin')
  })
})
