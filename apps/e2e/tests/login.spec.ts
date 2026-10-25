import { projects, user } from './data'
import { expect, test } from './fixtures'

test.beforeEach(async ({ api }) => {
  await api.on('GET', '/auth/me', {
    status: 401,
    body: { error: 'unauthorized' },
  })
})

test('sans session, une page privée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/projets/1')

  await expect(page).toHaveURL('/connexion?redirect=/projets/1')
  await expect(page.getByRole('heading', { name: 'OpenPatatoes' })).toBeVisible()
})

test('la connexion mène aux projets', async ({ page, api }) => {
  await api.on('POST', '/auth/login', {
    body: { user },
  })
  await api.on('GET', '/projects', { body: projects })

  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill('marie')
  await page.getByLabel('Mot de passe').fill('secret')
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Potager/ })).toBeVisible()
  await expect(page.getByText('2 projets')).toBeVisible()
})

test('des identifiants refusés affichent une erreur', async ({ page, api }) => {
  await api.on('POST', '/auth/login', {
    status: 401,
    body: { error: 'invalid_credentials' },
  })

  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill('marie')
  await page.getByLabel('Mot de passe').fill('faux')
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page.getByText('Identifiant ou mot de passe incorrect.', { exact: false })).toBeVisible()
  await expect(page).toHaveURL('/connexion')
})
