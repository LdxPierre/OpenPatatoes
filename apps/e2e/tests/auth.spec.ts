import { alice, expect, signIn, test } from './fixtures'

test.use({
  scenario: {
    accounts: [alice],
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
    },
  },
})

test('sans session, une page privée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/projets/1')

  await expect(page).toHaveURL('/connexion?redirect=/projets/1')
  await expect(page.getByRole('heading', { name: 'OpenPatatoes' })).toBeVisible()
})

test('des identifiants refusés affichent une erreur', async ({ page }) => {
  await signIn(page, { ...alice, password: 'mauvais-mot-de-passe' })

  await expect(page.getByText('Identifiant ou mot de passe incorrect.')).toBeVisible()
  await expect(page).toHaveURL('/connexion')
})

test('à la première connexion, le jeton OP mène aux projets', async ({ page }) => {
  await signIn(page, alice)
  await expect(page).toHaveURL('/jeton-op')

  await page.getByLabel('Jeton d\'API OpenProject').fill('jeton-alice')
  await page.getByRole('button', { name: 'Enregistrer le jeton' }).click()
  await expect(page.getByText('Connecté à OpenProject en tant que Alice Martin.')).toBeVisible()
  await page.getByRole('button', { name: 'Continuer' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: /Potager/ })).toBeVisible()
})

test('un jeton refusé par OP affiche une erreur', async ({ page }) => {
  await signIn(page, alice)

  await page.getByLabel('Jeton d\'API OpenProject').fill('jeton-inconnu')
  await page.getByRole('button', { name: 'Enregistrer le jeton' }).click()

  await expect(page.getByText('OpenProject a refusé ce jeton.')).toBeVisible()
  await expect(page).toHaveURL('/jeton-op')
})

test('la déconnexion ramène à la connexion', async ({ page }) => {
  await signIn(page, alice)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()

  await expect(page).toHaveURL('/connexion')
  await page.goto('/')
  await expect(page).toHaveURL('/connexion')
})
