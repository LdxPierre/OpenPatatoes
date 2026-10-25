import type { Account } from './fixtures'
import { expect, signIn, test } from './fixtures'

const alice: Account = { username: 'alice', password: 'mot-de-passe-alice' }

test.use({
  scenario: {
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
          memberIds: [1],
        },
        {
          id: 2,
          identifier: 'verger',
          name: 'Verger',
          memberIds: [1],
        },
        {
          id: 3,
          identifier: 'rucher',
          name: 'Rucher',
          memberIds: [2],
        },
      ],
      workPackages: [
        { id: 10, projectId: 1, subject: 'Préparer les semis' },
        {
          id: 11,
          projectId: 1,
          subject: 'Commander les graines',
          parentId: 10,
        },
        {
          id: 12,
          projectId: 1,
          subject: 'Installer les godets',
          parentId: 10,
        },
        { id: 20, projectId: 1, subject: 'Pailler les allées' },
      ],
    },
  },
})

test('liste les seuls projets visibles avec le jeton OP', async ({ page }) => {
  await signIn(page, alice)

  await expect(page.getByRole('heading', { name: 'Projets' })).toBeVisible()
  await expect(page.getByText('2 projets')).toBeVisible()
  await expect(page.getByRole('link', { name: /Potager/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Verger/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Rucher/ })).toHaveCount(0)
})

test('ouvre un projet et parcourt son arbre au clavier', async ({ page }) => {
  await signIn(page, alice)
  await page.getByRole('link', { name: /Potager/ }).click()

  await expect(page).toHaveURL('/projets/1')
  await expect(page.getByRole('heading', { name: 'Potager' })).toBeVisible()
  const tree = page.getByRole('tree', { name: 'Tâches de Potager' })
  await expect(tree.getByRole('treeitem')).toHaveCount(2)

  const semis = tree.getByRole('treeitem', { name: /Préparer les semis/ })
  await semis.focus()
  await page.keyboard.press('ArrowRight')

  await expect(semis).toHaveAttribute('aria-expanded', 'true')
  await expect(tree.getByRole('treeitem', { name: /Commander les graines/ })).toBeVisible()
  await expect(tree.getByRole('treeitem')).toHaveCount(4)
})

test('un projet hors de portée du jeton est introuvable', async ({ page }) => {
  await signIn(page, alice)
  await expect(page).toHaveURL('/')

  await page.goto('/projets/3')

  await expect(page.getByRole('heading', { name: 'Rucher' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toBeVisible()
})
