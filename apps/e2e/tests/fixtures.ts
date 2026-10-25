import type { Page } from '@playwright/test'
import { test as base } from '@playwright/test'

/** Réponse simulée d'une route de l'API. */
interface MockResponse {
  status?: number
  body?: unknown
}

/** Simule l'API (`/api/...`) dans le navigateur, sans serveur ni OpenProject. */
export class ApiMock {
  constructor(private readonly page: Page) {}

  // Les filtres portent sur le chemin : un glob `**/api/**` capterait aussi les modules Vite de `src/shared/api/`.

  /** Toute route non simulée répond 404 : un test ne dépend jamais d'un vrai serveur. */
  async init() {
    await this.page.route(url => url.pathname.startsWith('/api/'), route =>
      route.fulfill({
        status: 404,
        json: { error: 'not_mocked' },
      }))
  }

  /** Simule `method path`. La dernière simulation d'une route l'emporte. */
  async on(method: string, path: string, { status = 200, body = {} }: MockResponse = {}) {
    await this.page.route(url => url.pathname === `/api${path}`, async (route) => {
      if (route.request().method() !== method)
        return route.fallback()
      await route.fulfill({ status, json: body })
    })
  }
}

export const test = base.extend<{ api: ApiMock }>({
  api: async ({ page }, use) => {
    const api = new ApiMock(page)
    await api.init()
    await use(api)
  },
})

export { expect } from '@playwright/test'
