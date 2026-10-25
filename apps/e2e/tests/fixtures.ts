import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

/**
 * État de départ d'un test, appliqué par le serveur e2e (`apps/server/test/e2e/server.ts`).
 * Les utilisateurs OP reçoivent les identifiants 1, 2… dans l'ordre : `memberIds` s'y réfère.
 * Sous-ensemble du `Scenario` du serveur, qui accepte tous les champs du faux OP : à compléter au besoin.
 */
export interface Scenario {
  accounts?: Array<Account & { isAdmin?: boolean, opToken?: string }>
  op?: {
    users?: Array<{ name: string, token: string }>
    projects?: Array<{ id: number, identifier: string, name: string, memberIds: number[] }>
    workPackages?: Array<{ id: number, projectId: number, subject: string, parentId?: number | null }>
  }
}

export interface Account {
  username: string
  password: string
}

export const alice: Account = { username: 'alice', password: 'mot-de-passe-alice' }

export const test = base.extend<{ scenario: Scenario, resetStack: void }>({
  scenario: [
    {},
    { option: true },
  ],
  // Avant chaque test, la base et le faux OP repartent du scénario déclaré par `test.use`.
  resetStack: [
    async ({ request, scenario }, use) => {
      const response = await request.post('/api/__e2e/reset', { data: scenario })
      expect(response.status()).toBe(204)
      await use()
    },
    { auto: true },
  ],
})

export async function signIn(page: Page, { username, password }: Account) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(username)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

export { expect }
