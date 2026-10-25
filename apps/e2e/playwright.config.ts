import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/** Port dédié : les tests ne réutilisent pas un `pnpm dev` lancé à côté. */
const port = 5174

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'fr-FR',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Seul le front tourne : les tests simulent l'API (voir `tests/fixtures.ts`).
  webServer: {
    command: `pnpm --filter @openpatatoes/web exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
