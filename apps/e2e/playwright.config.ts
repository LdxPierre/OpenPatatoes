import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/** Ports dédiés, distincts de ceux de `pnpm dev`. */
const webPort = 5174
const apiPort = 3100

export default defineConfig({
  testDir: './tests',
  // Tous les tests partagent le serveur et sa base : ils tournent l'un après l'autre.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    locale: 'fr-FR',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Un serveur déjà lancé sur ces ports peut servir le code d'un autre worktree : on ne le réutilise pas.
  webServer: [
    {
      // L'app réelle, sur la base `openpatatoes_e2e` du PostgreSQL de Docker, face à un faux OpenProject.
      command: 'pnpm --filter @openpatatoes/server e2e:serve',
      url: `http://localhost:${apiPort}/api/health`,
      env: {
        E2E_API_PORT: String(apiPort),
      },
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @openpatatoes/web exec vite --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      env: { API_URL: `http://localhost:${apiPort}` },
      reuseExistingServer: false,
    },
  ],
})
